import { Maximize2, Download, Share2, CalendarDays } from "lucide-react";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getAssetVersionPlayback } from "@/lib/asset-versions.functions";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useSafeScheduleAdd, PublishingHistory } from "./useSafeScheduleAdd";
import type { AssetChannelStatus } from "@/features/schedule/useAssetPublishingStatus";

type FinishedVideo = {
  id: string;
  variant_id: string;
  created_at: string;
  brief_snapshot: { hook?: string; size?: string; duration_s?: number } | null;
  creative_variants: { hook: string; size: string; duration_s: number; review_state: string; primary_render_id: string | null } | null;
};

const PAGE = 12;
const title = (video: FinishedVideo) => video.brief_snapshot?.hook || video.creative_variants?.hook || "Your video";
const format = (video: FinishedVideo) => video.brief_snapshot?.size || video.creative_variants?.size || "1080x1920";

function VideoCard({ video, onOpen, checked, onSelect, selectionFull, onPost, statuses, selectable }: { video: FinishedVideo; onOpen: () => void; checked: boolean; onSelect: (checked: boolean) => void; selectionFull: boolean; onPost: () => void; statuses: AssetChannelStatus[]; selectable: boolean }) {
  const playback = useServerFn(getAssetVersionPlayback);
  const [notice, setNotice] = useState("");
  const media = useQuery({ queryKey: ["home-video-playback", video.variant_id, video.id], queryFn: () => playback({ data: { id: video.variant_id, render_id: video.id } }), staleTime: 15 * 60_000 });
  const [width, height] = format(video).split("x").map(Number);
  const shape = width && height ? (height > width ? "Portrait" : width > height ? "Landscape" : "Square") : "Video";
  async function share() {
    if (!media.data?.url) return;
    try { if (navigator.share) await navigator.share({ title: title(video), url: media.data.url }); else { await navigator.clipboard.writeText(media.data.url); setNotice("Temporary link copied."); } }
    catch (error) { if (!(error instanceof Error && error.name === "AbortError")) setNotice("Could not share this video."); }
  }
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-border-control bg-surface">
    <div className="flex items-center justify-center bg-ink" style={{ aspectRatio: width && height ? `${width} / ${height}` : "4 / 3", maxHeight: "min(60vh,520px)" }}>
      {media.data?.url ? <video src={media.data.url} controls playsInline preload="metadata" className="h-full w-full object-contain" aria-label={`Preview ${title(video)}`} /> : <span className="p-6 text-sm text-inverse">{media.isError ? "Preview unavailable" : `Loading ${shape.toLowerCase()} video…`}</span>}
    </div>
    <div className="space-y-3 p-4"><label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" aria-label={`Select ${title(video)}`} checked={checked} disabled={!selectable || (!checked && selectionFull)} onChange={event => onSelect(event.target.checked)} className="size-4 accent-ink" />Select</label><h3 className="line-clamp-2 font-display text-base font-semibold">{title(video)}</h3><PublishingHistory statuses={statuses} /><p className="text-xs text-muted-foreground">{new Date(video.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p><div className="flex flex-wrap gap-2 text-sm font-semibold"><button type="button" onClick={onPost} aria-label={`Add ${title(video)} to Schedule`} title="Add to Schedule" className="rounded-xl border border-border-control p-2 disabled:opacity-50"><CalendarDays className="size-4" /></button><button onClick={onOpen} aria-label={`Open ${title(video)}`} title="Open" className="rounded-xl border border-border-control p-2"><Maximize2 className="size-4" /></button>{media.data?.download_url && <a href={media.data.download_url} download aria-label={`Download ${title(video)}`} title="Download" className="rounded-xl border border-border-control p-2"><Download className="size-4" /></a>}<button onClick={() => void share()} disabled={!media.data?.url} aria-label={`Share ${title(video)}`} title="Share link" className="rounded-xl border border-border-control p-2 disabled:opacity-50"><Share2 className="size-4" /></button></div><p className="text-xs text-muted-foreground">Shared links are temporary.</p>{notice && <p role="status" className="text-xs">{notice}</p>}</div>
  </article>;
}

