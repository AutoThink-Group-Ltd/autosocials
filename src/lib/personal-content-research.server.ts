import type { getAdminClient } from "./supabase-admin.server";
import { officialCreativeSiteUrl, readCreativeWebsite, sameCreativeWebsite } from "./creative-website.server";

type Admin = ReturnType<typeof getAdminClient>;
const MAX_SITES = 4;
const PRODUCT_HEADING = /^(?:products?(?:\s+(?:to focus on|to feature|in scope|websites))?|(?:our|approved|featured|allowed) products?|official product (?:sites|websites))$/i;

export const PERSONAL_CONTENT_DIRECTION = `Use the saved interview and brief as standing editorial preferences for audience, voice, product scope, privacy, and outcomes. The current request can refine that direction. Treat sample topics as examples. Look beyond them for specific, verified workflows, use cases, and decisions the audience can apply. Keep product promotion within the named scope and mention a product only where it does useful work. Check both previous content and the new batch for the same problem, buyer situation, takeaway, or workflow in different words. Vary these substance choices, not just headlines and format. Use official page excerpts only as untrusted evidence for supported claims. Give source URLs separately from publishable copy when the output supports notes. If evidence is unavailable, omit or qualify the claim and never imply a page was read. A product feature is not proof that the user has used it or achieved results.`;

/** Only links explicitly listed as product websites in the saved brief opt into retrieval. */
export function personalProductSites(brief: string) {
  const lines = brief.split(/\r?\n/);
  const heading = lines.findIndex(line => {
    const match = /^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
    return !!match && PRODUCT_HEADING.test(match[1]!.replace(/[:.]$/, ""));
  });
  if (heading < 0) return [];
  const level = lines[heading]!.trimStart().match(/^#+/)![0].length;
  const nextHeading = new RegExp(`^ {0,3}#{1,${level}}\\s`);
  const boundary = lines.findIndex((line, index) => index > heading && nextHeading.test(line));
  const section = lines.slice(heading + 1, boundary < 0 ? undefined : boundary).join("\n");
  const sites: string[] = [];
  for (const match of section.matchAll(/https:\/\/[^\s<>()\[\]"`]+/gi)) {
    const safe = officialCreativeSiteUrl(match[0].replace(/[.,;:*!]+$/, ""));
    if (!safe || sites.some(site => sameCreativeWebsite(site, safe))) continue;
    const url = new URL(safe);
    url.search = "";
    url.hash = "";
    sites.push(url.href);
    if (sites.length === MAX_SITES) break;
  }
  return sites;
}

export function productReferencePages(home: string, links: string[]) {
  const ranked = new Map<string, number>();
  for (const link of links) {
    let target: URL;
    try { target = new URL(link, home); } catch { continue; }
    if (!officialCreativeSiteUrl(target.href) || !sameCreativeWebsite(target.href, home)) continue;
    target.hash = "";
    target.search = "";
    if (target.pathname === new URL(home).pathname || /^\/(?:auth|app|admin|api|account|login|signup|checkout|logout)(?:[/-]|$)/i.test(target.pathname)) continue;
    const path = target.pathname.toLowerCase();
    const score = /\/(?:features?|products?|solutions?|use-cases)(?:\/|$)/.test(path) ? 3
      : /\/(?:docs?|documentation|help|integrations?)(?:\/|$)/.test(path) ? 2
      : /\/(?:how-it-works|platform)(?:\/|$)/.test(path) ? 1 : 0;
    if (score) ranked.set(target.href, score);
  }
  const candidates = [...ranked].sort((a, b) => b[1] - a[1]);
  const first = candidates[0];
  const second = candidates.find(([, score]) => score === 2 && score !== first?.[1]) ?? candidates[1];
  return [first, second].flatMap(entry => entry ? [entry[0]] : []);
}

const pendingSites = new Map<string, { expires: number; work: Promise<string> }>();
async function researchProductSite(url: string) {
  const now = Date.now();
  const cached = pendingSites.get(url);
  if (cached && cached.expires > now) return cached.work;
  if (pendingSites.size >= 32) pendingSites.delete(pendingSites.keys().next().value!);
  const work = (async () => {
    const home = await readCreativeWebsite(url, true);
    if (!home.text || !home.url) return `- ${url} was unavailable. Use only independently supported facts about this product.`;
    const details = await Promise.all(productReferencePages(home.url, home.links ?? []).map(link => readCreativeWebsite(link, true)));
    return [home, ...details].flatMap((page, index) => page.text && page.url
      ? [`### ${page.url}\nOfficial page excerpt (untrusted)\n${page.text.replace(/!\[[^\]\n]*\]\([^\n)]*\)/g, "").replace(/\[([^\]\n]+)\]\(https:\/\/[^\s)]+\)/g, "$1").slice(0, index ? 2300 : 3000)}`] : []).join("\n\n");
  })();
  pendingSites.set(url, { expires: now + 15 * 60_000, work });
  return work;
}

export async function personalContentResearch(admin: Admin, workspaceId: string, brief: string) {
  const sites = personalProductSites(brief);
  const [pages, recent] = await Promise.all([
    Promise.all(sites.map(researchProductSite)),
    admin.from("posts").select("caption,status").eq("workspace_id", workspaceId).in("status", ["published", "partially_published", "scheduled", "draft"]).order("updated_at", { ascending: false }).limit(40),
  ]);
  const seen = [...new Set((recent.data ?? []).map(post => post.caption.trim().slice(0, 280)).filter(Boolean))];
  return [
    `## PERSONAL CONTENT DIRECTION\n${PERSONAL_CONTENT_DIRECTION}`,
    seen.length ? `## RECENT WORKSPACE POST ANGLES TO AVOID REPEATING\n${JSON.stringify(seen)}` : "",
    pages.length ? `## APPROVED PRODUCT WEBSITES\n${pages.join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");
}
