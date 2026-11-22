/** Public HTTPS only. The fixed scraping service performs network retrieval. */
export function officialCreativeSiteUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") || /[:\[\]]/.test(host) || /^[\d.]+$/.test(host) || /(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example|onion)$/.test(host)) return null;
    return url.href;
  } catch { return null; }
}

const site = (url: URL) => url.hostname.replace(/\.$/, "").replace(/^www\./, "");
export function sameCreativeWebsite(first: string, second: string) {
  return site(new URL(first)) === site(new URL(second));
}

export async function readCreativeWebsite(value: string, productResearch = false): Promise<{ text: string; url?: string; links?: string[]; limitation?: string }> {
  const url = officialCreativeSiteUrl(value);
  if (!url) return { text: "", limitation: "The official website URL did not pass the public HTTPS URL check." };
  const key = process.env["FIRECRAWL_API_KEY"]?.trim();
  if (!key) return { text: "", limitation: "The website reading service is unavailable." };
  const timeout = productResearch ? 8_000 : 20_000;
  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ url, formats: productResearch ? ["markdown", "links"] : ["markdown"], onlyMainContent: !productResearch, timeout: timeout - 2_000,
        ...(productResearch ? { maxAge: 3_600_000, removeBase64Images: true } : {}) }),
      signal: controller.signal, redirect: "error",
    });
    if (!response.ok || !response.body) throw new Error("Site retrieval unavailable");
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let body = "", bytes = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 250_000) { await reader.cancel(); throw new Error("Site response exceeded limit"); }
      body += decoder.decode(chunk.value, { stream: true });
    }
    body += decoder.decode();
    const parsed = JSON.parse(body) as { success?: boolean; data?: { markdown?: unknown; links?: unknown; metadata?: { url?: string; sourceURL?: string; statusCode?: number } } };
    const page = parsed.data;
    if (parsed.success !== true || typeof page?.markdown !== "string" || !page.markdown.trim()) throw new Error("No readable official site text");
    const metadata = page.metadata;
    const resolved = officialCreativeSiteUrl(metadata?.url ?? metadata?.sourceURL ?? url);
    if (productResearch && (!resolved || !sameCreativeWebsite(url, resolved) || (metadata?.statusCode && metadata.statusCode >= 400))) throw new Error("Page unavailable on the approved site");
    const text = page.markdown.slice(0, 50000);
    const links = Array.isArray(page.links) ? page.links.filter((link): link is string => typeof link === "string").slice(0, 200) : [];
    return { text, url: resolved ?? url, links, ...(text.length < page.markdown.length ? { limitation: "Only an excerpt of the website was read." } : {}) };
  } catch { return { text: "", limitation: "Website retrieval failed or timed out." }; }
  finally { clearTimeout(deadline); }
}
