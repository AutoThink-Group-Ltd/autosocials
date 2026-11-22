import { randomBytes, randomUUID } from "node:crypto";
import {
  decryptWebhookSecret,
  encryptWebhookSecret,
  parseWebhookUrl,
  resolveWebhookEndpoint,
  sendWebhook,
  type WebhookEvent,
} from "./agent-webhooks-transport.server";

// Migration-owned service-role tables precede regeneration of the shared Supabase types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENT = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,3}$/;
function checkId(id: string) {
  if (!UUID.test(id)) throw new Error("Invalid identifier");
}
function eventType(type: string) {
  if (type.length > 100 || !EVENT.test(type))
    throw new Error("Invalid event type");
}
async function owner(db: Db, workspaceId: string, userId: string) {
  checkId(workspaceId);
  checkId(userId);
  const { data, error } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error || data?.role !== "owner")
    throw new Error("Workspace owner access required");
}
/** userId must come from a verified session, never client input. The secret is returned once. */
export async function createWebhookSubscription(
  db: Db,
  userId: string,
  workspaceId: string,
  endpoint: string,
  eventTypes: string[],
) {
  await owner(db, workspaceId, userId);
  if (
    !Array.isArray(eventTypes) ||
    !eventTypes.length ||
    eventTypes.length > 20 ||
    new Set(eventTypes).size !== eventTypes.length
  )
    throw new Error("Invalid event types");
  eventTypes.forEach(eventType);
  const url = parseWebhookUrl(endpoint);
  await resolveWebhookEndpoint(url);
  const id = randomUUID(),
    secret = `whsec_${randomBytes(32).toString("base64url")}`,
    ciphertext = encryptWebhookSecret(secret, `${workspaceId}:${id}`);
  const { error } = await db.from("agent_webhook_subscriptions").insert({
    id,
    workspace_id: workspaceId,
    created_by: userId,
    endpoint: url.toString(),
    secret_ciphertext: ciphertext,
    event_types: eventTypes,
  });
  if (error) throw new Error("Could not create subscription");
  return { id, secret };
}
export async function listWebhookStatus(
  db: Db,
  userId: string,
  workspaceId: string,
  subscriptionId?: string,
) {
  await owner(db, workspaceId, userId);
  if (subscriptionId) checkId(subscriptionId);
  let subs = db
    .from("agent_webhook_subscriptions")
    .select("id,endpoint,event_types,enabled,created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  let deliveries = db
    .from("agent_webhook_deliveries")
    .select(
      "id,subscription_id,event_id,event_type,status,attempts,last_http_status,created_at,next_attempt_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (subscriptionId) {
    subs = subs.eq("id", subscriptionId);
    deliveries = deliveries.eq("subscription_id", subscriptionId);
  }
  const [s, d] = await Promise.all([subs, deliveries]);
  if (s.error || d.error) throw new Error("Could not retrieve webhook status");
  return { subscriptions: s.data, deliveries: d.data };
}
export async function disableWebhookSubscription(
  db: Db,
  userId: string,
  workspaceId: string,
  subscriptionId: string,
) {
  await owner(db, workspaceId, userId);
  checkId(subscriptionId);
  const { data, error } = await db
    .from("agent_webhook_subscriptions")
    .update({ enabled: false })
    .eq("workspace_id", workspaceId)
    .eq("id", subscriptionId)
    .select("id")
    .maybeSingle();
  if (error || !data) throw new Error("Subscription not found");
  return { id: data.id, enabled: false };
}
/** Invoke only from a trusted server action after the underlying event is durable. */
export async function enqueueWebhookEvent(db: Db, event: WebhookEvent) {
  checkId(event.id);
  checkId(event.workspaceId);
  checkId(event.subjectId);
  eventType(event.type);
  if (!Number.isFinite(Date.parse(event.occurredAt)))
    throw new Error("Invalid event time");
  const { data, error } = await db
    .from("agent_webhook_subscriptions")
    .select("id")
    .eq("workspace_id", event.workspaceId)
    .eq("enabled", true)
    .contains("event_types", [event.type]);
  if (error) throw new Error("Could not find subscriptions");
  if (!data.length) return { queued: 0 };
  const rows = data.map((s: { id: string }) => ({
    subscription_id: s.id,
    workspace_id: event.workspaceId,
    event_id: event.id,
    event_type: event.type,
    occurred_at: new Date(event.occurredAt).toISOString(),
    subject_id: event.subjectId,
  }));
  const result = await db.from("agent_webhook_deliveries").upsert(rows, {
    onConflict: "subscription_id,event_id",
    ignoreDuplicates: true,
  });
  if (result.error) throw new Error("Could not enqueue event");
  return { queued: rows.length };
}
/** Run from a trusted scheduler only. Nothing invokes this automatically. */
export async function processOneWebhookDelivery(db: Db) {
  // Terminalize abandoned final attempts before claiming another row.
  const cleanup = await db
    .from("agent_webhook_deliveries")
    .update({ status: "failed", lease_id: null, lease_until: null })
    .eq("status", "delivering")
    .eq("attempts", 5)
    .lt("lease_until", new Date().toISOString());
  if (cleanup.error) throw new Error("Could not recover webhook deliveries");
  const claim = await db.rpc("agent_webhook_claim");
  if (claim.error) throw new Error("Could not claim delivery");
  const d = claim.data?.[0];
  if (!d) return { processed: false };
  let status = 0;
  try {
    const sub = await db
      .from("agent_webhook_subscriptions")
      .select("id,workspace_id,endpoint,secret_ciphertext,enabled")
      .eq("id", d.subscription_id)
      .eq("workspace_id", d.workspace_id)
      .single();
    if (sub.error || !sub.data?.enabled)
      throw new Error("Subscription unavailable");
    const event: WebhookEvent = {
      id: d.event_id,
      type: d.event_type,
      occurredAt: new Date(d.occurred_at).toISOString(),
      workspaceId: d.workspace_id,
      subjectId: d.subject_id,
    };
    const secret = decryptWebhookSecret(
      sub.data.secret_ciphertext,
      `${d.workspace_id}:${d.subscription_id}`,
    );
    status = await sendWebhook(sub.data.endpoint, secret, event);
  } catch {
    /* Store no endpoint, response body or error text. */
  }
  const delivered = status >= 200 && status < 300,
    final = delivered || d.attempts >= 5;
  const update = {
    status: delivered ? "delivered" : final ? "failed" : "pending",
    last_http_status: status || null,
    lease_id: null,
    lease_until: null,
    next_attempt_at: new Date(
      Date.now() + Math.min(3600, 30 * 2 ** (d.attempts - 1)) * 1000,
    ).toISOString(),
  };
  const saved = await db
    .from("agent_webhook_deliveries")
    .update(update)
    .eq("id", d.id)
    .eq("lease_id", d.lease_id)
    .eq("status", "delivering")
    .select("id")
    .maybeSingle();
  if (saved.error || !saved.data)
    throw new Error("Could not finalize delivery");
  return { processed: true, delivered };
}
