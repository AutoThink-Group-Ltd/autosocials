import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, ChevronLeft, ChevronRight, ImageOff, Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { analyseBrandSocialPost } from "@/lib/brand-social-analysis.functions";
import { FeedVideo } from "@/components/publishing/FeedVideo";
import { getLinkedInFeedVideo } from "@/lib/linkedin-feed-video.functions";
import { useEffect, useRef } from "react";

export type ReviewPost = { url: string; date: string | null; caption: string; cover: string | null; hasVideo?: boolean };

function LinkedInVideo({ workspaceId, post }: { workspaceId: string; post: ReviewPost }) {
  const video = useRef<HTMLVideoElement>(null);
  const resolve = useServerFn(getLinkedInFeedVideo);
  const query = useQuery({ queryKey: ["linkedin-feed-video", workspaceId, post.url], queryFn: () => resolve({ data: { workspace_id: workspaceId, post_url: post.url } }), staleTime: 0, retry: false });
  useEffect(() => {
    if (!query.data?.url || !video.current) return;
    const element = video.current;
    let cancelled = false;
    let player: { destroy: () => void } | undefined;
    if (element.canPlayType("application/vnd.apple.mpegurl")) element.src = query.data.url;
    else void import("hls.js").then(({ default: Hls }) => {
      if (cancelled || !Hls.isSupported()) return;
      const hls = new Hls(); player = hls; hls.loadSource(query.data!.url!); hls.attachMedia(element);
    });
    return () => { cancelled = true; player?.destroy(); element.removeAttribute("src"); element.load(); };
  }, [query.data?.url]);
  if (query.isPending) return <p role="status" className="p-8 text-sm text-muted-foreground">Loading video…</p>;
  if (query.isError || !query.data?.url) return <p className="p-8 text-sm text-muted-foreground">Video unavailable. Open the original post to watch it.</p>;
  return <video ref={video} poster={post.cover ?? undefined} controls playsInline className="max-h-[65dvh] w-full" />;
}
export function SocialPostViewer({ workspaceId, platform, posts, index, onIndex, onClose }: { workspaceId: string; platform: string; posts: ReviewPost[]; index: number | null; onIndex: (index: number) => void; onClose: () => void }) {
  const post = index === null ? null : posts[index] ?? null;
  const analyse = useServerFn(analyseBrandSocialPost);
  const query = useQuery({
    queryKey: ["brand-social-post-analysis", workspaceId, post?.url], enabled: !!post,
    queryFn: () => analyse({ data: { workspace_id: workspaceId, post_url: post!.url } }),
    staleTime: Infinity, retry: false,
    refetchInterval: (q) => q.state.data?.status === "running" ? 3000 : false,
  });
  const analysis = query.data?.analysis;
  return <Dialog open={!!post} onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="flex max-h-[92dvh] w-[min(96vw,1150px)] max-w-none flex-col gap-0 overflow-hidden p-0">
    <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 pr-14"><div><DialogTitle className="font-display text-lg">{platform === "x" ? "X" : platform[0]?.toUpperCase() + platform.slice(1)} post</DialogTitle><DialogDescription className="mt-1">{index !== null ? `${index + 1} of ${posts.length}` : ""} · Browse this channel’s posts</DialogDescription></div><div className="flex items-center gap-2"><button type="button" aria-label="Previous post" disabled={index === null || index === 0} onClick={() => onIndex(index! - 1)} className="rounded-full border border-border p-2 disabled:opacity-30"><ChevronLeft className="size-4" /></button><button type="button" aria-label="Next post" disabled={index === null || index >= posts.length - 1} onClick={() => onIndex(index! + 1)} className="rounded-full border border-border p-2 disabled:opacity-30"><ChevronRight className="size-4" /></button></div></div>
    {post && <div className="grid min-h-0 overflow-y-auto md:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]"><div className="min-w-0 bg-surface-subtle p-4 sm:p-6"><div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-background">{platform === "linkedin" && post.hasVideo ? <LinkedInVideo key={post.url} workspaceId={workspaceId} post={post} /> : (post.hasVideo || platform === "tiktok" || platform === "youtube") ? <FeedVideo key={post.url} platform={platform} permalink={post.url} thumbnail={post.cover} /> : <>{post.cover ? <img key={post.url} src={post.cover} alt="Available post cover" referrerPolicy="no-referrer" className="max-h-[65dvh] w-full object-contain" onError={(event) => { event.currentTarget.style.display = "none"; event.currentTarget.nextElementSibling?.removeAttribute("hidden"); }} /> : null}<p hidden={!!post.cover} className="p-8 text-center text-sm text-muted-foreground"><ImageOff className="mx-auto mb-2 size-6" />Post image unavailable</p></>}</div><p className="mt-3 text-xs text-muted-foreground">{post.hasVideo ? "Video from the original public post." : "Available cover image; additional slides may not be included."}</p><p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{post.caption || "No caption was available."}</p><a href={post.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1 text-sm font-semibold underline">Open original post <ArrowUpRight className="size-4" /></a></div>
      <aside className="min-w-0 border-border bg-card p-5 sm:p-7 md:border-l"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><Sparkles className="size-4" /> Sam’s analysis</p><h2 className="mt-3 font-display text-2xl font-bold">A closer look</h2>{query.isPending || query.data?.status === "running" ? <p role="status" className="mt-5 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Sam is reviewing this post…</p> : query.isError || !analysis ? <div role="alert" className="mt-5 text-sm text-muted-foreground"><p>Sam couldn’t complete this analysis. You can still open the original post.</p></div> : <div className="mt-5 space-y-5"><p className="text-sm leading-relaxed">{analysis.summary}</p>{analysis.strengths.length > 0 && <div><h3 className="text-sm font-semibold">What stands out</h3><ul className="mt-2 space-y-2">{analysis.strengths.map((point, i) => <li key={i} className="rounded-xl bg-surface-subtle p-3 text-sm leading-relaxed">{point}</li>)}</ul></div>}<div><h3 className="text-sm font-semibold">An opportunity</h3><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{analysis.opportunity}</p></div><p className="border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">{analysis.basis === "caption_and_cover" ? "Based on the saved caption and cover image." : "Based on the saved caption only."} Sam hasn’t inspected video footage, other slides or post performance.</p></div>}</aside></div>}
  </DialogContent></Dialog>;
}