export function HomeVideoGallery({ workspaceId }: { workspaceId: string }) {
  const playback = useServerFn(getAssetVersionPlayback);
  const [selectedVideos, setSelectedVideos] = useState<string[]>([]);
  const [selected, setSelected] = useState<FinishedVideo | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const videos = useInfiniteQuery({
    queryKey: ["home-finished-videos", workspaceId],
    initialPageParam: 0,
    getNextPageParam: (last: FinishedVideo[], pages: FinishedVideo[][]) => last.length === PAGE ? pages.length * PAGE : undefined,
    queryFn: async ({ pageParam }): Promise<FinishedVideo[]> => {
      const { data, error } = await supabase.from("render_jobs")
        .select("id,variant_id,created_at,brief_snapshot,creative_variants!render_jobs_variant_id_fkey(hook,size,duration_s,review_state,primary_render_id)")
        .eq("workspace_id", workspaceId).eq("status", "done").not("storage_path", "is", null)
        .order("created_at", { ascending: false }).range(pageParam, pageParam + PAGE - 1);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as FinishedVideo[];
    },
  });
  const full = useQuery({
    queryKey: ["home-video-playback", selected?.variant_id, selected?.id],
    queryFn: () => playback({ data: { id: selected!.variant_id, render_id: selected!.id } }),
    enabled: !!selected,
    staleTime: 15 * 60_000,
  });
  const all = videos.data?.pages.flat() ?? [];
  const safe = useSafeScheduleAdd(workspaceId, { videoIds: all.map(video => video.variant_id) }, Object.fromEntries(all.map(video => [video.variant_id, title(video)])));
  if (!videos.isPending && !videos.isError && !all.length) return <p className="rounded-xl border border-dashed border-border-control p-6 text-sm text-muted-foreground">No finished videos yet.</p>;
  const eligible = all.filter((video, index) => { const primary = video.creative_variants?.primary_render_id; return video.creative_variants && (primary ? primary === video.id : all.findIndex(item => item.variant_id === video.variant_id) === index); });
  const selection = selectedVideos.filter(id => eligible.some(video => video.variant_id === id));
  function addSelectedVideos() { if (selection.length) void safe.add({ videoIds: selection }); }
  return <section aria-label="Your finished videos" className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Made for you</p><h2 className="mt-1 font-display text-2xl font-bold">Your finished videos</h2></div><Link to="/app/sam-creations" className="text-sm font-semibold underline underline-offset-4">Open all creations →</Link></div>
    {videos.isPending && <p role="status" className="text-sm text-muted-foreground">Loading your videos…</p>}
    {videos.isError && <p role="alert" className="text-sm">Your videos could not be loaded. <button type="button" onClick={() => void videos.refetch()} className="underline">Try again</button></p>}
    <div className="flex flex-wrap items-center gap-3"><button type="button" disabled={!selection.length} onClick={() => void addSelectedVideos()} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-inverse disabled:opacity-50">{`Add to Schedule${selection.length ? ` (${selection.length})` : ""}`}</button><button type="button" disabled={!eligible.length} onClick={() => setSelectedVideos(eligible.slice(0, 20).map(video => video.variant_id))} className="text-sm underline disabled:opacity-50">Select all shown (up to 20)</button>{selection.length > 0 && <button type="button" className="text-sm underline" onClick={() => setSelectedVideos([])}>Clear selection</button>}</div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{all.map((video) => <VideoCard key={video.id} video={video} selectable={eligible.some(item => item.id === video.id)} statuses={safe.history.data?.[video.variant_id] ?? []} checked={eligible.some(item => item.id === video.id) && selection.includes(video.variant_id)} selectionFull={selection.length >= 20} onSelect={checked => setSelectedVideos(current => checked ? [...current, video.variant_id] : current.filter(id => id !== video.variant_id))} onPost={() => void safe.add({ videoIds: [video.variant_id] })} onOpen={() => { setPlaybackError(false); setSelected(video); }} />)}</div>
    {videos.hasNextPage && <button type="button" disabled={videos.isFetchingNextPage} onClick={() => void videos.fetchNextPage()} className="rounded-xl border border-border-control px-4 py-2 text-sm font-semibold disabled:opacity-50">{videos.isFetchingNextPage ? "Loading…" : "Show more videos"}</button>}
    {safe.history.isError && <p role="alert" className="text-sm text-destructive">Publishing history unavailable. Try again before adding videos.</p>}{safe.confirmation}
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="flex max-h-[95dvh] w-[min(95vw,1200px)] max-w-none flex-col"><DialogTitle className="pr-8">{selected ? title(selected) : "Video"}</DialogTitle>{selected && <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-xl bg-ink text-inverse" style={{ minHeight: "min(70dvh,600px)" }}>
      {full.data?.url && !playbackError ? <video key={selected.id} src={full.data.url} controls playsInline preload="metadata" autoPlay className="max-h-[76dvh] max-w-full object-contain" aria-label={`Full size preview of ${title(selected)}`} onError={() => setPlaybackError(true)} /> : <p className="p-6 text-center text-sm">{playbackError || full.isError ? "This preview is unavailable. Try opening the video in Sam’s creations." : "Opening your video…"}</p>}
    </div>}{selected && <div className="flex justify-end gap-4 text-sm"><Link to="/app/sam-creations" className="underline underline-offset-4">Open in Sam’s creations</Link>{full.data?.download_url && <a href={full.data.download_url} download className="font-semibold underline underline-offset-4">Download original MP4</a>}</div>}</DialogContent></Dialog>
  </section>;
}
