import { safePersonalCaption } from "./personal-brand-media-cache";
import { z } from "zod";
import { youtubeRequest } from "./youtube.server";
import { parseClientSocialProfile } from "./client-social-profiles";

/** Public YouTube Data API only. Titles and descriptions are not video/audio reviews. */
export async function collectPersonalYouTube(profileUrl: string): Promise<string> {
  const profile = parseClientSocialProfile(profileUrl);
  if (!profile || profile.platform !== "youtube" || !profile.url) throw new Error("Invalid YouTube profile");
  const parts = new URL(profile.url).pathname.split("/").filter(Boolean);
  const first = parts[0] ?? "";
  const selector: Record<string, string> | null = first.startsWith("@") ? { forHandle: first } : first === "channel" && parts[1] ? { id: parts[1] } : first === "user" && parts[1] ? { forUsername: parts[1] } : null;
  if (!selector) return `Profile: ${profile.url}\nPublic posts were not inspected for this platform.`;
  const channelSchema = z.object({ items: z.array(z.object({ contentDetails: z.object({ relatedPlaylists: z.object({ uploads: z.string().min(1).max(100) }) }) })).max(1) });
  const channels = channelSchema.parse(await youtubeRequest("channels", { part: "contentDetails", ...selector, maxResults: "1" }));
  const uploads = channels.items[0]?.contentDetails.relatedPlaylists.uploads;
  if (!uploads) return `Profile: ${profile.url}\nPublic posts could not be retrieved.`;
  const pageSchema = z.object({ items: z.array(z.object({ snippet: z.object({ title: z.string().default(""), description: z.string().default(""), publishedAt: z.string(), resourceId: z.object({ videoId: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }) }) })).max(20) });
  const page = pageSchema.parse(await youtubeRequest("playlistItems", { part: "snippet", playlistId: uploads, maxResults: "20" }));
  const cutoff = Date.now() - 90 * 24 * 60 * 60_000;
  const posts = page.items.filter((item) => { const date = Date.parse(item.snippet.publishedAt); return Number.isFinite(date) && date >= cutoff && date <= Date.now(); });
  return `Profile: ${profile.url}\nEvidence: public video titles and descriptions; video footage and audio were not reviewed.\n${posts.map(({ snippet }) => `- ${snippet.publishedAt} https://www.youtube.com/watch?v=${snippet.resourceId.videoId}\n  ${safePersonalCaption(`${snippet.title}\n${snippet.description}`)}`).join("\n") || "No public posts returned."}`;
}
