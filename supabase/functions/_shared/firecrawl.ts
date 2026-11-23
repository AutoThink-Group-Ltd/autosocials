/** Return only web search results from the Firecrawl v2 response. */
export function firecrawlWebResults(payload: unknown): Record<string, any>[] {
  if (!payload || typeof payload !== "object") return [];
  const data = (payload as Record<string, unknown>).data;
  if (!data || typeof data !== "object") return [];
  const web = (data as Record<string, unknown>).web;
  return Array.isArray(web) ? web.filter((row): row is Record<string, any> => !!row && typeof row === "object" && !Array.isArray(row)) : [];
}
