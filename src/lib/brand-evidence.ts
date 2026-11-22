/** Bounded evidence freshness and source selection; no crawling or model calls. */
export const BRAND_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export function evidenceIsFresh(createdAt: string | null | undefined, now = Date.now()) {
  const time = Date.parse(createdAt ?? "");
  return Number.isFinite(time) && time <= now && now - time < BRAND_EVIDENCE_MAX_AGE_MS;
}
export function relatedBrandPages(markdown: string, website: string): string[] {
  const base = new URL(website);
  const found = new Map<string, number>();
  for (const match of markdown.matchAll(/\[([^\]]{0,200})\]\(([^\s)]+)\)/g)) {
    try {
      const url = new URL(match[2]!, base);
      url.hash = "";
      if (url.origin !== base.origin || url.username || url.password || url.search || url.href === base.href || /\.(?:pdf|zip|jpg|png|mp4)$/i.test(url.pathname)) continue;
      const score = /pricing|product|features|services|faq/i.test(`${match[1]} ${url.pathname}`) ? 2 : /about|demo/i.test(`${match[1]} ${url.pathname}`) ? 1 : 0;
      if (score) found.set(url.href, score);
    } catch { /* Invalid website links are not evidence. */ }
  }
  return [...found].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([url]) => url);
}
