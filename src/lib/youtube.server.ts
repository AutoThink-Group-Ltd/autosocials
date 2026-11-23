import { z } from "zod";
import { YouTubeBrowseInputSchema, YouTubeChannelIdSchema, YouTubePageTokenSchema, type YouTubeBrowseInput, type YouTubeBrowseResult, type YouTubeChannel, type YouTubeVideo, type YouTubeComment } from "./youtube";

const VideoId = z.string().regex(/^[A-Za-z0-9_-]{11}$/);
const count = (v: unknown): number | undefined => typeof v === "string" && /^\d+$/.test(v) && Number.isSafeInteger(Number(v)) ? Number(v) : undefined;
const Thumbnails = z.record(z.object({ url: z.string().url() }));
const Snippet = z.object({ title: z.string(), channelTitle: z.string(), channelId: YouTubeChannelIdSchema.optional(), description: z.string().default(""), publishedAt: z.string().optional(), thumbnails: Thumbnails.optional() });
const Item = z.object({ id: VideoId, snippet: Snippet, statistics: z.record(z.string()).optional(), contentDetails: z.object({ duration: z.string().optional() }).optional(), status: z.object({ embeddable: z.boolean().optional(), privacyStatus: z.string().optional() }).optional() });
const VideoPage = z.object({ items: z.array(Item).max(8), nextPageToken: YouTubePageTokenSchema.optional() });
const ChannelItem = z.object({ id: YouTubeChannelIdSchema, snippet: z.object({ title: z.string(), description: z.string().optional(), thumbnails: Thumbnails.optional() }), contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().min(1).max(100).optional() }).optional() }).optional() });
const thumbnailUrl = (thumbnails?: z.infer<typeof Thumbnails>) => (thumbnails?.maxres ?? thumbnails?.standard ?? thumbnails?.high ?? thumbnails?.medium ?? thumbnails?.default)?.url;

export class YouTubeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

/** No provider URLs or credentials are accepted from callers; public API data stays transient. */
export async function youtubeRequest(path: "search" | "videos" | "commentThreads" | "channels" | "playlistItems", params: Record<string, string>): Promise<unknown> {
  const key = process.env["YOUTUBE_API_KEY"];
  if (!key) throw new YouTubeError("not_configured", "YouTube search and statistics need YOUTUBE_API_KEY with YouTube Data API v3 enabled. You can still open videos on YouTube.");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  // Header keeps API keys out of URLs and error traces.
  const response = await fetch(url, { headers: { "X-Goog-Api-Key": key }, signal: AbortSignal.timeout(15_000) });
  const raw = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = z.object({ error: z.object({ errors: z.array(z.object({ reason: z.string() })).optional() }) }).safeParse(raw);
    const code = reason.success ? reason.data.error.errors?.[0]?.reason ?? "api_error" : "api_error";
    if (["quotaExceeded", "dailyLimitExceeded", "rateLimitExceeded"].includes(code)) throw new YouTubeError(code, "YouTube's API quota or request limit has been reached. Try later or open YouTube directly.");
    if (code === "commentsDisabled") throw new YouTubeError(code, "Comments are disabled for this video.");
    if (code === "videoNotFound" || response.status === 404) throw new YouTubeError("unavailable", "This video is unavailable or private.");
    if (response.status === 403 || response.status === 401) throw new YouTubeError(code, "YouTube API access was refused. Check that YouTube Data API v3 is enabled and the server API key restrictions allow it.");
    throw new YouTubeError("api_error", "YouTube could not complete this request. Please try again later.");
  }
  return raw;
}

export async function readYouTubeVideos(ids: string[]): Promise<{ videos: YouTubeVideo[]; fetched_at: string }> {
  const videoIds = z.array(VideoId).min(1).max(8).parse(ids);
  // id lookups are bounded by the validated ID array (maxResults applies to charts, not id).
  const raw = await youtubeRequest("videos", { part: "snippet,statistics,contentDetails,status", id: [...new Set(videoIds)].join(",") });
  const parsed = z.object({ items: z.array(Item) }).parse(raw);
  return decorateVideos(videoIds, parsed.items);
}

