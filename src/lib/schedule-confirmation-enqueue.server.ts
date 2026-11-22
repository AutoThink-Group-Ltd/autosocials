import { getAdminClient } from "./supabase-admin.server";
import { dispatchScheduleConfirmation } from "./schedule-confirmation-dispatch.server";

/** Called only after confirmation, using request-scoped committed receipts and the verified user. */
export async function enqueueScheduleConfirmation(requestId: string, workspaceId: string, userId: string, recipient: string) {
  const admin = getAdminClient();
  const { data: request, error: requestError } = await (admin.from as any)("creation_schedule_requests").select("workspace_id,user_id,expected_count").eq("request_id", requestId).maybeSingle();
  if (requestError || !request || request.workspace_id !== workspaceId || request.user_id !== userId) throw new Error("Schedule request unavailable");
  const { data: receipts, error: receiptError } = await (admin.from as any)("creation_schedule_receipts").select("post_id,immediate_at").eq("request_id", requestId);
  if (receiptError || !receipts?.length) throw new Error("No confirmed posts found");
  const [workspaceResult, snapshotsResult] = await Promise.all([
    admin.from("workspaces").select("name,timezone").eq("id", workspaceId).single(),
    (admin.from as any)("schedule_confirmation_items").select("post_id,snapshot").eq("request_id", requestId),
  ]);
  if (workspaceResult.error || !workspaceResult.data || snapshotsResult.error || snapshotsResult.data?.length !== receipts.length) throw new Error("Immutable schedule snapshots unavailable");
  const receiptIds = new Set(receipts.map((receipt: any) => receipt.post_id));
  if (snapshotsResult.data.some((row: any) => !receiptIds.has(row.post_id))) throw new Error("Schedule snapshot mismatch");
  const items = snapshotsResult.data.map((row: any) => row.snapshot);
  items.sort((a: any, b: any) => Number(b.immediate) - Number(a.immediate) || Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  const payload = { workspace: workspaceResult.data.name, timezone: workspaceResult.data.timezone || "UTC", recipient, items, partial: !request.expected_count || receipts.length < request.expected_count };
  const { error } = await admin.rpc("finalize_schedule_confirmation" as never, { _request_id: requestId, _workspace_id: workspaceId, _user_id: userId, _payload: payload } as never);
  if (error) throw new Error("Could not queue schedule confirmation");
  await dispatchScheduleConfirmation(requestId);
}
