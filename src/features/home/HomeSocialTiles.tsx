import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { contentTrashKey, listContentTrash, setContentTrashed } from "@/lib/content-trash";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Download, Maximize2, Share2, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { AssetChannelStatus } from "@/features/schedule/useAssetPublishingStatus";
import { useSafeScheduleAdd, PublishingHistory } from "./useSafeScheduleAdd";
import { TileFeedPreview } from "@/features/schedule/TileFeedPreview";

type Tile = { id: string; name: string; storage_path: string; created_at: string };
const PAGE = 12;

function TileCard({ workspaceId, tile, statuses, mode, showCompleted = false, open, onOpenChange, onPrevious, onNext, canPrevious, canNext, selected, onSelect, selectionFull, onAdd, onTrash, trashPending, compact = false }: { workspaceId: string; tile: Tile; statuses: AssetChannelStatus[]; mode: "available" | "scheduled" | "published"; showCompleted?: boolean; open: boolean; onOpenChange: (open: boolean) => void; onPrevious: () => void; onNext: () => void; canPrevious: boolean; canNext: boolean; selected: boolean; onSelect: (selected: boolean) => void; selectionFull: boolean; onAdd: () => void; onTrash: () => void; trashPending: boolean; compact?: boolean }) {
  const [message, setMessage] = useState("");
  const links = useQuery({ queryKey: ["home-tile-urls", tile.id, tile.storage_path], staleTime: 45 * 60_000, queryFn: async () => {
    const bucket = supabase.storage.from("brand-assets-private");
    const [preview, download] = await Promise.all([bucket.createSignedUrl(tile.storage_path, 3600), bucket.createSignedUrl(tile.storage_path, 3600, { download: tile.name })]);
    if (preview.error || download.error || !preview.data?.signedUrl || !download.data?.signedUrl) throw new Error("Preview unavailable");
    return { preview: preview.data.signedUrl, download: download.data.signedUrl };
  } });
  async function share() {
    if (!links.data) return;
    try {
      if (navigator.share) await navigator.share({ title: tile.name, url: links.data.preview });
      else { await navigator.clipboard.writeText(links.data.preview); setMessage("Link copied. It expires in one hour."); }
    } catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setMessage("Could not share this image."); }
  }
  const iconButton = "inline-flex size-10 items-center justify-center rounded-xl border border-border-control text-ink hover:bg-surface-subtle disabled:opacity-50";
  const actions = <div className="flex flex-wrap items-center gap-2">{!open && <button type="button" disabled={!links.data} onClick={() => onOpenChange(true)} className={iconButton} aria-label={`Open ${tile.name}`} title="Open"><Maximize2 className="h-4 w-4" /></button>}<button type="button" className={iconButton} aria-label={`Add ${tile.name} to Schedule`} title="Add to Schedule" onClick={onAdd}><CalendarDays className="h-4 w-4" /></button>{links.data ? <a href={links.data.download} download={tile.name} className={iconButton} aria-label={`Download ${tile.name}`} title="Download"><Download className="h-4 w-4" /></a> : <button type="button" disabled className={iconButton} aria-label={`Download ${tile.name}`} title="Download"><Download className="h-4 w-4" /></button>}<button type="button" disabled={!links.data} onClick={() => void share()} className={iconButton} aria-label={`Share ${tile.name}`} title="Share"><Share2 className="h-4 w-4" /></button><button type="button" disabled={trashPending} className={iconButton} onClick={onTrash} aria-label={`Move ${tile.name} to Trash`} title="Move to Trash"><Trash2 className="size-4" /></button></div>;
  return <article className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border-control bg-surface">
    {links.data ? <button type="button" onClick={() => onOpenChange(true)} aria-label={`Open ${tile.name} preview`} className="block w-full"><img src={links.data.preview} alt={tile.name} loading="lazy" className="block h-auto w-full object-contain" /></button> : <div className="flex aspect-square items-center justify-center bg-surface-subtle text-sm">{links.isError ? "Preview unavailable" : "Loading preview…"}</div>}
    <div className="flex flex-1 flex-col gap-3 p-4"><label className="flex cursor-pointer items-center gap-2 text-sm font-semibold"><input type="checkbox" disabled={!selected && selectionFull} checked={selected} onChange={event => onSelect(event.target.checked)} className="size-4 accent-ink" />Select for scheduling</label><PublishingHistory statuses={statuses} />{showCompleted && <p className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4" /> Design ready</p>}<h3 className="line-clamp-2 min-h-12 break-words font-semibold">{tile.name.replace(/\.[^.]+$/, "")}</h3><div className="mt-auto">{actions}</div><p className="text-xs text-muted-foreground">Shared links expire after one hour.</p>{message && !open && <p role="status" className="text-xs">{message}</p>}</div>
    <Dialog open={open} onOpenChange={onOpenChange}><DialogContent onKeyDown={event => { if ((event.target as HTMLElement).closest("[role=tablist]")) return; if (event.key === "ArrowLeft" && canPrevious) { event.preventDefault(); onPrevious(); } if (event.key === "ArrowRight" && canNext) { event.preventDefault(); onNext(); } }} className="flex max-h-[95dvh] w-[min(95vw,1400px)] max-w-none flex-col gap-4"><DialogTitle className="pr-8">{tile.name.replace(/\.[^.]+$/, "")}</DialogTitle><DialogDescription className="sr-only">Social channel and image preview with download and sharing options.</DialogDescription><div className="min-h-0 flex-1 overflow-auto">{links.data && open && <TileFeedPreview key={tile.id} workspaceId={workspaceId} tileId={tile.id} title={tile.name.replace(/\.[^.]+$/, "")} imageUrl={links.data.preview} publishingHistory={statuses} />}</div><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><button type="button" className={iconButton} disabled={!canPrevious} onClick={onPrevious} aria-label="Previous design" title="Previous design"><ChevronLeft className="size-4" /></button><button type="button" className={iconButton} disabled={!canNext} onClick={onNext} aria-label="Next design" title="Next design"><ChevronRight className="size-4" /></button></div><p className="text-xs text-muted-foreground">Shared links expire after one hour.</p>{actions}</div>{message && <p role="status" className="text-xs">{message}</p>}</DialogContent></Dialog>
  </article>;
}

