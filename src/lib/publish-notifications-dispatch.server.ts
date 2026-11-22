import { FROM, renderEmail } from "./email-layout.server";
import { getAdminClient } from "./supabase-admin.server";

type Event = { id: string; target_id: string; workspace_id: string; post_id: string; created_at: string };
type DeliveryKey = { event_id: string; user_id: string };
type Claimed = DeliveryKey & { attempts: number };
type Recipient = { user_id: string; selected: boolean; opted_in: boolean };
type Attachment = { content: string; filename: string; type: string; disposition: string; content_id: string };
type PublishDetails = { email: string; workspace: string; platform: string; caption: string; permalink?: string | null; preview?: Attachment | null };
const safePostUrl = (value?: string | null) => {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : null; } catch { return null; }
};
type Outcome = { status: "pending" | "sent" | "failed" | "uncertain" | "suppressed"; error: string | null; next_attempt_at?: string; provider_message_id?: string | null };
class BeforeSubmissionError extends Error {}

// This interface keeps the authorization and retry decisions independently testable.
export type PublishStore = {
  eligible: (workspaceId: string, eventCreatedAt: string) => Promise<string[]>;
  addDeliveries: (eventId: string, users: string[]) => Promise<void>;
  finishEvent: (eventId: string) => Promise<void>;
  claim: (key: DeliveryKey) => Promise<Claimed | null>;
  event: (id: string) => Promise<Event>;
  stillEligible: (workspaceId: string, userId: string, eventCreatedAt: string) => Promise<boolean>;
  details: (event: Event, userId: string) => Promise<PublishDetails>;
  finishDelivery: (key: DeliveryKey, outcome: Outcome) => Promise<void>;
};

/** Membership and both explicit choices are required; missing settings never opt anyone in. */
export function resolveEligible(enabled: boolean, recipients: Recipient[], memberIds: string[]): string[] {
  if (!enabled) return [];
  const members = new Set(memberIds);
  return [...new Set(recipients.filter((r) => r.selected && r.opted_in && members.has(r.user_id)).map((r) => r.user_id))];
}

export async function assemblePublishEvent(event: Event, store: PublishStore): Promise<void> {
  const users = await store.eligible(event.workspace_id, event.created_at);
  // The unique (event,user) key and ignoreDuplicates make overlapping workers safe.
  if (users.length) await store.addDeliveries(event.id, users);
  await store.finishEvent(event.id);
}

const retry = (attempts: number, error: string): Outcome => attempts < 3
  ? { status: "pending", error, next_attempt_at: new Date(Date.now() + (attempts <= 1 ? 5 : 15) * 60_000).toISOString() }
  : { status: "failed", error };

export async function dispatchPublishDelivery(key: DeliveryKey, store: PublishStore, send: (email: string, message: { subject: string; html: string; text: string; attachments?: Attachment[] }) => Promise<{ status: number; messageId: string | null }>): Promise<void> {
  const claim = await store.claim(key);
  if (!claim) return;
  let submitting = false;
  let outcome: Outcome;
  try {
    const event = await store.event(key.event_id);
    if (!await store.stillEligible(event.workspace_id, key.user_id, event.created_at)) {
      outcome = { status: "suppressed", error: null };
    } else {
      const details = await store.details(event, key.user_id);
      const postUrl = safePostUrl(details.permalink);
      const { html, text } = renderEmail({
        preheader: `A post was published for ${details.workspace}.`,
        heading: "Your post is live",
        intro: [`Your scheduled post for ${details.workspace} was published to ${details.platform}.`, ...(details.caption ? [`Caption: ${details.caption}`] : [])],
        bodyHtml: details.preview ? `<img src="cid:published-post-preview" alt="Published post image preview" style="display:block;max-width:100%;height:auto;border-radius:10px;margin:0 0 20px;">` : "",
        ctaLabel: postUrl ? `View on ${details.platform}` : "Open Schedule",
        ctaUrl: postUrl ?? "https://autosocials.com/app/schedule",
        footerNote: "To change publishing email preferences, open Settings, choose the correct workspace, then select Notifications.",
      });
      submitting = true;
      const response = await send(details.email, { subject: `Post published — ${details.workspace}`.replace(/[\r\n]/g, " "), html, text, ...(details.preview ? { attachments: [details.preview] } : {}) });
      outcome = response.status === 429 ? retry(claim.attempts, "Email provider rate limited the request")
        : response.status >= 200 && response.status < 300 ? { status: "sent", error: null, provider_message_id: response.messageId }
        : response.status >= 500 ? { status: "uncertain", error: "Email provider response was uncertain" }
        : { status: "failed", error: `Email provider returned ${response.status}` };
    }
  } catch (error) {
    // Once submitted, a timeout can mean the provider accepted the message. Never retry it automatically.
    outcome = submitting && !(error instanceof BeforeSubmissionError) ? { status: "uncertain", error: "Email submission outcome uncertain" } : retry(claim.attempts, "Could not prepare or authorize notification");
  }
  await store.finishDelivery(key, outcome);
}

