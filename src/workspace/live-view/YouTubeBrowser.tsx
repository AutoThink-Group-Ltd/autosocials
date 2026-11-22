import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Home, Search, X, Play, ExternalLink } from "lucide-react";
import { browseYouTube, getYouTubeComments, getYouTubeVideos } from "@/lib/youtube.functions";
import { youtubePlayerError, youtubeWatchUrl, type YouTubeVideo } from "@/lib/youtube";

export type YouTubeBrowserInitial = { videoIds?: string[]; selectedVideoId?: string; query?: string; channelId?: string };
type BrowseOrder = "relevance" | "date" | "viewCount";
type Gallery = { order?: BrowseOrder; videoIds?: string[]; query?: string; channelId?: string; scrollTop: number };
type Screen = Gallery & { selectedVideoId?: string; video?: YouTubeVideo };
type Player = { destroy: () => void; getIframe: () => HTMLIFrameElement };
type PlayerOptions = { videoId: string; width: string; height: string; playerVars: { autoplay: number; controls: number; playsinline: number; origin: string }; events: { onError: (event: { data: number }) => void; onReady: () => void } };
type PlayerAPI = { Player: new (element: HTMLElement, options: PlayerOptions) => Player };
type YouTubeWindow = Window & { YT?: PlayerAPI; onYouTubeIframeAPIReady?: () => void };
let playerAPI: Promise<PlayerAPI> | undefined;

function loadPlayerAPI(): Promise<PlayerAPI> {
  const host = window as YouTubeWindow;
  if (host.YT?.Player) return Promise.resolve(host.YT);
  if (playerAPI) return playerAPI;
  playerAPI = new Promise<PlayerAPI>((resolve, reject) => {
    const previous = host.onYouTubeIframeAPIReady;
    let finished = false;
    const finish = (error?: Error) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      host.onYouTubeIframeAPIReady = previous;
      if (error) reject(error);
      else if (host.YT?.Player) resolve(host.YT);
      else reject(new Error("YouTube player is unavailable."));
    };
    const timeout = window.setTimeout(() => finish(new Error("YouTube player took too long to load. Try opening the video on YouTube.")), 15000);
    host.onYouTubeIframeAPIReady = () => { try { previous?.(); } finally { finish(); } };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => { script.remove(); finish(new Error("YouTube player could not load.")); };
      document.head.appendChild(script);
    }
  }).catch((error: unknown) => { playerAPI = undefined; throw error; });
  return playerAPI;
}

/** A video selection loads the official player; playback still requires pressing Play. */
export function YouTubePlayer({ video }: { video: YouTubeVideo }) {
  const mount = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!video.available || !video.embeddable) return;
    let cancelled = false;
    let player: Player | undefined;
    const container = mount.current;
    setReady(false); setError(null);
    void loadPlayerAPI().then((api) => {
      if (cancelled || !container) return;
      const target = document.createElement("div");
      container.appendChild(target);
      player = new api.Player(target, {
        width: "100%", height: "100%", videoId: video.id,
        playerVars: { autoplay: 0, controls: 1, playsinline: 1, origin: window.location.origin },
        events: {
          onReady: () => { if (cancelled) return; setReady(true); const frame = player?.getIframe(); if (frame) { frame.title = video.title || "YouTube video player"; frame.referrerPolicy = "strict-origin-when-cross-origin"; } },
          onError: (event) => { if (!cancelled) setError(youtubePlayerError(event.data)); },
        },
      });
    }).catch((cause: unknown) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "YouTube player could not load."); });
    return () => { cancelled = true; player?.destroy(); container?.replaceChildren(); };
  }, [video.id, video.title, video.available, video.embeddable]);
  const unavailable = !video.available ? "This video is unavailable or private." : !video.embeddable ? "This creator does not allow embedded playback." : null;
  return <div style={{ width: "min(100cqw, calc(100cqh * 16 / 9))" }} className="relative aspect-video max-h-full min-h-0 max-w-full overflow-hidden rounded-xl bg-ink text-inverse">
    {!unavailable && !error && <div ref={mount} className="absolute inset-0 [&_iframe]:h-full [&_iframe]:w-full" />}
    {!ready && !error && !unavailable && <div role="status" className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm">Loading YouTube player…</div>}
    {(error || unavailable) && <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-5 text-center"><p role={error ? "alert" : "status"}>{error || unavailable}</p><a href={youtubeWatchUrl(video.id)} target="_blank" rel="noopener noreferrer" className="underline">Watch on YouTube ↗</a></div>}
  </div>;
}

export function youtubeMetric(value: number | undefined, label: string) {
  return value === undefined ? `${label} unavailable` : `${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value)} ${label}`;
}
function publishedLabel(value?: string) {
  return value && Number.isFinite(Date.parse(value))
    ? "Published " + new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(value)) + " UTC"
    : "Published date/time unavailable";
}

