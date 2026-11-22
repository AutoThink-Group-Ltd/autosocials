import type { ModelCreateRequest } from "./model-create.functions";
import { parseCreativeDirection } from "./creative-direction";

export type HomeStageState = "pending" | "complete" | "active" | "failed";
export type HomeOverviewItem = {
  id: string; batch_id: string; variant_id?: string; render_id?: string; title: string;
  source: "models" | "create"; updated_at: string; model_name?: string;
  stages: { narrative: HomeStageState; storyboard: HomeStageState; video: HomeStageState };
  status: string; error?: string; action: "retry_model" | "retry_render" | "retry_planning" | "resume" | "view" | "reconcile";
  resume_request?: ModelCreateRequest; saved_prompt?: string; can_resume_model?: boolean;
  kind: "batch" | "variant" | "planning"; trashed: boolean; can_trash: boolean; trash_reason?: string;
};
export type HomeBatch = { id: string; workspace_id: string; created_by: string; title: string | null; goal?: string | null; stage: string; active_plan_id?: string | null; narratives: unknown; created_at: string; updated_at: string };
export type HomeVariant = { id: string; batch_id: string; hook: string; narrative?: string | null; script?: string | null; beats?: unknown; production_plan?: unknown; build_prompt_issues?: unknown; created_at: string; updated_at: string };
export type HomeRender = { id: string; variant_id: string; status: string; phase: string | null; error: string | null; created_at: string; saved_plan_version?: string | null; retry_engine_version?: string | null };
export type HomeLedgerStep = { render_job_id: string; provider: string; status: string; provider_job_id: string | null; error_code: string | null };
export type HomePlanningJob = { id: string; batch_id: string; status: "queued" | "running" | "completed" | "failed"; error: string | null; picked?: unknown; home_trashed_at?: string | null; created_at: string; updated_at: string };
export type HomeOverviewView = "home" | "trash";
export const modelFailureMarker = "Create could not finish. Review this saved request and production history before retrying.";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
export const homeNarratives = (batch: HomeBatch) => Array.isArray(batch.narratives) ? batch.narratives.map(record) : [];
export const isModelsBatch = (batch: HomeBatch) => homeNarratives(batch).some((item) => !!item.model_create_request || (typeof item.why === "string" && item.why.startsWith("Manual Models request.")));
const failure = (batch: HomeBatch) => batch.title?.startsWith("Needs review: ") && homeNarratives(batch).some((item) => typeof item.why === "string" && item.why.endsWith(modelFailureMarker));
const savedError = (batch: HomeBatch) => homeNarratives(batch).find((item) => typeof item.model_create_error === "string")?.model_create_error as string | undefined;
const definiteNoJobFailures = new Set(["provider_rejected", "authentication_failed", "rate_limited", "invalid_input", "not_configured", "production_preflight_failed", "provider_stream_failed", "http_400", "http_401", "http_403", "http_404", "http_413", "http_415", "http_422", "http_429", "user_confirmed_retry_after_unknown"]);
export function uncertainHomeRender(job: HomeRender, steps: HomeLedgerStep[], ledgerAvailable = true) {
  return !ledgerAvailable || job.phase === "reconciliation_required" || steps.some((step) => step.provider !== "autosocials" &&
    (!["completed", "failed"].includes(step.status) || (step.status === "failed" && !step.provider_job_id && !definiteNoJobFailures.has(step.error_code ?? ""))));
}

