import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

// Configure SendGrid Inbound Parse to authenticate with HTTP Basic credentials.
// An unauthenticated or misconfigured endpoint never accepts creator replies.
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const auth = req.headers.get("authorization") || "";
  let provided = "";
  try { const decoded = atob(auth.replace(/^Basic\s+/i, "")); if (decoded.startsWith("outreach:")) provided = decoded.slice(9); } catch { /* reject malformed credentials */ }
  const lookup = await db.from("internal_job_secrets").select("secret").eq("name", "outreach_inbound").maybeSingle();
  if (!provided || lookup.error || !lookup.data?.secret) return new Response("Unauthorized", { status: 401 });
  const digest = async (value: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  const [a,b] = await Promise.all([digest(provided),digest(lookup.data.secret)]);
  if (a.reduce((n,v,i)=>n | (v ^ b[i]),0) !== 0) return new Response("Unauthorized", { status: 401 });
  if (Number(req.headers.get("content-length") || 0) > 2_000_000) return new Response("Too large", { status: 413 });
  try {
    const form = await req.formData();
    const to = String(form.get("to") || "");
    let envelope = "";
    try { envelope = JSON.stringify(JSON.parse(String(form.get("envelope") || "{}"))); } catch { /* no envelope */ }
    const match = `${to} ${envelope}`.match(/reply\+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})@reply\.autosocials\.com/i);
    if (!match) return new Response("Unknown recipient", { status: 400 });
    const job = await db.from("outreach_jobs").select("id,workspace_id,to_email").eq("id", match[1]).in("status", ["claimed","accepted","delivered","ambiguous"]).maybeSingle();
    if (job.error) return new Response("Temporary error", { status: 503 });
    if (!job.data) return new Response("Unknown message", { status: 404 });
    const headers = String(form.get("headers") || "").slice(0,50000);
    const messageId = headers.match(/^message-id:\s*(<[^\r\n<>]{1,500}>)/im)?.[1] || null;
    if (!messageId) return new Response("Message-ID required", { status: 400 });
    const providerId = `${job.data.workspace_id}:${messageId}`;
    const from = String(form.get("from") || "").slice(0,500);
    const fromEmail = from.match(/<([^<>]+)>/)?.[1] || from;
    const inserted = await db.from("email_replies").upsert({ workspace_id: job.data.workspace_id, original_message_id: job.data.id, outreach_job_id: job.data.id, provider_event_id: providerId, inbound_message_id: messageId, from_email: fromEmail.trim().slice(0,255), from_name: from.includes("<") ? from.split("<")[0].trim().replace(/^"|"$/g, "") : null, subject: String(form.get("subject") || "").slice(0,300), body_text: String(form.get("text") || "").slice(0,50000), body_html: null }, { onConflict: "provider_event_id", ignoreDuplicates: true });
    if (inserted.error) return new Response("Temporary error", { status: 503 });
    return new Response("OK");
  } catch { return new Response("Invalid message", { status: 400 }); }
});