export function HomeSocialTiles({ workspaceId, showCompleted = false, showEmpty = false, compact = false }: { workspaceId: string; showCompleted?: boolean; showEmpty?: boolean; compact?: boolean }) {
  const [mode, setMode] = useState<"available" | "scheduled" | "published">("available");
  const [confirmTile, setConfirmTile] = useState<Tile | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const queryClient = useQueryClient();
  const trash = useQuery({ queryKey: contentTrashKey(workspaceId, "tile"), queryFn: () => listContentTrash(workspaceId, "tile") });
  const changeTrash = useMutation({
    mutationFn: ({ id, restore, workspace }: { id: string; restore: boolean; workspace: string }) =>
      setContentTrashed(workspace, "tile", id, !restore),
    onSuccess: async (_, { id, workspace }) => {
      setSelectedId(null);
      setSelectedAssets(ids => ids.filter(value => value !== id));
      await queryClient.invalidateQueries({ queryKey: contentTrashKey(workspace, "tile") });
    },
  });
  const tiles = useInfiniteQuery({ queryKey: ["home-social-tiles", workspaceId], initialPageParam: 0,
    getNextPageParam: (last: Tile[], pages: Tile[][]) => last.length === PAGE ? pages.length * PAGE : undefined,
    queryFn: async ({ pageParam }): Promise<Tile[]> => {
      const { data, error } = await supabase.from("brand_files").select("id,name,storage_path,created_at").eq("workspace_id", workspaceId).eq("source", "social_tile").order("created_at", { ascending: false }).order("id", { ascending: false }).range(pageParam, pageParam + PAGE - 1);
      if (error) throw error;
      return (data ?? []).filter(tile => tile.storage_path.startsWith(`${workspaceId}/`));
    } });
  const trashedIds = new Set(trash.data);
  const all = trash.isSuccess ? (tiles.data?.pages.flat() ?? []).filter(tile => !trashedIds.has(tile.id)) : [];
  const safe = useSafeScheduleAdd(workspaceId, { tileIds: all.map(tile => tile.id) }, Object.fromEntries(all.map(tile => [tile.id, tile.name])));
  const publishing = safe.history;
  useEffect(() => {
    if (tiles.hasNextPage && !tiles.isFetchingNextPage && !tiles.isFetchNextPageError) void tiles.fetchNextPage();
  }, [tiles.hasNextPage, tiles.isFetchingNextPage, tiles.isFetchNextPageError, tiles.fetchNextPage]);
  const classify = (tile: Tile): "available" | "scheduled" | "published" => {
    const statuses = publishing.data?.[tile.id] ?? [];
    if (statuses.some(status => ["pending", "awaiting_approval", "publishing", "retrying"].includes(status.status))) return "scheduled";
    if (statuses.some(status => status.status === "published")) return "published";
    return "available";
  };
  const shown = publishing.isSuccess ? all.filter(tile => classify(tile) === mode) : [];
  const eligible = new Set(publishing.isSuccess ? shown.map(tile => tile.id) : []);
  const selection = selectedAssets.filter(id => eligible.has(id));
  const selectedIndex = shown.findIndex(tile => tile.id === selectedId);
  return <section aria-label="Your social tiles" className="space-y-4"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Made for you</p><h2 className="mt-1 font-display text-2xl font-bold">Your social tiles</h2></div>
    {tiles.isPending && <p role="status">Loading your social tiles…</p>}{tiles.isError && <p role="alert">Your social tiles could not be loaded. <button className="underline" onClick={() => void tiles.refetch()}>Try again</button></p>}
    {trash.isSuccess && showEmpty && !tiles.isPending && !tiles.isError && !all.length && <p className="rounded-xl border border-dashed border-border-control p-6 text-sm text-muted-foreground">No social tiles yet.</p>}
    <div role="tablist" aria-label="Social tile status" className="flex flex-wrap gap-2 border-b border-border-control">{(["available", "scheduled", "published"] as const).map(tab => <button key={tab} type="button" role="tab" aria-selected={mode === tab} onClick={() => { changeTrash.reset(); setMode(tab); setSelectedId(null); setSelectedAssets([]); }} className={`border-b-2 px-3 py-2 text-sm font-semibold ${mode === tab ? "border-ink text-ink" : "border-transparent text-muted-foreground hover:text-ink"}`}>{tab === "available" ? "Ready to schedule" : tab === "scheduled" ? "Scheduled" : "Published"}</button>)}</div>
    {publishing.isError && <p role="alert">Publishing status is unavailable. <button type="button" className="underline" onClick={() => void publishing.refetch()}>Try again</button></p>}
    {all.length > 0 && publishing.isPending && <p role="status">Checking publishing status…</p>}
    {shown.length > 0 && <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!selection.length} onClick={() => void safe.add({ tileIds: selection })} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-inverse disabled:opacity-50">Add to Schedule{selection.length ? ` (${selection.length})` : ""}</button>{selection.length > 0 && <button type="button" onClick={() => setSelectedAssets([])} className="text-sm underline">Clear selection</button>}<button type="button" onClick={() => setSelectedAssets(shown.slice(0, 20).map(tile => tile.id))} className="text-sm underline">Select all shown (up to 20)</button></div>}
    {all.length > 0 && publishing.isSuccess && !shown.length && !tiles.hasNextPage && <div className="rounded-xl border border-dashed border-border-control bg-surface p-6"><p className="font-semibold">{mode === "available" ? "Ready to create something new?" : mode === "scheduled" ? "No scheduled tiles yet." : "No published tiles yet."}</p>{mode === "available" && <><p className="mt-2 text-sm text-muted-foreground">Your available social tiles will appear here. Start a new narrative to create more.</p><a href="/app/create" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-inverse">Create a narrative</a></>}</div>}
    {trash.isError && <p role="alert">Could not load Trash. <button type="button" className="underline" onClick={() => void trash.refetch()}>Try again</button></p>}
    {changeTrash.isError && <p role="alert">{changeTrash.error.message}</p>}
    <div className={compact ? "grid items-stretch gap-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,280px),320px))]" : "grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3"}>{shown.map(tile => <TileCard key={tile.id} workspaceId={workspaceId} trashPending={changeTrash.isPending} onTrash={() => setConfirmTile(tile)} onAdd={() => void safe.add({ tileIds: [tile.id] })} compact={compact} tile={tile} statuses={publishing.data?.[tile.id] ?? []} mode={classify(tile)} selected={selection.includes(tile.id)} selectionFull={selection.length >= 20} onSelect={checked => setSelectedAssets(current => checked ? [...current, tile.id] : current.filter(id => id !== tile.id))} showCompleted={showCompleted} open={selectedId === tile.id} onOpenChange={open => setSelectedId(open ? tile.id : null)} onPrevious={() => setSelectedId(shown[selectedIndex - 1]?.id ?? null)} onNext={() => setSelectedId(shown[selectedIndex + 1]?.id ?? null)} canPrevious={selectedIndex > 0} canNext={selectedIndex < shown.length - 1} />)}</div>
    <AlertDialog open={!!confirmTile} onOpenChange={open => { if (!open) setConfirmTile(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Move tile to Trash?</AlertDialogTitle><AlertDialogDescription>You can restore {confirmTile?.name} from Trash. Existing posts stay on their current schedule.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirmTile) changeTrash.mutate({ id: confirmTile.id, restore: false, workspace: workspaceId }); }}>Move to Trash</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    {safe.confirmation}
    {tiles.hasNextPage && <button className="rounded-xl border border-border-control px-4 py-2 text-sm font-semibold" disabled={tiles.isFetchingNextPage} onClick={() => void tiles.fetchNextPage()}>Show more tiles</button>}
  </section>;
}
