export type WebsiteImageCandidate = { url: string; page: string; label: string; score: number };
/** Only image references from the saved website itself; ignore trackers, UI and third-party content. */
export function websiteImageCandidates(docs: { extracted_text: string | null }[], website: string): WebsiteImageCandidate[] {
  const site = new URL(website);
  const root = site.hostname.toLowerCase().replace(/^www\./, "");
  const candidates = new Map<string, WebsiteImageCandidate>();
  for (const doc of docs) {
    const text = doc.extracted_text || "";
    const source = text.match(/^Source: (https:\/\/\S+)$/m)?.[1];
    if (!source) continue;
    let page: URL;
    try { page = new URL(source); } catch { continue; }
    if (page.hostname.toLowerCase().replace(/^www\./, "") !== root) continue;
    for (const match of text.matchAll(/!\[([^\]]{0,250})\]\((https:\/\/[^\s)]+)(?:\s+[^)]*)?\)/g)) {
      try {
        const url = new URL(match[2]!.replace(/&amp;/g, "&"));
        const host = url.hostname.toLowerCase().replace(/^www\./, "");
        const label = match[1]!.replace(/\s+/g, " ").trim().slice(0, 100);
        const hint = `${label} ${url.pathname}`.toLowerCase();
        if (host !== root || url.username || url.password || url.port || [...url.searchParams.keys()].some((key) => /token|secret|password|credential|api.?key|signature|authorization/i.test(key)) || !/\.(?:jpe?g|png|webp)$/i.test(url.pathname) || /(?:cookie|consent|avatar|profile.picture|review|rating|star|icon|logo|favicon|badge|payment|trustpilot|tracking|placeholder|spinner)/i.test(hint)) continue;
        url.hash = "";
        const linkedHero = !label && match.index !== undefined && text[match.index - 1] === "[" && page.pathname === "/";
        const score = (linkedHero ? 40 : 0) + (/hero|banner|slider/i.test(hint) ? 30 : 0) + (/product|bundle|shampoo|collection|category/i.test(hint) ? 15 : 0) + (label ? 8 : 0) + (/-scaled\./i.test(url.pathname) ? 4 : 0) - (/-\d{2,4}x\d{2,4}\./i.test(url.pathname) ? 5 : 0);
        const candidate = { url: url.href, page: page.href, label: label || decodeURIComponent(url.pathname.split("/").pop() || "Website image").replace(/[-_]+/g, " ").replace(/\.[a-z]+$/i, ""), score };
        const key = label ? label.toLowerCase() : url.pathname.toLowerCase();
        const old = candidates.get(key);
        if (!old || old.score < score) candidates.set(key, candidate);
      } catch { /* Ignore malformed or unsupported references. */ }
    }
  }
  return [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, 40);
}
