import { createClient } from "npm:@supabase/supabase-js@2.99.1";

type Profile = { platform: string; handle: string; url?: string | null };
type Evidence = {
  checkedAt: string;
  virloUpdatedAt?: string;
  website: { title: string; url: string; text: string } | null;
  market: { title: string; url: string; snippet: string; publishedAt?: string }[];
  formats: { name: string; recipe: string; lifecycle: string; creators7d?: number; creatorsPrevious7d?: number; platformNames: string[] }[];
  posts: { platform: string; url: string; caption: string; publishedAt?: string; likes?: number; comments?: number; views?: number }[];
  providers: { firecrawl: "ready" | "unavailable"; virlo: "ready" | "unavailable"; apify: "ready" | "unavailable" };
};

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const profileActors: Record<string, string> = { instagram: "apify~instagram-scraper", tiktok: "clockworks~tiktok-scraper" };
const cache = new Map<string, { expiresAt: number; includedWebsite: boolean; value: Evidence }>();
const inFlight = new Map<string, Promise<Evidence>>();

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function cleanText(value: unknown, limit: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, limit) : "";
}
function finite(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}
function date(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const parsed = new Date(typeof value === "number" && value < 1e12 ? value * 1000 : value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}
function secret(...names: string[]): string | null {
  for (const name of names) {
    const value = Deno.env.get(name)?.trim();
    if (value) return value;
  }
  return null;
}
function safeWebsite(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ""));
    const host = url.hostname.toLowerCase().replace(/\.$/, "");
    if (url.protocol !== "https:" || url.username || url.password || url.port || !host.includes(".") || /[:\[\]]/.test(host) || /^[\d.]+$/.test(host) || /(?:^|\.)(?:localhost|local|internal|lan|test|invalid|example|onion)$/.test(host)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
function safeSocialProfile(value: unknown): Profile | null {
  const row = record(value);
  const platform = cleanText(row.platform, 30).toLowerCase();
  if (!(platform in profileActors)) return null;
  const handle = cleanText(row.handle, 100).replace(/^@/, "");
  if (!/^[\w.-]{1,100}$/.test(handle)) return null;
  const supplied = cleanText(row.url, 500);
  const url = supplied || (platform === "instagram" ? `https://www.instagram.com/${handle}/` : `https://www.tiktok.com/@${handle}`);
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || !["instagram.com", "tiktok.com"].includes(host)) return null;
    if ((platform === "instagram" && host !== "instagram.com") || (platform === "tiktok" && host !== "tiktok.com")) return null;
    return { platform, handle, url: parsed.href };
  } catch { return null; }
}
async function readJson(response: Response, byteLimit = 250_000): Promise<Record<string, unknown>> {
  if (!response.ok || !response.body) throw new Error("Provider unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let body = "", bytes = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > byteLimit) { await reader.cancel(); throw new Error("Provider response exceeded limit"); }
    body += decoder.decode(part.value, { stream: true });
  }
  return record(JSON.parse(body + decoder.decode()));
}
function profileTerms(value: unknown): string[] {
  const found: string[] = [];
  const visit = (item: unknown, key = "", depth = 0) => {
    if (depth > 4 || found.length >= 8) return;
    if (typeof item === "string" && /industry|category|location|service|product|audience|summary|description|focus|market|sector|business/i.test(key)) {
      const text = cleanText(item, 100);
      if (text && !/^https?:\/\//i.test(text) && !/\S+@\S+/.test(text)) found.push(text);
    } else if (Array.isArray(item)) {
      item.slice(0, 8).forEach((child) => visit(child, key, depth + 1));
    } else if (item && typeof item === "object") {
      Object.entries(item as Record<string, unknown>).slice(0, 30).forEach(([childKey, child]) => visit(child, childKey, depth + 1));
    }
  };
  visit(value);
  return [...new Set(found)].slice(0, 6);
}

async function fetchWebsite(url: string, key: string): Promise<Evidence["website"]> {
  const response = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true, timeout: 9000 }),
    signal: AbortSignal.timeout(10_000), redirect: "error",
  });
  const payload = await readJson(response);
  const data = record(payload.data), metadata = record(data.metadata);
  const text = cleanText(data.markdown, 8_000);
  if (!text) throw new Error("No readable website text");
  return { title: cleanText(metadata.title, 160) || new URL(url).hostname, url, text };
}

