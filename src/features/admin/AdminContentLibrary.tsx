import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Film, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminContentLinks, listAdminContent } from "@/lib/admin-content.functions";
import type { AdminContentVideo } from "@/lib/admin-content.functions";
import { useAdminContentDelete, type DeletableContent } from "./AdminContentDelete";

const deletionTarget = (video: AdminContentVideo): DeletableContent => ({ target: video.id, workspaceId: video.workspaceId, label: video.title });

export default function AdminContentLibrary() {
  const deletion = useAdminContentDelete("video");
  const list = useServerFn(listAdminContent);
  const [page, setPage] = useState(0);
  const [view, setView] = useState<"gallery" | "table">("gallery");
  const [draftSearch, setDraftSearch] = useState("");
  const [draftModel, setDraftModel] = useState("");
  const [filters, setFilters] = useState({ search: "", model: "" });
  const query = useQuery({ queryKey: ["admin-content-library", page, filters.search, filters.model], queryFn: () => list({ data: { page, ...filters } }), refetchOnWindowFocus: false });
  const result = query.data;
  const pageSize = result?.pageSize ?? 24;
  function search(event: FormEvent) { event.preventDefault(); setPage(0); setFilters({ search: draftSearch.trim(), model: draftModel.trim() }); }
  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Content / All workspaces</p><h1 className="mt-2 font-display text-[30px] font-bold tracking-tight">Video library</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Every completed video with a saved file, including earlier versions. Available only to Super Admins.</p></div>
      <Button variant="outline" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />Refresh</Button>
    </header>
    <form onSubmit={search} className="grid gap-3 rounded-2xl border border-border-control bg-canvas p-4 sm:grid-cols-[1fr_1fr_auto]">
      <label className="space-y-1.5 text-xs font-semibold">Saved title or model<Input value={draftSearch} onChange={(event) => setDraftSearch(event.target.value)} maxLength={100} placeholder="Search saved production titles…" /></label>
      <label className="space-y-1.5 text-xs font-semibold">Model filter<Input value={draftModel} onChange={(event) => setDraftModel(event.target.value)} maxLength={200} placeholder="Any model" /></label>
      <Button type="submit" className="self-end"><Search className="h-4 w-4" />Search</Button>
      <p className="text-[11px] leading-relaxed text-muted-foreground sm:col-span-3">Older videos without a saved brief use the current asset's title and dimensions for display. Title search uses saved production titles; model search includes legacy videos.</p>
    </form>
    {query.isPending ? <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Loading videos…</div>
      : query.isError ? <div role="alert" className="rounded-2xl border border-border-control bg-canvas p-6"><p className="font-semibold">The library couldn't be loaded</p><p className="mt-2 text-sm text-muted-foreground">Check your Super Admin access or try again.</p><Button className="mt-4" variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>
        : <>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted-foreground"><b className="text-foreground">{(result?.total ?? 0).toLocaleString()}</b> completed videos{filters.search || filters.model ? " matching these filters" : " across the system"}</p><div className="flex gap-2" aria-label="Video library view"><Button size="sm" variant={view === "gallery" ? "default" : "outline"} aria-pressed={view === "gallery"} onClick={() => setView("gallery")}>Gallery</Button><Button size="sm" variant={view === "table" ? "default" : "outline"} aria-pressed={view === "table"} onClick={() => setView("table")}>Table</Button></div></div>
          {deletion.toolbar((result?.videos ?? []).map(deletionTarget))}
          {result?.videos.length ? view === "table" ? <VideoTable videos={result.videos} deletion={deletion} /> : <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{result.videos.map((video) => <VideoCard key={video.id} video={video} deletion={deletion} />)}</div> : <div className="rounded-2xl border border-dashed border-border-control p-12 text-center"><Film className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-semibold">No completed videos found</p><p className="mt-2 text-sm text-muted-foreground">{filters.search || filters.model ? "Try a different title or model filter." : "Videos appear here after production completes and the file is saved."}</p></div>}
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border-control pt-4 text-xs text-muted-foreground"><span>{result?.total ? page * pageSize + 1 : 0}–{Math.min((page + 1) * pageSize, result?.total ?? 0)} of {result?.total ?? 0}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((old) => old - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= (result?.total ?? 0)} onClick={() => setPage((old) => old + 1)}>Next</Button></div></footer>
        </>}
    {deletion.dialog}
  </div>;
}

type Deletion = ReturnType<typeof useAdminContentDelete>;
function VideoCard({ video, deletion }: { video: AdminContentVideo; deletion: Deletion }) {
  const getLinks = useServerFn(getAdminContentLinks);
  const media = useQuery({ queryKey: ["admin-content-links", video.id], queryFn: () => getLinks({ data: { renderId: video.id } }), staleTime: 10 * 60_000, retry: 1 });
  const [playError, setPlayError] = useState(false);
  const links = media.data; const busy = media.isFetching; const error = media.isError ? "The saved file could not be opened. Try refreshing its links." : playError ? "Playback is unavailable. Refresh the video links or try downloading the MP4." : null;
  function prepare() { setPlayError(false); void media.refetch(); }
  return <article className="overflow-hidden rounded-2xl border border-border-control bg-canvas">
    <div className="flex min-h-48 items-center justify-center bg-surface-subtle p-3">
      {links?.playback ? <video controls preload="metadata" src={links.playback} aria-label={video.title} className="max-h-96 w-full rounded-lg" onError={() => setPlayError(true)} />
        : <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">{busy ? <><Loader2 className="h-8 w-8 animate-spin" />Loading preview…</> : <Button size="sm" variant="outline" onClick={prepare}>Retry preview</Button>}</div>}
    </div>
    <div className="space-y-4 p-4">
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={deletion.isSelected(deletionTarget(video))} onChange={() => deletion.toggle(deletionTarget(video))} />Select {video.title}</label>
      <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold"><span className="rounded-full border border-border-control px-2 py-0.5">Completed</span><span className="text-muted-foreground">{video.version == null ? "Legacy version" : `Version ${video.version}`}</span></div><h2 className="break-words font-display text-base font-bold leading-snug">{video.title}</h2><p className="mt-1 break-words text-xs text-muted-foreground">{video.workspace}</p></div>
      <dl className="grid grid-cols-2 gap-3 text-xs"><div><dt className="text-muted-foreground">Model</dt><dd className="mt-1 break-words font-medium">{video.model ?? "Not recorded"}</dd></div><div><dt className="text-muted-foreground">Format</dt><dd className="mt-1 font-medium">{video.duration == null ? "Duration unknown" : `${video.duration}s`} · {video.size ?? "Size unknown"}</dd></div><div><dt className="text-muted-foreground">Created</dt><dd className="mt-1">{new Date(video.createdAt).toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Last updated</dt><dd className="mt-1">{new Date(video.completedAt).toLocaleString()}</dd></div></dl>
      {!video.snapshot && <p className="text-[11px] text-muted-foreground">Legacy metadata · no frozen production title</p>}
      {error && <p role="alert" className="text-xs leading-relaxed text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-border-control pt-3">
        <Button size="sm" variant="destructive" onClick={() => deletion.deleteOne(deletionTarget(video))}>Delete</Button>
        {links?.download ? <a href={links.download} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-control bg-surface px-3 text-xs font-semibold hover:bg-surface-subtle"><Download className="h-3.5 w-3.5" />Download MP4</a>
          : <Button size="sm" variant="outline" disabled={busy} onClick={() => void prepare()}><Download className="h-3.5 w-3.5" />{busy ? "Preparing…" : "Prepare download"}</Button>}
        {links && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void prepare()}><RefreshCw className="h-3.5 w-3.5" />Refresh links</Button>}
      </div>
      {links && <p className="text-[10px] leading-relaxed text-muted-foreground">Private links expire. Refresh them if needed. Download speed depends on the video size and connection.</p>}
    </div>
  </article>;
}

function VideoTable({ videos, deletion }: { videos: AdminContentVideo[]; deletion: Deletion }) {
  return <div className="overflow-x-auto rounded-2xl border border-border-control bg-canvas"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr className="border-b border-border-control text-muted-foreground">{["Select", "Preview", "Title", "Workspace", "Status", "Model", "Format", "Created", "Last updated", "Download", "Delete"].map(label => <th key={label} className="p-3 font-medium">{label}</th>)}</tr></thead><tbody>{videos.map(video => <VideoTableRow key={video.id} video={video} deletion={deletion} />)}</tbody></table></div>;
}
function VideoTableRow({ video, deletion }: { video: AdminContentVideo; deletion: Deletion }) {
  const getLinks = useServerFn(getAdminContentLinks);
  const media = useQuery({ queryKey: ["admin-content-links", video.id], queryFn: () => getLinks({ data: { renderId: video.id } }), staleTime: 10 * 60_000, retry: 1 });
  return <tr className="border-b border-border-control last:border-0"><td className="p-3"><input type="checkbox" aria-label={`Select ${video.title}`} checked={deletion.isSelected(deletionTarget(video))} onChange={() => deletion.toggle(deletionTarget(video))} /></td><td className="p-3">{media.data?.playback ? <video src={media.data.playback} controls preload="metadata" aria-label={video.title} className="max-h-32 w-32 rounded-lg" /> : media.isError ? <Button size="sm" variant="outline" onClick={() => void media.refetch()}>Retry</Button> : <span className="text-xs text-muted-foreground">Loading…</span>}</td><td className="p-3 font-medium">{video.title}<p className="text-xs text-muted-foreground">{video.version == null ? "Legacy version" : `Version ${video.version}`}</p></td><td className="p-3">{video.workspace}</td><td className="p-3">Completed</td><td className="p-3">{video.model ?? "Not recorded"}</td><td className="p-3">{video.duration == null ? "Unknown" : `${video.duration}s`} · {video.size ?? "Unknown"}</td><td className="p-3">{new Date(video.createdAt).toLocaleString()}</td><td className="p-3">{new Date(video.completedAt).toLocaleString()}</td><td className="p-3">{media.data?.download ? <a href={media.data.download} target="_blank" rel="noopener noreferrer" className="underline">Download MP4</a> : "Unavailable"}</td><td className="p-3"><Button size="sm" variant="destructive" onClick={() => deletion.deleteOne(deletionTarget(video))}>Delete</Button></td></tr>;
}