async function readChannels(ids: string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return [];
  return z.object({ items: z.array(ChannelItem).max(8) }).parse(await youtubeRequest("channels", { part: "snippet,contentDetails", id: unique.join(","), maxResults: "8" })).items;
}

const channelMetadata = (channel: z.infer<typeof ChannelItem>): YouTubeChannel => ({ id: channel.id, title: channel.snippet.title, avatarUrl: thumbnailUrl(channel.snippet.thumbnails), description: channel.snippet.description?.slice(0, 6000) });

async function decorateVideos(videoIds: string[], items: z.infer<typeof Item>[], knownChannels?: z.infer<typeof ChannelItem>[]): Promise<{ videos: YouTubeVideo[]; fetched_at: string }> {
  const channels = knownChannels ?? await readChannels(items.flatMap((v) => v.snippet.channelId ? [v.snippet.channelId] : []));
  const avatars = new Map(channels.map((channel) => [channel.id, thumbnailUrl(channel.snippet.thumbnails)]));
  const byId = new Map(items.map((v) => [v.id, v]));
  const videos: YouTubeVideo[] = videoIds.map((id) => {
    const v = byId.get(id);
    if (!v) return { id, title: "Unavailable video", channelTitle: "Unknown channel", description: "This video was removed, made private or is unavailable.", embeddable: false, available: false };
    return { id, title: v.snippet.title, channelTitle: v.snippet.channelTitle, channelId: v.snippet.channelId, channelAvatarUrl: v.snippet.channelId ? avatars.get(v.snippet.channelId) : undefined, description: v.snippet.description.slice(0, 6000), publishedAt: v.snippet.publishedAt, thumbnailUrl: thumbnailUrl(v.snippet.thumbnails), viewCount: count(v.statistics?.viewCount), likeCount: count(v.statistics?.likeCount), commentCount: count(v.statistics?.commentCount), duration: v.contentDetails?.duration, embeddable: v.status?.embeddable === true, available: v.status?.privacyStatus !== "private" };
  });
  return { videos, fetched_at: new Date().toISOString() };
}

/** Public, transient browse data; no OAuth, audiovisual retrieval or personalised feed. */
export async function browseYouTubePublic(input: YouTubeBrowseInput): Promise<YouTubeBrowseResult> {
  const data = YouTubeBrowseInputSchema.parse(input);
  const page: Record<string, string> = data.page_token ? { pageToken: data.page_token } : {};
  if (data.channel_id) {
    const channels = await readChannels([data.channel_id]);
    const channel = channels[0];
    if (!channel) throw new YouTubeError("unavailable", "This YouTube channel is unavailable.");
    if (data.order === "viewCount") {
      const result = z.object({ items: z.array(z.object({ id: z.object({ videoId: VideoId }) })).max(8), nextPageToken: YouTubePageTokenSchema.optional() }).parse(await youtubeRequest("search", { part: "snippet", type: "video", channelId: data.channel_id, order: "viewCount", maxResults: "8", safeSearch: "moderate", ...page }));
      const ids = result.items.map((item) => item.id.videoId);
      const raw = ids.length ? z.object({ items: z.array(Item).max(8) }).parse(await youtubeRequest("videos", { part: "snippet,statistics,contentDetails,status", id: ids.join(",") })).items : [];
      return { ...await decorateVideos(ids, raw, channels), next_page_token: result.nextPageToken, channel: channelMetadata(channel) };
    }
    const playlistId = channel.contentDetails?.relatedPlaylists?.uploads;
    if (!playlistId) return { videos: [], fetched_at: new Date().toISOString(), channel: channelMetadata(channel) };
    const result = z.object({ items: z.array(z.object({ contentDetails: z.object({ videoId: VideoId }) })).max(8), nextPageToken: YouTubePageTokenSchema.optional() }).parse(await youtubeRequest("playlistItems", { part: "contentDetails", playlistId, maxResults: "8", ...page }));
    const ids = result.items.map((item) => item.contentDetails.videoId);
    const raw = ids.length ? z.object({ items: z.array(Item).max(8) }).parse(await youtubeRequest("videos", { part: "snippet,statistics,contentDetails,status", id: ids.join(",") })).items : [];
    return { ...await decorateVideos(ids, raw, channels), next_page_token: result.nextPageToken, channel: channelMetadata(channel) };
  }
  if (data.query) {
    const result = z.object({ items: z.array(z.object({ id: z.object({ videoId: VideoId }) })).max(8), nextPageToken: YouTubePageTokenSchema.optional() }).parse(await youtubeRequest("search", { part: "snippet", type: "video", q: data.query, maxResults: "8", safeSearch: "moderate", ...(data.order ? { order: data.order } : {}), ...page }));
    const ids = result.items.map((item) => item.id.videoId);
    return { ...(ids.length ? await readYouTubeVideos(ids) : { videos: [], fetched_at: new Date().toISOString() }), next_page_token: result.nextPageToken };
  }
  const result = VideoPage.parse(await youtubeRequest("videos", { part: "snippet,statistics,contentDetails,status", chart: "mostPopular", regionCode: "GB", maxResults: "8", ...page }));
  return { ...await decorateVideos(result.items.map((v) => v.id), result.items), next_page_token: result.nextPageToken };
}

