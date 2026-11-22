// Server-only: audits the LIVE site against blueprint v3, stores the result and sends the health email.
import { SITE_URL, seoRoutes } from "./seo-routes";
import { countBySeverity, siteScore, duplicates, lastmodLooksFake, pageIssues, parsePage, sortIssues, type DiscoveryCheck, type Issue, type PageReport } from "./seo-audit";
import { renderSeoEmail } from "./seo-email";

const UA = "AutoSocials-SEO-Health/1.0 (+https://autosocials.com)";

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function get(url: string, redirect: RequestRedirect = "follow") {
  try { const r = await fetch(url, { redirect, headers: { "User-Agent": UA } }); return { status: r.status, text: redirect === "manual" ? "" : await r.text(), location: r.headers.get("location") ?? "" }; }
  catch { return { status: 0, text: "", location: "" }; }
}

export async function runSeoAudit(userId: string | null) {
  const sm = await get(`${SITE_URL}/sitemap.xml`);
  const locs = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
  const lastmods = [...sm.text.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)].map((m) => m[1]!);
  const inSitemap = new Set(locs.map((l) => l.replace(SITE_URL, "").replace(/\/$/, "") || "/"));
  const creatorSample = locs.filter((l) => /\/(tiktok|instagram)\//.test(l)).slice(0, 3).map((l) => l.replace(SITE_URL, ""));
  const paths = [...new Set([...seoRoutes.map((r) => r.path), "/privacy", "/terms", ...creatorSample])];

  const raw = await Promise.all(paths.map(async (path) => ({ path, res: await get(`${SITE_URL}${path}`) })));
  const parsed = raw.map(({ path, res }) => ({ path, status: res.status, ...parsePage(res.text, SITE_URL) }));
  const ogUrls = [...new Set(parsed.map((p) => p.ogImage).filter(Boolean))];
  const ogOk = new Map(await Promise.all(ogUrls.map(async (u) => [u, (await get(u)).status === 200] as const)));
  const indexable = parsed.filter((p) => p.status === 200 && !p.noindex);
  const dupT = duplicates(indexable.map((p) => p.title)), dupD = duplicates(indexable.map((p) => p.description));
  const inbound = new Map<string, number>();
  for (const p of parsed) for (const l of p.linksOut) if (l !== p.path) inbound.set(l, (inbound.get(l) ?? 0) + 1);

  const pages: PageReport[] = parsed.map((p) => {
    const base = { ...p, inSitemap: p.noindex || inSitemap.has(p.path), linksIn: inbound.get(p.path) ?? 0, linksOut: p.linksOut.slice(0, 40) };
    return { ...base, issues: pageIssues(base, SITE_URL, dupT, dupD, !p.ogImage || ogOk.get(p.ogImage) === true) };
  });

  // Discovery layer (§8–§13, §19).
  const [robots, llms, llmsFull, facts, openapi, www, missing] = await Promise.all([
    get(`${SITE_URL}/robots.txt`), get(`${SITE_URL}/llms.txt`), get(`${SITE_URL}/llms-full.txt`), get(`${SITE_URL}/api/public/facts`),
    get(`${SITE_URL}/openapi.json`), get("https://www.autosocials.com/", "manual"), get(`${SITE_URL}/this-page-should-not-exist-${Date.now()}`),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const discovery: DiscoveryCheck[] = [
    { name: "Sitemap", url: `${SITE_URL}/sitemap.xml`, ok: sm.status === 200 && locs.length > 0 && locs.every((l) => l.startsWith(SITE_URL)) && !lastmodLooksFake(lastmods, today), note: sm.status === 200 ? `${locs.length.toLocaleString("en-GB")} URLs, apex host, real update dates` : `Returns ${sm.status}` },
    { name: "robots.txt", url: `${SITE_URL}/robots.txt`, ok: robots.status === 200 && robots.text.includes(`Sitemap: ${SITE_URL}/sitemap.xml`) && !/^Disallow:\s*\/\s*$/m.test(robots.text), note: "Points to the sitemap, private areas blocked, AI crawlers allowed" },
    { name: "llms.txt", url: `${SITE_URL}/llms.txt`, ok: llms.status === 200 && llms.text.startsWith("# "), note: "Short, quotable brief for AI assistants" },
    { name: "llms-full.txt", url: `${SITE_URL}/llms-full.txt`, ok: llmsFull.status === 200, note: "Full page index for answer engines" },
    { name: "Public facts", url: `${SITE_URL}/api/public/facts`, ok: facts.status === 200 && facts.text.includes('"name"'), note: facts.status === 200 ? "Machine-readable facts for AI tools" : "Live after next publish" },
    { name: "OpenAPI", url: `${SITE_URL}/openapi.json`, ok: openapi.status === 200, note: openapi.status === 200 ? "Describes the public facts endpoint" : "Live after next publish" },
    { name: "www redirect", url: "https://www.autosocials.com/", ok: [301, 308].includes(www.status), note: [301, 308].includes(www.status) ? "Permanent redirect to autosocials.com" : `Redirect is ${www.status} (temporary). Set autosocials.com as primary domain` },
    { name: "Missing pages", url: SITE_URL, ok: missing.status === 404, note: `Unknown URLs return ${missing.status}` },
  ];

  const issues: Issue[] = sortIssues([
    ...pages.flatMap((p) => p.issues.map((i) => ({ ...i, path: p.path }))),
    ...discovery.filter((d) => !d.ok).map((d) => ({ severity: (d.name === "Public facts" || d.name === "OpenAPI" ? "high" : "critical") as Issue["severity"], path: d.url.replace(SITE_URL, "") || "/", message: `${d.name} check failed`, fix: d.note })),
  ]);
  const row = { score: siteScore(pages.map((p) => p.issues), discovery.map((d) => d.ok)), counts: countBySeverity(issues), pages, discovery, issues, created_by: userId };
  const db = await admin();
  const { data, error } = await db.from("seo_audits").insert(row).select("id,created_at").single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, created_at: data.created_at as string, ...row };
}

async function gscTotals() {
  try {
    const db = await admin();
    const { getGscToken } = await import("./gsc-digest.server");
    const token = await getGscToken(db);
    const site = process.env["GSC_SITE_URL"]; if (!site) return null;
    const day = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
    const q = async (s: string, e: string) => {
      const r = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ startDate: s, endDate: e, dataState: "all" }) });
      const j = (await r.json()) as { rows?: { clicks: number; impressions: number }[] };
      return j.rows?.[0] ?? { clicks: 0, impressions: 0 };
    };
    const [now, prev] = await Promise.all([q(day(9), day(3)), q(day(16), day(10))]);
    return { clicks: now.clicks, impressions: now.impressions, clicksDelta: now.clicks - prev.clicks, impressionsDelta: now.impressions - prev.impressions };
  } catch { return null; }
}

