// Pure renderer for the SEO health email. Monochrome AutoSocials look, table layout, <p> spacing at 1.6.
import type { DiscoveryCheck, Issue, Severity } from "./seo-audit";

const INK = "#171715", CANVAS = "#F5F3EE", MUTED = "#6D6962", LINE = "#E4E1DA", WHITE = "#FFFFFF";
const SEV: Record<Severity, { label: string; dot: string }> = {
  critical: { label: "Critical", dot: "#C2362B" }, high: { label: "High", dot: "#D98A1E" }, medium: { label: "Medium", dot: "#2E8B57" }, low: { label: "Low", dot: "#9A968E" },
};
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const p = (txt: string, style = "") => `<p style="margin:0;line-height:1.6;${style}">${txt}</p>`;

export type SeoEmailInput = {
  date: string; score: number; prevScore: number | null; counts: Record<Severity, number>; pages: number;
  issues: Issue[]; discovery: DiscoveryCheck[]; gsc: { clicks: number; impressions: number; clicksDelta: number | null; impressionsDelta: number | null } | null;
  dashboardUrl: string; logoUrl: string;
};

const verdict = (s: number) => (s >= 90 ? "In great shape" : s >= 75 ? "Solid, a few fixes to make" : s >= 50 ? "Needs attention" : "Fix these first");
const delta = (d: number | null) => (d === null ? "" : `<span style="color:${d >= 0 ? "#2E8B57" : "#C2362B"};font-size:12px;font-weight:700;">${d >= 0 ? "▲" : "▼"} ${Math.abs(d).toLocaleString("en-GB")}</span>`);

