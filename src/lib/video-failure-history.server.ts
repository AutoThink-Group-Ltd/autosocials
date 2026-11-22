import { getAdminClient } from "./supabase-admin.server";

export type VideoFailureEvent = {
  id: string;
  workspace_id: string;
  batch_id: string | null;
  variant_id: string | null;
  job_id: string;
  step_id: string | null;
  retry_of_event_id: string | null;
  retry_of_step_id: string | null;
  stage: "planning" | "production" | "provider";
  style: string | null;
  provider: string | null;
  model: string | null;
  provider_job_id: string | null;
  provider_request_id: string | null;
  error_code: string | null;
  cause: string;
  occurred_at: string;
};

/** Access is checked before using the service client and every query is workspace scoped. */
export async function getVideoFailureHistoryForUser(userId: string, workspaceId: string): Promise<VideoFailureEvent[]> {
  const admin = getAdminClient();
  const role = await admin.rpc("has_role", { _user_id: userId, _role: "super_admin" });
  if (role.error || role.data !== true) throw new Error("Forbidden");
  const result = await (admin.from("video_failure_events" as never) as any)
    .select("id,workspace_id,batch_id,variant_id,job_id,step_id,retry_of_event_id,retry_of_step_id,stage,style,provider,model,provider_job_id,provider_request_id,error_code,cause,occurred_at")
    .eq("workspace_id", workspaceId).order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (result.error) throw new Error("Could not load video failure history. Please try again.");
  return (result.data ?? []) as VideoFailureEvent[];
}

/** Support uses its authenticated RLS client and must pass the super-admin check. */
export async function getSupportVideoFailureHistoryForUser(ctx: { supabase: any; userId: string }, workspaceId?: string): Promise<VideoFailureEvent[]> {
  const role = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (role.error || role.data !== true) throw new Error("Forbidden");
  let query = ctx.supabase.from("video_failure_events").select("id,workspace_id,batch_id,variant_id,job_id,step_id,retry_of_event_id,retry_of_step_id,stage,style,provider,model,provider_job_id,provider_request_id,error_code,cause,occurred_at");
  if (workspaceId) query = query.eq("workspace_id", workspaceId);
  const result = await query.order("occurred_at", { ascending: false }).order("id", { ascending: false }).limit(100);
  if (result.error) throw new Error("Could not load video failure history.");
  return (result.data ?? []) as VideoFailureEvent[];
}