export async function sendSeoEmail(userId: string | null, fresh = true) {
  const db = await admin();
  const audit = fresh ? await runSeoAudit(userId) : (await db.from("seo_audits").select("*").order("created_at", { ascending: false }).limit(1).single()).data;
  if (!audit) throw new Error("No audit yet");
  const { data: prev } = await db.from("seo_audits").select("score").lt("created_at", audit.created_at).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const email = renderSeoEmail({
    date: new Date(audit.created_at).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
    score: audit.score, prevScore: prev?.score ?? null, counts: audit.counts, pages: audit.pages.length, issues: audit.issues, discovery: audit.discovery,
    gsc: await gscTotals(), dashboardUrl: `${SITE_URL}/app/admin/seo`, logoUrl: "https://sikwctnpyouldmcsjduq.supabase.co/storage/v1/object/public/email-assets/logo-white-2026.png",
  });
  const sg = process.env["SENDGRID_API_KEY"];
  const recipient = process.env["SELF_HOST_SEO_AUDIT_TO"]?.trim();
  const sender = process.env["SELF_HOST_REPORTS_FROM"]?.trim();
  if (!sg || !recipient || !sender) throw new Error("Configure SendGrid and the operator's report addresses before sending.");
  const from = { email: sender, name: "AutoSocials" };
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST", headers: { Authorization: `Bearer ${sg}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: recipient }] }], from, reply_to: from, subject: email.subject,
      content: [{ type: "text/plain", value: email.text }, { type: "text/html", value: email.html }], categories: ["seo-health"],
      tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
    }),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
  await db.from("seo_audits").update({ emailed_at: new Date().toISOString() }).eq("id", audit.id);
  return { sent: true, score: audit.score, subject: email.subject };
}

// IndexNow (§16). Key is public by protocol; served at /indexnow-key.txt.
export const INDEXNOW_KEY = "a7c3e91f5b2d48e6b0f4c8d29e1a6b37"; // gitleaks:allow public IndexNow verification file value
export async function pingIndexNow(userId: string) {
  const db = await admin();
  const { data: last } = await db.from("indexnow_log").select("created_at").eq("ok", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && Date.now() - new Date(last.created_at).getTime() < 60 * 60 * 1000) throw new Error("Search engines were pinged less than an hour ago.");
  const sm = await get(`${SITE_URL}/sitemap.xml`);
  const urls = [...sm.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!).filter((u) => u.startsWith(SITE_URL)).slice(0, 10000);
  if (!urls.length) throw new Error("Sitemap had no URLs to submit.");
  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host: new URL(SITE_URL).host, key: INDEXNOW_KEY, keyLocation: `${SITE_URL}/indexnow-key.txt`, urlList: urls }),
  }).catch(() => null);
  const ok = !!res && (res.status === 200 || res.status === 202);
  await db.from("indexnow_log").insert({ submitted: urls.length, status: res?.status ?? 0, ok, error: ok ? null : (await res?.text().catch(() => ""))?.slice(0, 500) || "Request failed", created_by: userId });
  if (!ok) throw new Error(`IndexNow returned ${res?.status ?? "no response"}. Make sure the latest version is published.`);
  return { submitted: urls.length, status: res!.status };
}
