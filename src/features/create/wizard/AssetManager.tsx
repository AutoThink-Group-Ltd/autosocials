import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, Download, FolderOpen, FolderPlus, LayoutGrid, List, Maximize2, Pencil, Play, RefreshCw, Search, Share2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createFolder, deleteBatch, deleteVariant, moveVariants, renameBatch } from "@/lib/creative.functions";
import { useSafeScheduleAdd, PublishingHistory } from "@/features/home/useSafeScheduleAdd";
import { getRenderPlayback } from "@/lib/media.functions";
import { downloadVideo } from "@/lib/share.functions";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { videoProductionOutcome } from "@/lib/video-production-outcome";
import { ShareDialog } from "./ShareDialog";
import { AssetEditor } from "./AssetEditor";
import { CarouselLibrary } from "../CarouselLibrary";
import { HomeSocialTiles } from "@/features/home/HomeSocialTiles";
import { HomeContent } from "@/features/home/HomeContent";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { errMsg, field, ghost, primary } from "./shared";

type Render = { id: string; status: string; storage_path: string | null; created_at: string; version: number | null; snapshot_hook: string | null; snapshot_review_state: string | null; snapshot_size: string | null; snapshot_duration: string | null; technical_status: string | null; creative_status: string | null; frame_qa: unknown; qa_issues: unknown };
type Asset = { id: string; batch_id: string; hook: string; narrative: string; duration_s: number; size: string; review_state: string; created_at: string; primary_render_id: string | null; render_jobs: Render[] };
type Folder = { id: string; title: string; count: number };
type DeleteRequest = { kind: "assets"; ids: string[] } | { kind: "folder"; id: string; title: string } | null;
const PAGE = 48;
const APPROVAL_LABELS: Record<string, string> = { approved: "Approved", needs_revision: "Changes requested", rejected: "Rejected", draft: "Draft" };
const latest = (a: Asset) => a.render_jobs[0];
const finished = (a: Asset) => a.primary_render_id ? a.render_jobs.find((r) => r.id === a.primary_render_id && r.status === "done" && !!r.storage_path) : a.render_jobs.find((r) => r.status === "done" && !!r.storage_path);
const assetName = (a: Asset) => (finished(a)?.snapshot_hook ?? a.hook).trim() || "Untitled asset";
const assetReview = (a: Asset) => finished(a)?.snapshot_review_state ?? a.review_state;
const assetSize = (a: Asset) => finished(a)?.snapshot_size ?? a.size;
const assetDuration = (a: Asset) => finished(a)?.snapshot_duration ?? a.duration_s;
const videoAspect = (a: Asset) => { const [w, h] = assetSize(a).split("x").map(Number); return w && h && w > 0 && h > 0 ? w / h : 4 / 3; };
const day = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const approval = (a: Asset) => APPROVAL_LABELS[assetReview(a)] ?? "Awaiting approval";
const production = (a: Asset) => {
  const status = latest(a)?.status;
  if (["queued", "preparing", "rendering"].includes(status ?? "")) return finished(a) ? "Rebuilding" : "In production";
  if (status === "failed") return "Needs attention";
  const video = finished(a);
  return video ? (videoProductionOutcome(video).status === "done" ? "Ready to review" : "Needs review") : "Not rendered";
};

