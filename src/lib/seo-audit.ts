// Pure SEO/GEO page checks (blueprint v3 §5–§7, §18). No I/O: the server runner fetches HTML and passes it in.

export type Severity = "critical" | "high" | "medium" | "low";
export type PageReport = {
  path: string; status: number; title: string; description: string; canonical: string; ogImage: string;
  h1: number; words: number; schema: string[]; noindex: boolean; inSitemap: boolean;
  linksOut: string[]; linksIn: number; issues: { severity: Severity; message: string; fix: string }[];
};
export type DiscoveryCheck = { name: string; url: string; ok: boolean; note: string };
export type Issue = { severity: Severity; path: string; message: string; fix: string };

const pick = (html: string, re: RegExp) => (re.exec(html)?.[1] ?? "").trim();
const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
const meta = (html: string, attr: "name" | "property", key: string) =>
  decode(pick(html, new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`, "i")) || pick(html, new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="${key}"`, "i")));

/** Read what a crawler sees before JavaScript runs. */
export function parsePage(html: string, site: string) {
  const body = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  const main = (/<body[^>]*>([\s\S]*)<\/body>/i.exec(body)?.[1] ?? body).replace(/<[^>]+>/g, " ");
  const schema = [...html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].flatMap((m) => {
    try { const j = JSON.parse(m[1]!); return (Array.isArray(j) ? j : [j]).map((x: { "@type"?: string }) => String(x["@type"] ?? "")).filter(Boolean); } catch { return ["invalid"]; }
  });
  const host = new URL(site).host;
  const linksOut = [...new Set([...html.matchAll(/<a[^>]*href="([^"#?]+)/gi)].map((m) => m[1]!).map((h) => {
    if (h.startsWith("/")) return h;
    try { const u = new URL(h); return u.host === host ? u.pathname : ""; } catch { return ""; }
  }).filter((h) => h.startsWith("/")))];
  return {
    title: decode(pick(html, /<title[^>]*>([^<]*)<\/title>/i)),
    description: meta(html, "name", "description"),
    canonical: pick(html, /<link[^>]*rel="canonical"[^>]*href="([^"]*)"/i),
    ogImage: meta(html, "property", "og:image"),
    noindex: /noindex/i.test(meta(html, "name", "robots")),
    h1: (body.match(/<h1[\s>]/gi) ?? []).length,
    words: main.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length,
    schema, linksOut,
  };
}

/** Per-page issues. Indexable pages are held to the full bar; noindex pages only need to stay noindex. */
export function pageIssues(p: Omit<PageReport, "issues">, site: string, dupTitles: Set<string>, dupDescs: Set<string>, ogImageOk: boolean): PageReport["issues"] {
  const out: PageReport["issues"] = [];
  const add = (severity: Severity, message: string, fix: string) => out.push({ severity, message, fix });
  if (p.status !== 200) { add("critical", `Returns ${p.status}`, "Make the page load, or remove it from the sitemap."); return out; }
  if (p.noindex) return out;
  const self = `${site}${p.path === "/" ? "/" : p.path}`;
  if (!p.title) add("critical", "No title", "Add a unique title in the route head().");
  else if (p.title.length > 65) add("medium", `Title is ${p.title.length} characters`, "Trim the title to 65 characters or fewer.");
  if (!p.description) add("high", "No meta description", "Add a 120–160 character description.");
  else if (p.description.length > 170 || p.description.length < 70) add("low", `Description is ${p.description.length} characters`, "Aim for 120–160 characters.");
  if (p.title && dupTitles.has(p.title)) add("high", "Title shared with another page", "Give this page its own title.");
  if (p.description && dupDescs.has(p.description)) add("high", "Description shared with another page", "Write a description for this page.");
  if (!p.canonical) add("high", "No canonical link", "Add a self-referencing canonical.");
  else if (p.canonical.replace(/\/$/, "") !== self.replace(/\/$/, "")) add("critical", `Canonical points to ${p.canonical}`, `Point the canonical at ${self}.`);
  if (p.h1 !== 1) add("medium", `${p.h1} H1 headings`, "Use exactly one H1 per page.");
  if (p.words < 150) add("medium", `Only ${p.words} words before JavaScript`, "Server-render more real content on this page.");
  if (!p.schema.length) add("medium", "No structured data", "Add JSON-LD that matches the page.");
  if (p.schema.includes("invalid")) add("high", "Structured data does not parse", "Fix the JSON-LD block.");
  if (!p.ogImage) add("medium", "No share image", "Add og:image (1200x630).");
  else if (!ogImageOk) add("critical", "Share image is broken", `The share image ${p.ogImage} does not load. Upload it or point to a real image.`);
  if (!p.inSitemap) add("high", "Not in the sitemap", "Add the page to the sitemap.");
  if (p.linksIn === 0 && p.path !== "/") add("medium", "Orphan page (no internal links in)", "Link to it from a related page.");
  return out;
}

const WEIGHT: Record<Severity, number> = { critical: 12, high: 5, medium: 2, low: 0.5 };
/** 100 minus weighted issues, floored at 0. Discovery failures count as critical. */
export function scoreAudit(issues: Pick<Issue, "severity">[]): number {
  return Math.max(0, Math.round(100 - issues.reduce((a, i) => a + WEIGHT[i.severity], 0)));
}
export function countBySeverity(issues: Pick<Issue, "severity">[]) {
  const c = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const i of issues) c[i.severity]++;
  return c;
}
const ORDER: Severity[] = ["critical", "high", "medium", "low"];
export const sortIssues = <T extends Pick<Issue, "severity">>(xs: T[]) => [...xs].sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity));

/** Duplicates across indexable pages. */
export function duplicates(values: string[]): Set<string> {
  const seen = new Map<string, number>();
  for (const v of values.filter(Boolean)) seen.set(v, (seen.get(v) ?? 0) + 1);
  return new Set([...seen].filter(([, n]) => n > 1).map(([v]) => v));
}

/** Sitemap lastmod must never be today's date stamped on every URL (§8). */
export function lastmodLooksFake(lastmods: string[], today: string): boolean {
  return lastmods.length > 3 && lastmods.every((d) => d.slice(0, 10) === today);
}

/** Site score: 70% the average page score, 30% the share of discovery checks passing. Stops one noisy template sinking the whole site. */
export function siteScore(pageIssueLists: Pick<Issue, "severity">[][], discoveryOk: boolean[]): number {
  const pages = pageIssueLists.length ? pageIssueLists.reduce((a, l) => a + scoreAudit(l), 0) / pageIssueLists.length : 100;
  const disc = discoveryOk.length ? (discoveryOk.filter(Boolean).length / discoveryOk.length) * 100 : 100;
  return Math.round(pages * 0.7 + disc * 0.3);
}