export async function searchYouTube(query: string) {
  const q = z.string().trim().min(2).max(180).parse(query);
  const result = z.object({ items: z.array(z.object({ id: z.object({ videoId: VideoId }) })) }).parse(await youtubeRequest("search", { part: "snippet", type: "video", q, maxResults: "6", safeSearch: "moderate" }));
  const ids = result.items.map((v) => v.id.videoId);
  if (!ids.length) return { video_ids: [], videos: [], fetched_at: new Date().toISOString() };
  return { video_ids: ids, ...await readYouTubeVideos(ids) };
}

export async function readYouTubeComments(videoId: string): Promise<{ comments: YouTubeComment[]; notice?: string }> {
  try {
    const result = z.object({ items: z.array(z.object({ id: z.string(), snippet: z.object({ topLevelComment: z.object({ snippet: z.object({ authorDisplayName: z.string(), textDisplay: z.string(), likeCount: z.number().optional(), publishedAt: z.string().optional() }) }) }) })) }).parse(await youtubeRequest("commentThreads", { part: "snippet", videoId: VideoId.parse(videoId), maxResults: "20", order: "relevance", textFormat: "plainText" }));
    return { comments: result.items.map((c) => ({ id: c.id, author: c.snippet.topLevelComment.snippet.authorDisplayName, text: c.snippet.topLevelComment.snippet.textDisplay.slice(0, 3000), likeCount: c.snippet.topLevelComment.snippet.likeCount, publishedAt: c.snippet.topLevelComment.snippet.publishedAt })), notice: "Public top-level comments, sorted by relevance. This is a sample, not all comments or replies. Comments are audience claims, not verified production facts." };
  } catch (error) {
    if (error instanceof YouTubeError && ["commentsDisabled", "unavailable"].includes(error.code)) return { comments: [], notice: error.message };
    throw error;
  }
}

/** External web evidence only; never download, proxy or scrape YouTube audiovisual content. */
export async function researchYouTubeProduction(title: string, channel: string) {
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) return { sources: [], notice: "External source research isn't configured. The uploader's public description may still contain production credits." };
  const query = `${title.slice(0, 150)} ${channel.slice(0, 80)} how made tools Higgsfield -site:youtube.com -site:youtu.be`;
  const response = await fetch("https://api.firecrawl.dev/v2/search", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, limit: 5 }), signal: AbortSignal.timeout(20_000) });
  if (!response.ok) return { sources: [], notice: "External source research is temporarily unavailable. Production tools and earnings remain unverified." };
  const result = z.object({ data: z.object({ web: z.array(z.object({ url: z.string().url(), title: z.string().optional(), description: z.string().optional() })).optional() }).optional() }).parse(await response.json());
  return { sources: (result.data?.web ?? []).filter((s) => { const u = new URL(s.url); return u.protocol === "https:" && !/(^|\.)(youtube\.com|youtu\.be)$/.test(u.hostname); }), notice: "Search excerpts are untrusted leads, not confirmation that a tool made this exact video. Cite source URLs and attribute claims. No video, audio or transcript was watched or downloaded. Public views are not earnings; private revenue is unknown." };
}