export function AssetManager({ ws, onPick, onChanged }: {
  ws: string; currentId?: string; onPick: (id: string) => void; onChanged: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const mkFolder = useServerFn(createFolder);
  const move = useServerFn(moveVariants);
  const remove = useServerFn(deleteVariant);
  const removeFolder = useServerFn(deleteBatch);
  const rename = useServerFn(renameBatch);
  const download = useServerFn(downloadVideo);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [kind, setKind] = useState<"videos" | "tiles" | "written" | "carousels">("videos");
  const [q, setQ] = useState("");
  const [folder, setFolder] = useState("all");
  const [review, setReview] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState<Asset[] | null>(null);
  const [preview, setPreview] = useState<Asset | null>(null);
  const [editingAssetId, setEditingAssetId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DeleteRequest>(null);
  const [busy, setBusy] = useState(false);
  const [folderForm, setFolderForm] = useState<{ id?: string; moveIds?: string[] } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [manageFolders, setManageFolders] = useState(false);
  const term = q.trim().replace(/[%,()]/g, " ");

  const folders = useQuery({
    queryKey: ["asset-gallery-folders", ws],
    queryFn: async (): Promise<Folder[]> => {
      const { data, error } = await supabase.from("creative_batches").select("id,title,creative_variants(count)").eq("workspace_id", ws).order("title");
      if (error) throw new Error(error.message);
      return (data ?? []).map((f) => ({ id: f.id, title: f.title || "Untitled folder", count: f.creative_variants?.[0]?.count ?? 0 }));
    },
  });
  const list = useInfiniteQuery({
    queryKey: ["asset-gallery", ws, term, folder, review, sort], initialPageParam: 0,
    refetchInterval: (query) => query.state.data?.pages.some((page) => page.some((asset) => ["queued", "preparing", "rendering"].includes(latest(asset)?.status ?? ""))) ? 10000 : false,
    getNextPageParam: (last: Asset[], pages: Asset[][]) => last.length === PAGE ? pages.length * PAGE : undefined,
    queryFn: async ({ pageParam }): Promise<Asset[]> => {
      let query = supabase.from("creative_variants").select("id,batch_id,hook,narrative,duration_s,size,review_state,created_at,primary_render_id,render_jobs!render_jobs_variant_id_fkey(id,status,storage_path,created_at,version,technical_status,creative_status,frame_qa,qa_issues,snapshot_hook:brief_snapshot->>hook,snapshot_review_state:brief_snapshot->>review_state,snapshot_size:brief_snapshot->>size,snapshot_duration:brief_snapshot->>duration_s)").eq("workspace_id", ws);
      if (term) query = query.or(`hook.ilike.%${term}%,narrative.ilike.%${term}%`);
      if (folder !== "all") query = query.eq("batch_id", folder);
      if (review !== "all") query = query.eq("review_state", review);
      query = sort === "name" ? query.order("hook", { ascending: true }) : query.order("created_at", { ascending: sort === "oldest" });
      const { data, error } = await query.order("id", { ascending: true }).order("created_at", { referencedTable: "render_jobs", ascending: false }).order("id", { referencedTable: "render_jobs", ascending: false }).range(pageParam, pageParam + PAGE - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Asset[];
    },
  });
  const assets = useMemo(() => list.data?.pages.flat() ?? [], [list.data]);
  const safe = useSafeScheduleAdd(ws, { videoIds: assets.map(asset => asset.id) }, Object.fromEntries(assets.map(asset => [asset.id, assetName(asset)])));
  const picked = assets.filter((a) => selected.has(a.id));
  const readyPicked = picked.filter((a) => !!finished(a));
  const allSelected = assets.length > 0 && assets.every((a) => selected.has(a.id));
  const folderTitles = new Map((folders.data ?? []).map((f) => [f.id, f.title]));

  useEffect(() => { setSelected(new Set()); setPreview(null); setSharing(null); }, [ws, term, folder, review, sort]);
  useEffect(() => { setFolder("all"); setQ(""); setFolderForm(null); setDeleting(null); setEditingAssetId(null); }, [ws]);
  useEffect(() => {
    const id = sessionStorage.getItem("as:open-asset-id");
    if (!id) return;
    sessionStorage.removeItem("as:open-asset-id");
    setEditingAssetId(id);
  }, [ws]);
  const toggle = (id: string) => setSelected((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const sync = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["asset-gallery", ws] }), qc.invalidateQueries({ queryKey: ["asset-gallery-folders", ws] }), qc.invalidateQueries({ queryKey: ["batches", ws] }), qc.invalidateQueries({ queryKey: ["variants"] }), onChanged()]);
  };
  async function moveAssets(ids: string[], target: string) {
    if (!target || !ids.length) return;
    if (target === "__new") { setFolderName(""); setFolderForm({ moveIds: ids }); return; }
    const movable = ids.filter((id) => assets.find((asset) => asset.id === id)?.batch_id !== target);
    if (!movable.length) { toast.info("The selected assets are already in this folder."); return; }
    setBusy(true);
    try {
      for (let i = 0; i < movable.length; i += 50) await move({ data: { ids: movable.slice(i, i + 50), target } });
      setSelected(new Set()); await sync(); toast.success(movable.length === 1 ? "Asset moved." : `${movable.length} assets moved.`);
    } catch (e) { await sync(); toast.error(errMsg(e, "Couldn't move the assets")); }
    finally { setBusy(false); }
  }
  async function saveFolder() {
    const title = folderName.trim();
    if (!title || !folderForm) return;
    setBusy(true);
    try {
      if (folderForm.id) await rename({ data: { id: folderForm.id, title } });
      else {
        const created = await mkFolder({ data: { workspace_id: ws, title } });
        if (folderForm.moveIds?.length) {
          for (let i = 0; i < folderForm.moveIds.length; i += 50) await move({ data: { ids: folderForm.moveIds.slice(i, i + 50), target: created.id } });
          setSelected(new Set());
        }
      }
      setFolderForm(null); await sync(); toast.success("Folder saved.");
    } catch (e) { await sync(); toast.error(errMsg(e, "Couldn't save the folder")); }
    finally { setBusy(false); }
  }
  async function doDelete() {
    if (!deleting) return;
    setBusy(true);
    const completed: string[] = [];
    try {
      if (deleting.kind === "folder") { await removeFolder({ data: { id: deleting.id } }); if (folder === deleting.id) setFolder("all"); }
      else for (const id of deleting.ids) { await remove({ data: { id } }); completed.push(id); }
      setSelected(new Set()); setDeleting(null); await sync(); toast.success("Deleted.");
    } catch (e) {
      if (deleting.kind === "assets" && completed.length) {
        const remaining = deleting.ids.filter((id) => !completed.includes(id));
        setSelected(new Set(remaining));
        setDeleting(remaining.length ? { kind: "assets", ids: remaining } : null);
        if (remaining.length) toast.error(`${completed.length} deleted. ${remaining.length} could not be deleted; try again.`);
        else toast.success("Deleted.");
      } else toast.error(errMsg(e, "Couldn't delete everything selected"));
      await sync();
    }
    finally { setBusy(false); }
  }
  async function downloadAsset(a: Asset) {
    try {
      const result = await download({ data: { id: a.id } });
      const anchor = document.createElement("a"); anchor.href = result.url; anchor.download = `${assetName(a).slice(0, 60)}.mp4`; anchor.rel = "noopener";
      document.body.appendChild(anchor); anchor.click(); anchor.remove();
    } catch (e) { toast.error(errMsg(e, "Couldn't download this asset")); }
  }
  const moveControl = (ids: string[], label: string) => (
    <Select value="" disabled={busy} onValueChange={(target) => void moveAssets(ids, target)}>
      <SelectTrigger aria-label={label} className="h-auto min-h-10 w-full min-w-0 flex-1 rounded-[10px] border-border-control bg-canvas text-[13px]"><SelectValue placeholder="Move to folder…" /></SelectTrigger>
      <SelectContent className="w-[min(28rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]">
        {(folders.data ?? []).map((f) => <SelectItem key={f.id} value={f.id} className="items-start py-2 [&>span:last-child]:whitespace-normal [&>span:last-child]:break-words">{f.title}</SelectItem>)}
        <SelectItem value="__new">+ New folder</SelectItem>
      </SelectContent>
    </Select>
  );
  function scheduleVideo(a: Asset) { if (finished(a)) { setPreview(null); void safe.add({ videoIds: [a.id] }); } }
  function addSelectedVideos() { if (picked.length > 20) { toast.error("Select up to 20 creations at a time."); return; } if (picked.some(asset => !finished(asset))) { toast.error("Wait for selected videos to finish before adding them."); return; } if (picked.length) void safe.add({ videoIds: picked.map(asset => asset.id) }); }
  const icon = "inline-flex size-10 items-center justify-center rounded-xl border border-border-control text-ink hover:bg-surface-subtle disabled:opacity-50";
  const actions = (a: Asset, compact = false, inPreview = false) => (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "justify-end")}>
      {!inPreview && <button type="button" className={icon} onClick={() => setPreview(a)} aria-label={`Open ${assetName(a)}`} title="Open"><Maximize2 className="h-4 w-4" /></button>}
      <button type="button" className={icon} disabled={!finished(a)} onClick={() => void scheduleVideo(a)} aria-label={`Add ${assetName(a)} to Schedule`} title="Add to Schedule"><CalendarDays className="h-4 w-4" /></button>
      <button type="button" className={icon} disabled={!finished(a)} onClick={() => void downloadAsset(a)} aria-label={`Download ${assetName(a)}`} title="Download"><Download className="h-4 w-4" /></button>
      <button type="button" className={icon} disabled={!finished(a)} onClick={() => setSharing([a])} aria-label={`Share ${assetName(a)}`} title="Share"><Share2 className="h-4 w-4" /></button>
      <button type="button" className={icon} disabled={!finished(a)} onClick={() => { setPreview(null); setEditingAssetId(a.id); }} aria-label={`Edit ${assetName(a)}`} title="Edit"><Pencil className="h-4 w-4" /></button>
    </div>
  );

  return (
    <main className="min-h-full bg-surface p-4 md:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="font-display text-[26px] font-bold tracking-tight">Sam’s creations</h1><p className="mt-1 text-[14px] text-muted-foreground">Your content library. Preview, download, share and organise every asset Sam makes.</p></div>
          <div className="flex gap-2">{kind === "videos" && <button type="button" className={ghost} onClick={() => { setFolderName(""); setFolderForm({}); }}><FolderPlus className="h-4 w-4" />New video folder</button>}<Link to="/app/create" className={primary}>Create</Link></div>
        </header>
        {safe.history.isError && <p role="alert" className="text-sm text-destructive">Publishing history unavailable. Try again before adding videos.</p>}
        <Tabs value={kind} onValueChange={value => setKind(value as "videos" | "tiles" | "written" | "carousels")} className="space-y-4">
          <TabsList aria-label="Creation type" className="grid h-auto w-full max-w-2xl grid-cols-2 sm:grid-cols-4 rounded-xl bg-surface-subtle p-1">
            <TabsTrigger value="videos" className="min-h-11 rounded-lg">Videos</TabsTrigger><TabsTrigger value="tiles" className="min-h-11 rounded-lg">Social tiles</TabsTrigger><TabsTrigger value="written" className="min-h-11 rounded-lg">Written</TabsTrigger><TabsTrigger value="carousels" className="min-h-11 rounded-lg">Carousels</TabsTrigger>
          </TabsList>
          <TabsContent value="carousels"><CarouselLibrary workspaceId={ws} /></TabsContent>
          <TabsContent value="tiles"><HomeSocialTiles workspaceId={ws} showEmpty compact /></TabsContent>
          <TabsContent value="written"><HomeContent workspaceId={ws} writtenOnly /></TabsContent>
          <TabsContent value="videos" className="space-y-5">
        <h2 className="font-display text-xl font-bold">Videos</h2>
        <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border-control bg-canvas p-3">
          <label className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search videos" aria-label="Search videos" className={cn(field, "pl-9")} /></label>
          <Select value={folder} onValueChange={setFolder}><SelectTrigger aria-label="Filter by folder" className="h-auto min-h-10 w-full min-w-0 rounded-[10px] border-border-control bg-canvas text-[13px] sm:w-72"><SelectValue placeholder="All folders" /></SelectTrigger><SelectContent className="w-[min(28rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)]"><SelectItem value="all">All folders</SelectItem>{(folders.data ?? []).map((f) => <SelectItem key={f.id} value={f.id} className="items-start py-2 [&>span:last-child]:whitespace-normal [&>span:last-child]:break-words">{f.title} ({f.count})</SelectItem>)}</SelectContent></Select>
          <select value={review} onChange={(e) => setReview(e.target.value)} aria-label="Filter by approval" className={cn(field, "w-auto")}><option value="all">All approval states</option><option value="approved">Approved</option><option value="draft">Draft</option><option value="needs_revision">Changes requested</option><option value="rejected">Rejected</option></select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort assets" className={cn(field, "w-auto")}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="name">Name</option></select>
          <div className="inline-flex rounded-[10px] border border-border-control p-0.5" aria-label="View options"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={cn("rounded-[8px] p-2", view === "grid" ? "bg-ink text-inverse" : "hover:bg-surface-subtle")}><LayoutGrid className="h-4 w-4" /></button><button type="button" aria-label="Table view" aria-pressed={view === "table"} onClick={() => setView("table")} className={cn("rounded-[8px] p-2", view === "table" ? "bg-ink text-inverse" : "hover:bg-surface-subtle")}><List className="h-4 w-4" /></button></div>
          <button type="button" className={ghost} aria-label="Refresh assets" onClick={() => void sync()}><RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} /></button>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[13px]"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(assets.map((a) => a.id)))} className="h-4 w-4 accent-ink" />Select all shown</label><span className="text-muted-foreground">{assets.length} asset{assets.length === 1 ? "" : "s"}{list.hasNextPage ? " shown" : ""}</span><button type="button" className="ml-auto inline-flex items-center gap-1.5 underline underline-offset-2" onClick={() => setManageFolders((v) => !v)}><FolderOpen className="h-4 w-4" />Manage folders</button></div>
        {selected.size > 0 && <div className="sticky top-0 z-20 flex flex-wrap items-center gap-2 rounded-[14px] border-2 border-ink bg-canvas p-3 shadow-sm"><b className="mr-1 text-[13px]">{selected.size} selected</b><button type="button" className={primary} disabled={busy} onClick={() => void addSelectedVideos()}><CalendarDays className="h-4 w-4" />Add to Schedule</button>{moveControl([...selected], "Move selected assets")}<button type="button" className={ghost} disabled={!readyPicked.length || readyPicked.length > 12} onClick={() => setSharing(readyPicked)} title="Share up to 12 finished videos at once"><Share2 className="h-4 w-4" />Share{readyPicked.length ? ` (${readyPicked.length})` : ""}</button><button type="button" className={ghost} disabled={busy} onClick={() => setDeleting({ kind: "assets", ids: [...selected] })}><Trash2 className="h-4 w-4" />Delete</button><button type="button" className="ml-auto text-[13px] underline" onClick={() => setSelected(new Set())}>Clear selection</button>{readyPicked.length > 12 && <p className="w-full text-[12px] text-muted-foreground">Select up to 12 finished videos to create one share link.</p>}</div>}
        {manageFolders && <section className="rounded-[14px] border border-border-control bg-canvas p-4"><h2 className="font-semibold">Folders</h2><div className="mt-2 divide-y divide-border">{(folders.data ?? []).map((f) => <div key={f.id} className="flex items-center gap-3 py-2 text-[13px]"><button type="button" className="min-w-0 flex-1 truncate text-left font-medium hover:underline" onClick={() => setFolder(f.id)}>{f.title} <span className="font-normal text-muted-foreground">· {f.count} assets</span></button><button type="button" className={ghost} onClick={() => onPick(f.id)}>Open</button><button type="button" aria-label={`Rename ${f.title}`} className={ghost} onClick={() => { setFolderName(f.title); setFolderForm({ id: f.id }); }}><Pencil className="h-4 w-4" /></button><button type="button" aria-label={`Delete ${f.title}`} className={ghost} onClick={() => setDeleting({ kind: "folder", id: f.id, title: f.title })}><Trash2 className="h-4 w-4" /></button></div>)}</div>{!folders.data?.length && <p className="mt-2 text-[13px] text-muted-foreground">Create a folder to organise your assets.</p>}</section>}
        {(list.error || folders.error) && <div role="alert" className="rounded-[14px] border border-destructive p-4 text-[13px]"><p>{errMsg(list.error ?? folders.error, "Couldn't load your assets")}</p><button type="button" className={cn(ghost, "mt-2")} onClick={() => void sync()}>Try again</button></div>}
        {list.isPending && <p role="status" className="py-16 text-center text-[14px] text-muted-foreground">Loading your assets…</p>}
        {!list.isPending && !list.error && !assets.length && <div className="rounded-[14px] border border-dashed border-border-control bg-canvas p-12 text-center"><Play className="mx-auto h-8 w-8 text-muted-foreground" /><h2 className="mt-3 font-display text-[20px] font-bold">{term || folder !== "all" || review !== "all" ? "No assets match these filters" : "No videos yet"}</h2><p className="mt-2 text-[14px] text-muted-foreground">{term || folder !== "all" || review !== "all" ? "Try another search, folder or approval state." : "Ask Sam to create a video, then find and organise it here."}</p></div>}
        {view === "grid" ? <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 280px), 320px))" }}>{assets.map((a) => <article key={a.id} style={{ maxWidth: `min(100%, calc(min(70vh, 560px) * ${videoAspect(a)}))` }} className={cn("w-full overflow-hidden rounded-[16px] border bg-canvas", selected.has(a.id) ? "border-ink ring-2 ring-ink" : "border-border-control")}><div className="relative"><AssetPreview key={a.id} ws={ws} asset={a} compact /><label className="absolute left-3 top-3 grid h-8 w-8 place-items-center rounded-[8px] bg-canvas shadow"><input type="checkbox" aria-label={`Select ${assetName(a)}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="h-4 w-4 accent-ink" /></label></div><div className="space-y-3 p-4"><div className="flex flex-wrap gap-1.5"><ApprovalBadge asset={a} /><PrimaryBadge asset={a} /><span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">{production(a)}</span></div><PublishingHistory statuses={safe.history.data?.[a.id] ?? []} /><button type="button" onClick={() => setPreview(a)} className="line-clamp-2 min-h-10 text-left text-[14px] font-semibold leading-snug hover:underline">{assetName(a)}</button><p className="line-clamp-2 text-[12px] text-muted-foreground">{folderTitles.get(a.batch_id) ?? "Folder"} · {assetDuration(a)}s · {assetSize(a)}</p>{actions(a)}<div className="flex items-center gap-2 border-t border-border pt-3">{moveControl([a.id], `Move ${assetName(a)}`)}<button type="button" className="ml-auto p-2 text-muted-foreground hover:text-destructive" aria-label={`Delete ${assetName(a)}`} onClick={() => setDeleting({ kind: "assets", ids: [a.id] })}><Trash2 className="h-4 w-4" /></button></div></div></article>)}</div> : <div className="overflow-x-auto rounded-[14px] border border-border-control bg-canvas"><table className="w-full text-left text-[13px]"><thead className="border-b border-border bg-surface-subtle text-[12px] text-muted-foreground"><tr><th className="w-10 p-3"><span className="sr-only">Select</span></th><th className="p-3">Asset</th><th className="p-3">Approval</th><th className="p-3">Production</th><th className="p-3">Folder</th><th className="p-3">Created</th><th className="p-3 text-right">Actions</th></tr></thead><tbody className="divide-y divide-border">{assets.map((a) => <tr key={a.id} className={selected.has(a.id) ? "bg-surface-subtle" : ""}><td className="p-3"><input type="checkbox" aria-label={`Select ${assetName(a)}`} checked={selected.has(a.id)} onChange={() => toggle(a.id)} className="h-4 w-4 accent-ink" /></td><td className="min-w-60 p-3"><button type="button" onClick={() => setPreview(a)} className="flex items-center gap-3 text-left hover:underline"><span className="grid h-12 w-16 shrink-0 place-items-center rounded-[8px] bg-ink text-inverse"><Play className="h-5 w-5" /></span><span><b className="line-clamp-2">{assetName(a)}</b><span className="mt-1 block text-[11px] text-muted-foreground">{assetDuration(a)}s · {assetSize(a)}</span></span></button></td><td className="whitespace-nowrap p-3"><ApprovalBadge asset={a} /> <PrimaryBadge asset={a} /><PublishingHistory statuses={safe.history.data?.[a.id] ?? []} /></td><td className="whitespace-nowrap p-3 text-muted-foreground">{production(a)}</td><td className="max-w-44 truncate p-3">{folderTitles.get(a.batch_id) ?? "Folder"}</td><td className="whitespace-nowrap p-3 text-muted-foreground">{day(a.created_at)}</td><td className="p-3">{actions(a, true)}</td></tr>)}</tbody></table></div>}
        {list.hasNextPage && <div className="text-center"><button type="button" className={ghost} disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? "Loading…" : "Load more videos"}</button></div>}
          </TabsContent>
        </Tabs>
      </div>
      {safe.confirmation}
      {editingAssetId && <AssetEditor key={`${ws}:${editingAssetId}`} ws={ws} assetId={editingAssetId} open onOpenChange={(open) => { if (!open) setEditingAssetId(null); }} onChanged={sync} />}
      <ShareDialog ws={ws} variantIds={(sharing ?? []).map((a) => a.id)} title={sharing?.length === 1 ? assetName(sharing[0]!) : "Sam’s creations"} open={!!sharing} onOpenChange={(open) => !open && setSharing(null)} />
      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}><DialogContent className="max-w-3xl"><DialogTitle>{preview ? assetName(preview) : "Asset preview"}</DialogTitle>{preview && <><AssetPreview key={preview.id} ws={ws} asset={preview} /><div className="flex flex-wrap items-center gap-2"><ApprovalBadge asset={preview} /><span className="text-[12px] text-muted-foreground">{production(preview)}</span><div className="ml-auto">{actions(preview, false, true)}</div></div></>}</DialogContent></Dialog>
      <Dialog open={!!folderForm} onOpenChange={(open) => !open && !busy && setFolderForm(null)}><DialogContent><DialogTitle>{folderForm?.id ? "Rename folder" : "New folder"}</DialogTitle><form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void saveFolder(); }}><input autoFocus value={folderName} onChange={(e) => setFolderName(e.target.value)} aria-label="Folder name" placeholder="Folder name" maxLength={120} className={field} /><div className="flex justify-end gap-2"><button type="button" className={ghost} disabled={busy} onClick={() => setFolderForm(null)}>Cancel</button><button type="submit" className={primary} disabled={busy || !folderName.trim()}>{busy ? "Saving…" : folderForm?.moveIds?.length ? "Create and move" : "Save folder"}</button></div></form></DialogContent></Dialog>
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && !busy && setDeleting(null)}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{deleting?.kind === "folder" ? "Delete this folder?" : `Delete ${deleting?.ids.length ?? 0} asset${deleting?.kind === "assets" && deleting.ids.length === 1 ? "" : "s"}?`}</AlertDialogTitle><AlertDialogDescription>{deleting?.kind === "folder" ? `“${deleting.title}” and all of its assets and renders will be removed.` : "The selected assets and their renders will be removed."} Publish drafts stay. This cannot be undone.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel><AlertDialogAction className={primary} disabled={busy} onClick={(e) => { e.preventDefault(); void doDelete(); }}>{busy ? "Deleting…" : "Delete"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  );
}

