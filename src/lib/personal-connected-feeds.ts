export const CONNECTED_EVIDENCE_DAYS = 365;
const hosts: Record<string, string[]> = { facebook: ["facebook.com"], instagram: ["instagram.com"], x: ["x.com", "twitter.com"], youtube: ["youtube.com", "youtu.be"], tiktok: ["tiktok.com"] };
/** Only retain bounded, canonical public links for the account's own platform. */
export function normalizeConnectedPosts(platform: string, posts: unknown, now = Date.now()) {
  const seen = new Set<string>();
  const cutoff = now - CONNECTED_EVIDENCE_DAYS * 24 * 60 * 60_000;
  return (Array.isArray(posts) ? posts : []).flatMap((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const post = value as Record<string, unknown>;
    try {
      const url = new URL(String(post["permalink"] ?? ""));
      const host = url.hostname.toLowerCase();
      const date = Date.parse(String(post["timestamp"] ?? ""));
      if (url.protocol !== "https:" || url.username || url.password || !hosts[platform]?.some((h) => host === h || host.endsWith(`.${h}`)) || !Number.isFinite(date) || date < cutoff || date > now || seen.has(url.href)) return [];
      seen.add(url.href);
      return [{ url: url.href, date: new Date(date).toISOString(), caption: String(post["caption"] ?? "").slice(0, 3000) }];
    } catch { return []; }
  }).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 20);
}
/** Defend the service-role collection against accidentally supplied foreign accounts. */
export function accountsForWorkspace<T extends { workspace_id: string }>(workspaceId: string, accounts: T[]): T[] {
  return accounts.filter((account) => account.workspace_id === workspaceId);
}
