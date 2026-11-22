import { FROM } from "./email-layout.server";
import { renderScheduleConfirmation, type ScheduleEmailItem } from "./schedule-confirmation-email.server";
import { getAdminClient } from "./supabase-admin.server";
import jpeg from "jpeg-js";

type Payload = { workspace: string; timezone: string; recipient: string; partial?: boolean; items: Array<ScheduleEmailItem & { mediaPath?: string }> };

export function emailThumbnail(bytes: Buffer): Buffer {
  const image = jpeg.decode(bytes, { useTArray: true, maxResolutionInMP: 16, maxMemoryUsageInMB: 96 });
  const scale = Math.min(1, 192 / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale)), height = Math.max(1, Math.round(image.height * scale));
  const pixels = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const source = (Math.min(image.height - 1, Math.floor(y / scale)) * image.width + Math.min(image.width - 1, Math.floor(x / scale))) * 4;
    const target = (y * width + x) * 4;
    for (let channel = 0; channel < 4; channel++) pixels[target + channel] = image.data[source + channel]!;
  }
  return Buffer.from(jpeg.encode({ width, height, data: pixels }, 78).data);
}

/** At most one attempt per request. Ambiguous network outcomes are marked uncertain for human review. */
export async function dispatchScheduleConfirmation(requestId: string) {
  const admin = getAdminClient();
  const { data, error } = await admin.rpc("claim_schedule_confirmation" as never, { _request_id: requestId } as never);
  if (error) throw new Error("Could not claim schedule confirmation");
  const row = (data as unknown as Array<{ request_id: string; workspace_id: string; user_id: string; attempts: number; payload: Payload }> | null)?.[0];
  if (!row) return;
  const retry = (reason: string) => ({ status: row.attempts < 3 ? "pending" : "failed", updated_at: new Date().toISOString(), next_attempt_at: new Date(Date.now() + (row.attempts <= 1 ? 5 : 15) * 60_000).toISOString(), error: reason });
  const alert = async (status: string) => {
    if (status !== "failed" && status !== "uncertain") return;
    const { recordCreationScheduleFailure } = await import("./creation-schedule-failure.server");
    await recordCreationScheduleFailure({ workspaceId: row.workspace_id, requestId, actorId: row.user_id, stage: "delivery", error: new Error(`Confirmation email ${status}`) });
  };
  let submitting = false;
  try {
    const attachments: Array<Record<string, string>> = [];
    let total = 0;
    const items = await Promise.all(row.payload.items.map(async (item, index) => {
      if (item.mediaKind === "video" || item.mediaKind === "document") return item;
      if (!item.mediaPath?.startsWith(`${row.workspace_id}/`)) throw new Error("Confirmed image preview is unavailable");
      const result = await admin.storage.from("post-media").download(item.mediaPath);
      if (result.error || !result.data || result.data.size > 3_000_000) throw new Error("Confirmed image preview could not be loaded");
      let bytes: Buffer;
      try { bytes = emailThumbnail(Buffer.from(await result.data.arrayBuffer())); } catch { throw new Error("Confirmed image preview could not be decoded"); }
      total += bytes.length;
      if (total > 5_000_000) throw new Error("Confirmation images exceed the email size limit");
      const cid = `schedule-${index}`;
      attachments.push({ content: bytes.toString("base64"), filename: `${cid}.jpg`, type: "image/jpeg", disposition: "inline", content_id: cid });
      return { ...item, imageContentId: cid };
    }));
    const message = renderScheduleConfirmation(row.payload.workspace, row.payload.timezone, items, row.payload.partial);
    const key = process.env["SENDGRID_API_KEY"];
    if (!key) throw new Error("Confirmation email service unavailable");
    submitting = true;
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ personalizations: [{ to: [{ email: row.payload.recipient }] }], from: FROM, reply_to: FROM, subject: message.subject, content: [{ type: "text/plain", value: message.text }, { type: "text/html", value: message.html }], attachments, categories: ["schedule-confirmation"], tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } } }) });
    const outcome = response.status === 429 ? retry("Email provider temporarily rate limited the request") : { status: response.ok ? "sent" : response.status >= 500 ? "uncertain" : "failed", updated_at: new Date().toISOString(), provider_message_id: response.ok ? response.headers.get("x-message-id") : null, error: response.ok ? null : `Email provider returned ${response.status}` };
    await (admin.from as any)("schedule_confirmation_outbox").update(outcome).eq("request_id", requestId).eq("status", "sending");
    await alert(outcome.status);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.slice(0, 200) : "Could not prepare confirmation email";
    const outcome = submitting ? { status: "uncertain", updated_at: new Date().toISOString(), error: "Email submission outcome uncertain" } : retry(reason);
    await (admin.from as any)("schedule_confirmation_outbox").update(outcome).eq("request_id", requestId).eq("status", "sending");
    try { await alert(outcome.status); } catch { console.error("Could not record confirmation email failure"); }
  }
}

/** Called by a trusted scheduled worker. Stale sending rows are not retried: the provider may have accepted them. */
export async function drainScheduleConfirmations() {
  const admin = getAdminClient();
  const stale = new Date(Date.now() - 10 * 60_000).toISOString();
  await (admin.from as any)("schedule_confirmation_outbox").update({ status: "uncertain", updated_at: new Date().toISOString(), error: "Email delivery outcome uncertain; check provider activity" }).eq("status", "sending").lt("updated_at", stale);
  const ready = await (admin.from as any)("schedule_confirmation_outbox").select("request_id,workspace_id,user_id").eq("status", "ready_to_assemble").order("created_at").limit(20);
  if (ready.error) throw new Error("Could not load completed schedules");
  const { enqueueScheduleConfirmation } = await import("./schedule-confirmation-enqueue.server");
  for (const row of ready.data ?? []) {
    const user = await admin.auth.admin.getUserById(row.user_id);
    if (user.error) continue;
    if (!user.data.user?.email) {
      await (admin.from as any)("schedule_confirmation_outbox").update({ status: "failed", updated_at: new Date().toISOString(), error: "Confirmation recipient has no email address" }).eq("request_id", row.request_id).eq("status", "ready_to_assemble");
      try { const { recordCreationScheduleFailure } = await import("./creation-schedule-failure.server"); await recordCreationScheduleFailure({ workspaceId: row.workspace_id, requestId: row.request_id, actorId: row.user_id, stage: "delivery", error: new Error("Confirmation account has no email address") }); } catch { console.error("Could not record confirmation email failure"); }
      continue;
    }
    try { await enqueueScheduleConfirmation(row.request_id, row.workspace_id, row.user_id, user.data.user.email); } catch { /* Keep ready for a later recovery attempt. */ }
  }
  const { data, error } = await (admin.from as any)("schedule_confirmation_outbox").select("request_id").eq("status", "pending").lte("next_attempt_at", new Date().toISOString()).order("created_at").limit(20);
  if (error) throw new Error("Could not load pending schedule confirmations");
  await Promise.all((data ?? []).map((row: { request_id: string }) => dispatchScheduleConfirmation(row.request_id)));
}
