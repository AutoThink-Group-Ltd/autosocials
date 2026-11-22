import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getYouTubeVideos } from "@/lib/youtube.functions";
import { youtubeWatchUrl, type YouTubeGalleryBlock } from "@/lib/youtube";
import { useWorkspaceUiOptional } from "@/workspace/WorkspaceUi";
import { YouTubeBrowser, YouTubeVideoCard, type YouTubeBrowserInitial } from "../YouTubeBrowser";
export { youtubeMetric } from "../YouTubeBrowser";

export function YouTubeGallery({ b, workspaceId, onChange }: {
  b: YouTubeGalleryBlock; workspaceId?: string | null; onChange: (block: YouTubeGalleryBlock) => void;
}) {
  const getVideos = useServerFn(getYouTubeVideos);
  const ui = useWorkspaceUiOptional();
  const [inline, setInline] = useState<YouTubeBrowserInitial | null>(null);
  const details = useQuery({
    queryKey: ["youtube-gallery", workspaceId, b.video_ids],
    queryFn: () => getVideos({ data: { workspace_id: workspaceId!, video_ids: b.video_ids } }),
    enabled: !!workspaceId, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false,
  });
  const open = (initial: YouTubeBrowserInitial) => { if (ui) ui.openYouTube(initial); else setInline(initial); };
  if (inline) return <div className="h-[min(780px,80dvh)] min-h-[360px] overflow-hidden rounded-2xl border border-border"><YouTubeBrowser workspaceId={workspaceId || null} initial={inline} onClose={() => setInline(null)} /></div>;
  return <section aria-label={b.title} className="space-y-4">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">YouTube references</p><h3 className="font-display text-xl font-bold">{b.title}</h3><p className="mt-1 text-sm text-muted-foreground">Search: {b.query}</p><p className="mt-1 text-xs text-muted-foreground">Search matches are references. A title alone does not verify the model used.</p></div>
      <button type="button" disabled={!workspaceId || details.isFetching} onClick={() => void details.refetch()} className="rounded-lg border border-border-control px-3 py-2 text-sm disabled:opacity-50">{details.isFetching ? "Refreshing…" : "Refresh details"}</button>
    </header>
    {!workspaceId && <p role="status" className="text-sm text-muted-foreground">Choose a workspace to load YouTube details.</p>}
    {details.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading current YouTube details…</p>}
    {details.isError && <p role="alert" className="rounded-xl border border-warning/40 bg-warning-surface p-3 text-sm text-warning">{details.error instanceof Error ? details.error.message : "YouTube details could not load."} You can still open the original videos below.</p>}
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {b.video_ids.map((id) => {
        const video = details.data?.videos.find((item) => item.id === id);
        return <div key={id}>
          {video ? <YouTubeVideoCard video={video} onSelect={() => { if (!ui) onChange({ ...b, selected_video_id: id }); open({ videoIds: b.video_ids, selectedVideoId: id, query: b.query }); }} onChannel={() => open({ channelId: video.channelId, query: video.channelId ? undefined : video.channelTitle })} /> : <button type="button" onClick={() => { if (!ui) onChange({ ...b, selected_video_id: id }); open({ videoIds: b.video_ids, selectedVideoId: id, query: b.query }); }} className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-xl bg-surface-subtle p-4 text-sm"><span className="font-semibold">YouTube reference</span><span className="text-xs text-muted-foreground">{id}</span></button>}
          <a href={youtubeWatchUrl(id)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-xs font-medium text-muted-foreground underline underline-offset-4">Open on YouTube ↗</a>
        </div>;
      })}
    </div>
  </section>;
}