/** Display state follows saved evidence. Viewing Home never advances work. */
export function homeOverviewItems(input: { batches: HomeBatch[]; variants: HomeVariant[]; renders: HomeRender[]; steps: HomeLedgerStep[]; planningJobs?: HomePlanningJob[]; ledgerAvailable?: boolean; requests?: Map<string, ModelCreateRequest>; modelNames?: Map<string, string>; modelOwners?: Set<string>; view?: HomeOverviewView | "all" }): HomeOverviewItem[] {
  const items: Array<Omit<HomeOverviewItem, "kind" | "trashed" | "can_trash" | "trash_reason">> = [];
  for (const batch of input.batches) {
    const variants = input.variants.filter((variant) => variant.batch_id === batch.id);
    const source = isModelsBatch(batch) ? "models" : "create";
    const resume_request = input.requests?.get(batch.id);
    const model_name = input.modelNames?.get(batch.id);
    const originalPrompt = homeNarratives(batch)[0]?.message;
    const saved_prompt = source === "models" && typeof originalPrompt === "string" ? originalPrompt.slice(0, 5000) : undefined;
    const can_resume_model = source === "models" && (input.modelOwners?.has(batch.id) === true || !!resume_request);
    const base = { batch_id: batch.id, source, model_name, resume_request, saved_prompt, can_resume_model } as const;
    const batchPlanningJobs = source === "create" ? input.planningJobs?.filter((job) => job.batch_id === batch.id).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id)) ?? [] : [];
    const planningJob = batchPlanningJobs[0];
    const planningIncomplete = planningJob && planningJob.status !== "completed";
    for (const visiblePlan of batchPlanningJobs.filter((job) => job.id === planningJob?.id && job.status !== "completed" || !!job.home_trashed_at)) {
      const picked = Array.isArray(visiblePlan.picked) ? visiblePlan.picked.map(record) : [];
      items.push({ ...base, id: visiblePlan.id, title: typeof picked[0]?.title === "string" ? picked[0].title : batch.title || "Your video",
        updated_at: visiblePlan.updated_at, stages: { narrative: "complete", storyboard: visiblePlan.status === "failed" ? "failed" : visiblePlan.status === "completed" ? "complete" : "active", video: "pending" },
        status: visiblePlan.status === "failed" ? "Storyboard failed" : visiblePlan.status === "queued" ? "Planning queued" : visiblePlan.status === "completed" ? "Storyboard ready" : "Preparing storyboard",
        error: visiblePlan.status === "failed" ? visiblePlan.error || "Your saved storyboard preparation needs attention." : undefined, action: visiblePlan.status === "failed" ? "retry_planning" : "resume" });
    }
    if (!variants.length) {
      if (planningIncomplete) continue;
      const narratives = homeNarratives(batch);
      const agreed = narratives.find((narrative) => narrative.selected === true && narrative.asset_creation);
      const creation = record(agreed?.asset_creation);
      const waiting = creation.status === "waiting_for_assets";
      const failed = source === "models" && failure(batch);
      const hasNarrative = narratives.some((item) => typeof item.message === "string" && !!item.message.trim());
      // The narrative bank and empty placeholders are not attempted videos.
      if (source === "create" && !agreed && (batch.goal?.startsWith("sam-thread:") || (!hasNarrative && !batch.goal?.trim()))) continue;
      items.push({ ...base, id: batch.id, title: typeof narratives[0]?.title === "string" ? narratives[0].title : batch.title || "Untitled video",
        updated_at: batch.updated_at, stages: { narrative: hasNarrative ? "complete" : "pending", storyboard: failed ? "failed" : source === "models" ? "active" : "pending", video: "pending" },
        status: waiting ? "Waiting for your assets" : failed ? "Planning failed" : source === "models" ? "Preparing storyboard" : creation.status === "ready_to_create" ? "Ready to create" : hasNarrative ? "Ready to plan" : "Choose a narrative",
        error: waiting ? `Your idea is saved. ${Array.isArray(creation.missing_inputs) ? creation.missing_inputs.filter((value): value is string => typeof value === "string").join("; ") : "Resume when you are ready."}` : failed ? savedError(batch) || "The video plan could not be completed. Your prompt is saved." : undefined,
        action: failed && resume_request ? "retry_model" : "resume" });
      continue;
    }
    for (const variant of variants) {
      const jobs = input.renders.filter((job) => job.variant_id === variant.id).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
      const plan = record(variant.production_plan);
      // Partially prepared briefs belong to the planning card until that job
      // completes. Older rendered versions remain visible as production history.
      if (!jobs.length && !plan.home_trashed_at && (planningIncomplete && plan.plan_id === planningJob.id || source === "create" && batch.active_plan_id && typeof plan.plan_id === "string" && plan.plan_id !== batch.active_plan_id)) continue;
      // An older job can still be active: never offer Retry while it owns work.
      const job = jobs.find((candidate) => ["queued", "preparing", "rendering"].includes(candidate.status)) ?? jobs[0];
      const storyboard = !!parseCreativeDirection(plan.direction) || (!!variant.script?.trim() && Array.isArray(variant.beats) && variant.beats.length > 0);
      const item: Omit<HomeOverviewItem, "kind" | "trashed" | "can_trash" | "trash_reason"> = { ...base, id: variant.id, variant_id: variant.id, render_id: job?.id,
        title: variant.hook || variant.narrative || batch.title || "Untitled video", updated_at: job?.created_at || variant.updated_at || batch.updated_at,
        stages: { narrative: "complete", storyboard: storyboard ? "complete" : "pending", video: "pending" }, status: "Ready to create", action: "resume" };
      if (job?.status === "done") { item.stages.video = "complete"; item.status = "Video ready"; item.action = "view"; }
      else if (job && ["queued", "preparing", "rendering"].includes(job.status)) { item.stages.video = "active"; item.status = job.status === "queued" ? "Queued" : "In production"; }
      else if (job?.status === "failed") {
        item.stages.video = "failed"; item.error = job.error || "The video could not be completed.";
        const uncertain = uncertainHomeRender(job, input.steps.filter((step) => step.render_job_id === job.id), input.ledgerAvailable);
        const canReuse = job.retry_engine_version === "1" && job.saved_plan_version === "1";
        item.status = uncertain ? "Production needs checking" : "Video failed";
        item.action = uncertain ? "reconcile" : canReuse ? "retry_render" : "resume";
      }
      else if (job) { item.stages.video = "active"; item.status = "Production needs checking"; item.action = "reconcile"; }
      else if (failure(batch)) { item.stages.video = "failed"; item.status = "Video could not start"; item.error = savedError(batch) || "This video's saved brief needs its production checks reviewed."; item.action = source === "models" && resume_request ? "retry_model" : "resume"; }
      items.push(item);
    }
  }
  const decorated = items.map((item): HomeOverviewItem => {
    const planning = input.planningJobs?.find((job) => job.id === item.id && !item.variant_id);
    const kind = item.variant_id ? "variant" : planning ? "planning" : "batch";
    const marker = kind === "variant" ? record(input.variants.find((variant) => variant.id === item.id)?.production_plan).home_trashed_at
      : planning ? planning.home_trashed_at : homeNarratives(input.batches.find((batch) => batch.id === item.batch_id)!).find((narrative) => typeof narrative.home_trashed_at === "string")?.home_trashed_at;
    const trashed = typeof marker === "string" && !!marker;
    const active = Object.values(item.stages).includes("active");
    const trash_reason = active ? "Wait for active preparation or production to finish before moving this video to Trash." : item.action === "reconcile" ? "Check this video's production history before moving it to Trash." : undefined;
    return { ...item, kind, trashed, can_trash: !trashed && !trash_reason, trash_reason };
  }).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  if (input.view === "all") return decorated;
  const visible = decorated.filter((item) => input.view === "trash" ? item.trashed : !item.trashed);
  return input.view === "trash" ? visible : visible.slice(0, 20);
}