function dateLabel(value?: string) { return value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "Date unavailable"; }

export function YouTubeVideoCard({ video, onSelect, onChannel }: { video: YouTubeVideo; onSelect: () => void; onChannel: () => void }) {
  return <article className="min-w-0">
    <button type="button" onClick={onSelect} className="group block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink">
      <div className="relative aspect-video overflow-hidden rounded-xl bg-surface-subtle">{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]" /> : <div className="flex h-full items-center justify-center"><Play className="h-9 w-9 text-muted-foreground" /></div>}<span className="absolute bottom-2 right-2 rounded bg-ink/90 px-2 py-1 text-[10px] font-semibold text-inverse">Watch</span></div>
      <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-snug text-foreground">{video.title || "YouTube video"}</h3>
    </button>
    <div className="mt-2 flex items-start gap-2"><button type="button" onClick={onChannel} aria-label={`View channel ${video.channelTitle || "creator"}`} className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-subtle size-8 text-xs font-semibold">{video.channelAvatarUrl ? <img src={video.channelAvatarUrl} alt="" className="h-full w-full object-cover" /> : (video.channelTitle || "YT").slice(0, 2).toUpperCase()}</button><div className="min-w-0"><button type="button" onClick={onChannel} className="block max-w-full truncate text-left text-xs text-muted-foreground hover:text-foreground">{video.channelTitle || "Channel unavailable"}</button><p className="mt-0.5 text-[11px] text-muted-foreground">{youtubeMetric(video.viewCount, "views")} · {youtubeMetric(video.likeCount, "likes")} · {youtubeMetric(video.commentCount, "comments")}</p><p className="mt-0.5 text-[11px] text-muted-foreground">{publishedLabel(video.publishedAt)}</p></div></div>
  </article>;
}

function WatchDetails({ workspaceId, video }: { workspaceId: string; video: YouTubeVideo }) {
  const getComments = useServerFn(getYouTubeComments);
  const [showComments, setShowComments] = useState(false);
  const comments = useQuery({ queryKey: ["youtube-comments", workspaceId, video.id], queryFn: () => getComments({ data: { workspace_id: workspaceId, video_id: video.id } }), enabled: showComments && video.available, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false });
  return <div className="space-y-4 text-sm"><details><summary className="cursor-pointer font-semibold">Description & video details</summary><div className="mt-3 space-y-3"><p className="text-xs text-muted-foreground">{youtubeMetric(video.viewCount, "views")} · {youtubeMetric(video.likeCount, "likes")} · {dateLabel(video.publishedAt)}</p><p className="whitespace-pre-wrap break-words text-muted-foreground">{video.description || "No public description available."}</p><p className="text-xs text-muted-foreground">Titles, descriptions and comments are creator or viewer claims. They do not verify which AI model or production method was used.</p></div></details>
    <button type="button" onClick={() => setShowComments((value) => !value)} className="font-semibold underline underline-offset-4">{showComments ? "Hide comments" : "Load comments"}</button>
    {showComments && <div className="space-y-3">{comments.isLoading && <p role="status">Loading comments…</p>}{comments.isError && <p role="alert">{comments.error instanceof Error ? comments.error.message : "Comments could not load."}</p>}{comments.data?.notice && <p className="text-muted-foreground">{comments.data.notice}</p>}{comments.data && !comments.data.comments.length && !comments.data.notice && <p>No public comments returned.</p>}{comments.data?.comments.map((comment) => <article key={comment.id} className="rounded-lg bg-surface-subtle p-3"><p className="font-semibold">{comment.author || "YouTube viewer"}</p><p className="mt-1 whitespace-pre-wrap break-words">{comment.text}</p></article>)}</div>}
  </div>;
}

