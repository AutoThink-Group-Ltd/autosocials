import { parseClientSocialProfile } from "./client-social-profiles";
import { safePersonalCaption } from "./personal-brand-media-cache";

/** Accept only recent posts whose author matches the saved personal profile. */
export function extractLinkedInPosts(savedUrl: string, payload: unknown, now = Date.now()) {
  const profile = parseClientSocialProfile(savedUrl);
  if (!profile || profile.platform !== "linkedin" || !profile.url || !/^\/in\/[^/]+\/?$/i.test(new URL(profile.url).pathname)) return [];
  const root = payload as any;
  const result = root?.data?.alexandria?.[0];
  if (result?.error) return [];
  const rows = result?.data?.elements ?? result?.records ?? [];
  if (!Array.isArray(rows)) return [];
  const seen = new Set<string>();
  return rows.flatMap((row: any) => {
    if (typeof row?.author?.publicIdentifier !== "string" || row.author.publicIdentifier.toLowerCase() !== profile.handle.toLowerCase() || row.repostedBy) return [];
    const date = typeof row?.postedAt?.date === "string" ? row.postedAt.date : "";
    const time = Date.parse(date);
    if (!Number.isFinite(time) || time > now || time < now - 90 * 86400000 || typeof row.content !== "string" || !row.content.trim()) return [];
    let url: URL;
    try { url = new URL(row.linkedinUrl); } catch { return []; }
    if (url.protocol !== "https:" || url.username || url.password || url.port || !["linkedin.com", "www.linkedin.com"].includes(url.hostname) || !/^\/(posts|feed\/update)\//.test(url.pathname)) return [];
    url.search = ""; url.hash = "";
    if (seen.has(url.href)) return [];
    seen.add(url.href);
    const videoUrl = typeof row.postVideo?.videoUrl === "string" ? row.postVideo.videoUrl : null;
    const coverUrl = typeof row.postVideo?.thumbnailUrl === "string" ? row.postVideo.thumbnailUrl : null;
    const imageUrl = !videoUrl && typeof row.postImages?.[0]?.url === "string" ? row.postImages[0].url : null;
    return [{ date: new Date(time).toISOString(), url: url.href, caption: safePersonalCaption(row.content).slice(0, 3000), videoUrl, coverUrl, imageUrl }];
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 20);
}

/** Only a profile's own About/intro text is context, never a social post. */
export function extractLinkedInProfileContext(savedUrl: string, payload: unknown, includeExperience = false): string | null {
  const expected = parseClientSocialProfile(savedUrl);
  if (!expected || expected.platform !== "linkedin" || !expected.url || new URL(expected.url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() !== "in") return null;
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {};
  const data = root["data"] && typeof root["data"] === "object" ? root["data"] as Record<string, unknown> : root;
  const metadata = data["metadata"] && typeof data["metadata"] === "object" ? data["metadata"] as Record<string, unknown> : {};
  const actual = typeof metadata["sourceURL"] === "string" ? parseClientSocialProfile(metadata["sourceURL"]) : null;
  if (!actual || actual.platform !== "linkedin" || !actual.url || new URL(actual.url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() !== "in" || actual.handle.toLowerCase() !== expected.handle.toLowerCase()) return null;
  const markdown = typeof data["markdown"] === "string" ? data["markdown"] : "";
  const about = markdown.match(/^## About\s*\n([\s\S]*?)(?=^##\s|$)/im)?.[1]?.trim();
  const heading = markdown.match(/^# [^\n]+\n+\*\*(.+?)\*\*/m)?.[1]?.trim();
  const experience = includeExperience ? markdown.match(/^## Experience\s*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im)?.[1]?.replace(/\s+/g, " ").trim().slice(0, 900) : null;
  const context = [heading, about?.replace(/\s+/g, " "), experience ? `Experience: ${experience}` : null].filter(Boolean).join(". ");
  return context ? safePersonalCaption(context).slice(0, 2400) : null;
}
