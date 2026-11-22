import type { getAdminClient } from "./supabase-admin.server";
import { getAdminClient as adminClient } from "./supabase-admin.server";
import { renderEmail, sendViaSendGrid } from "./email-layout.server";
type Admin = ReturnType<typeof getAdminClient>;
export type CreativeFailureNotice = { kind: "planning" | "render"; workspaceId: string; batchId?: string | null; jobId: string; error: string; stage?: string | null; narratives?: Array<{ title: string; style?: string; engine?: string }> };
/** Persist a single delivery claim before sending: uncertain delivery never causes duplicate emails. */
export async function notifyCreativeFailure(input: CreativeFailureNotice, admin: Admin = adminClient()): Promise<void> {
  const recipient = process.env["SELF_HOST_CREATIVE_ALERT_TO"]?.trim();
  if (!recipient) return;
  const notices = () => admin.from("creative_failure_notifications" as never) as any;
  const claimed = await notices().insert({ kind: input.kind, job_id: input.jobId, workspace_id: input.workspaceId, batch_id: input.batchId ?? null, status: "sending" }).select("job_id").maybeSingle();
  if (claimed.error || !claimed.data) return;
  const workspace = await admin.from("workspaces").select("name").eq("id", input.workspaceId).maybeSingle();
  const summary = input.error.replace(/https?:\/\/\S+/gi, "[URL omitted]").replace(/Bearer\s+\S+/gi, "[credential omitted]").replace(/(?:sk-|sb_secret_)[A-Za-z0-9_-]+/g, "[credential omitted]").slice(0, 3000);
  const timestamp = new Date().toISOString();
  const mail = renderEmail({ preheader: "A video creation request needs attention", heading: "Video creation needs attention", intro: [
    "Workspace: " + (workspace.data?.name ?? input.workspaceId), "Stage: " + (input.stage ?? input.kind), ...(input.narratives?.map((n) => "Narrative: " + n.title + "; style: " + (n.style ?? "not selected yet") + "; intended engine: " + (n.engine ?? "not selected yet")) ?? []), "Failure: " + summary,
    "Workspace ID: " + input.workspaceId, "Batch ID: " + (input.batchId ?? "unavailable"), "Job ID: " + input.jobId, "Recorded at: " + timestamp,
  ], signOff: false });
  try {
    const messageId = await sendViaSendGrid({ to: recipient, subject: "AutoSocials video " + input.kind + " failure: " + (workspace.data?.name ?? input.workspaceId), ...mail, tracking: false, categories: ["creative-failure"] });
    await notices().update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: messageId }).eq("kind", input.kind).eq("job_id", input.jobId);
  } catch {
    await notices().update({ status: "delivery_unconfirmed" }).eq("kind", input.kind).eq("job_id", input.jobId);
  }
}