function ApprovalBadge({ asset }: { asset: Asset }) {
  return <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", assetReview(asset) === "approved" ? "border-success/30 bg-success/10 text-success" : assetReview(asset) === "rejected" || assetReview(asset) === "needs_revision" ? "border-destructive/25 bg-destructive/5 text-destructive" : "border-border-control bg-surface-subtle text-ink")}>{approval(asset)}</span>;
}

function PrimaryBadge({ asset }: { asset: Asset }) {
  const render = finished(asset);
  return render ? <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">Primary · v{render.version ?? 1}</span> : null;
}

function AssetPreview({ ws, asset, compact = false }: { ws: string; asset: Asset; compact?: boolean }) {
  const playback = useServerFn(getRenderPlayback);
  const download = useServerFn(downloadVideo);
  const render = finished(asset);
  const [width, height] = assetSize(asset).split("x").map(Number);
  const aspectRatio = width! > 0 && height! > 0 ? `${width} / ${height}` : "4 / 3";
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const node = element.current;
    if (!node || typeof IntersectionObserver === "undefined") { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "300px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    setUrl(null); setError(null);
    const path = render?.storage_path;
    if (!visible || !path) return;
    const resolve = async () => {
      if (path.startsWith("autotoast:")) {
        try { const result = await playback({ data: { workspace_id: ws, media_id: path.slice(10) } }); if (result.url) return result.url; } catch { /* The original download also provides a playable MP4. */ }
        return (await download({ data: { id: asset.id } })).url;
      }
      const result = await supabase.storage.from("brand-assets-private").createSignedUrl(path, 3600);
      if (result.error || !result.data?.signedUrl) throw new Error(result.error?.message ?? "Preview unavailable");
      return result.data.signedUrl;
    };
    const timer = window.setTimeout(() => { if (active) setError("Preview is taking too long. Please try again or download the video."); }, 15000);
    void resolve().then((next) => { if (active) { setUrl(next); setError(null); } }).catch(() => { if (active) setError("Preview unavailable. Please try again or download the video."); }).finally(() => window.clearTimeout(timer));
    return () => { active = false; window.clearTimeout(timer); };
  }, [render?.storage_path, asset.id, ws, playback, download, attempt, visible]);
  return <div ref={element} style={{ aspectRatio, ...(!compact ? { maxWidth: `min(100%, calc(min(70vh, 640px) * ${width && height && width > 0 && height > 0 ? width / height : 4 / 3}))` } : {}) }} className="relative mx-auto flex w-full items-center justify-center overflow-hidden bg-ink text-inverse">{url && !error ? <video src={`${url}${url.includes("#") ? "" : "#t=0.1"}`} controls playsInline preload="metadata" className="h-full w-full object-contain" aria-label={`Preview ${assetName(asset)}`} onError={() => setError("This preview couldn't be played. Try downloading the original video.")} /> : <div className="max-w-xs p-6 text-center"><Play className="mx-auto h-8 w-8 opacity-60" /><p className="mt-3 text-[13px]">{error ?? (render ? "Loading preview…" : production(asset))}</p>{error && <button type="button" className="mt-3 text-[12px] underline" onClick={() => setAttempt((n) => n + 1)}>Retry preview</button>}</div>}</div>;
}
