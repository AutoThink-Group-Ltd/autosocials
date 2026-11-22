import { BRAND_INPUT_FILTER } from "@/lib/brand-files";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAll } from "@/lib/fetch-all";
const PAGE = 48;
import { BrandedVideo } from "./BrandedVideo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Folder, FileText, Image as ImageIcon, Film, Music, Type, Archive, File as FileIcon, LayoutGrid, List, Search, Upload, FolderPlus, Globe, Trash2, Pencil, FolderInput, Check, PackageOpen, ChevronRight, X, Sparkles, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatBytes, isAutoToastPath, extOf, relativeDate, matchesFilters, sortFiles, hashBlob, type FileKind, type DateRange, type SizeRange, type SortKey } from "@/lib/brand-files";
import { getMediaLinks, syncTranscripts, deleteMediaFiles } from "@/lib/media.functions";
import { startUpload, useUploads } from "@/workspace/uploads/uploadStore";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getBrandWorkStatus, labelBrandFiles, buildBrandProfile, scanWebsite, postUploadSummary, queueOlderDocuments, ensureBrandPalette, setBrandPaletteRole } from "@/lib/brand-assets.functions";
import { hexColour, type BrandPalette } from "@/lib/brand-palette";
import { startAutomaticBrandDiscovery } from "@/lib/brand-discovery.functions";
import { findWebsiteImages } from "@/lib/website-images.functions";
import { cn } from "@/lib/utils";

type FolderRow = { id: string; parent_id: string | null; name: string; is_system: boolean };
type FileRow = { created_by: string | null; content_hash: string | null; id: string; folder_id: string | null; name: string; kind: string; mime: string | null; size_bytes: number; storage_path: string; source: string; ai_label: string | null; ai_summary: string | null; extracted_text: string | null; created_at: string; media_id: string | null; transcript_status: string | null };
type Item = { type: "folder"; row: FolderRow } | { type: "file"; row: FileRow };

const BUCKET = "brand-assets-private";
const ICONS: Record<string, typeof FileIcon> = { image: ImageIcon, logo: ImageIcon, video: Film, audio: Music, doc: FileText, font: Type, archive: Archive, other: FileIcon };
const FILTERS: (FileKind | "all")[] = ["all", "image", "logo", "video", "audio", "doc", "font", "archive"];
const FILTER_LABEL: Record<string, string> = { all: "All", image: "Images", logo: "Logos", video: "Videos", audio: "Audio", doc: "Docs", font: "Fonts", archive: "ZIPs" };
const isCreation = (file: FileRow) => ["social_tile", "render", "ai-generated"].includes(file.source);
const sel = "h-8 rounded-[8px] border border-border-control bg-surface px-2 text-[12px]";
const btn = "inline-flex h-9 items-center gap-1.5 rounded-[10px] px-3 text-[13px] font-medium disabled:opacity-40";
const ghost = cn(btn, "border border-border-control bg-surface hover:bg-surface-subtle");
const primary = cn(btn, "bg-ink text-inverse hover:bg-ink-hover");