async function fetchMarketSearch(name: string, website: string | null, profile: unknown, key: string): Promise<Evidence["market"]> {
  const host = website ? new URL(website).hostname.replace(/^www\./, "") : "";
  const terms = profileTerms(profile).join(" ");
  const query = cleanText([name, host, terms, "current sector market consumer and regulatory developments UK"].filter(Boolean).join(" "), 360);
  const response = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, limit: 5 }), signal: AbortSignal.timeout(9_000), redirect: "error",
  });
  const payload = await readJson(response);
  const rows = Array.isArray(payload.data) ? payload.data : [];
  return rows.slice(0, 5).flatMap((entry): Evidence["market"] => {
    const row = record(entry);
    const url = safeWebsite(row.url);
    const title = cleanText(row.title, 180), snippet = cleanText(row.description ?? row.snippet, 600);
    if (!url || !title || !snippet) return [];
    const publishedAt = date(row.publishedTime ?? row.published_at ?? row.date);
    if (publishedAt && Date.now() - Date.parse(publishedAt) > 366 * 86_400_000) return [];
    return [{ title, url, snippet, ...(publishedAt ? { publishedAt } : {}) }];
  });
}

async function fetchFormats(key: string, signal: AbortSignal, onReceipt: (response: Response) => void): Promise<{ formats: Evidence["formats"]; updatedAt?: string }> {
  const query = new URLSearchParams({ client_fit: "local_business", brand_safety: "safe", region: "GB", language: "en", limit: "6", examples: "0" });
  const response = await fetch(`https://api.virlo.ai/v1/content-trends?${query}`, {
    headers: { Authorization: `Bearer ${key}` }, signal, redirect: "error",
  });
  onReceipt(response);
  const payload = await readJson(response);
  const data = Array.isArray(payload.data) ? payload.data : [];
  const meta = record(payload.meta);
  const formats = data.flatMap((entry): Evidence["formats"] => {
    const row = record(entry), clientFit = record(row.client_fit), localFit = record(clientFit.local_business);
    const name = cleanText(row.name, 120), recipe = cleanText(row.recipe, 500), lifecycle = cleanText(row.lifecycle, 30);
    if (!name || !recipe || !["new", "rising", "peaking", "fading"].includes(lifecycle)) return [];
    if (localFit.fit !== "yes" && localFit.fit !== "maybe") return [];
    const platforms = record(row.platforms);
    return [{ name, recipe, lifecycle, creators7d: finite(row.creators_7d), creatorsPrevious7d: finite(row.creators_prev_7d), platformNames: Object.entries(platforms).filter(([, count]) => finite(count) !== undefined).map(([platform]) => platform).slice(0, 3) }];
  });
  return { formats, updatedAt: date(meta.updated_at) };
}

