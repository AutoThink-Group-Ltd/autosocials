import { officialCreativeSiteUrl } from "./creative-context.server";

type Source = { title: string; url: string; snippet: string };
/** Search snippets are untrusted leads, not verified facts. */
export async function writtenPostNews(brief: string): Promise<{ sources: Source[]; status: "ready" | "unavailable" }> {
  const key = process.env["FIRECRAWL_API_KEY"]?.trim();
  if (!key) return { sources: [], status: "unavailable" };
  try {
    const response = await fetch("https://api.firecrawl.dev/v2/search", {
      method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: `${brief.slice(0, 500)} recent news developments`, limit: 5 }),
      signal: AbortSignal.timeout(12000), redirect: "error",
    });
    if (!response.ok) throw new Error("Search unavailable");
    const payload = await response.json() as { data?: { web?: unknown } };
    const sources = (Array.isArray(payload.data?.web) ? payload.data.web : []).flatMap((row: unknown) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const url = typeof item.url === "string" ? officialCreativeSiteUrl(item.url) : null;
      const title = typeof item.title === "string" ? item.title.trim().slice(0, 180) : "";
      const snippet = typeof item.description === "string" ? item.description.trim().slice(0, 500) : "";
      return url && title && snippet ? [{ title, url, snippet }] : [];
    }).slice(0, 5);
    return { sources, status: sources.length ? "ready" : "unavailable" };
  } catch { return { sources: [], status: "unavailable" }; }
}