export function BrandAssets() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const ws = currentWorkspace?.id;
  const qc = useQueryClient();
  const label = useServerFn(labelBrandFiles);
  const build = useServerFn(buildBrandProfile);
  const summarise = useServerFn(postUploadSummary);
  const queueOld = useServerFn(queueOlderDocuments);
  const scan = useServerFn(scanWebsite);
  const startAutoDiscovery = useServerFn(startAutomaticBrandDiscovery);
  const findImages = useServerFn(findWebsiteImages);
  const [findingWebsiteImages, setFindingWebsiteImages] = useState(false);
  const workStatus = useServerFn(getBrandWorkStatus);
  const [watchUntil, setWatchUntil] = useState(0);
  const work = useQuery({
    queryKey: ["brand-work", ws], enabled: !!ws,
    queryFn: () => workStatus({ data: { workspace_id: ws! } }),
    refetchInterval: (query) => query.state.data?.active || Date.now() < watchUntil ? 3000 : false,
  });
  const autoChecking = work.data?.active === true;
  const hasSavedSources = !!currentWorkspace?.website || (Array.isArray(currentWorkspace?.social_profiles) && currentWorkspace.social_profiles.length > 0);
  useEffect(() => {
    if (!ws || !hasSavedSources) return;
    setWatchUntil(Date.now() + 15000);
    void startAutoDiscovery({ data: { workspace_id: ws } }).finally(() => { void qc.invalidateQueries({ queryKey: ["brand-work", ws] }); }).catch(() => {});
  }, [ws, hasSavedSources]);
  const [tab, setTab] = useState<"files" | "creations" | "profile" | "website">("files");
  const [cwd, setCwd] = useState<string | null>(null);
  const [view, setView] = useState<"grid" | "table">("grid");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<FileRow | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const getLinks = useServerFn(getMediaLinks);
  const [confirmDelete, setConfirmDelete] = useState<Item[] | null>(null);
  const [url, setUrl] = useState("");
  const [scanning, setScanning] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const [naming, setNaming] = useState<null | { mode: "new" } | { mode: "rename"; it: Item }>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const lastClicked = useRef<string | null>(null);
  const [dateF, setDateF] = useState<DateRange>("any");
  const [sizeF, setSizeF] = useState<SizeRange>("any");
  const [folderF, setFolderF] = useState<string>("any");
  const [sort, setSort] = useState<SortKey>("name");
  const [dupes, setDupes] = useState<FileRow[] | null>(null);
  const [findingDupes, setFindingDupes] = useState(false);
  const [extracting, setExtracting] = useState<string | null>(null);

  const { data: folders = [] } = useQuery({
    queryKey: ["asset-folders", ws], enabled: !!ws,
    queryFn: async (): Promise<FolderRow[]> => (await supabase.from("asset_folders").select("id,parent_id,name,is_system").eq("workspace_id", ws!).order("name")).data ?? [],
  });
  const { data: files = [] } = useQuery({
    queryKey: ["brand-files", ws], enabled: !!ws,
    refetchInterval: autoChecking ? 5000 : false,
    queryFn: (): Promise<FileRow[]> => fetchAll<FileRow>((a, b) => supabase.from("brand_files").select("id,folder_id,name,kind,mime,size_bytes,storage_path,source,ai_label,ai_summary,extracted_text,created_at,media_id,transcript_status,created_by,content_hash").eq("workspace_id", ws!).or(BRAND_INPUT_FILTER).order("name").range(a, b)),
  });
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["asset-folders", ws] });
    void qc.invalidateQueries({ queryKey: ["brand-files", ws] });
  }, [qc, ws]);
  useEffect(() => {
    refresh();
    void qc.invalidateQueries({ queryKey: ["brand-profile", ws] });
  }, [work.data?.active, refresh, qc, ws]);

  const syncT = useServerFn(syncTranscripts);
  const delMedia = useServerFn(deleteMediaFiles);
  const pendingTranscripts = files.some((f) => f.media_id && (f.transcript_status === "pending" || f.transcript_status === "processing"));
  useEffect(() => {
    if (!ws || !pendingTranscripts) return;
    let stop = false;
    const tick = async () => {
      try {
        const r = await syncT({ data: { workspace_id: ws } });
        if (!stop && r.updated) {
          refresh();
          let more = true;
          while (more) more = (await label({ data: { workspace_id: ws } })).labelled > 0;
          await build({ data: { workspace_id: ws } }).catch(() => {});
        }
      } catch { /* try again next tick */ }
    };
    void tick();
    const t = setInterval(tick, 30000);
    return () => { stop = true; clearInterval(t); };
  }, [ws, pendingTranscripts, syncT, refresh, label, build]);

  const crumbs = useMemo(() => {
    const out: FolderRow[] = []; let id = cwd;
    while (id) { const f = folders.find((x) => x.id === id); if (!f) break; out.unshift(f); id = f.parent_id; }
    return out;
  }, [cwd, folders]);

  const searching = q.trim().length > 0 || filter !== "all" || dateF !== "any" || sizeF !== "any" || folderF !== "any";
  const libraryFiles = useMemo(() => files.filter((file) => isCreation(file) === (tab === "creations")), [files, tab]);
  const folderName = useCallback((id: string | null) => folders.find((f) => f.id === id)?.name ?? "", [folders]);
  const items: Item[] = useMemo(() => {
    const fx = { kind: filter, date: dateF, size: sizeF, folder: folderF, term: q };
    if (searching || tab === "creations") return sortFiles(libraryFiles.filter((f) => matchesFilters(f, fx, folderName(f.folder_id))), sort).map((row) => ({ type: "file" as const, row }));
    const fs = folders.filter((f) => f.parent_id === cwd).sort((a, b) => a.name.localeCompare(b.name));
    return [
      ...fs.map((row) => ({ type: "folder" as const, row })),
      ...sortFiles(libraryFiles.filter((f) => f.folder_id === cwd), sort).map((row) => ({ type: "file" as const, row })),
    ];
  }, [folders, libraryFiles, tab, cwd, q, filter, dateF, sizeF, folderF, sort, searching, folderName]);
  const clearFilters = () => { setQ(""); setFilter("all"); setDateF("any"); setSizeF("any"); setFolderF("any"); };
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [cwd, q, filter, dateF, sizeF, folderF, sort]);
  const shown = items.slice(0, limit);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current; if (!el) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) setLimit((l) => l + PAGE); }, { rootMargin: "400px" });
    io.observe(el); return () => io.disconnect();
  }, [shown.length, items.length, tab]);
  const recent = useMemo(() => [...libraryFiles].sort((a, b) => b.created_at.localeCompare(a.created_at)).filter((f) => Date.now() - new Date(f.created_at).getTime() < 7 * 86400000).slice(0, 10), [libraryFiles]);
  const readCount = files.filter((f) => f.ai_label).length;
  // Resume reading after a refresh: if some files are unread and no upload is running, pick them up once.
  const resumed = useRef<string | null>(null);
  useEffect(() => {
    if (!ws || resumed.current === ws || !files.length || readCount >= files.length) return;
    resumed.current = ws;
    const t = setTimeout(() => { void organise(); }, 3000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, files.length, readCount]);
  const lastRead = recent[0]?.created_at;
  const zips = libraryFiles.filter((f) => f.kind === "archive" && !isAutoToastPath(f.storage_path));
  const { data: people = {} } = useQuery({
    queryKey: ["brand-file-people", ws, [...new Set(files.map((f) => f.created_by).filter(Boolean))].sort().join(",")],
    enabled: files.some((f) => f.created_by),
    queryFn: async () => {
      const ids = [...new Set(files.map((f) => f.created_by).filter(Boolean))] as string[];
      const { data } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      return Object.fromEntries((data ?? []).map((p) => [p.id, p.full_name || "Teammate"])) as Record<string, string>;
    },
  });
  const who = (id: string | null) => (id ? (id === user?.id ? "You" : people[id] ?? "Teammate") : "—");

  async function extractAll() { for (const z of zips) { setExtracting(z.id); await unpack(z); } setExtracting(null); }

  async function findDuplicates() {
    setFindingDupes(true);
    try {
      const rows = [...libraryFiles];
      for (const f of rows) {
        if (f.content_hash || isAutoToastPath(f.storage_path)) continue;
        const { data } = await supabase.storage.from(BUCKET).download(f.storage_path);
        if (!data) continue;
        const h = await hashBlob(data); f.content_hash = h;
        await supabase.from("brand_files").update({ content_hash: h }).eq("id", f.id);
      }
      const seen = new Map<string, FileRow>(); const extra: FileRow[] = [];
      for (const f of sortFiles(rows, "oldest")) {
        const key = f.content_hash ?? (isAutoToastPath(f.storage_path) ? `m:${f.name}:${f.size_bytes}` : null);
        if (!key) continue;
        if (seen.has(key)) extra.push(f); else seen.set(key, f);
      }
      if (!extra.length) toast.success("No duplicates — your library is clean.");
      else setDupes(extra);
    } finally { setFindingDupes(false); }
  }

  function toggle(id: string, shift: boolean) {
    setSelecting(true);
    setSelected((s) => {
      const n = new Set(s);
      const ids = items.map((i) => i.row.id);
      const a = lastClicked.current ? ids.indexOf(lastClicked.current) : -1, b = ids.indexOf(id);
      if (shift && a >= 0 && b >= 0) ids.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((x) => n.add(x));
      else n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
    lastClicked.current = id;
  }
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.row.id));
  const selectedFiles = items.filter((i): i is Extract<Item, { type: "file" }> => i.type === "file" && selected.has(i.row.id));
  async function downloadSelected() {
    if (!selectedFiles.length || downloading) return;
    setDownloading(true);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      const names = new Set<string>();
      for (const { row } of selectedFiles) {
        let blob: Blob;
        if (row.media_id) {
          const links = await getLinks({ data: { file_id: row.id } });
          if (!links.download_url) throw new Error(`Download unavailable for ${row.name}.`);
          const response = await fetch(links.download_url);
          if (!response.ok) throw new Error(`Could not download ${row.name}.`);
          blob = await response.blob();
        } else {
          const result = await supabase.storage.from(BUCKET).download(row.storage_path);
          if (result.error || !result.data) throw new Error(`Could not download ${row.name}.`);
          blob = result.data;
        }
        const clean = row.name.replace(/[\\/]/g, "_");
        let name = clean; let suffix = 2;
        while (names.has(name.toLowerCase())) { const dot = clean.lastIndexOf("."); name = dot > 0 ? `${clean.slice(0, dot)} (${suffix++})${clean.slice(dot)}` : `${clean} (${suffix++})`; }
        names.add(name.toLowerCase());
        zip.file(name, await blob.arrayBuffer());
      }
      const archive = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(archive);
      const link = document.createElement("a"); link.href = url; link.download = "autosocials-assets.zip"; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create the ZIP. Please try again."); }
    finally { setDownloading(false); }
  }
  const countIn = (id: string) => libraryFiles.filter((f) => f.folder_id === id).length + folders.filter((f) => f.parent_id === id).length;

  async function ensureFolder(parent: string | null, name: string, cache: Map<string, string>): Promise<string> {
    const key = `${parent ?? "root"}/${name}`;
    const hit = cache.get(key); if (hit) return hit;
    const existing = folders.find((f) => f.parent_id === parent && f.name === name);
    if (existing) { cache.set(key, existing.id); return existing.id; }
    const { data, error } = await supabase.from("asset_folders").insert({ workspace_id: ws!, parent_id: parent, name, created_by: user?.id ?? null }).select("id").single();
    if (error || !data) throw new Error(error?.message ?? "Couldn't create folder");
    cache.set(key, data.id); return data.id;
  }

  function ingest(list: File[]) {
    if (!ws || !list.length) return;
    const target = cwd;
    const cache = new Map<string, string>();
    void startUpload(ws, list, async () => { refresh(); await organise(); }, {
      folderId: target,
      folderLabel: crumbs.at(-1)?.name ?? "Brand Assets",
      resolveFolder: async (dir) => { let parent = target; for (const p of dir.split("/").filter(Boolean)) parent = await ensureFolder(parent, p, cache); return parent; },
    });
    toast.success(`${list.length} file${list.length === 1 ? "" : "s"} added to the upload queue`, { description: "Keep browsing or add more — they upload in the background." });
  }
  const jobs = useUploads();
  const activeCount = jobs.filter((j) => j.workspaceId === ws && j.phase === "uploading").length;
  const lastDone = jobs.filter((j) => j.phase === "done").length;
  useEffect(() => { refresh(); }, [lastDone, activeCount, refresh]);

  async function unpack(f: FileRow) {
    const { data, error } = await supabase.storage.from(BUCKET).download(f.storage_path);
    if (error || !data) { toast.error("Couldn't open that ZIP."); return; }
    const file = new File([data], f.name, { type: "application/zip" });
    const cache = new Map<string, string>(); const target = f.folder_id;
    await supabase.storage.from(BUCKET).remove([f.storage_path]);
    await supabase.from("brand_files").delete().eq("id", f.id);
    setPreview(null); refresh();
    const openNew = async () => {
      const id = cache.get(`${target ?? "root"}/${f.name.replace(/\.zip$/i, "")}`);
      await qc.refetchQueries({ queryKey: ["asset-folders", ws] }); await qc.refetchQueries({ queryKey: ["brand-files", ws] });
      if (id) { clearFilters(); setCwd(id); }
    };
    void startUpload(ws!, [file], async () => { await openNew(); await organise(); }, {
      folderId: target, folderLabel: f.name,
      resolveFolder: async (dir) => { let parent = target; for (const p of dir.split("/").filter(Boolean)) parent = await ensureFolder(parent, p, cache); return parent; },
    });
  }

  async function organise() {
    if (!ws) return;
    setWatchUntil(Date.now() + 15000);
    const started = new Date(Date.now() - 15 * 60000).toISOString();
    try {
      await queueOld({ data: { workspace_id: ws } }).catch(() => {});
      // Refresh after each slice so the "Sam has read X of Y" line climbs live.
      for (let i = 0; i < 40; i++) {
        const r = await label({ data: { workspace_id: ws } });
        refresh();
        if (r.busy) { await new Promise((resolve) => setTimeout(resolve, 2000)); continue; }
        if (!r.labelled) break;
      }
      const built = await build({ data: { workspace_id: ws } });
      if (built.busy) { toast.message("Sam is already reading this brand. Progress will keep updating here."); return; }
      void qc.invalidateQueries({ queryKey: ["brand-profile", ws] });
      const since = new Date(Date.now() - 15 * 60000).toISOString();
      const { data: fresh } = await supabase.from("brand_files").select("ai_label").eq("workspace_id", ws).gte("labelled_at", since);
      const counts = new Map<string, number>(); for (const r of fresh ?? []) { const k = r.ai_label ?? "file"; counts.set(k, (counts.get(k) ?? 0) + 1); }
      const what = [...counts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => `${n} ${k}${n > 1 && !k.endsWith("s") ? "s" : ""}`).join(", ");
      const note = fresh?.length ? await summarise({ data: { workspace_id: ws, since: started } }).catch(() => ({ posted: false })) : { posted: false };
      if (note.posted) void qc.invalidateQueries({ queryKey: ["sam-messages", ws, "create"] });
      toast.success(fresh?.length ? `Sam has read ${fresh.length} new file${fresh.length === 1 ? "" : "s"}` : "Sam updated your brand profile", {
        description: what ? `${what}.${note.posted ? " Sam left you a note in her chat." : " Her brand profile and ideas are updated."}` : undefined, duration: 10000,
        action: note.posted ? { label: "Read note", onClick: () => { window.location.href = "/app/create"; } } : undefined,
      });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Sam couldn't read the files"); }
  }

  async function scanCurrentWebsite() {
    if (!ws) return;
    setScanning(true); setWatchUntil(Date.now() + 15000);
    try {
      const result = await scan({ data: { workspace_id: ws, url } });
      if (result.busy) { toast.message("Sam is already scanning this website. Progress will keep updating here."); return; }
      refresh(); toast.success("Website saved. Sam is reading it…"); setUrl(""); await organise();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Scan failed"); }
    finally { setScanning(false); }
  }

  async function findImagesOnWebsite() {
    if (!ws || findingWebsiteImages) return;
    setFindingWebsiteImages(true); setWatchUntil(Date.now() + 15000);
    try {
      const result = await findImages({ data: { workspace_id: ws } });
      refresh(); void qc.invalidateQueries({ queryKey: ["brand-profile", ws] });
      if (result.busy) toast.message("Sam is already finding website images. They’ll appear in the Website folder.");
      else if (!result.found) toast.message("No suitable website image references were found. Scan the website first.");
      else if (!result.imported) toast.message("No new images could be saved. Existing files are unchanged.");
      else if (!result.profileUpdated) toast.message("Website images are available in the Website folder; Sam’s brand profile could not be refreshed yet.");
      else toast.success("Website images are available in the Website folder for you to review.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t find website images."); }
    finally { setFindingWebsiteImages(false); }
  }

  async function newFolder(name: string, parent: string | null = cwd) {
    if (!name.trim() || !ws) return null;
    const { data, error } = await supabase.from("asset_folders").insert({ workspace_id: ws, parent_id: parent, name: name.trim(), created_by: user?.id ?? null }).select("id").single();
    if (error) { toast.error(error.message); return null; }
    refresh(); return data.id;
  }
  async function rename(it: Item, name: string) {
    if (!name.trim() || name === it.row.name) return;
    const { error } = it.type === "folder"
      ? await supabase.from("asset_folders").update({ name: name.trim() }).eq("id", it.row.id)
      : await supabase.from("brand_files").update({ name: name.trim() }).eq("id", it.row.id);
    if (error) toast.error(error.message); else refresh();
  }
  async function move(ids: string[], target: string | null) {
    const fileIds = ids.filter((id) => files.some((f) => f.id === id));
    const folderIds = ids.filter((id) => folders.some((f) => f.id === id) && id !== target);
    if (fileIds.length) await supabase.from("brand_files").update({ folder_id: target, labelled_at: null }).in("id", fileIds);
    if (folderIds.length) await supabase.from("asset_folders").update({ parent_id: target }).in("id", folderIds);
    setSelected(new Set()); refresh();
    if (fileIds.length) { toast.success(`Moved ${fileIds.length} file${fileIds.length === 1 ? "" : "s"} to ${folders.find((f) => f.id === target)?.name ?? "Brand Assets"}`, { description: "Sam is re-reading them with the new category." }); void organise(); }
  }
  async function doDelete(list: Item[]) {
    const descend = (id: string): string[] => [id, ...folders.filter((f) => f.parent_id === id).flatMap((f) => descend(f.id))];
    const folderIds = list.filter((i) => i.type === "folder").flatMap((i) => descend(i.row.id));
    if (files.some((f) => f.folder_id && folderIds.includes(f.folder_id) && isCreation(f))) {
      toast.error("This folder contains AutoSocials creations. Move or remove them before deleting the folder.");
      setConfirmDelete(null);
      return;
    }
    const doomed = files.filter((f) => list.some((i) => i.type === "file" && i.row.id === f.id) || (f.folder_id && folderIds.includes(f.folder_id)));
    if (doomed.length) {
      const atIds = doomed.filter((f) => f.media_id).map((f) => f.id);
      if (atIds.length) await delMedia({ data: { workspace_id: ws!, file_ids: atIds } }).catch(() => toast.error("Couldn't remove some videos from video storage."));
      const cloud = doomed.filter((f) => !isAutoToastPath(f.storage_path)).map((f) => f.storage_path);
      if (cloud.length) await supabase.storage.from(BUCKET).remove(cloud);
      await supabase.from("brand_files").delete().in("id", doomed.map((f) => f.id));
    }
    const roots = list.filter((i) => i.type === "folder").map((i) => i.row.id);
    if (roots.length) await supabase.from("asset_folders").delete().in("id", roots);
    setSelected(new Set()); setConfirmDelete(null); refresh();
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const moving = e.dataTransfer.getData("text/x-asset-ids");
    if (moving) return;
    ingest(Array.from(e.dataTransfer.files));
  };

  if (!ws) return <p className="p-6 text-[14px] text-muted-foreground">Pick a workspace first.</p>;
  const empty = !files.length && !folders.length;

  return (
    <div className="relative min-h-[calc(100dvh-3rem)] bg-surface p-4 md:p-6" onDragOver={(e) => { if (tab === "files" && e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragOver(true); } }} onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(false); }} onDrop={(e) => { if (tab === "files") onDrop(e); }}>
      <header className="mb-5">
        <h1 className="font-display text-[24px] font-bold tracking-tight text-ink">Brand assets</h1>
        <p className="mt-1 max-w-2xl text-[14px] text-text-secondary">Upload files and notes for Sam to learn your brand. Sam uses this knowledge when creating assets.</p>
        <a href="/app/brand-dna" className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4">Explore Brand DNA <ChevronRight size={15} /></a>
      </header>
      {autoChecking && <p role="status" className="mb-4 rounded-[12px] border border-border-control bg-canvas p-3 text-[13px]">Sam is reading your brand in the background. You can keep browsing and return here for progress.</p>}
      {work.data?.interrupted && <p role="status" className="mb-4 rounded-[12px] border border-border-control bg-canvas p-3 text-[13px]">An earlier brand task was interrupted before completion could be confirmed. Please contact support before retrying it.</p>}
      <div role="tablist" aria-label="Brand assets sections" className="mb-6 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {([
          ["files", "Files", "Upload and organise your assets", Folder],
          ["creations", "AutoSocials creations", "Assets made for you", ImageIcon],
          ["profile", "Brand profile", "See what Sam knows about your brand", Sparkles],
          ["website", "Website", "Scan your website for brand details", Globe],
        ] as const).map(([id, title, description, Icon]) => (
          <button key={id} type="button" role="tab" id={`brand-tab-${id}`} aria-selected={tab === id} aria-controls={`brand-panel-${id}`} onClick={() => { setTab(id); setSelected(new Set()); setSelecting(false); setCwd(null); clearFilters(); }} className={cn("flex min-h-[84px] items-center gap-3 rounded-[14px] border p-4 text-left transition-colors", tab === id ? "border-ink bg-ink text-inverse" : "border-border bg-surface hover:bg-surface-subtle")}>
            <Icon className="h-5 w-5 shrink-0" />
            <span><span className="block font-display text-[16px] font-bold">{title}</span><span className="mt-1 block text-[12px] opacity-75">{description}</span></span>
          </button>
        ))}
      </div>
      {tab === "profile" && <section role="tabpanel" id="brand-panel-profile" aria-labelledby="brand-tab-profile"><BrandProfileCard ws={ws} onRebuild={organise} hasFiles={!empty} autoChecking={autoChecking} /></section>}
      {tab === "website" && <section role="tabpanel" id="brand-panel-website" aria-labelledby="brand-tab-website"><ScanCard compact url={url} setUrl={setUrl} scanning={scanning || !!work.data?.kinds.includes("website")} onScan={scanCurrentWebsite} />{currentWorkspace?.website && <button type="button" className={cn(ghost, "mt-4")} disabled={findingWebsiteImages || !!work.data?.kinds.includes("website-images")} onClick={() => void findImagesOnWebsite()}><Globe className="h-4 w-4" />{findingWebsiteImages || work.data?.kinds.includes("website-images") ? "Finding website images…" : "Find website images"}</button>}</section>}
      {(tab === "files" || tab === "creations") && <section role="tabpanel" id={`brand-panel-${tab}`} aria-labelledby={`brand-tab-${tab}`}>
      <div className="flex flex-wrap items-center gap-2">
        {tab === "files" ? <button type="button" className={primary} onClick={() => fileInput.current?.click()}><Upload className="h-4 w-4" />Upload</button> : <a href="/app/sam-creations" className={ghost}>View all Sam’s creations <ChevronRight className="h-4 w-4" /></a>}
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { ingest(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
        {tab === "files" && <button type="button" className={ghost} onClick={() => setNaming({ mode: "new" })}><FolderPlus className="h-4 w-4" />New folder</button>}
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, type, folder…" className="pl-9" aria-label="Find files" />
        </div>
        <div className="flex rounded-[10px] border border-border-control p-0.5">
          <button type="button" aria-label="Grid view" className={cn("rounded-[8px] p-1.5", view === "grid" && "bg-ink text-inverse")} onClick={() => setView("grid")}><LayoutGrid className="h-4 w-4" /></button>
          <button type="button" aria-label="Table view" className={cn("rounded-[8px] p-1.5", view === "table" && "bg-ink text-inverse")} onClick={() => setView("table")}><List className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={cn("rounded-full border px-2.5 py-1 text-[12px]", filter === f ? "border-ink bg-ink text-inverse" : "border-border-control hover:bg-surface-subtle")}>{FILTER_LABEL[f]}</button>
        ))}
        <select aria-label="Date added" className={sel} value={dateF} onChange={(e) => setDateF(e.target.value as DateRange)}>
          <option value="any">Any date</option><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="year">This year</option>
        </select>
        <select aria-label="Size" className={sel} value={sizeF} onChange={(e) => setSizeF(e.target.value as SizeRange)}>
          <option value="any">Any size</option><option value="small">Under 1 MB</option><option value="medium">1–50 MB</option><option value="large">Over 50 MB</option>
        </select>
        <select aria-label="Folder" className={sel} value={folderF} onChange={(e) => setFolderF(e.target.value)}>
          <option value="any">Any folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <select aria-label="Sort by" className={sel} value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="name">Sort: Name</option><option value="newest">Sort: Newest</option><option value="oldest">Sort: Oldest</option><option value="largest">Sort: Largest</option><option value="type">Sort: Type</option>
        </select>
        {searching && <button type="button" className="text-[12px] underline" onClick={clearFilters}>Clear all</button>}
        <button type="button" className="rounded-full border border-border-control px-2.5 py-1 text-[12px] hover:bg-surface-subtle" disabled={findingDupes || !files.length} onClick={() => void findDuplicates()}>{findingDupes ? "Checking…" : "Find duplicates"}</button>
        {items.length > 0 && <button type="button" className="ml-auto rounded-full border border-border-control px-2.5 py-1 text-[12px] hover:bg-surface-subtle" onClick={() => { setSelecting(!selecting); if (selecting) setSelected(new Set()); }}>{selecting ? "Done selecting" : "Select"}</button>}
        {items.length > 0 && (
          <button type="button" className="rounded-full border border-border-control px-2.5 py-1 text-[12px] hover:bg-surface-subtle" onClick={() => { setSelecting(true); setSelected(allSelected ? new Set() : new Set(items.map((i) => i.row.id))); }}>{allSelected ? "Unselect all" : "Select all"}</button>
        )}
        {selected.size > 0 && (
          <span className="flex items-center gap-2 text-[12px]">
            <span className="font-semibold">{selected.size} selected</span>
            <button type="button" className={ghost} disabled={downloading || !selectedFiles.length || selectedFiles.length !== selected.size} title={selectedFiles.length !== selected.size ? "Select files only to download a ZIP" : undefined} onClick={() => void downloadSelected()}><Download className="h-4 w-4" />{downloading ? "Preparing ZIP…" : "Download ZIP"}</button>
            <button type="button" className={primary} onClick={() => setMoveOpen(true)}><FolderInput className="h-4 w-4" />Move to…</button>
            <button type="button" className={ghost} onClick={() => setConfirmDelete(items.filter((i) => selected.has(i.row.id)))}><Trash2 className="h-4 w-4" />Delete</button>
            <button type="button" className={ghost} onClick={() => setSelected(new Set())}>Clear</button>
          </span>
        )}
      </div>

      {zips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] border-2 border-ink bg-surface p-3">
          <ZipBadge />
          <p className="flex-1 text-[13px]"><span className="font-semibold">{zips.length} ZIP{zips.length === 1 ? " hasn't" : "s haven't"} been opened.</span> Extract {zips.length === 1 ? "it" : "them"} so the images and files inside show up and Sam can read them.</p>
          <button type="button" className={primary} disabled={!!extracting} onClick={() => void extractAll()}><PackageOpen className="h-4 w-4" />{extracting ? "Extracting…" : zips.length === 1 ? "Extract" : "Extract all"}</button>
        </div>
      )}

      {tab === "files" && files.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-[14px] border border-border bg-surface p-3 text-[13px]">
          <Sparkles className="h-4 w-4" />
          <p className="flex-1"><span className="font-semibold">Sam has read {readCount} of {files.length} files</span>{lastRead && <span className="text-muted-foreground"> · newest added {relativeDate(lastRead)}</span>}{readCount < files.length && <span className="text-muted-foreground"> · reading the rest now…</span>}</p>
          <button type="button" className="text-[12px] underline" onClick={() => setTab("profile")}>See what she learned</button>
        </div>
      )}

      {tab === "files" && !searching && !cwd && recent.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Recently added</p>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {recent.map((f) => (
              <div key={f.id} className="w-[180px] shrink-0">
                <Tile it={{ type: "file", row: f }} selected={selected.has(f.id)} selecting={selecting} count={0} selectedIds={selected}
                  onOpen={() => setPreview(f)} onToggle={(shift) => toggle(f.id, shift)} onExtract={() => void unpack(f)}
                  onRename={() => setNaming({ mode: "rename", it: { type: "file", row: f } })} onDelete={() => setConfirmDelete([{ type: "file", row: f }])} onDropIds={() => {}} />
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "files" && <nav className="mt-4 flex flex-wrap items-center gap-1 text-[13px]" aria-label="Folder path">
        <DropCrumb label="Brand Assets" onClick={() => setCwd(null)} onDropIds={(ids) => void move(ids, null)} active={!cwd && !searching} />
        {!searching && crumbs.map((c) => (
          <span key={c.id} className="flex items-center gap-1"><ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /><DropCrumb label={c.name} onClick={() => setCwd(c.id)} onDropIds={(ids) => void move(ids, c.id)} active={c.id === cwd} /></span>
        ))}
        {searching && <span className="text-muted-foreground">· {items.length} results across all folders</span>}
      </nav>}

      {tab === "creations" && !libraryFiles.length ? <p className="mt-6 rounded-[14px] border border-dashed border-border-control p-8 text-sm text-muted-foreground">Your AutoSocials creations will appear here.</p> : empty ? (
        <div className="mt-6">
          <button type="button" onClick={() => fileInput.current?.click()} className="group flex min-h-[240px] flex-col items-center justify-center rounded-[18px] border-2 border-dashed border-border-control bg-surface p-8 text-center transition-colors hover:border-ink">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-inverse transition-transform group-hover:scale-105"><Upload className="h-6 w-6" /></span>
            <span className="mt-4 font-display text-[18px] font-bold">Drop your brand folder here</span>
            <span className="mt-1 max-w-sm text-[13px] text-muted-foreground">Zips, markdown guides, logos, images, fonts, audio or video. Folders inside zips are kept, and Sam sorts and reads everything.</span>
          </button>
        </div>
      ) : view === "grid" ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {shown.map((it) => (
            <Tile key={it.row.id} it={it} selected={selected.has(it.row.id)} selecting={selecting} count={it.type === "folder" ? countIn(it.row.id) : 0}
              selectedIds={selected}
              onOpen={() => it.type === "folder" ? (setCwd(it.row.id), setQ(""), setFilter("all")) : setPreview(it.row)}
              onToggle={(shift) => toggle(it.row.id, shift)}
              onExtract={() => it.type === "file" && void unpack(it.row)}
              onRename={() => setNaming({ mode: "rename", it })} onDelete={() => setConfirmDelete([it])} onDropIds={(ids) => it.type === "folder" && void move(ids, it.row.id)} />
          ))}
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-[14px] border border-border bg-surface">
          <table className="w-full text-[13px]">
            <thead className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr><th className="w-8 p-3" />{([["name", "Name"], [null, "Sam's label"], ["type", "Type"], ["largest", "Size"], ["newest", "Added"]] as const).map(([k, l]) => (
                <th key={l} className="p-3">{k ? <button type="button" className={cn("uppercase", (sort === k || (k === "newest" && sort === "oldest")) && "font-bold text-foreground")} onClick={() => setSort(k === "newest" && sort === "newest" ? "oldest" : k)}>{l}{k === "newest" && sort === "oldest" ? " ↑" : sort === k ? " ↓" : ""}</button> : l}</th>
              ))}<th className="p-3">Added by</th><th className="p-3">Folder</th><th className="p-3" /></tr>
            </thead>
            <tbody>
              {shown.map((it) => {
                const Icon = it.type === "folder" ? Folder : ICONS[it.row.kind] ?? FileIcon;
                return (
                  <tr key={it.row.id} draggable onClick={(e) => { if (selecting && !(e.target as HTMLElement).closest("button, input")) toggle(it.row.id, e.shiftKey); }} onDragStart={(e) => e.dataTransfer.setData("text/x-asset-ids", JSON.stringify(selected.has(it.row.id) ? [...selected] : [it.row.id]))}
                    onDragOver={(e) => it.type === "folder" && e.preventDefault()} onDrop={(e) => { const ids = e.dataTransfer.getData("text/x-asset-ids"); if (it.type === "folder" && ids) { e.stopPropagation(); void move(JSON.parse(ids), it.row.id); } }}
                    className="border-b border-border last:border-0 hover:bg-surface-subtle">
                    <td className="p-3"><button type="button" role="checkbox" aria-checked={selected.has(it.row.id)} aria-label={`Select ${it.row.name}`} onClick={(e) => toggle(it.row.id, e.shiftKey)} className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-surface">{selected.has(it.row.id) && <Check className="h-4 w-4" />}</button></td>
                    <td className="p-3"><button type="button" className="flex items-center gap-2 font-medium" onClick={(e) => selecting ? toggle(it.row.id, e.shiftKey) : it.type === "folder" ? setCwd(it.row.id) : setPreview(it.row)}><Icon className="h-4 w-4 text-muted-foreground" />{it.row.name}</button></td>
                    <td className="p-3 text-muted-foreground">{it.type === "file" ? it.row.ai_label ?? "Reading…" : `${countIn(it.row.id)} items`}</td>
                    <td className="p-3 uppercase text-muted-foreground">{it.type === "folder" ? "Folder" : extOf(it.row.name) || it.row.kind}</td>
                    <td className="p-3 tabular-nums text-muted-foreground">{it.type === "file" ? formatBytes(it.row.size_bytes) : "—"}</td>
                    <td className="whitespace-nowrap p-3 text-muted-foreground">{it.type === "file" ? relativeDate(it.row.created_at) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{it.type === "file" ? who(it.row.created_by) : "—"}</td>
                    <td className="p-3 text-muted-foreground">{it.type === "file" ? folderName(it.row.folder_id) || "Brand Assets" : "—"}</td>
                    <td className="p-3 text-right"><button type="button" aria-label="Rename" className="p-1" onClick={() => setNaming({ mode: "rename", it })}><Pencil className="h-3.5 w-3.5" /></button><button type="button" aria-label="Delete" className="p-1" onClick={() => setConfirmDelete([it])}><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!empty && items.length > limit && (
        <div ref={sentinel} className="mt-4 flex flex-col items-center gap-1">
          <button type="button" className={ghost} onClick={() => setLimit((l) => l + PAGE)}>Load more</button>
          <span className="text-[12px] text-muted-foreground">Showing {shown.length} of {items.length}</span>
        </div>
      )}
      </section>}

      {tab === "files" && dragOver && (
        <div className="pointer-events-none absolute inset-2 z-20 flex items-center justify-center rounded-[20px] border-2 border-dashed border-ink bg-canvas/90 backdrop-blur-sm">
          <div className="text-center"><Upload className="mx-auto h-10 w-10 animate-bounce" /><p className="mt-3 font-display text-[20px] font-bold">Drop to save into {crumbs.at(-1)?.name ?? "Brand Assets"}</p></div>
        </div>
      )}

      {preview && <PreviewPanel meta={[["Type", extOf(preview.name).toUpperCase() || preview.kind], ["Size", formatBytes(preview.size_bytes)], ["Added", relativeDate(preview.created_at)], ["Added by", who(preview.created_by)], ["Folder", folderName(preview.folder_id) || "Brand Assets"]]} file={preview} onClose={() => setPreview(null)} onUnpack={() => void unpack(preview)} />}

      <AlertDialog open={!!dupes} onOpenChange={(o) => !o && setDupes(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dupes?.length} duplicate{dupes?.length === 1 ? "" : "s"} found</AlertDialogTitle>
            <AlertDialogDescription>These are extra copies of files already in your library. The oldest copy of each is kept.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-[240px] space-y-1 overflow-y-auto text-[13px]">{dupes?.map((d) => <li key={d.id} className="flex justify-between gap-2"><span className="truncate">{d.name}</span><span className="shrink-0 text-muted-foreground">{folderName(d.folder_id) || "Brand Assets"}</span></li>)}</ul>
          <AlertDialogFooter><AlertDialogCancel>Keep them</AlertDialogCancel><AlertDialogAction onClick={() => { if (dupes) void doDelete(dupes.map((row) => ({ type: "file" as const, row }))).then(() => { toast.success("Duplicates removed"); setDupes(null); }); }}>Remove duplicates</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NameDialog open={!!naming} title={naming?.mode === "rename" ? "Rename" : "New folder"}
        description={naming?.mode === "rename" ? undefined : `Creates a folder in ${crumbs.at(-1)?.name ?? "Brand Assets"}. Sam uses folder names to understand what files are.`}
        initial={naming?.mode === "rename" ? naming.it.row.name : ""} cta={naming?.mode === "rename" ? "Save" : "Create folder"}
        onClose={() => setNaming(null)}
        onSubmit={async (name) => { if (naming?.mode === "rename") await rename(naming.it, name); else await newFolder(name); setNaming(null); }} />

      <MoveDialog open={moveOpen} onClose={() => setMoveOpen(false)} folders={folders} count={selected.size} exclude={[...selected]}
        onMove={async (target) => { await move([...selected], target); setMoveOpen(false); }}
        onCreate={async (name) => { const id = await newFolder(name, null); if (id) { await move([...selected], id); setMoveOpen(false); } }} />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirmDelete?.length === 1 ? `"${confirmDelete[0]?.row.name}"` : `${confirmDelete?.length} items`}?</AlertDialogTitle>
            <AlertDialogDescription>Files are removed permanently, including everything inside deleted folders.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => confirmDelete && void doDelete(confirmDelete)}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function DropCrumb({ label, onClick, onDropIds, active }: { label: string; onClick: () => void; onDropIds: (ids: string[]) => void; active: boolean }) {
  const [over, setOver] = useState(false);
  return (
    <button type="button" onClick={onClick} onDragOver={(e) => { if (e.dataTransfer.types.includes("text/x-asset-ids")) { e.preventDefault(); setOver(true); } }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const ids = e.dataTransfer.getData("text/x-asset-ids"); if (ids) { e.stopPropagation(); onDropIds(JSON.parse(ids)); } }}
      className={cn("rounded-[8px] px-2 py-1", active ? "font-semibold" : "text-muted-foreground hover:text-foreground", over && "bg-ink text-inverse")}>{label}</button>
  );
}

function useMediaLinks(file: FileRow | null, enabled = true) {
  const get = useServerFn(getMediaLinks);
  return useQuery({
    queryKey: ["media-links", file?.id], enabled: !!file?.media_id && enabled, staleTime: 45 * 60 * 1000,
    queryFn: () => get({ data: { file_id: file!.id } }),
  }).data ?? null;
}

function useSignedUrl(path: string | null, enabled = true) {
  return useQuery({
    queryKey: ["signed", path], enabled: !!path && !isAutoToastPath(path) && enabled, staleTime: 50 * 60 * 1000,
    queryFn: async () => (await supabase.storage.from(BUCKET).createSignedUrl(path!, 3600)).data?.signedUrl ?? null,
  }).data ?? null;
}

function Tile({ it, selected, selecting, selectedIds, count, onOpen, onToggle, onRename, onDelete, onDropIds, onExtract }: {
  onExtract: () => void; it: Item; selected: boolean; selecting: boolean; selectedIds: Set<string>; count: number; onOpen: () => void; onToggle: (shift: boolean) => void; onRename: () => void; onDelete: () => void; onDropIds: (ids: string[]) => void;
}) {
  const [over, setOver] = useState(false);
  const [thumbnailFailed, setThumbnailFailed] = useState(false);
  const isImg = it.type === "file" && (it.row.kind === "image" || it.row.kind === "logo");
  const url = useSignedUrl(it.type === "file" ? it.row.storage_path : null, isImg);
  const media = useMediaLinks(it.type === "file" ? it.row : null, it.type === "file" && it.row.kind === "video");
  useEffect(() => setThumbnailFailed(false), [media?.thumbnail_url]);
  const Icon = it.type === "folder" ? Folder : ICONS[it.row.kind] ?? FileIcon;
  return (
    <div draggable onClick={(e) => { if (selecting && !(e.target as HTMLElement).closest("button, input")) onToggle(e.shiftKey); }} onDragStart={(e) => e.dataTransfer.setData("text/x-asset-ids", JSON.stringify(selected ? [...selectedIds] : [it.row.id]))}
      onDragOver={(e) => { if (it.type === "folder" && e.dataTransfer.types.includes("text/x-asset-ids")) { e.preventDefault(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { setOver(false); const ids = e.dataTransfer.getData("text/x-asset-ids"); if (it.type === "folder" && ids) { e.stopPropagation(); onDropIds(JSON.parse(ids)); } }}
      className={cn("group relative flex flex-col overflow-hidden rounded-[14px] border bg-surface transition-[border-color,transform] hover:-translate-y-0.5", selected || over ? "border-ink" : "border-border")}>
      <button type="button" onClick={(e) => selecting ? onToggle(e.shiftKey) : onOpen()} className="flex aspect-[4/3] w-full shrink-0 items-center justify-center overflow-hidden bg-surface-subtle [&>img]:h-full [&>img]:w-full">
        {it.type === "file" && it.row.kind === "archive" ? <span className="flex flex-col items-center gap-2"><ZipBadge large /><span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold tracking-wider text-inverse">ZIP · not opened</span></span> : media?.thumbnail_url && !thumbnailFailed ? <img src={media.thumbnail_url} alt={it.row.name} loading="lazy" onError={() => setThumbnailFailed(true)} className="h-full w-full object-contain" /> : isImg && url ? <img src={url} alt={it.row.name} loading="lazy" className={cn("h-full w-full object-contain", it.row.kind === "logo" && "p-4")} /> : it.type === "file" && it.row.extracted_text ? <span className="h-full w-full overflow-hidden whitespace-pre-line p-3 text-left text-[10px] leading-snug text-muted-foreground [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">{it.row.extracted_text.slice(0, 500)}</span> : <Icon className={cn("h-10 w-10", it.type === "folder" ? "text-ink" : "text-muted-foreground")} strokeWidth={1.5} />}
      </button>
      <div className="flex items-start gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium" title={it.row.name}>{it.type === "file" && Date.now() - new Date(it.row.created_at).getTime() < 86400000 && <span className="mr-1 rounded-full bg-ink px-1.5 py-px align-middle text-[9px] font-bold uppercase tracking-wider text-inverse">New</span>}{it.row.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">{it.type === "folder" ? `${count} items` : `${it.row.ai_label ?? it.row.kind} · ${relativeDate(it.row.created_at)}`}</p>
          {it.type === "file" && (it.row.ai_label
            ? <p className="mt-0.5 truncate text-[11px] font-medium text-foreground" title={it.row.ai_summary ?? "Sam understands this file"}>✓ Sam understands this</p>
            : <p className="mt-0.5 animate-pulse text-[11px] text-muted-foreground">Sam is reading…</p>)}
        </div>
        {it.type === "file" && extOf(it.row.name) && <span className="shrink-0 rounded-[6px] border border-border-control px-1.5 py-0.5 text-[10px] font-bold uppercase">{extOf(it.row.name)}</span>}
      </div>
      {it.type === "file" && it.row.kind === "archive" && !isAutoToastPath(it.row.storage_path) && (
        <div className="px-2.5 pb-2.5"><button type="button" onClick={onExtract} className={cn(primary, "h-8 w-full justify-center")}><PackageOpen className="h-4 w-4" />Extract</button></div>
      )}
      <button type="button" role="checkbox" aria-checked={selected} aria-label={`Select ${it.row.name}`} onClick={(e) => onToggle(e.shiftKey)} className={cn("absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full border-2 border-ink bg-surface text-ink", !selecting && !selected && "opacity-0 group-hover:opacity-100 focus:opacity-100")}>{selected && <Check className="h-4 w-4" />}</button>
      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button type="button" aria-label="Rename" onClick={onRename} className="rounded-[8px] bg-surface/90 p-1.5 shadow-sm"><Pencil className="h-3.5 w-3.5" /></button>
        <button type="button" aria-label="Delete" onClick={onDelete} className="rounded-[8px] bg-surface/90 p-1.5 shadow-sm"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}

function PreviewPanel({ file, onClose, onUnpack, meta }: { meta: [string, string][]; file: FileRow; onClose: () => void; onUnpack: () => void }) {
  const signed = useSignedUrl(file.storage_path);
  const download = useQuery({ queryKey: ["signed-download", file.storage_path, file.name], enabled: !file.media_id && !isAutoToastPath(file.storage_path), staleTime: 50 * 60 * 1000, queryFn: async () => (await supabase.storage.from(BUCKET).createSignedUrl(file.storage_path, 3600, { download: file.name })).data?.signedUrl ?? null }).data;
  const media = useMediaLinks(file);
  const url = file.media_id ? media?.playback_url ?? null : signed;
  const dl = file.media_id ? media?.download_url ?? null : download;
  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[520px] flex-col border-l border-border bg-surface shadow-2xl" aria-label="File preview">
      <header className="flex items-center gap-2 border-b border-border p-4">
        <div className="min-w-0 flex-1"><p className="break-all font-semibold">{file.name}</p><p className="text-[12px] text-muted-foreground">{file.ai_label ?? file.kind} · {formatBytes(file.size_bytes)}</p></div>
        {dl && <a href={dl} download={file.name} className={ghost} aria-label="Download"><Download className="h-4 w-4" /></a>}
        <button type="button" aria-label="Close" onClick={onClose} className={ghost}><X className="h-4 w-4" /></button>
      </header>
      <div className="flex-1 overflow-auto p-4">
        <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">{meta.map(([k, v]) => <Fragment key={k}><dt className="text-muted-foreground">{k}</dt><dd className="truncate">{v}</dd></Fragment>)}</dl>
        {file.ai_summary && <p className="mb-4 rounded-[12px] bg-surface-subtle p-3 text-[13px]"><Sparkles className="mr-1 inline h-3.5 w-3.5" />{file.ai_summary}</p>}
        {(file.kind === "image" || file.kind === "logo") && url && <img src={url} alt={file.name} className="mx-auto max-h-[70vh] rounded-[12px] object-contain" />}
        {file.kind === "video" && url && <BrandedVideo src={url} thumbnail={media?.thumbnail_url} downloadUrl={dl} name={file.name} />}
        {file.kind === "audio" && url && <audio src={url} controls className="w-full" />}
        {file.media_id && media?.status === "processing" && <p className="mb-3 text-[13px] text-muted-foreground">Still processing — playback appears shortly.</p>}
        {file.media_id && file.transcript_status === "pending" && <p className="mb-3 text-[13px] text-muted-foreground">Transcript on its way — Sam will read it once it's ready.</p>}
        {file.extracted_text && <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed">{file.extracted_text}</pre>}
        {file.kind === "archive" && (
          <div className="mb-4 rounded-[12px] border border-border p-4">
            <p className="text-[13px]">This ZIP hasn't been opened yet. Unpack it so its images and files show up here and Sam can read them.</p>
            <button type="button" className={cn(primary, "mt-3")} onClick={onUnpack}><PackageOpen className="h-4 w-4" />Unpack ZIP</button>
          </div>
        )}
        {!["image", "logo", "video", "audio", "archive"].includes(file.kind) && !file.extracted_text && <p className="text-[13px] text-muted-foreground">No preview for this type. Download it to open.</p>}
      </div>
    </aside>
  );
}

function ScanCard({ url, setUrl, scanning, onScan, compact }: { url: string; setUrl: (s: string) => void; scanning: boolean; onScan: () => void; compact?: boolean }) {
  const valid = /^https?:\/\/.+\..+/.test(url);
  return (
    <div className={cn("rounded-[18px] border border-border bg-surface p-6", !compact && "flex min-h-[240px] flex-col justify-center")}>
      <Globe className="h-6 w-6" />
      <p className="mt-3 font-display text-[18px] font-bold">{compact ? "Add a website" : "Or start from a website"}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">Sam scans the site and saves its copy, colours and fonts. Website images can also be collected for review.</p>
      <form className="mt-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (valid && !scanning) onScan(); }}>
        <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://yourbrand.com" aria-label="Website address" />
        <button type="submit" className={primary} disabled={!valid || scanning}>{scanning ? "Scanning…" : "Scan"}</button>
      </form>
    </div>
  );
}

function BrandProfileCard({ ws, onRebuild, hasFiles, autoChecking }: { ws: string; onRebuild: () => Promise<void>; hasFiles: boolean; autoChecking: boolean }) {
  const [busy, setBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState<"primary" | "accent" | null>(null);
  const [custom, setCustom] = useState("");
  const qc = useQueryClient();
  const ensurePalette = useServerFn(ensureBrandPalette);
  const saveRole = useServerFn(setBrandPaletteRole);
  const { data } = useQuery({
    queryKey: ["brand-profile", ws],
    queryFn: async () => (await supabase.from("brand_profiles").select("profile,strength,updated_at").eq("workspace_id", ws).maybeSingle()).data,
    refetchInterval: autoChecking ? 5000 : false,
  });
  const p = (data?.profile ?? null) as null | { name?: string; what_it_is?: string; tone?: string; colours?: string[]; palette?: BrandPalette; gaps?: string[]; approved_claims?: string[] };
  useEffect(() => {
    if (!p || autoChecking) return;
    void ensurePalette({ data: { workspace_id: ws } }).then((result) => {
      if (result.changed) void qc.invalidateQueries({ queryKey: ["brand-profile", ws] });
    }).catch(() => {});
  }, [ws, !!p, !!p?.palette?.swatches?.length, autoChecking]);
  const setRole = async (role: "primary" | "accent", hex: string) => {
    setRoleBusy(role);
    try {
      await saveRole({ data: { workspace_id: ws, role, hex } });
      await qc.invalidateQueries({ queryKey: ["brand-profile", ws] });
      setCustom("");
      toast.success(`${role === "primary" ? "Primary" : "Accent"} colour saved`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save the colour."); }
    finally { setRoleBusy(null); }
  };
  return (
    <section className="rounded-[18px] border border-border bg-surface p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Brand profile</p>
          <h2 className="mt-1 font-display text-[20px] font-bold">{p?.name || (autoChecking ? "Sam is learning your brand…" : "Sam hasn't read your brand yet")}</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">{p?.what_it_is || (autoChecking ? "Reviewing the website and public social profiles saved in workspace settings." : "Drop a brand folder or scan your website. Sam turns it into the profile she uses for every piece of content.")}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-[28px] font-extrabold tabular-nums">{data?.strength ?? 0}<span className="text-[14px] text-muted-foreground">/100</span></p>
          <p className="text-[11px] text-muted-foreground">Ready to create</p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full bg-ink transition-[width] duration-700" style={{ width: `${data?.strength ?? 0}%` }} /></div>
      {p && (
        <div className="mt-4 grid gap-3 text-[13px] md:grid-cols-3">
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Tone</p><p>{p.tone || "Unknown"}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Colours</p><p className="flex flex-wrap gap-1">{(p.colours ?? []).slice(0, 6).map((c) => <span key={c} className="rounded-full border border-border-control px-2 py-0.5 text-[11px]">{c}</span>)}{!p.colours?.length && "Unknown"}</p></div>
          <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">Gaps</p><p>{p.gaps?.length ? p.gaps.slice(0, 3).join(" · ") : "None found"}</p></div>
        </div>
      )}
      {p && (
        <div className="mt-5 border-t border-border pt-4">
          <h3 className="font-display text-[16px] font-bold">Colour palette</h3>
          <p className="mt-1 text-[12px] text-muted-foreground">{p.palette?.source_url ? `Extracted from ${new URL(p.palette.source_url).hostname}. Choose how Sam uses these colours.` : "Scan the website to detect its colours, then choose a primary and accent."}</p>
          {!!p.palette?.swatches?.length ? (
            <>
              <div className="mt-3 flex flex-wrap gap-2">
                {p.palette.swatches.map((hex) => <button key={hex} type="button" className="flex items-center gap-2 rounded-[10px] border border-border-control bg-surface px-2 py-1.5 text-[12px] hover:bg-surface-subtle" title={`Copy ${hex}`} onClick={() => void navigator.clipboard.writeText(hex).then(() => toast.success(`Copied ${hex}`)).catch(() => toast.error("Could not copy the hex code."))}><span className="h-5 w-5 rounded-[5px] border border-border-control" style={{ backgroundColor: hex }} />{hex}<span className="text-muted-foreground">Copy</span></button>)}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(["primary", "accent"] as const).map((role) => <label key={role} className="text-[12px] font-medium capitalize">{role} colour<select className={cn(sel, "mt-1 block w-full")} value={p.palette?.[role] ?? ""} disabled={!!roleBusy} onChange={(e) => void setRole(role, e.target.value)} aria-label={`${role} colour`}>{!p.palette?.[role] && <option value="">Choose a colour</option>}{p.palette!.swatches.map((hex) => <option key={hex} value={hex}>{hex}</option>)}</select></label>)}
              </div>
            </>
          ) : <p className="mt-3 text-[12px] text-muted-foreground">No website colours detected yet.</p>}
          <form className="mt-3 flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); if (hexColour(custom)) void setRole("primary", custom); }}>
            <Input className="w-36" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="#E2058B" aria-label="Custom hex colour" maxLength={7} />
            <button type="button" className={ghost} disabled={!hexColour(custom) || !!roleBusy} onClick={() => void setRole("primary", custom)}>Set primary</button>
            <button type="button" className={ghost} disabled={!hexColour(custom) || !!roleBusy} onClick={() => void setRole("accent", custom)}>Set accent</button>
          </form>
        </div>
      )}
      {hasFiles && (
        <button type="button" className={cn(ghost, "mt-4")} disabled={busy} onClick={async () => { setBusy(true); await onRebuild(); setBusy(false); }}>
          <Sparkles className="h-4 w-4" />{busy ? "Sam is reading…" : "Ask Sam to re-read everything"}
        </button>
      )}
    </section>
  );
}

function NameDialog({ open, title, description, initial, cta, onClose, onSubmit }: { open: boolean; title: string; description?: string | undefined; initial: string; cta: string; onClose: () => void; onSubmit: (name: string) => Promise<void> }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setName(initial); }, [open, initial]);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle>{description && <DialogDescription>{description}</DialogDescription>}</DialogHeader>
        <form onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; setBusy(true); await onSubmit(name); setBusy(false); }}>
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. App Screenshots" aria-label="Name" />
          <DialogFooter className="mt-4"><button type="button" className={ghost} onClick={onClose}>Cancel</button><button type="submit" className={primary} disabled={!name.trim() || busy}>{busy ? "Saving…" : cta}</button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({ open, onClose, folders, count, exclude, onMove, onCreate }: { open: boolean; onClose: () => void; folders: FolderRow[]; count: number; exclude: string[]; onMove: (target: string | null) => Promise<void>; onCreate: (name: string) => Promise<void> }) {
  const [target, setTarget] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTarget(null); setNewName(""); } }, [open]);
  const path = (f: FolderRow): string => { const p = folders.find((x) => x.id === f.parent_id); return p ? `${path(p)} / ${f.name}` : f.name; };
  const list = folders.filter((f) => !exclude.includes(f.id)).map((f) => ({ id: f.id, label: path(f) })).sort((a, b) => a.label.localeCompare(b.label));
  const go = async (fn: () => Promise<void>) => { setBusy(true); await fn(); setBusy(false); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Move {count} item{count === 1 ? "" : "s"}</DialogTitle><DialogDescription>Pick a category. Sam reads folder names to understand what these files are.</DialogDescription></DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newName.trim()) void go(() => onCreate(newName)); }}>
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category, e.g. App Screenshots" aria-label="New folder name" />
          <button type="submit" className={primary} disabled={!newName.trim() || busy}><FolderPlus className="h-4 w-4" />Create & move</button>
        </form>
        <div className="max-h-[320px] overflow-y-auto rounded-[12px] border border-border">
          {[{ id: null as string | null, label: "Brand Assets (top level)" }, ...list].map((f) => (
            <button key={f.id ?? "root"} type="button" onClick={() => setTarget(f.id)} className={cn("flex w-full items-center gap-2 border-b border-border px-3 py-2.5 text-left text-[13px] last:border-0 hover:bg-surface-subtle", target === f.id && "bg-surface-subtle font-semibold")}>
              <Folder className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">{f.label}</span>{target === f.id && <Check className="h-4 w-4" />}
            </button>
          ))}
        </div>
        <DialogFooter><button type="button" className={ghost} onClick={onClose}>Cancel</button><button type="button" className={primary} disabled={busy} onClick={() => void go(() => onMove(target))}>{busy ? "Moving…" : "Move here"}</button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ZipBadge({ large }: { large?: boolean }) {
  const sz = large ? "h-16 w-14" : "h-9 w-8";
  return (
    <span className={cn("relative inline-flex shrink-0 items-start justify-center rounded-[6px] border-2 border-ink bg-surface", sz)} aria-hidden>
      <span className="mt-0.5 flex flex-col items-center">{Array.from({ length: large ? 5 : 3 }, (_, i) => <span key={i} className={cn("h-1 bg-ink", large ? "w-2" : "w-1.5", i % 2 ? "translate-x-1" : "-translate-x-1")} />)}</span>
      <span className={cn("absolute bottom-1 rounded-[3px] bg-ink font-bold text-inverse", large ? "px-1 text-[9px]" : "px-0.5 text-[6px]")}>ZIP</span>
    </span>
  );
}
