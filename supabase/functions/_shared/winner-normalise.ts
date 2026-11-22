/** A provider's absent or hidden count is unknown, never zero. */
export function observedCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const n = typeof value === "number" ? value : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

export function providerUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 4096) return null;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password ? u.href : null;
  } catch { return null; }
}

export type Observation = {
  external_id: string;
  title?: string;
  caption: string;
  format: string;
  thumbnail_url: string | null;
  permalink: string | null;
  published_at: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments_count: number | null;
  shares: number | null;
};

type Data = {
  id?: string; created_time?: string; timestamp?: string; attachments?: any; media_type?: string;
  full_picture?: string; message?: string; caption?: string; thumbnail_url?: string; media_url?: string;
  permalink_url?: string; permalink?: string; reactions?: any; comments?: any; like_count?: unknown;
  comments_count?: unknown; shares?: any; snippet?: any; statistics?: any; create_time?: unknown;
  video_description?: string; title?: string; cover_image_url?: string; share_url?: string;
  view_count?: unknown; comment_count?: unknown; share_count?: unknown;
};
export function normaliseMeta(platform: "facebook" | "instagram", p: Data): Observation | null {
  const date = platform === "facebook" ? p.created_time : p.timestamp;
  if (typeof p.id !== "string" || typeof date !== "string" || !Number.isFinite(Date.parse(date))) return null;
  const attachment = p.attachments?.data?.[0];
  const facebookImage = providerUrl(p.full_picture) ?? providerUrl(attachment?.media?.image?.src)
    ?? providerUrl(attachment?.subattachments?.data?.[0]?.media?.image?.src);
  const format = platform === "instagram" ? String(p.media_type ?? "unknown").toLowerCase() : attachment?.media_type === "video" ? "video" : (attachment?.subattachments?.data?.length ?? 0) > 1 ? "carousel" : facebookImage ? "image" : "text";
  return {
    external_id: p.id, title: platform === "facebook" ? String(attachment?.title || "").slice(0, 1000) : undefined, caption: String((platform === "facebook" ? p.message || attachment?.title || attachment?.description : p.caption) ?? "").slice(0, 10000), format,
    thumbnail_url: platform === "facebook" ? facebookImage : providerUrl(p.thumbnail_url ?? p.media_url),
    permalink: providerUrl(platform === "facebook" ? p.permalink_url : p.permalink), published_at: new Date(date).toISOString(),
    views: null, reach: null,
    likes: observedCount(platform === "facebook" ? p.reactions?.summary?.total_count : p.like_count),
    comments_count: observedCount(platform === "facebook" ? p.comments?.summary?.total_count : p.comments_count),
    shares: observedCount(platform === "facebook" ? p.shares?.count : null),
  };
}

export function normaliseYouTube(p: Data): Observation | null {
  const date = p.snippet?.publishedAt;
  if (typeof p.id !== "string" || typeof date !== "string" || !Number.isFinite(Date.parse(date))) return null;
  return { external_id: p.id, title: String(p.snippet?.title || "").slice(0, 1000), caption: String(p.snippet?.description || p.snippet?.title || "").slice(0, 10000), format: "video",
    thumbnail_url: providerUrl(p.snippet?.thumbnails?.high?.url ?? p.snippet?.thumbnails?.default?.url),
    permalink: `https://www.youtube.com/watch?v=${encodeURIComponent(p.id)}`, published_at: new Date(date).toISOString(),
    views: observedCount(p.statistics?.viewCount), reach: null, likes: observedCount(p.statistics?.likeCount),
    comments_count: observedCount(p.statistics?.commentCount), shares: null };
}

export function normaliseTikTok(p: Data): Observation | null {
  const seconds = observedCount(p.create_time);
  if (typeof p.id !== "string" || seconds === null || !Number.isFinite(new Date(seconds * 1000).getTime())) return null;
  return { external_id: p.id, title: String(p.title || "").slice(0, 1000), caption: String(p.video_description || p.title || "").slice(0, 10000), format: "video",
    thumbnail_url: providerUrl(p.cover_image_url), permalink: providerUrl(p.share_url), published_at: new Date(seconds * 1000).toISOString(),
    views: observedCount(p.view_count), reach: null, likes: observedCount(p.like_count), comments_count: observedCount(p.comment_count), shares: observedCount(p.share_count) };
}
