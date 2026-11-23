import { targetFromSocialUrl, targetsFromText, type ResearchPlatform, type ResearchPost, type ResearchTarget } from "./research";
import { sampleResearchFrames } from "./research-frames.server";

const APIFY_BASE = "https://api.apify.com/v2";
const ACTORS: Record<ResearchPlatform, string> = {
  instagram: "apify~instagram-scraper",
  facebook: "apify~facebook-posts-scraper",
  tiktok: "clockworks~tiktok-scraper",
};

function string(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }
function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function number(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
}
function image(value: unknown): string | null {
  const candidate = string(value);
  if (!candidate) return null;
  try { return new URL(candidate).protocol === "https:" ? candidate : null; } catch { return null; }
}
function date(value: unknown): string | null {
  const d = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(String(value ?? ""));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export async function discoverResearchTargets(query: string): Promise<{ candidates: ResearchTarget[]; warnings: string[] }> {
  const direct = targetsFromText(query);
  if (direct.length) return { candidates: direct, warnings: [] };
  if (/^@[\w.-]{2,100}$/.test(query.trim())) {
    const handle = query.trim().slice(1);
    return { candidates: ["instagram", "tiktok"].map((platform) => targetFromSocialUrl(`https://www.${platform}.com/${platform === "tiktok" ? "@" : ""}${handle}`)!).filter(Boolean), warnings: ["Confirm which platform owns this handle before analysis."] };
  }
  const key = process.env["FIRECRAWL_API_KEY"];
  if (!key) return { candidates: [], warnings: ["Company lookup is unavailable until the search provider is configured. Enter a social profile link instead."] };
  const warnings: string[] = [];
  const isWebsite = /^(?:https?:\/\/)?[\w.-]+\.[a-z]{2,}(?:\/|$)/i.test(query.trim());
  const searches = isWebsite ? [query.trim()] : ["instagram", "facebook", "tiktok"].map((platform) => `${query.trim()} official ${platform}`);
  const results = await Promise.allSettled(searches.map(async (term) => {
    const endpoint = isWebsite ? "https://api.firecrawl.dev/v2/scrape" : "https://api.firecrawl.dev/v2/search";
    const body = isWebsite ? { url: /^https?:\/\//i.test(term) ? term : `https://${term}`, formats: ["markdown", "links"] } : { query: term, limit: 5 };
    const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Search provider returned ${response.status}`);
    return await response.json() as Record<string, unknown>;
  }));
  const found = new Map<string, ResearchTarget>();
  for (const result of results) {
    if (result.status === "rejected") { warnings.push("Some account matches could not be checked."); continue; }
    const payload = result.value;
    const data = payload["data"];
    const entries = isWebsite ? [data ?? payload] : (Array.isArray(record(data)["web"]) ? record(data)["web"] as unknown[] : []);
    for (const entry of entries) {
      const item = record(entry);
      const text = [item["url"], item["markdown"], item["description"], item["links"], item["metadata"]].map((x) => typeof x === "string" ? x : JSON.stringify(x ?? "")).join(" ");
      for (const target of targetsFromText(text)) found.set(target.id, target);
    }
  }
  return { candidates: [...found.values()].slice(0, 12), warnings: [...new Set(warnings)] };
}

function apifyKey(): string { const key = process.env["APIFY_API_TOKEN"]; if (!key) throw new Error("Public post collection is not configured: APIFY_API_TOKEN is missing"); return key; }
async function apify(path: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${APIFY_BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${apifyKey()}`, "Content-Type": "application/json", ...init?.headers }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Apify returned ${response.status}`);
  return await response.json() as Record<string, unknown>;
}

export function apifyConfigured(): boolean { return !!process.env["APIFY_API_TOKEN"]; }

/** Bounded public X timeline collection for an explicitly saved profile. */
export async function startXProfileRun(handle: string, limit = 12): Promise<string> {
  if (!/^[\w]{1,15}$/.test(handle)) throw new Error("Invalid X profile");
  const payload = await apify("/acts/xquik~x-tweet-scraper/runs?waitForFinish=0", { method: "POST", body: JSON.stringify({ mode: "profileTweets", twitterHandles: [handle], maxItems: Math.min(20, limit), outputPreset: "flat", tweetTypes: { excludeReplies: true, excludeRetweets: true } }) });
  const id = string(record(payload["data"])["id"]);
  if (!id) throw new Error("Social provider did not return a run ID");
  return id;
}

export function normalizeXProfilePosts(handle: string, rows: Record<string, unknown>[], limit = 12) {
  return rows.flatMap((row) => {
    const author = string(row["authorUsername"]) ?? string(record(row["author"])["userName"]) ?? string(record(row["author"])["username"]);
    if (!author || author.toLowerCase() !== handle.toLowerCase()) return [];
    const url = string(row["url"]) ?? string(row["tweetUrl"]);
    if (!url) return [];
    try { const u = new URL(url); if (!["x.com", "www.x.com", "twitter.com", "www.twitter.com"].includes(u.hostname) || !u.pathname.toLowerCase().startsWith(`/${handle.toLowerCase()}/status/`)) return []; } catch { return []; }
    const images = Array.isArray(row["imageUrls"]) ? row["imageUrls"] : Array.isArray(row["mediaUrls"]) ? row["mediaUrls"] : [];
    return [{ url, caption: string(row["text"]) ?? "", published_at: date(row["createdAt"]), thumbnail_url: image(images[0]) }];
  }).slice(0, limit);
}

export async function startApifyRun(target: ResearchTarget, limit = 12): Promise<string> {
  const input = target.platform === "instagram"
    ? { directUrls: [target.url], resultsType: "posts", resultsLimit: Math.min(20, limit), addParentData: true }
    : target.platform === "facebook"
      ? { startUrls: [{ url: target.url }], resultsLimit: Math.min(20, limit), captionText: true }
      : { profiles: [target.handle], resultsPerPage: Math.min(20, limit), profileSorting: "latest", profileScrapeSections: ["videos"] };
  const payload = await apify(`/acts/${ACTORS[target.platform]}/runs?waitForFinish=0`, { method: "POST", body: JSON.stringify(input) });
  const id = string(record(payload["data"])["id"]);
  if (!id) throw new Error("Apify did not return a run ID");
  return id;
}

export async function pollApifyRun(runId: string): Promise<{ status: "running" | "complete" | "failed"; posts?: Record<string, unknown>[] }> {
  const payload = await apify(`/actor-runs/${encodeURIComponent(runId)}`);
  const run = record(payload["data"]);
  const status = string(run["status"]);
  if (["FAILED", "TIMED-OUT", "ABORTED"].includes(status ?? "")) return { status: "failed" };
  if (status !== "SUCCEEDED") return { status: "running" };
  const dataset = string(run["defaultDatasetId"]);
  if (!dataset) return { status: "failed" };
  const response = await fetch(`${APIFY_BASE}/datasets/${encodeURIComponent(dataset)}/items?clean=true&limit=30`, { headers: { Authorization: `Bearer ${apifyKey()}` }, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Apify dataset returned ${response.status}`);
  const items: unknown = await response.json();
  return { status: "complete", posts: Array.isArray(items) ? items.map(record) : [] };
}

export function normalizeApifyPosts(platform: ResearchPlatform, target: ResearchTarget, rows: Record<string, unknown>[], limit = 12): ResearchPost[] {
  const posts = new Map<string, ResearchPost>();
  for (const row of rows) {
    if (row["error"] || row["errorMessage"]) continue;
    const videoMeta = record(row["videoMeta"]);
    const media = Array.isArray(row["media"]) ? record(row["media"][0]) : record(row["media"]);
    const rawUrl = platform === "tiktok" ? row["webVideoUrl"] : row["url"];
    const url = string(rawUrl);
    if (!url || !/^https:\/\//i.test(url)) continue;
    const id = string(platform === "facebook" ? row["postId"] : row["id"]) ?? url;
    const caption = string(platform === "facebook" ? row["text"] : platform === "tiktok" ? row["text"] : row["caption"]) ?? "";
    const published = date(platform === "facebook" ? row["time"] : platform === "tiktok" ? row["createTimeISO"] ?? row["createTime"] : row["timestamp"]);
    const thumbnail = image(platform === "tiktok" ? videoMeta["coverUrl"] : platform === "facebook" ? media["thumbnail"] ?? media["image"] ?? row["image"] : row["displayUrl"] ?? (Array.isArray(row["images"]) ? row["images"][0] : null));
    const kind = platform === "tiktok" || row["isVideo"] === true || !!row["videoUrl"] || /video|reel/i.test(String(row["type"] ?? "")) ? "video" : /carousel|sidecar/i.test(String(row["type"] ?? "")) ? "carousel" : thumbnail ? "image" : "unknown";
    // Only explicit stills from a provider count as frames. A cover image alone is a thumbnail.
    const frames = Array.isArray(row["frames"]) ? row["frames"].map(image).filter((x): x is string => !!x).slice(0, 3) : [];
    posts.set(id, { id: `${platform}:${id}`, platform, profile_url: target.url, url, caption: caption.slice(0, 3000), published_at: published, thumbnail_url: thumbnail, media_type: kind, metrics: {
      likes: number(platform === "instagram" ? row["likesCount"] : platform === "tiktok" ? row["diggCount"] : row["likes"]),
      comments: number(platform === "instagram" ? row["commentsCount"] : platform === "tiktok" ? row["commentCount"] : row["comments"]),
      views: number(platform === "instagram" ? row["videoPlayCount"] : platform === "tiktok" ? row["playCount"] : row["viewsCount"]),
      shares: number(platform === "tiktok" ? row["shareCount"] : platform === "facebook" ? row["shares"] : row["sharesCount"]),
    }, review_basis: frames.length ? "frames" : thumbnail ? "thumbnail" : "metadata", ...(frames.length ? { frames } : {}) });
  }
  return [...posts.values()].sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? "")).slice(0, limit);
}

/** Inspect at most two recent videos per profile; failures keep the honest cover/metadata label. */
export async function attachResearchFrames(platform: ResearchPlatform, posts: ResearchPost[], rows: Record<string, unknown>[]): Promise<void> {
  const selected = posts.filter((post) => post.media_type === "video").slice(0, 2);
  await Promise.all(selected.map(async (post) => {
    const rawId = post.id.slice(platform.length + 1);
    const row = rows.find((item) => String(platform === "facebook" ? item["postId"] : item["id"]) === rawId);
    if (!row) return;
    const videoMeta = record(row["videoMeta"]);
    const media = Array.isArray(row["media"]) ? record(row["media"][0]) : record(row["media"]);
    const videoUrl = string(platform === "instagram" ? row["videoUrl"] : platform === "tiktok" ? videoMeta["downloadAddr"] : media["videoUrl"] ?? row["videoUrl"]);
    if (!videoUrl) return;
    const duration = number(platform === "instagram" ? row["videoDuration"] : platform === "tiktok" ? videoMeta["duration"] : media["duration"]);
    const frames = await sampleResearchFrames(videoUrl, duration);
    if (frames.length) { post.frames = frames; post.review_basis = "frames"; }
  }));
}

/** Provider media URLs are transient and never persisted. */
export function personalVideoInput(platform: ResearchPlatform, post: ResearchPost, rows: Record<string, unknown>[]) {
  const rawId = post.id.slice(platform.length + 1);
  const row = rows.find((item) => String(platform === "facebook" ? item["postId"] : item["id"]) === rawId);
  if (!row) return null;
  const meta = record(row["videoMeta"]);
  const media = Array.isArray(row["media"]) ? record(row["media"][0]) : record(row["media"]);
  const videoUrl = string(platform === "instagram" ? row["videoUrl"] : platform === "tiktok" ? meta["downloadAddr"] : media["videoUrl"] ?? row["videoUrl"]);
  const durationSeconds = number(platform === "instagram" ? row["videoDuration"] : platform === "tiktok" ? meta["duration"] : media["duration"]);
  return videoUrl && durationSeconds ? { id: post.id, videoUrl, durationSeconds } : null;
}