export function makePublishStore(): PublishStore {
  const admin = getAdminClient();
  // Newly migrated tables are service-only and are not yet in generated client types.
  const table = (name: string): any => (admin.from as any)(name);
  const checked = <T,>(r: { data: T; error: unknown }): T => { if (r.error) throw new Error("Notification data unavailable"); return r.data; };
  const hasPrivilegedAccess = async (workspaceId: string, userId: string) => {
    const [directMember, member, agency] = await Promise.all([
      table("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).maybeSingle(),
      admin.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspaceId }),
      admin.rpc("is_workspace_agency", { _user_id: userId, _workspace_id: workspaceId }),
    ]);
    // A direct member added after the event must not bypass the event-time membership check.
    if (checked(directMember)) return false;
    return !!(checked(member) || checked(agency));
  };
  return {
    eligible: async (workspaceId, eventCreatedAt) => {
      const [setting, recipients, members] = await Promise.all([
        table("publish_notification_settings").select("enabled").eq("workspace_id", workspaceId).lte("updated_at", eventCreatedAt).maybeSingle(),
        table("publish_notification_recipients").select("user_id,selected,opted_in").eq("workspace_id", workspaceId).eq("selected", true).eq("opted_in", true).lte("updated_at", eventCreatedAt),
        table("workspace_members").select("user_id").eq("workspace_id", workspaceId).lte("created_at", eventCreatedAt),
      ]);
      const s = checked(setting) as { enabled: boolean } | null;
      const rs = checked(recipients) as Recipient[];
      const ms = checked(members) as { user_id: string }[];
      const ids = (ms ?? []).map((m) => m.user_id);
      if (s?.enabled) {
        const candidates = (rs ?? []).filter(recipient => !ids.includes(recipient.user_id));
        const access = await Promise.all(candidates.map(recipient => hasPrivilegedAccess(workspaceId, recipient.user_id)));
        candidates.forEach((recipient, index) => { if (access[index]) ids.push(recipient.user_id); });
      }
      return resolveEligible(s?.enabled === true, rs ?? [], ids);
    },
    addDeliveries: async (eventId, users) => {
      checked(await table("publish_notification_deliveries").upsert(users.map((userId) => ({ event_id: eventId, user_id: userId })), { onConflict: "event_id,user_id", ignoreDuplicates: true }));
    },
    finishEvent: async (eventId) => { checked(await table("publish_notification_events").update({ status: "assembled" }).eq("id", eventId).eq("status", "pending")); },
    claim: async (key) => {
      const r = await (admin.rpc as any)("claim_publish_notification_delivery", { _event_id: key.event_id, _user_id: key.user_id });
      const rows = checked(r) as Claimed[] | null;
      return rows?.[0] ?? null;
    },
    event: async (id) => {
      const event = checked(await table("publish_notification_events").select("id,target_id,workspace_id,post_id,created_at").eq("id", id).maybeSingle()) as Event | null;
      if (!event) throw new Error("Event unavailable");
      return event;
    },
    stillEligible: async (workspaceId, userId, eventCreatedAt) => {
      const [setting, person, member] = await Promise.all([
        table("publish_notification_settings").select("enabled").eq("workspace_id", workspaceId).lte("updated_at", eventCreatedAt).maybeSingle(),
        table("publish_notification_recipients").select("selected,opted_in").eq("workspace_id", workspaceId).eq("user_id", userId).lte("updated_at", eventCreatedAt).maybeSingle(),
        table("workspace_members").select("user_id").eq("workspace_id", workspaceId).eq("user_id", userId).lte("created_at", eventCreatedAt).maybeSingle(),
      ]);
      const s = checked(setting) as { enabled: boolean } | null;
      const p = checked(person) as { selected: boolean; opted_in: boolean } | null;
      const m = checked(member);
      if (!s?.enabled || !p?.selected || !p.opted_in) return false;
      return !!m || await hasPrivilegedAccess(workspaceId, userId);
    },
    details: async (event, userId) => {
      const [post, target, workspace, user, media] = await Promise.all([
        table("posts").select("caption").eq("id", event.post_id).eq("workspace_id", event.workspace_id).maybeSingle(),
        table("post_targets").select("platform,status,caption_override,permalink").eq("id", event.target_id).eq("post_id", event.post_id).maybeSingle(),
        table("workspaces").select("name").eq("id", event.workspace_id).maybeSingle(),
        admin.auth.admin.getUserById(userId),
        table("post_media").select("kind,storage_path,mime").eq("post_id", event.post_id).order("position").limit(1),
      ]);
      const p = checked(post) as { caption: string | null } | null;
      const t = checked(target) as { platform: string; status: string; caption_override: string | null; permalink: string | null } | null;
      const w = checked(workspace) as { name: string | null } | null;
      if (user.error || !user.data.user?.email || !p || !t || t.status !== "published" || !w) throw new Error("Notification details unavailable");
      // Embed a bounded image; keep the private bucket private and never block delivery on preview failure.
      let preview: Attachment | null = null;
      const item = !media.error && Array.isArray(media.data) ? media.data[0] : null;
      if (item?.kind === "image" && typeof item.storage_path === "string" && item.storage_path.startsWith(`${event.workspace_id}/`) && ["image/jpeg", "image/png", "image/gif"].includes(item.mime)) {
        try {
          const result = await admin.storage.from("post-media").download(item.storage_path);
          if (!result.error && result.data && result.data.size <= 3_000_000) preview = { content: Buffer.from(await result.data.arrayBuffer()).toString("base64"), filename: "post-preview", type: item.mime, disposition: "inline", content_id: "published-post-preview" };
        } catch { /* Send without a preview. */ }
      }
      return { email: user.data.user.email, workspace: w.name || "your workspace", platform: t.platform, caption: t.caption_override ?? p.caption ?? "", permalink: t.permalink, preview };
    },
    finishDelivery: async (key, outcome) => { checked(await table("publish_notification_deliveries").update({ ...outcome, updated_at: new Date().toISOString() }).eq("event_id", key.event_id).eq("user_id", key.user_id).eq("status", "sending")); },
  };
}

