import { createHash } from "node:crypto";
import type { getAdminClient } from "./supabase-admin.server";
import type { ProductionAssetPlan } from "./creative-planning.server";
import { notifyCreativeFailure } from "./creative-failure-alert.server";
type Admin = ReturnType<typeof getAdminClient>;
export type PlanningCheckpoint = { plan: ProductionAssetPlan; variant_ids: string[]; automatic_recoveries?: number };
export type PlanningExecutionResult = { count: number; plan_id: string; deferred?: boolean };
export type NarrativePlanningJob = { id: string; batch_id: string; workspace_id: string; created_by: string; input: Record<string, unknown>; status: "queued" | "running" | "completed" | "failed"; progress: string; error: string | null; checkpoint: PlanningCheckpoint | null; created_at: string; started_at: string | null; completed_at: string | null };
const table = (admin: Admin) => admin.from("creative_planning_jobs" as never) as any;
export function planningJobView(job: NarrativePlanningJob) { return { job_id: job.id, status: job.status, progress: job.progress, count: Number(job.input["count"] ?? 1), started_at: job.started_at, created_at: job.created_at, plan_id: job.status === "completed" ? job.id : null, error: job.error }; }
export async function latestNarrativePlan(admin: Admin, batchId: string) {
  const result = await table(admin).select("*").eq("batch_id", batchId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (result.error) throw new Error("Could not read video preparation progress.");
  return result.data ? planningJobView(result.data as NarrativePlanningJob) : null;
}
export async function enqueueNarrativePlan(admin: Admin, request: { workspaceId: string; userId: string; batchId: string; input: Record<string, unknown>; retry: boolean }) {
  const { retry: _retry, ...input } = request.input;
  const requestHash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const result = await (admin.rpc as any)("enqueue_creative_planning", { _batch_id: request.batchId, _workspace_id: request.workspaceId, _created_by: request.userId, _request_hash: requestHash, _input: input, _retry: request.retry });
  if (result.error || !result.data) throw new Error("Could not save this video preparation request. Please try again.");
  return planningJobView(result.data as NarrativePlanningJob);
}
export async function savePlanningCheckpoint(admin: Admin, id: string, checkpoint: PlanningCheckpoint) {
  const saved = await table(admin).update({ checkpoint, progress: "Preparing and reviewing your video briefs", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "running");
  if (saved.error) throw new Error("Could not save the prepared video plan. No video generation has started.");
}
/** Each callback persists its own prompt; one interrupted sibling cannot discard completed work. */
export async function continuePlanningBriefs<T extends { build_prompt: string | null }>(briefs: T[], prepare: (brief: T) => Promise<void>) {
  const results = await Promise.allSettled(briefs.filter((brief) => !brief.build_prompt).map(prepare));
  const failed = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
  if (failed) throw failed.reason;
}
function narrativeNotice(job: NarrativePlanningJob) {
  const picked = Array.isArray(job.input["picked"]) ? job.input["picked"] as Array<Record<string, unknown>> : [];
  return picked.map((n) => {
    const style = n["video_style"] && typeof n["video_style"] === "object" ? n["video_style"] as Record<string, unknown> : null;
    return { title: String(n["title"] ?? "Untitled narrative"), ...(typeof style?.["name"] === "string" ? { style: style["name"] } : {}), ...(Array.isArray(style?.["engine_labels"]) ? { engine: style["engine_labels"].filter((label): label is string => typeof label === "string").join(", ") } : {}) };
  });
}
export async function runNarrativePlanningJobs(admin: Admin, execute: (job: NarrativePlanningJob) => Promise<PlanningExecutionResult>) {
  // Vercel terminates this worker after 300 s. A six-minute-old claim cannot still own an invocation.
  // Resume only a persisted plan; an interrupted initial inference is never silently repeated.
  const stale = await table(admin).select("*").eq("status", "running").lt("started_at", new Date(Date.now() - 6 * 60_000).toISOString());
  if (stale.error) throw new Error("Could not inspect interrupted video preparation.");
  for (const row of stale.data ?? []) {
    const job = row as NarrativePlanningJob;
    const hasCheckpoint = !!job.checkpoint?.plan && Array.isArray(job.checkpoint.variant_ids) && job.checkpoint.variant_ids.length > 0;
    const recoveries = Number(job.checkpoint?.automatic_recoveries ?? 0);
    const resumable = hasCheckpoint && recoveries < 1;
    if (!hasCheckpoint && Date.now() - Date.parse(job.started_at!) < 20 * 60_000) continue;
    const message = hasCheckpoint ? "Video brief preparation was interrupted again. Your saved plan and completed briefs are retained. Retry explicitly to continue the unfinished briefs." : "Video preparation was interrupted before it finished. Your narratives are saved. Retry to continue; saved briefs will be reused.";
    const recovered = await table(admin).update(resumable
      ? { status: "queued", progress: "Continuing your saved video briefs", checkpoint: { ...job.checkpoint, automatic_recoveries: recoveries + 1 }, started_at: null, error: null, updated_at: new Date().toISOString() }
      : { status: "failed", progress: "Preparation interrupted", error: message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", job.id).eq("status", "running").eq("started_at", job.started_at).select("id").maybeSingle();
    if (recovered.error) throw new Error("Could not recover interrupted video preparation.");
    if (recovered.data && !resumable) await notifyCreativeFailure({ kind: "planning", workspaceId: job.workspace_id, batchId: job.batch_id, jobId: job.id, error: message, narratives: narrativeNotice(job) }, admin);
  }
  const next = await table(admin).select("*").eq("status", "queued").order("created_at").limit(1);
  if (next.error) throw new Error("Could not inspect queued video preparation.");
  for (const candidate of next.data ?? []) {
    const claimed = await table(admin).update({ status: "running", progress: "Sam is preparing and checking your videos", started_at: new Date().toISOString(), updated_at: new Date().toISOString(), error: null }).eq("id", candidate.id).eq("status", "queued").select("*").maybeSingle();
    if (claimed.error) throw new Error("Could not claim video preparation.");
    if (!claimed.data) continue;
    const job = claimed.data as NarrativePlanningJob;
    const startedAt = job.started_at;
    try {
      const result = await execute(job);
      if (result.deferred) {
        const continued = await table(admin).update({ status: "queued", progress: "Preparing and reviewing your video briefs", started_at: null, updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "running").eq("started_at", startedAt).select("id").maybeSingle();
        if (continued.error) throw new Error("The saved video plan could not be continued.");
        if (continued.data) {
          const wake = await admin.rpc("advance_creative_engine_jobs");
          if (wake.error) console.warn("Video brief continuation will resume on the next scheduled check.");
        }
        continue;
      }
      const completed = await table(admin).update({ status: "completed", progress: "Your video briefs are ready", result, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "running").eq("started_at", startedAt);
      if (completed.error) throw new Error("Briefs were saved but preparation status could not be updated. Retry to restore the saved plan.");
    } catch (error) {
      const message = (error instanceof Error ? error.message : "Video preparation could not finish.").slice(0, 6000);
      const failed = await table(admin).update({ status: "failed", progress: "Video preparation needs attention", error: message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", job.id).eq("status", "running").eq("started_at", startedAt).select("id").maybeSingle();
      if (failed.error) throw new Error("Could not record the video preparation failure.");
      if (failed.data) await notifyCreativeFailure({ kind: "planning", workspaceId: job.workspace_id, batchId: job.batch_id, jobId: job.id, error: message, narratives: narrativeNotice(job) }, admin);
    }
  }
  // Processing this queue never submits paid video generation.
  return (next.data ?? []).length;
}
