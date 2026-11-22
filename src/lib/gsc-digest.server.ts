// Server-only runner for the daily GSC Intent email.
import { diffSnapshots, renderDigest, EMPTY_DIFF, type IntentSnap, type NoticeKind } from "./gsc-digest";
import { fetchOpenAI } from "./openai-quota.server";

const MAX_QUERIES_FOR_AI = 1500;

type Row = { keys: string[]; clicks: number; impressions: number; position: number };

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDay(d);
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}

export async function getGscToken(db: any): Promise<string> {
  const { data } = await db.from("google_oauth_tokens").select("*").eq("service", "search_console").maybeSingle();
  if (!data) throw new Error("Search Console is not connected");
  if (new Date(data.expires_at) > new Date(Date.now() + 60_000)) return data.access_token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env["GOOGLE_OAUTH_CLIENT_ID"] ?? "",
      client_secret: process.env["GOOGLE_OAUTH_CLIENT_SECRET"] ?? "",
      refresh_token: data.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google token refresh failed [${res.status}]: ${await res.text()}`);
  const t = await res.json();
  await db.from("google_oauth_tokens").update({
    access_token: t.access_token,
    expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("service", "search_console");
  return t.access_token;
}

async function fetchQueries(token: string, start: string, end: string): Promise<Row[]> {
  const site = process.env["GSC_SITE_URL"];
  if (!site) throw new Error("GSC_SITE_URL is not set");
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const rows: Row[] = [];
  for (let startRow = 0; ; startRow += 25000) {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ startDate: start, endDate: end, dimensions: ["query"], rowLimit: 25000, startRow, dataState: "all" }),
    });
    if (!res.ok) throw new Error(`Search Console query failed [${res.status}]: ${await res.text()}`);
    const j = await res.json();
    const batch: Row[] = j.rows ?? [];
    rows.push(...batch);
    if (batch.length < 25000) break;
  }
  return rows;
}

type AiIntent = { name: string; description: string; product_potential: string; queries: string[] };

async function groupIntents(rows: Row[], previousNames: string[]): Promise<AiIntent[]> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  const top = [...rows].sort((a, b) => b.impressions - a.impressions).slice(0, MAX_QUERIES_FOR_AI);
  const list = top.map((r) => `${r.keys[0]}\t${r.impressions}\t${r.clicks}`).join("\n");
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["intents"],
    properties: {
      intents: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "description", "product_potential", "queries"],
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            product_potential: { type: "string" },
            queries: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  };
  const res = await fetchOpenAI("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-5.4",
      reasoning: { effort: "low" },
      input: [
        {
          role: "system",
          content:
            "You group Google Search Console queries for autosocials.com (AI social growth workspace for brands and agencies) into search intents. " +
            "Names are short Title Case (e.g. 'AI CRM Software'). Description is one line. product_potential is one short line. " +
            "Every query must be copied verbatim into exactly one intent. When an intent matches one of the existing names, reuse that exact name.",
        },
        {
          role: "user",
          content: `Existing intent names:\n${previousNames.join("\n") || "(none)"}\n\nQueries (query<TAB>impressions<TAB>clicks):\n${list}`,
        },
      ],
      text: { format: { type: "json_schema", name: "intents", strict: true, schema } },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`AI grouping failed [${res.status}]: ${body}`);
    (err as any).status = res.status;
    throw err;
  }
  const j = await res.json();
  const text: string =
    j.output_text ??
    (j.output ?? []).flatMap((o: any) => o.content ?? []).find((c: any) => c.type === "output_text")?.text ?? "";
  if (!text) throw new Error("AI returned no intents");
  return (JSON.parse(text).intents ?? []) as AiIntent[];
}

function aggregate(intents: AiIntent[], rows: Row[]) {
  const byQuery = new Map(rows.map((r) => [r.keys[0]!.toLowerCase(), r]));
  const out: (IntentSnap & { product_potential: string; query_count: number })[] = [];
  const seen = new Set<string>();
  for (const i of intents) {
    const name = i.name.trim();
    if (!name || seen.has(name)) continue;
    let impr = 0, clicks = 0, posW = 0, count = 0;
    const qs: string[] = [];
    for (const q of i.queries) {
      const r = byQuery.get(q.toLowerCase());
      if (!r) continue;
      impr += r.impressions; clicks += r.clicks; posW += r.position * r.impressions; count++;
      qs.push(r.keys[0]!);
    }
    if (count === 0) continue;
    seen.add(name);
    qs.sort((a, b) => (byQuery.get(b.toLowerCase())!.impressions - byQuery.get(a.toLowerCase())!.impressions));
    out.push({
      intent_name: name, description: i.description, product_potential: i.product_potential,
      queries: qs, query_count: count, total_impressions: impr, total_clicks: clicks,
      avg_position: impr > 0 ? posW / impr : 0,
    });
  }
  return out;
}

export interface DigestResult {
  status: "sent" | "skipped" | "no_data" | "failed";
  reason?: string;
  subject?: string;
  newCount?: number;
  growingCount?: number;
  digestDate: string;
}

/** Sends one rendered digest through SendGrid, tracking off, with a unique ref so mail apps never thread it. */
async function sendEmail(email: { subject: string; html: string; text: string }) {
  const sg = process.env["SENDGRID_API_KEY"];
  const recipient = process.env["SELF_HOST_GSC_DIGEST_TO"]?.trim();
  const sender = process.env["SELF_HOST_REPORTS_FROM"]?.trim();
  if (!sg || !recipient || !sender) throw new Error("Configure SendGrid and the operator's report addresses before sending.");
  const from = { email: sender, name: "AutoSocials" };
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${sg}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: recipient }] }],
      from, reply_to: from, subject: email.subject,
      headers: { "X-Entity-Ref-ID": crypto.randomUUID() },
      content: [{ type: "text/plain", value: email.text }, { type: "text/html", value: email.html }],
      categories: ["gsc-intent-digest"],
      tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
    }),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
}

export async function runGscDigest(opts: { force?: boolean } = {}): Promise<DigestResult> {
  const db = await admin();
  const reportDate = addDays(isoDay(new Date()), -1); // "yesterday"
  const prevDate = addDays(reportDate, -1);

  // Every outcome is logged; an email goes out every day (sent_at marks that it did).
  const log = async (r: DigestResult, notified: boolean) => {
    await db.from("gsc_digest_log").upsert({
      digest_date: reportDate, status: r.status, reason: r.reason ?? null, subject: r.subject ?? null,
      new_count: r.newCount ?? 0, growing_count: r.growingCount ?? 0,
      sent_at: notified ? new Date().toISOString() : null,
    }, { onConflict: "digest_date" });
    return r;
  };

  // No comparison today: still email a notice so a quiet day never looks like a missing email.
  const notify = async (status: "no_data" | "failed", kind: NoticeKind, reason: string) => {
    const email = renderDigest(reportDate, EMPTY_DIFF, { kind, reason });
    try {
      await sendEmail(email);
      return await log({ status, reason, subject: email.subject, digestDate: reportDate }, true);
    } catch (e) {
      const why = `${reason} · notice email failed: ${e instanceof Error ? e.message : String(e)}`;
      console.error("[gsc-digest]", why);
      return await log({ status: "failed", reason: why.slice(0, 1000), digestDate: reportDate }, false);
    }
  };

  if (!opts.force) {
    const { data: existing } = await db.from("gsc_digest_log").select("sent_at").eq("digest_date", reportDate).maybeSingle();
    if (existing?.sent_at) return { status: "skipped", reason: "Already emailed for this day", digestDate: reportDate };
  }

  try {
    // 1. Sync intents from the last 28 days.
    const token = await getGscToken(db);
    const rows = await fetchQueries(token, addDays(reportDate, -27), reportDate);
    if (rows.length === 0) return await notify("no_data", "no_data", "Search Console returned no rows for the last 28 days.");

    const { data: prevIntents } = await db.from("gsc_intents").select("name, built_url, built_at");
    const prevMap = new Map<string, { built_url: string | null; built_at: string | null }>(
      (prevIntents ?? []).map((p: any) => [p.name, p]),
    );
    const ai = await groupIntents(rows, [...prevMap.keys()]);
    const intents = aggregate(ai, rows);
    if (intents.length === 0) return await notify("no_data", "no_data", "Search Console returned queries, but no intents could be built from them.");

    // Replace the intent set, preserving built_url / built_at.
    await db.from("gsc_intents").delete().neq("name", "");
    await db.from("gsc_intents").insert(intents.map((i) => ({
      name: i.intent_name, description: i.description, product_potential: i.product_potential, queries: i.queries.slice(0, 50),
      query_count: i.query_count, total_impressions: i.total_impressions, total_clicks: i.total_clicks,
      avg_position: i.avg_position, built_url: prevMap.get(i.intent_name)?.built_url ?? null,
      built_at: prevMap.get(i.intent_name)?.built_at ?? null, synced_at: new Date().toISOString(),
    })));

    // 2. Snapshot for the report date.
    await db.from("gsc_intent_snapshots").delete().eq("snapshot_date", reportDate);
    await db.from("gsc_intent_snapshots").insert(intents.map((i) => ({
      snapshot_date: reportDate, intent_name: i.intent_name, description: i.description, queries: i.queries.slice(0, 10),
      query_count: i.query_count, total_impressions: i.total_impressions, total_clicks: i.total_clicks, avg_position: i.avg_position,
    })));

    // 3. Compare with the day before.
    const { data: prev } = await db.from("gsc_intent_snapshots").select("*").eq("snapshot_date", prevDate);
    const num = (r: any): IntentSnap => ({
      intent_name: r.intent_name, description: r.description, queries: r.queries ?? [],
      total_impressions: Number(r.total_impressions), total_clicks: Number(r.total_clicks), avg_position: Number(r.avg_position),
    });
    if (!prev || prev.length === 0) {
      return await notify("no_data", "baseline", `Baseline saved for ${reportDate}; no snapshot for ${prevDate} to compare yet.`);
    }
    const diff = diffSnapshots(intents, prev.map(num));
    const email = renderDigest(reportDate, diff);

    // 4. Send.
    await sendEmail(email);
    return await log({
      status: "sent", subject: email.subject, newCount: diff.newIntents.length,
      growingCount: diff.growing.length, digestDate: reportDate,
    }, true);
  } catch (e) {
    const reason = (e instanceof Error ? e.message : String(e)).slice(0, 800);
    console.error("[gsc-digest]", reason);
    return await notify("failed", "failed", reason);
  }
}