export function renderSeoEmail(x: SeoEmailInput): { subject: string; html: string; text: string } {
  const top = x.issues.slice(0, 5);
  const change = x.prevScore === null ? "First health check" : x.score === x.prevScore ? "No change since last check" : `${x.score > x.prevScore ? "Up" : "Down"} ${Math.abs(x.score - x.prevScore)} since last check`;
  const subject = `SEO health ${x.score}/100 · ${x.counts.critical} critical · ${x.date}`;

  const sevCell = (k: Severity) => `<td width="25%" align="center" style="padding:14px 6px;border-right:1px solid ${LINE};">
      ${p(`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${SEV[k].dot};"></span>`, "font-size:0;")}
      ${p(String(x.counts[k]), `font-size:26px;font-weight:800;color:${INK};letter-spacing:-0.5px;`)}
      ${p(SEV[k].label, `font-size:11px;text-transform:uppercase;letter-spacing:1px;color:${MUTED};`)}</td>`;

  const issueRows = top.length ? top.map((i, n) => `<tr><td style="padding:14px 0;border-top:${n ? `1px solid ${LINE}` : "0"};">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
        <td width="34" valign="top">${p(String(n + 1).padStart(2, "0"), `font-size:13px;font-weight:800;color:${INK};`)}</td>
        <td valign="top">
          ${p(`<span style="display:inline-block;padding:2px 8px;border-radius:999px;background:${SEV[i.severity].dot};color:${WHITE};font-size:10px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;">${SEV[i.severity].label}</span>&nbsp;&nbsp;<span style="font-family:Menlo,Consolas,monospace;font-size:12px;color:${MUTED};">${esc(i.path)}</span>`)}
          ${p(esc(i.message), `font-size:15px;font-weight:700;color:${INK};padding-top:4px;`)}
          ${p(esc(i.fix), `font-size:13px;color:${MUTED};`)}
        </td></tr></table></td></tr>`).join("")
    : `<tr><td>${p("Nothing to fix. Every check passed.", `font-size:15px;font-weight:700;color:${INK};`)}</td></tr>`;

  const discRows = x.discovery.map((d, n) => `<tr>
      <td style="padding:10px 0;border-top:${n ? `1px solid ${LINE}` : "0"};">${p(`<b style="color:${INK};">${esc(d.name)}</b>`, "font-size:14px;")}${p(esc(d.note), `font-size:12px;color:${MUTED};`)}</td>
      <td align="right" style="padding:10px 0;border-top:${n ? `1px solid ${LINE}` : "0"};"><span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:${d.ok ? INK : "#C2362B"};color:${WHITE};font-size:14px;font-weight:800;">${d.ok ? "✓" : "!"}</span></td></tr>`).join("");

  const gsc = x.gsc ? `<tr><td style="padding:0 32px 28px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${INK};border-radius:16px;"><tr>
        <td width="50%" style="padding:20px 22px;">${p("Search clicks · 7 days", `font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#B9B5AC;`)}${p(`${x.gsc.clicks.toLocaleString("en-GB")} ${delta(x.gsc.clicksDelta)}`, `font-size:28px;font-weight:800;color:${WHITE};`)}</td>
        <td width="50%" style="padding:20px 22px;border-left:1px solid #33322F;">${p("Impressions · 7 days", `font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#B9B5AC;`)}${p(`${x.gsc.impressions.toLocaleString("en-GB")} ${delta(x.gsc.impressionsDelta)}`, `font-size:28px;font-weight:800;color:${WHITE};`)}</td>
      </tr></table></td></tr>` : "";

  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:${INK};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(`${verdict(x.score)}. ${x.counts.critical} critical, ${x.counts.high} high across ${x.pages} pages.`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};"><tr><td align="center" style="padding:32px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:${WHITE};border:2px solid ${INK};border-radius:22px;overflow:hidden;">
  <tr><td style="background:${INK};padding:22px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td><img src="${x.logoUrl}" alt="AutoSocials" height="28" style="display:block;height:28px;border:0;"></td>
      <td align="right">${p(`SEO + GEO HEALTH`, `font-size:11px;letter-spacing:2px;font-weight:700;color:#B9B5AC;`)}${p(esc(x.date), `font-size:12px;color:${WHITE};`)}</td>
    </tr></table></td></tr>
  <tr><td align="center" style="padding:40px 32px 8px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" width="168" height="168" style="width:168px;height:168px;border-radius:50%;border:12px solid ${INK};background:${CANVAS};">
      ${p(`${x.score}<span style="font-size:20px;color:${MUTED};font-weight:700;">/100</span>`, `font-size:60px;font-weight:900;letter-spacing:-2px;color:${INK};line-height:1;`)}
    </td></tr></table>
    ${p(verdict(x.score), `font-size:24px;font-weight:800;letter-spacing:-0.5px;padding-top:22px;`)}
    ${p(`${esc(change)} · ${x.pages} pages checked on autosocials.com`, `font-size:13px;color:${MUTED};`)}
  </td></tr>
  <tr><td style="padding:24px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:2px solid ${INK};border-radius:16px;"><tr>${(["critical", "high", "medium", "low"] as Severity[]).map(sevCell).join("").replace(/border-right:1px solid [^;]+;(?![\s\S]*border-right)/, "")}</tr></table>
  </td></tr>
  <tr><td style="padding:8px 32px 4px;">${p("Top fixes", `font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;color:${MUTED};`)}</td></tr>
  <tr><td style="padding:0 32px 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${issueRows}</table></td></tr>
  ${gsc}
  <tr><td style="padding:0 32px 8px;">${p("Discovery files", `font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:800;color:${MUTED};`)}</td></tr>
  <tr><td style="padding:0 32px 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};border-radius:14px;padding:4px 18px;"><tr><td style="padding:4px 18px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">${discRows}</table></td></tr></table></td></tr>
  <tr><td align="center" style="padding:4px 32px 40px;">
    <a href="${x.dashboardUrl}" style="display:inline-block;background:${INK};color:${WHITE};text-decoration:none;font-weight:700;font-size:15px;padding:15px 30px;border-radius:12px;">Open SEO health →</a>
  </td></tr>
  <tr><td style="border-top:1px solid ${LINE};padding:18px 32px;background:${CANVAS};">
    ${p("Sent by Sam · AutoSocials. Checks follow the SEO + GEO Production Blueprint v3 against the live site.", `font-size:11px;color:${MUTED};`)}
  </td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    `AutoSocials SEO + GEO health · ${x.date}`, `Score: ${x.score}/100 (${verdict(x.score)}). ${change}.`,
    `Critical ${x.counts.critical} · High ${x.counts.high} · Medium ${x.counts.medium} · Low ${x.counts.low}`, "",
    "Top fixes:", ...top.map((i, n) => `${n + 1}. [${SEV[i.severity].label}] ${i.path}: ${i.message}. ${i.fix}`), "",
    "Discovery files:", ...x.discovery.map((d) => `${d.ok ? "OK" : "!!"} ${d.name}: ${d.note}`), "", `Open SEO health: ${x.dashboardUrl}`,
  ].join("\n");
  return { subject, html, text };
}
