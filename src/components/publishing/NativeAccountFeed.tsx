import { useCallback, useEffect, useRef, useState } from "react";
import {
  Loader2,
  Heart,
  MessageCircle,
  RefreshCw,
  Images,
  Film,
  ExternalLink,
  LayoutGrid,
  List,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { FeedVideo } from "./FeedVideo";

export type FeedPlatform = "facebook" | "instagram" | "x" | "youtube" | "tiktok";
const FEED_FUNCTION: Record<FeedPlatform, string> = { facebook: "meta-fetch-feed", instagram: "meta-fetch-feed", x: "x-fetch-feed", youtube: "youtube-fetch-feed", tiktok: "tiktok-fetch-feed" };
const PLATFORM_LABEL: Record<FeedPlatform, string> = { facebook: "Facebook", instagram: "Instagram", x: "X", youtube: "YouTube", tiktok: "TikTok" };

interface FeedPost {
  id: string;
  platform: FeedPlatform;
  caption: string;
  media_type: "image" | "video" | "carousel" | "text";
  media_url: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  timestamp: string;
  like_count: number | null;
  comment_count: number | null;
  share_count: number | null;
}
interface AccountMeta {
  handle: string;
  display_name: string;
  avatar_url: string | null;
  platform: FeedPlatform;
}
interface Props {
  socialAccountId: string;
  fallbackName: string;
  fallbackHandle?: string | null;
  fallbackAvatar?: string | null;
  platform: FeedPlatform;
}

export function NativeAccountFeed({
  socialAccountId,
  fallbackName,
  fallbackHandle,
  fallbackAvatar,
  platform,
}: Props) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [account, setAccount] = useState<AccountMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const sequence = useRef(0);
  const confirmed = useRef(new Map<string, FeedPost>());
  const load = useCallback(
    async (after?: string) => {
      const request = ++sequence.current;
      setLoading(true);
      setError(null);
      try {
        const { data, error: failure } = await supabase.functions.invoke(
          FEED_FUNCTION[platform],
          {
            body: {
              social_account_id: socialAccountId,
              ...(after ? { cursor: after } : {}),
            },
          },
        );
        if (request !== sequence.current) return;
        if (failure || data?.error) {
          const providerError = failure?.context instanceof Response
            ? await failure.context.json().catch(() => null)
            : null;
          throw new Error(data?.error ?? providerError?.error ?? failure?.message ?? "Could not load feed");
        }
        const incoming: FeedPost[] = data.posts ?? [];
        setPosts((previous) => {
          const combined = after
            ? [...previous, ...incoming]
            : [...confirmed.current.values(), ...incoming];
          return [...new Map(combined.map((post) => [post.id, post])).values()];
        });
        setAccount(data.account ?? null);
        setCursor(data.next_cursor ?? null);
        setSyncedAt(new Date(data.fetched_at || Date.now()));
      } catch (failure) {
        if (request === sequence.current)
          setError(
            failure instanceof Error ? failure.message : "Could not load feed",
          );
      } finally {
        if (request === sequence.current) setLoading(false);
      }
    },
    [socialAccountId, platform],
  );
  const cancelRequests = useCallback(() => {
    sequence.current++;
  }, []);
  useEffect(() => {
    setPosts([]);
    setAccount(null);
    setCursor(null);
    setSyncedAt(null);
    confirmed.current.clear();
    void load();
    return cancelRequests;
  }, [load, cancelRequests]);
  useEffect(() => {
    let active = true;
    const channel = supabase
      .channel(`publish-feed-${socialAccountId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "post_targets",
          filter: `social_account_id=eq.${socialAccountId}`,
        },
        async ({ new: target }) => {
          if (target["status"] !== "published" || !target["platform_post_id"])
            return;
          const { data: post } = await supabase
            .from("posts")
            .select("caption,post_media(storage_path,kind,position)")
            .eq("id", String(target["post_id"]))
            .maybeSingle();
          if (!active || !post) return;
          const media = [...post.post_media].sort(
            (left, right) => left.position - right.position,
          )[0];
          const signed = media && media.kind !== "document"
            ? await supabase.storage
                .from("post-media")
                .createSignedUrl(media.storage_path, 3600)
            : null;
          if (!active) return;
          const item: FeedPost = {
            id: String(target["platform_post_id"]),
            platform,
            caption: String(target["caption_override"] || post.caption || ""),
            media_type:
              post.post_media.length > 1 || media?.kind === "document"
                ? "carousel"
                : media?.kind === "video"
                  ? "video"
                  : media
                    ? "image"
                    : "text",
            media_url: signed?.data?.signedUrl || null,
            thumbnail_url:
              media?.kind === "video" ? null : signed?.data?.signedUrl || null,
            permalink: target["permalink"] ? String(target["permalink"]) : null,
            timestamp: String(
              target["published_at"] || new Date().toISOString(),
            ),
            like_count: null,
            comment_count: null,
            share_count: null,
          };
          confirmed.current.set(item.id, item);
          setPosts((previous) => [
            item,
            ...previous.filter((existing) => existing.id !== item.id),
          ]);
          void load();
        },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [socialAccountId, platform, load]);
  const display = account?.display_name || fallbackName;
  const handle = account?.handle || fallbackHandle || "";
  const avatar = account?.avatar_url || fallbackAvatar || null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-sm font-semibold">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-full w-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            display.slice(0, 1).toUpperCase()
          )}
        </div>
        <div className="mr-auto min-w-0">
          <h3 className="truncate text-sm font-semibold">{display}</h3>
          <p className="text-[11px] text-muted-foreground">
            {platform === "facebook" ? "Facebook Page" : `@${handle}`} ·{" "}
            {posts.length} loaded posts
          </p>
        </div>
        {platform === "instagram" && (
          <div className="flex rounded-lg border p-0.5">
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              aria-label="Instagram grid view"
              aria-pressed={view === "grid"}
              onClick={() => setView("grid")}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-7 w-7"
              aria-label="Instagram list view"
              aria-pressed={view === "list"}
              onClick={() => setView("list")}
            >
              <List className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Refresh account feed"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
        </Button>
      </div>
      {syncedAt && (
        <p className="text-[10px] text-muted-foreground">
          Last synced{" "}
          {syncedAt.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          })}{" "}
          · Live account content
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-xs text-destructive"
        >
          {error}
          <Button
            variant="outline"
            size="sm"
            className="ml-2"
            onClick={() => void load()}
          >
            Try again
          </Button>
        </div>
      )}
      {loading && !posts.length ? (
        <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading live posts…
        </div>
      ) : !posts.length && !error ? (
        <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
          No published posts on this account yet.
        </div>
      ) : platform === "instagram" && view === "grid" ? (
        <div className="grid grid-cols-3 gap-1.5">
          {posts.map((post) => post.media_type === "video" ? (
            <div key={post.id} className="overflow-hidden rounded-lg border">{post.permalink && <a className="block p-2 text-xs font-semibold underline" href={post.permalink} target="_blank" rel="noreferrer">Open original post ↗</a>}<FeedVideo platform={platform} permalink={post.permalink} mediaUrl={post.media_url} thumbnail={post.thumbnail_url} /></div>
          ) : (
            <a
              key={post.id}
              href={post.permalink ?? undefined}
              target="_blank"
              rel="noreferrer"
              aria-label={post.caption || "View Instagram post"}
              className="group relative aspect-square overflow-hidden rounded-lg bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              {post.media_type === "video" &&
              !post.thumbnail_url &&
              post.media_url ? (
                <video
                  src={post.media_url}
                  preload="metadata"
                  muted
                  className="h-full w-full object-cover"
                />
              ) : (
                (post.thumbnail_url || post.media_url) && (
                  <img
                    src={(post.thumbnail_url || post.media_url)!}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                )
              )}
              {post.permalink && <span className="absolute left-1 top-1 rounded bg-background px-2 py-1 text-xs font-semibold">Open original post ↗</span>}
              <span className="absolute right-2 bottom-2 rounded bg-background/80 p-1">
                {post.media_type === "carousel" ? (
                  <Images className="h-3.5 w-3.5" />
                ) : post.media_type === "video" ? (
                  <Film className="h-3.5 w-3.5" />
                ) : null}
              </span>
              <span className="absolute inset-0 flex items-center justify-center gap-3 bg-ink/60 text-xs text-inverse opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                <span className="flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />
                  {formatNumber(post.like_count)}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {formatNumber(post.comment_count)}
                </span>
              </span>
            </a>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <article
              key={post.id}
              className="overflow-hidden rounded-2xl border bg-card shadow-xs"
            >
              <header className="flex items-center gap-2 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    display.slice(0, 1)
                  )}
                </div>
                <div>
                  <p className="text-xs font-semibold">{display}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(post.timestamp), {
                      addSuffix: true,
                    })}
                  </p>
                </div>
                {post.permalink && (
                  <a
                    href={post.permalink}
                    target="_blank"
                    aria-label={`Open original post on ${PLATFORM_LABEL[platform]}`}
                    rel="noreferrer"
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    Open original post
                    <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </header>
              {post.caption && (
                <p className="whitespace-pre-wrap px-4 pb-3 text-sm leading-relaxed">
                  {post.caption}
                </p>
              )}
              {post.media_type === "video" ? (
                <FeedVideo platform={platform} permalink={post.permalink} mediaUrl={post.media_url} thumbnail={post.thumbnail_url} />
              ) : (post.thumbnail_url || post.media_url) && (
                <a
                  href={post.permalink ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="relative block bg-muted"
                >
                  {post.media_type === "video" &&
                  !post.thumbnail_url &&
                  post.media_url ? (
                    <video
                      src={post.media_url}
                      preload="metadata"
                      muted
                      className="max-h-[440px] w-full object-contain"
                    />
                  ) : (
                    <img
                      src={(post.thumbnail_url || post.media_url)!}
                      alt=""
                      loading="lazy"
                      className="max-h-[440px] w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {post.media_type === "video" && (
                    <Film className="absolute bottom-3 right-3 h-7 w-7 rounded-full bg-background/80 p-1.5" />
                  )}
                </a>
              )}
              <footer className="flex items-center gap-3 px-4 py-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Heart className="h-3 w-3" /> {formatNumber(post.like_count)}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="h-3 w-3" />{" "}
                  {formatNumber(post.comment_count)}
                </span>
              </footer>
            </article>
          ))}
        </div>
      )}
      {cursor && (
        <Button
          variant="outline"
          className="w-full"
          disabled={loading}
          onClick={() => void load(cursor)}
        >
          {loading ? "Loading…" : "Load more posts"}
        </Button>
      )}
    </div>
  );
}
function formatNumber(value: number | null) {
  if (value == null) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(value);
}
