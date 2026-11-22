import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

// Only the database scheduler can run this worker. Claimed jobs are never retried
// automatically after an uncertain provider response.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const db = createClient(url, serviceKey);
  const supplied = req.headers.get("x-outreach-job-secret") || "";
  const secret = await db.from("internal_job_secrets").select("secret").eq("name", "outreach_worker").maybeSingle();
  if (!supplied || secret.error || !secret.data?.secret) return new Response("Unauthorized", { status: 401 });
  const digest = async (s: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
  const [a, b] = await Promise.all([digest(supplied), digest(secret.data.secret)]);
  if (a.reduce((n, v, i) => n | (v ^ b[i]), 0) !== 0) return new Response("Unauthorized", { status: 401 });
  // Deployment must explicitly enable the worker after verified reply routing and
  // provider configuration; accepting mail without a trustworthy reply path loses replies.
  if (Deno.env.get("OUTREACH_DELIVERY_ENABLED") !== "true") return Response.json({ status: "disabled" });
  const jobs = await db.rpc("claim_outreach_jobs", { _limit: 10, _workspace_id: null });
  if (jobs.error) return new Response("Queue unavailable", { status: 500 });
  for (const job of jobs.data || []) {
    const update = async (status: string, error_message: string | null, provider_message_id?: string | null) => {
      await db.from("outreach_jobs").update({ status, error_message, provider_message_id: provider_message_id || null, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "claimed");
    };
    const [blocked, config, settings] = await Promise.all([
      db.from("blocked_contacts").select("id").eq("workspace_id", job.workspace_id).ilike("email", job.to_email).maybeSingle(),
      db.from("workspace_sendgrid_config").select("api_key,sending_paused").eq("workspace_id", job.workspace_id).maybeSingle(),
      db.from("outreach_sender_settings").select("sending_paused").eq("workspace_id", job.workspace_id).maybeSingle(),
    ]);
    if (blocked.error || config.error || settings.error) { await update("failed", "Could not verify delivery eligibility"); continue; }
    if (blocked.data || config.data?.sending_paused || settings.data?.sending_paused) { await update("cancelled", "Sending paused or recipient suppressed"); continue; }
    const platform = !job.sender_identity_id && job.from_email === "info@autosocials.com";
    let apiKey = platform ? Deno.env.get("SENDGRID_API_KEY") : config.data?.api_key;
    if (!platform) {
      const domain = job.from_email.split("@")[1]?.toLowerCase();
      const [identity, verified, proof] = await Promise.all([
        db.from("sender_identities").select("id").eq("id", job.sender_identity_id).eq("workspace_id", job.workspace_id).eq("sender_email", job.from_email).eq("is_verified", true).maybeSingle(),
        db.from("workspace_domains").select("sendgrid_domain_id").eq("workspace_id", job.workspace_id).eq("domain", domain).eq("status", "verified").maybeSingle(),
        db.from("outreach_domain_proofs").select("verified_at").eq("workspace_id", job.workspace_id).eq("domain", domain).maybeSingle(),
      ]);
      if (identity.error || verified.error || proof.error || !identity.data || !verified.data?.sendgrid_domain_id || !proof.data?.verified_at) { await update("failed", "Sender verification is unavailable"); continue; }
    }
    if (!apiKey) { await update("failed", "Email provider is not configured"); continue; }
    const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const html = `<div>${escape(job.body).replaceAll("\n", "<br>")}<br><br>${escape(job.signature || "").replaceAll("\n", "<br>")}</div>`;
    const log = await db.from("email_send_log").insert({ workspace_id: job.workspace_id, sender_identity_id: job.sender_identity_id, to_email: job.to_email, to_name: job.to_name, subject: job.subject, body_html: html, message_id: job.id, status: "pending" });
    if (log.error) { await update("failed", "Could not record the send"); continue; }
    try {
      const threadHeaders = job.in_reply_to_message_id ? { "In-Reply-To": job.in_reply_to_message_id, "References": job.in_reply_to_message_id } : undefined;
      const result = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ personalizations: [{ to: [{ email: job.to_email, name: job.to_name || undefined }] }], from: { email: job.from_email, name: job.from_name }, reply_to: { email: `reply+${job.id}@reply.autosocials.com` }, subject: job.subject, headers: threadHeaders, content: [{ type: "text/html", value: html }], custom_args: { message_uuid: job.id, workspace_id: job.workspace_id, platform: "autosocials" } }), signal: AbortSignal.timeout(20000) });
      if (result.ok) { await update("accepted", null, result.headers.get("x-message-id")); await db.from("email_send_log").update({ status: "sent" }).eq("message_id", job.id).eq("workspace_id", job.workspace_id); }
      else if (result.status >= 500 || result.status === 429) await update("ambiguous", `Provider returned ${result.status}; reconcile before retrying`);
      else await update("failed", `Provider rejected the message (${result.status})`);
    } catch { await update("ambiguous", "Provider response was not received; reconcile before retrying"); }
  }
  return Response.json({ processed: (jobs.data || []).length });
});
