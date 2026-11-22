import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { StudioCtx, usePreviewMap } from "@/workspace/live-view/blocks/usePreviews";
import { FileTile, Lightbox } from "@/workspace/live-view/blocks/Studio";
import type { CreationFile } from "@/lib/content-recipes";
import { cn } from "@/lib/utils";
import { field, ghost } from "./shared";

const PAGE_SIZE = 24;
const SUPPORTED = new Set(["image", "logo", "video", "audio", "doc"]);
type Props = { ws: string; files: CreationFile[]; selectedIds: string[]; disabled?: boolean; onToggle: (id: string, selected: boolean) => void };

/** Uses the same authenticated previews and fullscreen player as Brand Assets and Sam's Live View. */
export function AssetLibraryGallery({ ws, files, selectedIds, disabled = false, onToggle }: Props) {
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all"), [page, setPage] = useState(0);
  const [viewer, setViewer] = useState<{ ids: string[]; at: string } | null>(null);
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  useEffect(() => { setPortalRoot(document.body); }, []);
  const filtered = useMemo(() => files.filter((file) => SUPPORTED.has(file.kind) && (filter === "all" || filter === "selected" ? filter !== "selected" || selectedIds.includes(file.id) : filter === "image" ? ["image", "logo"].includes(file.kind) : file.kind === filter) && `${file.name} ${file.ai_label ?? ""} ${file.ai_summary ?? ""}`.toLowerCase().includes(search.toLowerCase().trim())), [files, filter, search, selectedIds]);
  const lastPage = Math.max(0, Math.ceil(filtered.length / PAGE_SIZE) - 1), currentPage = Math.min(page, lastPage);
  const ordered = useMemo(() => [...filtered].sort((a, b) => Number(selectedIds.includes(b.id)) - Number(selectedIds.includes(a.id))), [filtered, selectedIds]);
  const visible = ordered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const ids = visible.map((file) => file.id);
  // One bounded request for the visible page; opening a preview never changes selected production inputs.
  const { previews, loading } = usePreviewMap(ws, ids);
  const normalized = useMemo(() => new Map([...previews].map(([id, preview]) => [id, (preview.kind === "audio" || preview.kind === "video") && !preview.playback && preview.url ? { ...preview, playback: preview.url } : preview])), [previews]);
  const open = useCallback((group: string[], at: string) => setViewer({ ids: group, at }), []);
  const close = useCallback(() => setViewer(null), []);
  function changePage(next: number) { setViewer(null); setPage(next); }
  return <StudioCtx.Provider value={{ workspaceId: ws, previews: normalized, loading, open }}>
    <section aria-label="Brand asset gallery" className="space-y-4">
      <div><h4 className="font-semibold">Your brand assets</h4><p className="mt-1 text-xs text-muted-foreground">Sam selects relevant assets for this idea. You can preview and change the selection. {selectedIds.length} of 20 selected.</p></div>
      <div className="flex flex-wrap gap-2"><label className="relative min-w-0 flex-1"><Search aria-hidden className="absolute left-3 top-3 size-4 text-muted-foreground" /><input type="search" aria-label="Search brand assets" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className={cn(field, "min-h-10 pl-9")} placeholder="Find photos, screenshots, footage…" /></label><select aria-label="Filter brand assets" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} className={cn(field, "min-h-10 w-auto")}><option value="all">All files</option><option value="image">Images & logos</option><option value="video">Videos</option><option value="audio">Audio</option><option value="doc">Documents</option><option value="selected">Selected</option></select></div>
      {visible.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{visible.map((file) => {
        const selected = selectedIds.includes(file.id);
        return <li key={file.id} className={cn("min-w-0 rounded-2xl border p-2", selected ? "border-ink bg-surface-subtle ring-1 ring-ink" : "border-border bg-canvas")}>
          <label className="mb-2 flex min-h-8 cursor-pointer items-center gap-2 px-1 text-xs font-semibold"><input type="checkbox" aria-label={file.name} checked={selected} disabled={disabled || !selected && selectedIds.length >= 20} onChange={(event) => onToggle(file.id, event.target.checked)} className="size-4 accent-ink" /><span>{selected ? "Selected" : "Select"}</span></label>
          <FileTile id={file.id} group={ids} aspect="aspect-[4/3]" caption={<><p className="mt-1 truncate text-[11px] text-muted-foreground">{file.ai_label ?? file.kind}</p>{file.source === "shutterstock" && <p className="mt-1 text-[10px] font-medium text-muted-foreground">Licensed illustrative stock</p>}</>} />
          {!normalized.has(file.id) && <p className="mt-2 break-words text-xs font-medium">{file.name}</p>}
        </li>;
      })}</ul> : <p className="rounded-xl border border-dashed border-border-control p-5 text-sm text-muted-foreground">{files.length ? "No assets match this view. Try another search or filter." : "No brand files yet. Upload your pack or save and return later."}</p>}
      {filtered.length > PAGE_SIZE && <div className="flex items-center justify-between gap-2"><button type="button" className={ghost} disabled={currentPage === 0} aria-label="Previous asset page" onClick={() => changePage(currentPage - 1)}><ChevronLeft size={16} />Previous</button><span className="text-xs text-muted-foreground">{currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} of {filtered.length}</span><button type="button" className={ghost} disabled={currentPage >= lastPage} aria-label="Next asset page" onClick={() => changePage(currentPage + 1)}>Next<ChevronRight size={16} /></button></div>}
      {viewer && portalRoot && createPortal(<Lightbox key={`${viewer.at}:${viewer.ids.join(",")}`} ids={viewer.ids} at={viewer.at} onClose={close} />, portalRoot)}
    </section>
  </StudioCtx.Provider>;
}