async function fetchProfilePosts(profile: Profile, key: string): Promise<Evidence["posts"]> {
  const actor = profileActors[profile.platform];
  const input = profile.platform === "instagram"
    ? { directUrls: [profile.url], resultsType: "posts", resultsLimit: 6, addParentData: true }
    : { profiles: [profile.handle], resultsPerPage: 6, profileSorting: "latest", profileScrapeSections: ["videos"] };
  const endpoint = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?format=json&clean=true&limit=6&timeout=8`;
  const response = await fetch(endpoint, {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(input), signal: AbortSignal.timeout(10_000), redirect: "error",
  });
  if (!response.ok || !response.body) throw new Error("Apify unavailable");
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let body = "", bytes = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > 180_000) { await reader.cancel(); throw new Error("Apify response exceeded limit"); }
    body += decoder.decode(part.value, { stream: true });
  }
  const items: unknown = JSON.parse(body + decoder.decode());
  if (!Array.isArray(items)) return [];
  return items.slice(0, 6).flatMap((entry): Evidence["posts"] => {
    const row = record(entry);
    if (row.error || row.errorMessage) return [];
    const url = cleanText(profile.platform === "tiktok" ? row.webVideoUrl : row.url, 700);
    if (!/^https:\/\//i.test(url)) return [];
    const caption = cleanText(profile.platform === "tiktok" ? row.text : row.caption, 500);
    if (!caption) return [];
    const publishedAt = date(profile.platform === "tiktok" ? row.createTimeISO ?? row.createTime : row.timestamp);
    const likes = finite(profile.platform === "tiktok" ? row.diggCount : row.likesCount);
    const comments = finite(profile.platform === "tiktok" ? row.commentCount : row.commentsCount);
    const views = finite(profile.platform === "tiktok" ? row.playCount : row.videoPlayCount);
    return [{ platform: profile.platform, url, caption, ...(publishedAt ? { publishedAt } : {}), ...(likes !== undefined ? { likes } : {}), ...(comments !== undefined ? { comments } : {}), ...(views !== undefined ? { views } : {}) }];
  });
}

async function gather(workspaceId: string, userId: string, includeWebsite: boolean, includeVirlo: boolean): Promise<Evidence> {
  const checkedAt = new Date().toISOString();
  const evidence: Evidence = { checkedAt, website: null, market: [], formats: [], posts: [], providers: { firecrawl: "unavailable", virlo: "unavailable", apify: "unavailable" } };
  const serviceKey = secret("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = secret("SUPABASE_URL");
  if (!serviceKey || !supabaseUrl) return evidence;
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: workspace, error } = await admin.from("workspaces").select("id,name,website,social_profiles").eq("id", workspaceId).single();
  if (error || !workspace) return evidence;
  const { data: profile } = await admin.from("brand_profiles").select("profile").eq("workspace_id", workspaceId).maybeSingle();
  const siteUrl = safeWebsite(workspace.website);
  const firecrawlKey = secret("FIRECRAWL_API_KEY", "Firecrawl");
  const virloKey = secret("VIRLO_API_KEY", "Virlo");
  const apifyKey = secret("APIFY_API_TOKEN", "APIFY_TOKEN", "Apify");
  const profiles = Array.isArray(workspace.social_profiles) ? workspace.social_profiles.map(safeSocialProfile).filter((item): item is Profile => !!item).slice(0, 2) : [];

  const tasks: Promise<void>[] = [];
  if (firecrawlKey) {
    tasks.push((async () => {
      try {
        const [market, website] = await Promise.allSettled([
          fetchMarketSearch(workspace.name ?? "", siteUrl, profile?.profile, firecrawlKey),
          includeWebsite && siteUrl ? fetchWebsite(siteUrl, firecrawlKey) : Promise.resolve(null),
        ]);
        if (market.status === "fulfilled") evidence.market = market.value;
        if (website.status === "fulfilled") evidence.website = website.value;
        const websiteWasRequested = includeWebsite && !!siteUrl;
        evidence.providers.firecrawl = market.status === "fulfilled" || (websiteWasRequested && website.status === "fulfilled") ? "ready" : "unavailable";
      } catch { evidence.providers.firecrawl = "unavailable"; }
    })());
  }
  if (virloKey && includeVirlo) {
    tasks.push((async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const work = (async () => {
          const claim = await admin.from("virlo_research_activity").insert({ workspace_id: workspaceId, user_id: userId, operation: "content_trends", status: "started", estimated_cost_usd: 0.25 }).select("id").abortSignal(controller.signal).single();
          if (claim.error || !claim.data || controller.signal.aborted) throw new Error("Usage unavailable");
          const activityId = claim.data.id;
          let receipt: { status: number; cost: number | null; credits: number | null } | null = null;
          try {
            const result = await fetchFormats(virloKey, controller.signal, (response) => {
              const read = (name: string) => { const raw = response.headers.get(name); const value = raw === null || raw.trim() === "" ? NaN : Number(raw); return Number.isFinite(value) && value >= 0 ? value : null; };
              receipt = { status: response.status, cost: read("X-Cost"), credits: read("X-Credits-Used") };
            });
            const details = receipt as { status: number; cost: number | null; credits: number | null } | null;
            await admin.from("virlo_research_activity").update({ status: "completed", provider_status: details?.status ?? null, cost_usd: details?.cost ?? null, credits_used: details?.credits ?? null, updated_at: new Date().toISOString() }).eq("id", activityId);
            return result;
          } catch (error) {
            const details = receipt as { status: number; cost: number | null; credits: number | null } | null;
            await admin.from("virlo_research_activity").update({ status: details ? "failed" : "unknown", provider_status: details?.status ?? null, cost_usd: details?.cost ?? null, credits_used: details?.credits ?? null, updated_at: new Date().toISOString() }).eq("id", activityId);
            throw error;
          }
        })();
        const result = await Promise.race([work, new Promise<never>((_, reject) => controller.signal.addEventListener("abort", () => reject(new Error("Timed out")), { once: true }))]);
        evidence.formats = result.formats;
        evidence.virloUpdatedAt = result.updatedAt;
        evidence.providers.virlo = "ready";
      } catch { evidence.providers.virlo = "unavailable"; }
      finally { clearTimeout(timer); }
    })());
  }
  if (apifyKey && profiles.length) {
    tasks.push((async () => {
      const results = await Promise.allSettled(profiles.map((item) => fetchProfilePosts(item, apifyKey)));
      evidence.posts = results.flatMap((result) => result.status === "fulfilled" ? result.value : []).slice(0, 12);
      evidence.providers.apify = results.some((result) => result.status === "fulfilled") ? "ready" : "unavailable";
    })());
  }
  await Promise.all(tasks);
  return evidence;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405, headers: jsonHeaders });
  const serviceKey = secret("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey || req.headers.get("Authorization") !== `Bearer ${serviceKey}`) return Response.json({ error: "Unauthorized" }, { status: 401, headers: jsonHeaders });
  let input: Record<string, unknown>;
  try { input = record(await req.json()); } catch { return Response.json({ error: "Invalid request" }, { status: 400, headers: jsonHeaders }); }
  const userId = cleanText(input.userId, 80), workspaceId = cleanText(input.workspaceId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !/^[0-9a-f-]{36}$/i.test(workspaceId)) return Response.json({ error: "Invalid request" }, { status: 400, headers: jsonHeaders });
  const supabaseUrl = secret("SUPABASE_URL");
  if (!supabaseUrl) return Response.json({ error: "Not configured" }, { status: 503, headers: jsonHeaders });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: access, error } = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (error || !access) return Response.json({ error: "Forbidden" }, { status: 403, headers: jsonHeaders });

  const includeWebsite = input.includeWebsite === true;
  const includeVirlo = input.includeVirlo !== false;
  const requestKey = `${workspaceId}:${includeVirlo}`;
  const cached = cache.get(requestKey);
  if (cached && cached.expiresAt > Date.now() && (!includeWebsite || cached.includedWebsite)) return Response.json(cached.value, { headers: jsonHeaders });
  const existing = inFlight.get(requestKey);
  if (existing) return Response.json(await existing, { headers: jsonHeaders });
  const task = gather(workspaceId, userId, includeWebsite, includeVirlo);
  inFlight.set(requestKey, task);
  try {
    const value = await task;
    cache.set(requestKey, { expiresAt: Date.now() + 45 * 60_000, includedWebsite: includeWebsite, value });
    return Response.json(value, { headers: jsonHeaders });
  } catch {
    return Response.json({ error: "Social evidence is temporarily unavailable" }, { status: 200, headers: jsonHeaders });
  } finally { inFlight.delete(requestKey); }
});
