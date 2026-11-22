import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { renderEmail, sendViaSendGrid } from "../_shared/email-layout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const PRODUCTION_DOMAIN = "https://autosocials.com";
const log = (s: string, d?: unknown) => console.log(`[SEND-MAGIC-LINK] ${s}${d ? ` - ${JSON.stringify(d)}` : ""}`);
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type AuthType = "signup" | "magiclink" | "recovery" | "email_change";

const escHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// deno-lint-ignore no-explicit-any
async function notifyAdmins(admin: any, email: string, meta: Record<string, string>) {
  const { data: roles } = await admin.from("user_roles").select("user_id").eq("role", "super_admin");
  const recipients: string[] = [];
  for (const r of roles ?? []) {
    const { data } = await admin.auth.admin.getUserById(r.user_id);
    if (data?.user?.email) recipients.push(data.user.email);
  }
  if (!recipients.length) return;
  const isAgency = meta.account_type === "agency";
  const name = String(meta.full_name || email.split("@")[0]).slice(0, 100);
  const agencyName = String(meta.agency_name || "").slice(0, 100);
  const site = String(meta.agency_website || "").slice(0, 255);
  const when = new Date().toLocaleString("en-GB", { timeZone: "Europe/London", dateStyle: "medium", timeStyle: "short" });
  const rows: [string, string][] = [["Name", name], ["Email", email], ["Account type", isAgency ? "Agency" : "Business"], ["Signed up", `${when} (London)`]];
  if (isAgency) { rows.push(["Agency", agencyName || "—"]); rows.push(["Website", site || "—"]); }
  const bodyHtml = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 20px;border-collapse:collapse;">${rows.map(([k, v]) => {
    const val = k === "Website" && /^https?:\/\//.test(v) ? `<a href="${escHtml(v)}" style="color:#141414;">${escHtml(v)}</a>` : escHtml(v);
    return `<tr><td style="padding:8px 0;border-bottom:1px solid #E7E2D8;font-family:Arial,sans-serif;font-size:13px;color:#6B6B6B;width:120px;">${k}</td><td style="padding:8px 0;border-bottom:1px solid #E7E2D8;font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#141414;">${val}</td></tr>`;
  }).join("")}</table>`;
  const subject = isAgency ? `New agency signup: ${agencyName || name}` : `New business signup: ${name}`;
  const r = renderEmail({
    preheader: subject,
    heading: isAgency ? "New agency" : "New business",
    accent: "just joined.",
    intro: [`${name} has created an AutoSocials account. They still need to verify their email.`],
    bodyHtml,
    ctaLabel: "Open in Super Admin",
    ctaUrl: `${PRODUCTION_DOMAIN}/app/admin?tab=${isAgency ? "agencies" : "users"}`,
  });
  for (const to of recipients) await sendViaSendGrid({ to, subject, html: r.html, text: r.text, categories: ["admin", "admin_new_signup"], tracking: false });
}

function content(type: AuthType, url: string) {
  switch (type) {
    case "signup":
      return { subject: "Confirm your email to start with AutoSocials", ...renderEmail({
        preheader: "One click and Sam can start building your cycle.",
        heading: "Welcome to AutoSocials.", accent: "Let's begin.",
        intro: ["Confirm your email and I'll get your workspace ready — create, publish, find winners, launch ads, learn and repeat."],
        ctaLabel: "Confirm my email", ctaUrl: url,
        footerNote: "This link expires in 24 hours. Didn't sign up? Ignore this email and nothing will happen.",
      }) };
    case "recovery":
      return { subject: "Reset your AutoSocials password", ...renderEmail({
        preheader: "Choose a new password in under a minute.",
        heading: "Reset your password.",
        intro: ["Someone asked to reset the password on this account. If that was you, choose a new one below."],
        ctaLabel: "Choose a new password", ctaUrl: url,
        footerNote: "This link expires in 1 hour. Didn't ask for this? Ignore it — your password stays the same.",
      }) };
    case "email_change":
      return { subject: "Confirm your new email address", ...renderEmail({
        preheader: "Confirm the change to your AutoSocials sign-in email.",
        heading: "Confirm your new email.",
        intro: ["Tap below to start using this address to sign in to AutoSocials."],
        ctaLabel: "Confirm new email", ctaUrl: url,
        footerNote: "Didn't change your email? Reply to this message and we'll secure your account.",
      }) };
    default:
      return { subject: "Your AutoSocials sign-in link", ...renderEmail({
        preheader: "One tap and you're back in your workspace.",
        heading: "Sign in to AutoSocials.",
        intro: ["Here's your secure sign-in link. No password needed."],
        ctaLabel: "Sign in", ctaUrl: url,
        footerNote: "This link expires in 1 hour and works once. Didn't request it? You can ignore this email.",
      }) };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const body = await req.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const type: AuthType = ["signup", "recovery", "email_change"].includes(body.type) ? body.type : "magiclink";
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "A valid email is required" }, 400);
    if (type === "signup" && (!body.password || String(body.password).length < 6))
      return json({ error: "Password must be at least 6 characters" }, 400);

    let redirect = String(body.redirect_to || `${PRODUCTION_DOMAIN}/app`);
    if (!redirect.startsWith(PRODUCTION_DOMAIN)) redirect = redirect.replace(/^https?:\/\/[^/]+/, PRODUCTION_DOMAIN);
    if (type === "recovery") redirect = `${PRODUCTION_DOMAIN}/reset-password`;

    // generateLink never triggers the default backend mailer; for signup it also creates the user.
    // deno-lint-ignore no-explicit-any
    const params: any = type === "signup"
      ? { type: "signup", email, password: String(body.password), options: { redirectTo: redirect, data: body.metadata } }
      : type === "email_change"
      ? { type: "email_change_new", email: String(body.current_email ?? email), newEmail: email, options: { redirectTo: redirect } }
      : { type, email, options: { redirectTo: redirect, data: body.metadata } };

    const { data, error } = await admin.auth.admin.generateLink(params);
    if (error) {
      log("generateLink failed", { type, message: error.message });
      if (type === "signup" && /registered|exists/i.test(error.message))
        return json({ error: "This email is already registered. Try signing in instead." }, 409);
      // Don't reveal whether an account exists for sign-in/reset.
      return json({ success: true });
    }
    const hashed = data.properties?.hashed_token;
    if (!hashed) throw new Error("No verification token generated");
    const verifyType = type === "email_change" ? "email_change" : type;
    const url = `${PRODUCTION_DOMAIN}/auth/confirm?token_hash=${encodeURIComponent(hashed)}&type=${verifyType}&redirect_to=${encodeURIComponent(redirect)}`;

    const c = content(type, url);
    const id = await sendViaSendGrid({ to: email, subject: c.subject, html: c.html, text: c.text, categories: ["auth", `auth_${type}`], tracking: false });
    log("sent", { type, id });
    if (type === "signup" || (type === "magiclink" && data.user && Date.now() - new Date(data.user.created_at).getTime() < 60_000)) {
      try { await notifyAdmins(admin, email, (body.metadata ?? {}) as Record<string, string>); }
      catch (e) { log("admin notify failed", { message: e instanceof Error ? e.message : String(e) }); }
    }
    return json({ success: true, ...(type === "signup" ? { user_id: data.user?.id } : {}) });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log("ERROR", { message });
    return json({ error: "We couldn't send that email just now. Please try again in a minute." }, 500);
  }
});