export function YouTubeBrowser({ workspaceId, initial, onClose }: { workspaceId: string | null; initial?: YouTubeBrowserInitial; onClose: () => void }) {
  const browse = useServerFn(browseYouTube);
  const getVideos = useServerFn(getYouTubeVideos);
  const [current, setCurrent] = useState<Screen>(() => ({ ...initial, scrollTop: 0 }));
  const [history, setHistory] = useState<Screen[]>(() => initial?.selectedVideoId ? [{ ...initial, selectedVideoId: undefined, scrollTop: 0 }] : []);
  const [search, setSearch] = useState(initial?.query || "");
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setCurrent({ ...initial, scrollTop: 0 });
    setHistory(initial?.selectedVideoId ? [{ ...initial, selectedVideoId: undefined, scrollTop: 0 }] : []);
    setSearch(initial?.query || "");
  }, [initial]);
  const navigate = (next: Screen) => { setHistory((items) => [...items, { ...current, scrollTop: scroll.current?.scrollTop || 0 }]); setCurrent(next); setSearch(next.query || ""); };
  const back = () => { const previous = history.at(-1); if (!previous) return; setHistory((items) => items.slice(0, -1)); setCurrent(previous); setSearch(previous.query || ""); };
  const references = useQuery({ queryKey: ["youtube-gallery", workspaceId, current.videoIds], queryFn: () => getVideos({ data: { workspace_id: workspaceId!, video_ids: current.videoIds! } }), enabled: !!workspaceId && !!current.videoIds?.length, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false });
  const gallery = useInfiniteQuery({ queryKey: ["youtube-browse", workspaceId, current.query, current.channelId, current.order], initialPageParam: undefined as string | undefined, queryFn: ({ pageParam }) => browse({ data: { workspace_id: workspaceId!, query: current.query || undefined, channel_id: current.channelId, page_token: pageParam, ...(current.order ? { order: current.order } : {}) } }), getNextPageParam: (last) => last.next_page_token, enabled: !!workspaceId && !current.videoIds?.length && !current.selectedVideoId, staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false });
  const selected = useQuery({ queryKey: ["youtube-watch", workspaceId, current.selectedVideoId], queryFn: () => getVideos({ data: { workspace_id: workspaceId!, video_ids: [current.selectedVideoId!] } }), enabled: !!workspaceId && !!current.selectedVideoId && !current.video && !current.videoIds?.includes(current.selectedVideoId), staleTime: 5 * 60 * 1000, refetchOnWindowFocus: false, retry: false });
  const video = current.video || references.data?.videos.find((item) => item.id === current.selectedVideoId) || selected.data?.videos[0];
  const videos = current.videoIds?.length ? [...(references.data?.videos || [])] : gallery.data?.pages.flatMap((page) => page.videos).filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index) || [];
  if (current.videoIds?.length && current.order && current.order !== "relevance") videos.sort((a, b) => current.order === "date" ? (Date.parse(b.publishedAt || "") || 0) - (Date.parse(a.publishedAt || "") || 0) : (b.viewCount ?? -1) - (a.viewCount ?? -1));
  const loading = current.videoIds?.length ? references.isLoading : gallery.isLoading;
  const error = current.selectedVideoId ? selected.error || references.error : current.videoIds?.length ? references.error : gallery.error;
  const channel = gallery.data?.pages[0]?.channel;
  const openChannel = (item: YouTubeVideo) => navigate({ channelId: item.channelId, query: item.channelId ? undefined : item.channelTitle, scrollTop: 0 });
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = current.scrollTop; }, [current]);
  return <section aria-label="YouTube browser" className="flex h-full min-h-0 flex-col overflow-hidden bg-surface text-foreground">
    <header className="z-10 flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-3 sm:px-5">
      <button type="button" aria-label="Back to previous view" disabled={!history.length} onClick={back} className="rounded-full p-2 hover:bg-surface-subtle disabled:opacity-30"><ArrowLeft className="size-5" /></button>
      <div className="mr-1 flex items-center gap-1.5 font-display text-lg font-bold tracking-tight"><span className="flex h-6 w-9 items-center justify-center rounded-lg bg-destructive text-destructive-foreground"><Play className="size-4 fill-current" /></span>YouTube</div>
      <form onSubmit={(event) => { event.preventDefault(); if (search.trim()) navigate({ query: search.trim(), scrollTop: 0 }); }} className="order-last flex w-full min-w-0 overflow-hidden rounded-full border border-border-control sm:order-none sm:mx-auto sm:w-auto sm:flex-1 sm:max-w-xl"><input aria-label="Search YouTube" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search YouTube" className="min-w-0 flex-1 bg-transparent px-4 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink" /><button type="submit" aria-label="Search" className="border-l border-border-control bg-surface-subtle px-4"><Search className="size-4" /></button></form>
      <button type="button" onClick={() => navigate({ scrollTop: 0 })} className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium hover:bg-surface-subtle"><Home className="size-4" /><span className="hidden sm:inline">Home</span></button>
      <button type="button" onClick={onClose} aria-label="Close YouTube and return to work" className="flex items-center gap-1.5 rounded-full border border-border-control px-3 py-2 text-xs font-semibold"><span className="hidden sm:inline">Return to work</span><X className="size-4" /></button>
    </header>
    {!workspaceId ? <p role="status" className="p-6 text-sm text-muted-foreground">Choose a workspace to browse YouTube.</p> : current.selectedVideoId ? <div style={{ containerType: "size" }} className="flex min-h-0 flex-1 flex-col px-3 pb-3 pt-3 sm:px-5">
      {video ? <><div style={{ containerType: "size", height: "min(max(0px, calc(100cqh - 15rem)), calc(100cqw * 9 / 16))" }} className="flex w-full shrink-0 items-start justify-center overflow-hidden"><YouTubePlayer key={video.id} video={video} /></div><div className="shrink-0 py-3"><h2 className="line-clamp-2 font-display text-base font-bold sm:text-xl">{video.title || "YouTube video"}</h2><div aria-label="Video statistics" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span>{youtubeMetric(video.viewCount, "views")}</span><span>{youtubeMetric(video.likeCount, "likes")}</span><span>{youtubeMetric(video.commentCount, "comments")}</span><span title="YouTube does not expose public dislike counts through its Data API.">Dislikes unavailable</span><span>{publishedLabel(video.publishedAt)}</span></div><div className="mt-2 flex items-center justify-between gap-3"><button type="button" onClick={() => openChannel(video)} className="flex min-w-0 items-center gap-2 text-sm font-semibold"><span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-subtle text-xs">{video.channelAvatarUrl ? <img src={video.channelAvatarUrl} alt="" className="size-full object-cover" /> : (video.channelTitle || "YT").slice(0, 2)}</span><span className="truncate">{video.channelTitle || "Channel unavailable"}</span></button><a href={youtubeWatchUrl(video.id)} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground">YouTube<ExternalLink className="size-3" /></a></div></div><div className="min-h-0 flex-1 overflow-y-auto border-t border-border pt-3"><WatchDetails key={video.id} workspaceId={workspaceId} video={video} /></div></> : <div className="p-5"><p role={error ? "alert" : "status"}>{error instanceof Error ? error.message : "Loading video…"}</p><a href={youtubeWatchUrl(current.selectedVideoId)} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm underline">Watch on YouTube ↗</a></div>}
    </div> : <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6"><div className="mb-6"><p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">{current.channelId ? "Channel" : current.videoIds?.length ? "Sam’s references" : current.query ? "Search results" : "Discover"}</p><h2 className="font-display text-2xl font-bold tracking-tight">{current.channelId ? channel?.title || "Channel videos" : current.query ? `Results for “${current.query}”` : current.videoIds?.length ? "Video references" : "Popular on YouTube"}</h2>{channel?.description ? <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-muted-foreground">{channel.description}</p> : !current.query && !current.channelId && !current.videoIds?.length && <p className="mt-2 text-sm text-muted-foreground">Explore popular public videos. This feed is not personalised.</p>}</div>
      {(current.query || current.channelId || current.videoIds?.length) && <div className="mb-5 flex flex-wrap items-center gap-3"><label className="flex items-center gap-2 text-sm font-medium">Sort by<select aria-label="Sort videos" value={current.order || (current.channelId ? "date" : "relevance")} onChange={(event) => navigate({ ...current, order: event.target.value as BrowseOrder, scrollTop: 0 })} className="rounded-full border border-border-control bg-surface px-4 py-2 text-sm"><option value="date">Newest</option><option value="viewCount">Most viewed</option>{!current.channelId && <option value="relevance">{current.videoIds?.length ? "Sam’s order" : "Relevance"}</option>}</select></label>{!!current.videoIds?.length && <span className="text-xs text-muted-foreground">Sorts these references only.</span>}</div>}
      {loading && <p role="status" className="py-8 text-sm text-muted-foreground">Loading YouTube videos…</p>}{error && <div role="alert" className="mb-5 rounded-xl border border-warning/40 bg-warning-surface p-4 text-sm text-warning">{error instanceof Error ? error.message : "YouTube videos could not load."}<button type="button" onClick={() => void (current.videoIds?.length ? references.refetch() : gallery.refetch())} className="ml-3 underline">Try again</button></div>}
      <div className="grid grid-cols-1 gap-x-5 gap-y-8 @md:grid-cols-2 @3xl:grid-cols-3 sm:grid-cols-2 xl:grid-cols-3">{videos.map((item) => <YouTubeVideoCard key={item.id} video={item} onSelect={() => navigate({ ...current, selectedVideoId: item.id, video: item, scrollTop: 0 })} onChannel={() => openChannel(item)} />)}</div>
      {!loading && !error && !videos.length && <p className="py-8 text-sm text-muted-foreground">No public videos found. Try another search.</p>}{gallery.hasNextPage && !current.videoIds?.length && <div className="mt-8 text-center"><button type="button" disabled={gallery.isFetchingNextPage} onClick={() => void gallery.fetchNextPage()} className="rounded-full border border-border-control px-6 py-2 text-sm font-semibold disabled:opacity-50">{gallery.isFetchingNextPage ? "Loading more…" : "Load more videos"}</button></div>}
    </div>}
  </section>;
}
