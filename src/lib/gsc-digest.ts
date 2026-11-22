// Pure helpers for the daily GSC Intent email (no I/O — unit tested).

export interface IntentSnap {
  intent_name: string;
  description: string;
  queries: string[];
  total_impressions: number;
  total_clicks: number;
  avg_position: number;
}

export interface GrowingIntent extends IntentSnap {
  delta_impressions: number;
  delta_clicks: number;
}

export interface DigestDiff {
  newIntents: IntentSnap[];
  growing: GrowingIntent[];
}

/** New = no row the day before. Growing = impressions up > 0, top 10 by increase. */
export function diffSnapshots(current: IntentSnap[], previous: IntentSnap[]): DigestDiff {
  const prev = new Map(previous.map((p) => [p.intent_name, p]));
  const newIntents: IntentSnap[] = [];
  const growing: GrowingIntent[] = [];
  for (const c of current) {
    const p = prev.get(c.intent_name);
    if (!p) {
      newIntents.push(c);
      continue;
    }
    const di = c.total_impressions - p.total_impressions;
    if (di > 0) growing.push({ ...c, delta_impressions: di, delta_clicks: c.total_clicks - p.total_clicks });
  }
  newIntents.sort((a, b) => b.total_impressions - a.total_impressions);
  growing.sort((a, b) => b.delta_impressions - a.delta_impressions);
  return { newIntents, growing: growing.slice(0, 10) };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "YYYY-MM-DD" → { short: "DD/MM/YY", long: "Weekday D Month YYYY" } (UTC). */
export function ukDates(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(d.getUTCFullYear()).slice(2);
  return {
    short: `${dd}/${mm}/${yy}`,
    long: `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
    year: d.getUTCFullYear(),
  };
}

/** Days with no comparison still get an email; these explain why. */
export type NoticeKind = "no_data" | "baseline" | "failed";
export interface DigestNotice { kind: NoticeKind; reason: string }

const NOTICE_LABEL: Record<NoticeKind, string> = {
  no_data: "no data",
  baseline: "baseline saved",
  failed: "run failed",
};
const NOTICE_SUMMARY: Record<NoticeKind, string> = {
  no_data: "No search data from Google Search Console for this day, so there is nothing to compare yet.",
  baseline: "Baseline saved. Today's intents are stored, and day-on-day comparisons start with tomorrow's email.",
  failed: "Today's digest run failed before it could compare intents. The reason is below.",
};

/** Brand goes in the subject so mail apps never group this with other apps' digests. */
export function buildSubject(iso: string, diff: DigestDiff, notice?: DigestNotice, brand = "AutoSocials") {
  const { short, long } = ukDates(iso);
  const head = `GSC Intent · ${brand} · ${short}`;
  if (notice) return `${head} · ${NOTICE_LABEL[notice.kind]} (${long})`;
  const n = diff.newIntents.length;
  return n > 0
    ? `${head} · ${n} new intent${n === 1 ? "" : "s"} (${long})`
    : `${head} · ${diff.growing.length} growing (${long})`;
}

export function buildPreview(iso: string, diff: DigestDiff, notice?: DigestNotice) {
  const { short, long } = ukDates(iso);
  if (notice) return `Search intent for ${short} (${long}) — ${NOTICE_LABEL[notice.kind]}`;
  return `Search intent for ${short} (${long}) — ${diff.newIntents.length} new, ${diff.growing.length} growing`;
}

export const EMPTY_DIFF: DigestDiff = { newIntents: [], growing: [] };

export type SummaryCase = "new" | "growing" | "quiet";
export function summaryCase(diff: DigestDiff): SummaryCase {
  if (diff.newIntents.length > 0) return "new";
  if (diff.growing.length > 0) return "growing";
  return "quiet";
}

export function summaryText(diff: DigestDiff, domain: string) {
  const n = diff.newIntents.length, m = diff.growing.length;
  switch (summaryCase(diff)) {
    case "new":
      return `Yesterday, ${n} brand-new search intents appeared in Google Search Console for ${domain}, and ${m} existing intents grew.`;
    case "growing":
      return `Yesterday, ${m} search intents picked up new activity on ${domain}. No brand-new intents.`;
    default:
      return "Quiet day. No new intents and no growth vs the day before.";
  }
}

// ---------- Email rendering ----------

export const BRAND = {
  name: "AutoSocials",
  domain: "autosocials.com",
  logo: "https://sikwctnpyouldmcsjduq.supabase.co/storage/v1/object/public/email-assets/logo-dark.png",
  signoffName: "Kasim Javed",
  signoffRole: "Founder",
};
const INK = "#171715", ACCENT = "#64615B", MUTED = "#6D6962", RULE = "#E4E1DA", SURFACE = "#FFFFFF";
const HEAD = "'Plus Jakarta Sans','Helvetica Neue',Arial,sans-serif";
const BODY = "'Inter','Helvetica Neue',Arial,sans-serif";
const MONO = "'SF Mono','JetBrains Mono',Menlo,Consolas,monospace";

export const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const fmt = (n: number) => Math.round(n).toLocaleString("en-GB");

function sectionLabel(t: string) {
  return `<tr><td style="padding:28px 0 8px;border-bottom:1px solid ${RULE};font-family:${BODY};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${MUTED};">${esc(t)}</td></tr>`;
}

function row(name: string, right: string, under = "") {
  return `<tr><td style="padding:15px 0;border-bottom:1px solid ${RULE};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td width="16" valign="top" style="padding-top:6px;"><div style="width:8px;height:8px;border-radius:4px;background:${INK};font-size:0;line-height:0;">&nbsp;</div></td>
<td valign="top" style="font-family:${HEAD};font-size:15px;font-weight:600;color:${INK};">${esc(name)}</td>
<td valign="top" align="right" style="font-family:${MONO};font-size:13px;color:${MUTED};white-space:nowrap;">${right}</td>
</tr>${under ? `<tr><td></td><td colspan="2" style="padding-top:4px;font-family:${BODY};font-size:13px;line-height:1.6;color:${MUTED};">${under}</td></tr>` : ""}</table>
</td></tr>`;
}

const tag = (q: string) =>
  `<span style="display:inline-block;margin:6px 6px 0 0;padding:2px 8px;border:1px solid ${RULE};border-radius:4px;font-family:${BODY};font-size:12px;color:${MUTED};">${esc(q)}</span>`;

export function renderDigest(iso: string, diff: DigestDiff, notice?: DigestNotice) {
  const { short, long, year } = ukDates(iso);
  const subject = buildSubject(iso, diff, notice, BRAND.name);
  const preview = buildPreview(iso, diff, notice);
  const summary = notice ? NOTICE_SUMMARY[notice.kind] : summaryText(diff, BRAND.domain);
  const newImpr = diff.newIntents.reduce((s, i) => s + i.total_impressions, 0);
  const newClicks = diff.newIntents.reduce((s, i) => s + i.total_clicks, 0);

  const summaryHtml = (() => {
    if (notice) return esc(NOTICE_SUMMARY[notice.kind]);
    const n = diff.newIntents.length, m = diff.growing.length, d = `<strong style="color:${INK};">${esc(BRAND.domain)}</strong>`;
    switch (summaryCase(diff)) {
      case "new": return `Yesterday, <strong style="color:${INK};">${n}</strong> brand-new search intents appeared in Google Search Console for ${d}, and <strong style="color:${INK};">${m}</strong> existing intents grew.`;
      case "growing": return `Yesterday, <strong style="color:${INK};">${m}</strong> search intents picked up new activity on ${d}. No brand-new intents.`;
      default: return "Quiet day. No new intents and no growth vs the day before.";
    }
  })();
  const statusRows = notice
    ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sectionLabel("Status")}<tr><td style="padding:15px 0;border-bottom:1px solid ${RULE};font-family:${MONO};font-size:13px;line-height:1.6;color:${MUTED};">${esc(notice.reason)}</td></tr></table></td></tr>`
    : "";

  const stat = (v: string, l: string, border: boolean) =>
    `<td width="33%" align="center" style="padding:18px 8px;${border ? `border-left:1px solid ${RULE};` : ""}"><div style="font-family:${HEAD};font-size:27px;font-weight:700;color:${INK};">${v}</div><div style="padding-top:4px;font-family:${BODY};font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:${MUTED};">${l}</div></td>`;

  const newRows = diff.newIntents.length
    ? diff.newIntents.map((i) => row(i.intent_name, `Impressions: ${fmt(i.total_impressions)} · Clicks: ${fmt(i.total_clicks)}`,
        `${esc(i.description)}${i.queries.length ? `<br>${i.queries.slice(0, 3).map(tag).join("")}` : ""}`)).join("")
    : `<tr><td style="padding:15px 0;border-bottom:1px solid ${RULE};font-family:${BODY};font-size:13px;font-style:italic;color:${MUTED};">No brand-new intents yesterday.</td></tr>`;
  const growRows = diff.growing.length
    ? diff.growing.map((g) => row(g.intent_name, `+${fmt(g.delta_impressions)} impr. · ${g.delta_clicks >= 0 ? "+" : ""}${fmt(g.delta_clicks)} clicks`, `Position ${g.avg_position.toFixed(1)}`)).join("")
    : `<tr><td style="padding:15px 0;border-bottom:1px solid ${RULE};font-family:${BODY};font-size:13px;font-style:italic;color:${MUTED};">No intents grew yesterday.</td></tr>`;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${SURFACE};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(preview)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${SURFACE};"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;">
<tr><td style="padding-bottom:24px;border-bottom:1px solid ${RULE};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td><img src="${BRAND.logo}" alt="${esc(BRAND.name)}" height="40" style="display:block;height:40px;width:auto;border:0;"></td>
<td align="right" style="font-family:${BODY};font-size:10px;letter-spacing:0.28em;font-variant:small-caps;text-transform:uppercase;color:${MUTED};">Private notice</td>
</tr></table></td></tr>
<tr><td style="padding-top:28px;font-family:${BODY};font-size:11px;letter-spacing:0.28em;text-transform:uppercase;color:${ACCENT};">Daily digest · Data for ${short} · ${esc(long.toUpperCase())}</td></tr>
<tr><td style="padding-top:12px;font-family:${HEAD};font-size:28px;font-weight:800;letter-spacing:-0.02em;color:${INK};">Search intent · ${short}</td></tr>
<tr><td style="padding-top:8px;font-family:${BODY};font-size:13px;color:${MUTED};">Reporting period: ${esc(long)} (${short}) · ${esc(BRAND.domain)}</td></tr>
<tr><td style="padding-top:20px;font-family:${BODY};font-size:15px;line-height:1.6;color:${MUTED};">${summaryHtml}</td></tr>
<tr><td style="padding-top:24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};"><tr>
${stat(String(diff.newIntents.length), "New intents", false)}${stat(fmt(newImpr), "New impressions", true)}${stat(fmt(newClicks), "New clicks", true)}
</tr></table></td></tr>
${statusRows}${notice ? "" : `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sectionLabel("Brand-new intents")}${newRows}</table></td></tr>
<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${sectionLabel("Growing intents")}${growRows}</table></td></tr>`}
<tr><td style="padding-top:32px;font-family:${HEAD};font-size:15px;font-weight:600;color:${INK};">— ${esc(BRAND.signoffName)}<div style="font-family:${BODY};font-size:13px;font-weight:400;color:${MUTED};">${esc(BRAND.signoffRole)}</div></td></tr>
<tr><td style="padding-top:32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${RULE};"><tr>
<td style="padding-top:16px;font-family:${BODY};font-size:12px;line-height:1.6;color:${MUTED};">${esc(BRAND.name)} · ${esc(BRAND.domain)}<br>This is a private operational notice. Replies are read by a human.</td>
<td align="right" valign="top" style="padding-top:16px;font-family:${BODY};font-size:12px;color:${MUTED};white-space:nowrap;">UK · ${year}</td>
</tr></table></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    "PRIVATE NOTICE",
    `DAILY DIGEST · DATA FOR ${short} · ${long.toUpperCase()}`,
    `Search intent · ${short}`,
    `Reporting period: ${long} (${short}) · ${BRAND.domain}`,
    "",
    summary,
    "",
    `- New intents: ${diff.newIntents.length}`,
    `- New impressions: ${fmt(newImpr)}`,
    `- New clicks: ${fmt(newClicks)}`,
    "",
    ...(notice ? ["STATUS", `- ${notice.reason}`] : [
      "BRAND-NEW INTENTS",
      ...(diff.newIntents.length
        ? diff.newIntents.map((i) => `- ${i.intent_name}: ${i.description} (Impressions: ${fmt(i.total_impressions)} · Clicks: ${fmt(i.total_clicks)})${i.queries.length ? ` — e.g. ${i.queries.slice(0, 3).join(", ")}` : ""}`)
        : ["- No brand-new intents yesterday."]),
      "",
      "GROWING INTENTS",
      ...(diff.growing.length
        ? diff.growing.map((g) => `- ${g.intent_name}: +${fmt(g.delta_impressions)} impr. · +${fmt(g.delta_clicks)} clicks · position ${g.avg_position.toFixed(1)}`)
        : ["- No intents grew yesterday."]),
    ]),
    "",
    `— ${BRAND.signoffName}`,
    BRAND.signoffRole,
    "",
    `${BRAND.name} · ${BRAND.domain}`,
    "This is a private operational notice. Replies are read by a human.",
    `UK · ${year}`,
  ].join("\n");

  return { subject, preview, html, text };
}
