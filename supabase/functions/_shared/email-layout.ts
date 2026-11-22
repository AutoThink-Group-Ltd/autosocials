// AutoSocials branded email layout — single source for every outgoing email.
// Colours mirror src/brand/tokens.ts (email clients can't read CSS variables).

export const FROM = { email: "info@autosocials.com", name: "AutoSocials" };

const C = {
  canvas: "#F5F3EE",
  surface: "#FFFFFF",
  subtle: "#EEEBE4",
  ink: "#171715",
  secondary: "#64615B",
  muted: "#6D6962",
  border: "#E4E1DA",
};
const LOGO = "https://sikwctnpyouldmcsjduq.supabase.co/storage/v1/object/public/email-assets/logo-white-2026.png";
const DISPLAY = "'Plus Jakarta Sans', 'Helvetica Neue', Arial, sans-serif";
const UI = "'Inter', 'Helvetica Neue', Arial, sans-serif";
const SERIF = "'Instrument Serif', Georgia, 'Times New Roman', serif";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface EmailInput {
  preheader: string;
  heading: string;
  /** Optional italic serif accent appended to the heading. */
  accent?: string;
  intro: string[];
  ctaLabel?: string;
  ctaUrl?: string;
  /** Extra trusted HTML body (already escaped). */
  bodyHtml?: string;
  footerNote?: string;
  signOff?: boolean;
}

export function renderEmail(i: EmailInput): { html: string; text: string } {
  const p = (t: string) =>
    `<p style="margin:0 0 16px;font-family:${UI};font-size:15px;line-height:1.6;color:${C.secondary};">${esc(t)}</p>`;
  const cta = i.ctaUrl && i.ctaLabel
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px;"><tr><td style="background:${C.ink};border-radius:10px;">
        <a href="${esc(i.ctaUrl)}" style="display:inline-block;padding:14px 28px;font-family:${UI};font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">${esc(i.ctaLabel)} &rarr;</a>
       </td></tr></table>
       <p style="margin:0 0 6px;font-family:${UI};font-size:12px;line-height:1.6;color:${C.muted};">Button not working? Paste this link into your browser:</p>
       <p style="margin:0 0 8px;font-family:${UI};font-size:12px;line-height:1.6;word-break:break-all;"><a href="${esc(i.ctaUrl)}" style="color:${C.ink};">${esc(i.ctaUrl)}</a></p>`
    : "";
  const sign = i.signOff === false ? "" :
    `<p style="margin:28px 0 0;font-family:${UI};font-size:15px;line-height:1.6;color:${C.secondary};">Speak soon,<br><span style="font-family:${SERIF};font-style:italic;font-size:20px;color:${C.ink};">Sam</span><br><span style="font-size:13px;color:${C.muted};">Your growth agent at AutoSocials</span></p>`;
  const note = i.footerNote
    ? `<tr><td style="padding:0 40px 32px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.subtle};border-radius:10px;"><tr><td style="padding:16px 20px;font-family:${UI};font-size:13px;line-height:1.6;color:${C.secondary};">${esc(i.footerNote)}</td></tr></table></td></tr>`
    : "";
  const year = 2026;

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(i.heading)}</title></head>
<body style="margin:0;padding:0;background:${C.canvas};">
<span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;mso-hide:all;">${esc(i.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};"><tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.surface};border:1px solid ${C.border};border-radius:16px;overflow:hidden;">
    <tr><td style="background:${C.ink};padding:20px 32px;"><img src="${LOGO}" alt="AutoSocials" height="88" style="display:block;height:88px;width:auto;border:0;"></td></tr>
    <tr><td style="padding:40px 40px 8px;">
      <h1 style="margin:0 0 20px;font-family:${DISPLAY};font-size:28px;line-height:1.2;font-weight:800;letter-spacing:-0.02em;color:${C.ink};">${esc(i.heading)}${i.accent ? ` <span style="font-family:${SERIF};font-style:italic;font-weight:400;">${esc(i.accent)}</span>` : ""}</h1>
      ${i.intro.map(p).join("")}
      ${i.bodyHtml ?? ""}
      ${cta}
      ${sign}
    </td></tr>
    <tr><td style="height:24px;"></td></tr>
    ${note}
  </table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;"><tr><td style="padding:24px 40px;text-align:center;font-family:${UI};font-size:12px;line-height:1.6;color:${C.muted};">
    Organic content. Paid growth. <span style="font-family:${SERIF};font-style:italic;">On repeat.</span><br>
    AutoSocials &middot; <a href="mailto:${FROM.email}" style="color:${C.muted};">${FROM.email}</a> &middot; <a href="https://autosocials.com" style="color:${C.muted};">autosocials.com</a><br>&copy; ${year} AutoSocials
  </td></tr></table>
</td></tr></table></body></html>`;

  const text = [
    `${i.heading}${i.accent ? " " + i.accent : ""}`, "",
    ...i.intro, "",
    i.ctaUrl ? `${i.ctaLabel}: ${i.ctaUrl}` : "",
    i.footerNote ? `\n${i.footerNote}` : "",
    i.signOff === false ? "" : "\nSpeak soon,\nSam — AutoSocials",
    `\nAutoSocials · ${FROM.email} · autosocials.com`,
  ].join("\n");
  return { html, text };
}

/** Send one email via SendGrid. Throws with provider status on failure. */
export async function sendViaSendGrid(opts: {
  to: string; subject: string; html: string; text: string; categories?: string[]; tracking?: boolean;
}) {
  const key = Deno.env.get("SENDGRID_API_KEY");
  if (!key) throw new Error("SENDGRID_API_KEY not set");
  const off = opts.tracking === false;
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: opts.to }] }],
      from: FROM,
      reply_to: FROM,
      subject: opts.subject,
      content: [{ type: "text/plain", value: opts.text }, { type: "text/html", value: opts.html }],
      categories: opts.categories ?? [],
      ...(off ? { tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`SendGrid ${res.status}: ${await res.text()}`);
  return res.headers.get("x-message-id");
}
