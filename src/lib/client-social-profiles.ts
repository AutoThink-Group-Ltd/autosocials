export const SOCIAL_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "x", "linkedin", "pinterest", "threads", "snapchat", "substack", "reddit"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];
export type ClientSocialProfile = { platform: SocialPlatform; handle: string; url: string | null };

const domains: Record<string, SocialPlatform> = {
  "instagram.com": "instagram", "facebook.com": "facebook", "fb.com": "facebook",
  "tiktok.com": "tiktok", "youtube.com": "youtube", "youtu.be": "youtube",
  "x.com": "x", "twitter.com": "x", "linkedin.com": "linkedin",
  "pinterest.com": "pinterest", "pin.it": "pinterest", "threads.net": "threads",
  "snapchat.com": "snapchat", "substack.com": "substack", "reddit.com": "reddit",
};

export function parseClientSocialProfile(value: string, chosenPlatform?: SocialPlatform): ClientSocialProfile | null {
  const input = value.trim();
  if (!input) return null;
  const looksLikeUrl = /^(?:https?:\/\/|www\.)/i.test(input) || /^[\w-]+\.[a-z]{2,}(?:\/|$)/i.test(input);
  if (looksLikeUrl) {
    let url: URL;
    try { url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`); }
    catch { return null; }
    const host = url.hostname.toLowerCase().replace(/^www\./, "").replace(/^m\./, "");
    // Some networks localise profile URLs on country subdomains (for example
    // uk.pinterest.com). Match only the registered domain boundary so a
    // lookalike such as pinterest.com.example.org cannot be misclassified.
    const platform = domains[host] ?? Object.entries(domains).find(([domain]) => host.endsWith(`.${domain}`))?.[1];
    if (!platform || host === "youtu.be") return null;
    if (platform === "substack") {
      const parts = url.pathname.split("/").filter(Boolean);
      const publication = host.match(/^([a-z0-9-]+)\.substack\.com$/);
      if (publication && !parts.length && !["www", "app"].includes(publication[1])) return { platform, handle: publication[1], url: url.toString() };
      if (host === "substack.com" && parts.length === 1 && /^@[\w.-]+$/.test(parts[0])) return { platform, handle: parts[0].slice(1), url: url.toString() };
      return null;
    }
    if (!url.pathname.replace(/\//g, "")) return null;
    const parts = url.pathname.split("/").filter(Boolean);
    if (platform === "instagram" && ["p", "reel", "reels", "stories", "explore", "accounts"].includes(parts[0]?.toLowerCase())) return null;
    if (platform === "tiktok" && !parts[0]?.startsWith("@")) return null;
    if (platform === "youtube" && !["@", "channel", "user", "c"].some((prefix) => parts[0]?.startsWith(prefix))) return null;
    if (platform === "linkedin" && !["company", "in", "school"].includes(parts[0]?.toLowerCase())) return null;
    if (platform === "x" && ["i", "home", "explore", "search", "settings"].includes(parts[0]?.toLowerCase())) return null;
    if (platform === "facebook" && ["posts", "watch", "reel", "reels", "events", "groups"].includes(parts[0]?.toLowerCase())) return null;
    if (platform === "pinterest" && parts[0]?.toLowerCase() === "pin") return null;
    if (platform === "reddit" && (parts.length !== 2 || !["user", "u"].includes(parts[0]?.toLowerCase()))) return null;
    if (parts.length > (platform === "linkedin" || platform === "youtube" || platform === "reddit" ? 2 : 1)) return null;
    let handle: string;
    try { handle = decodeURIComponent(parts[parts.length - 1] ?? "").replace(/^@/, ""); }
    catch { return null; }
    if (!handle) return null;
    return { platform, handle, url: url.toString() };
  }
  if (!chosenPlatform) return null;
  const handle = input.replace(/^@/, "");
  if (!/^[\w.-]{1,100}$/.test(handle)) return null;
  return { platform: chosenPlatform, handle, url: null };
}

export function extractWebsiteSocialProfiles(markdown: string, links: unknown): ClientSocialProfile[] {
  const listed = Array.isArray(links) ? links.filter((link): link is string => typeof link === "string") : [];
  const embedded = markdown.match(/https?:\/\/[^\s<>"'()]+/gi) ?? [];
  const profiles = [...listed, ...embedded].flatMap((url) => {
    const profile = parseClientSocialProfile(url.replace(/[.,;]+$/, ""));
    return profile ? [profile] : [];
  });
  return [...new Map(profiles.map((profile) => [`${profile.platform}:${profile.handle.toLowerCase()}`, profile])).values()];
}
