import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";

import { decode64, derToRaw } from "./signature.ts";

Deno.serve(async req => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const publicKey = Deno.env.get("OUTREACH_SENDGRID_WEBHOOK_PUBLIC_KEY");
  const signature = req.headers.get("x-twilio-email-event-webhook-signature");
  const timestamp = req.headers.get("x-twilio-email-event-webhook-timestamp");
  // Provider retries may arrive days later; event IDs enforce durable replay protection.
  if (!publicKey || !signature || !timestamp || !/^\d{10}$/.test(timestamp) || Number(timestamp) > Date.now() / 1000 + 300 || Number(timestamp) < Date.now() / 1000 - 7 * 86400) return new Response("Unauthorized", { status: 401 });
  const body = await req.text(); if (body.length > 1_000_000) return new Response("Too large", { status: 413 });
  try {
    const key = await crypto.subtle.importKey("spki", decode64(publicKey.replace(/-----[^-]+-----|\s/g, "")), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, derToRaw(decode64(signature)), new TextEncoder().encode(timestamp + body));
    if (!valid) return new Response("Unauthorized", { status: 401 });
  } catch { return new Response("Unauthorized", { status: 401 }); }
  let events; try { events = JSON.parse(body); } catch { return new Response("Invalid payload", { status: 400 }); }
  if (!Array.isArray(events) || events.length > 1000) return new Response("Invalid payload", { status: 400 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  for (const event of events) {
    if (typeof event.sg_event_id !== "string" || typeof event.message_uuid !== "string" || typeof event.workspace_id !== "string") continue;
    if (!["delivered", "bounce", "dropped", "spamreport", "unsubscribe", "group_unsubscribe"].includes(event.event)) continue;
    const applied = await db.rpc("apply_outreach_provider_event", { _event_id: event.sg_event_id, _job_id: event.message_uuid, _workspace_id: event.workspace_id, _event: event.event });
    if (applied.error) return new Response("Temporary error", { status: 503 });
  }
  return new Response("OK");
});
