import type { getAdminClient } from "./supabase-admin.server";
import { notifyCreativeFailure } from "./creative-failure-alert.server";

type Admin = ReturnType<typeof getAdminClient>;

/** Report persisted render failures once, including failures found after a user leaves the page. */
export async function notifyFailedRenderJobs(admin: Admin, workspaceId: string): Promise<void> {
  const failed = await admin.from("render_jobs").select("id,variant_id,error,phase").eq("workspace_id", workspaceId).eq("status", "failed").order("created_at", { ascending: false }).limit(100);
  if (failed.error || !failed.data?.length) return;
  const ids = failed.data.map((job) => job.id);
  const notices = await (admin.from("creative_failure_notifications" as never) as any).select("job_id").eq("kind", "render").in("job_id", ids);
  if (notices.error) return;
  const sent = new Set<string>((notices.data ?? []).map((row: { job_id: string }) => row.job_id));
  const pending = failed.data.filter((job) => !sent.has(job.id));
  if (!pending.length) return;
  const variants = await admin.from("creative_variants").select("id,batch_id,narrative,production_plan").eq("workspace_id", workspaceId).in("id", pending.map((job) => job.variant_id));
  const byId = new Map((variants.data ?? []).map((variant) => [variant.id, variant]));
  await Promise.allSettled(pending.map(async (job) => {
    const variant = byId.get(job.variant_id);
    const plan = variant?.production_plan && typeof variant.production_plan === "object" && !Array.isArray(variant.production_plan)
      ? variant.production_plan as Record<string, unknown> : null;
    const style = plan?.["video_style"] && typeof plan["video_style"] === "object" ? plan["video_style"] as Record<string, unknown> : null;
    await notifyCreativeFailure({ kind: "render", workspaceId, ...(variant?.batch_id ? { batchId: variant.batch_id } : {}), jobId: job.id, stage: job.phase,
      error: job.error || "The video render failed without a recorded reason.", ...(variant ? { narratives: [{ title: variant.narrative || "Untitled narrative",
        ...(typeof style?.["name"] === "string" ? { style: style["name"] } : {}),
        ...(Array.isArray(style?.["engine_labels"]) ? { engine: style["engine_labels"].filter((value): value is string => typeof value === "string").join(" + ") } : {}) }] } : {}) }, admin);
  }));
}
