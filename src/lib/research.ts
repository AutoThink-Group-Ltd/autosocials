import { z } from "zod";

export const ResearchPlatformSchema = z.enum(["instagram", "facebook", "tiktok"]);
export type ResearchPlatform = z.infer<typeof ResearchPlatformSchema>;

export const ResearchTargetSchema = z.object({
  id: z.string().min(1).max(160),
  platform: ResearchPlatformSchema,
  handle: z.string().min(1).max(160),
  url: z.string().url().max(500),
  display_name: z.string().max(200).optional(),
  avatar_url: z.string().url().optional(),
});
export type ResearchTarget = z.infer<typeof ResearchTargetSchema>;

export type ResearchPost = {
  id: string;
  platform: ResearchPlatform;
  profile_url?: string;
  url: string;
  caption: string;
  published_at: string | null;
  thumbnail_url: string | null;
  media_type: "image" | "video" | "carousel" | "unknown";
  metrics: { likes?: number | null; comments?: number | null; views?: number | null; shares?: number | null };
  review_basis: "frames" | "thumbnail" | "metadata";
  frames?: string[];
};

export type ResearchAnalysis = {
  summary: string;
  findings: { title: string; body: string; post_ids: string[] }[];
  treatment: { title: string; hook: string; beats: string[]; rationale: string };
  reply: string;
};

export type ResearchRun = {
  id: string;
  query: string;
  question: string;
  status: "queued" | "fetching" | "analyzing" | "complete" | "partial" | "failed";
  created_at: string;
  updated_at: string;
  targets: ResearchTarget[];
  posts: ResearchPost[];
  errors: string[];
  analysis?: ResearchAnalysis | null;
  reply?: string | null;
};

export type ResearchRunSummary = {
  id: string;
  query: string;
  status: ResearchRun["status"];
  created_at: string;
  post_count?: number;
};

const SOCIAL_HOSTS: Record<string, ResearchPlatform> = {
  "instagram.com": "instagram", "www.instagram.com": "instagram",
  "facebook.com": "facebook", "www.facebook.com": "facebook", "m.facebook.com": "facebook",
  "tiktok.com": "tiktok", "www.tiktok.com": "tiktok",
};

/** Accept only canonical public profile paths; never turn post URLs into account matches. */
export function targetFromSocialUrl(input: string): ResearchTarget | null {
  try {
    const url = new URL(input.match(/^https?:\/\//i) ? input : `https://${input}`);
    const platform = SOCIAL_HOSTS[url.hostname.toLowerCase()];
    if (!platform) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (!parts.length) return null;
    const root = parts[0]!.toLowerCase();
    if (["p", "reel", "reels", "stories", "watch", "video", "videos", "share", "groups", "events", "pages", "explore", "accounts", "login", "search", "hashtag", "tag", "music"].includes(root)) return null;
    if (platform === "facebook" && root === "profile.php") return null;
    const handle = decodeURIComponent(parts[0]!).replace(/^@/, "");
    if (!/^[\w.-]{2,100}$/.test(handle)) return null;
    const path = platform === "tiktok" ? `@${handle}` : handle;
    const canonical = `https://www.${platform}.com/${path}`;
    return { id: `${platform}:${handle.toLowerCase()}`, platform, handle, url: canonical };
  } catch { return null; }
}

export function targetsFromText(text: string): ResearchTarget[] {
  const matches = text.match(/(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram|facebook|tiktok)\.com\/[^\s<>'"),]+/gi) ?? [];
  const unique = new Map<string, ResearchTarget>();
  for (const match of matches) {
    const target = targetFromSocialUrl(match.replace(/[.,;]+$/, ""));
    if (target) unique.set(target.id, target);
  }
  return [...unique.values()];
}