async function sendViaProvider(email: string, message: { subject: string; html: string; text: string; attachments?: Attachment[] }) {
  const key = process.env["SENDGRID_API_KEY"];
  if (!key) throw new BeforeSubmissionError("Email service unavailable");
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ personalizations: [{ to: [{ email }] }], from: FROM, reply_to: FROM, subject: message.subject, content: [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }], ...(message.attachments?.length ? { attachments: message.attachments } : {}), categories: ["publish-notification"], tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } } }),
  });
  return { status: response.status, messageId: response.headers.get("x-message-id") };
}

/** Drain safely on each scheduled invocation; ambiguous submissions require operator review. */
export async function drainPublishNotifications() {
  const admin = getAdminClient();
  const table = (name: string): any => (admin.from as any)(name);
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  const recovered = await table("publish_notification_deliveries").update({ status: "uncertain", error: "Email submission outcome uncertain", updated_at: new Date().toISOString() }).eq("status", "sending").lt("updated_at", stale);
  if (recovered.error) throw new Error("Could not recover notification jobs");
  const events = await table("publish_notification_events").select("id,target_id,workspace_id,post_id,created_at").eq("status", "pending").order("created_at").limit(50);
  if (events.error) throw new Error("Could not load notification events");
  const store = makePublishStore();
  for (const event of events.data ?? []) await assemblePublishEvent(event, store);
  const deliveries = await table("publish_notification_deliveries").select("event_id,user_id").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(50);
  if (deliveries.error) throw new Error("Could not load notifications");
  for (const key of deliveries.data ?? []) await dispatchPublishDelivery(key, store, sendViaProvider);
}
