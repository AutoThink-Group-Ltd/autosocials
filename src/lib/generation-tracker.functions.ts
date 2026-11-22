import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { GenerationStep } from "./generation-tracker";
import type { CreativeCapability } from "./creative-providers/registry";

type Context = { supabase: any; userId: string };
export async function assertGenerationAdmin(ctx: Context) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (error || data !== true) throw new Error("Forbidden");
}
const filters = z.object({
  page: z.number().int().min(0).max(100000).default(0),
  status: z.enum(["reserved", "submitted", "running", "completed", "failed", "reconciliation_required"]).optional(),
  provider: z.string().regex(/^[\w.-]{1,80}$/).optional(),
  model: z.string().trim().min(1).max(200).optional(), operation: z.string().trim().min(1).max(100).optional(),
  workspaceId: z.string().uuid().optional(), renderJobId: z.string().uuid().optional(),
});
export type GenerationFilters = z.input<typeof filters>;
export type GenerationCostTotal = { currency: string; kind: string; amount: number };
export type GenerationBreakdown = { provider: string; model: string; operation: string; total: number; completed: number; failed: number; retries: number; unknown_cost: number; success_rate: number; failure_rate: number; retry_rate: number; avg_elapsed_seconds: number | null; costs: GenerationCostTotal[] };
export type GenerationLatencySummary = { samples: number; medianSeconds: number | null; p95Seconds: number | null };
export type GenerationProductionStats = {
  scope: "matching_render_chains";
  production: GenerationLatencySummary;
  queue: GenerationLatencySummary;
  providerAndIngest: GenerationLatencySummary;
  assemblyAndChecks: GenerationLatencySummary;
  serverRequestToPlayable: GenerationLatencySummary;
  batchCompletion: GenerationLatencySummary;
  storage: GenerationLatencySummary;
  failed: number; cancelled: number; active: number; reconciliation: number; staleActive: number; excludedLegacy: number;
  serverRequestToPlayableMeasured: true;
  clickToPlayableMeasured: false; storageOnlyMeasured: true; batchCompletionMeasured: true;
};
export type GenerationStats = { total: number; completed: number; failed: number; reconciliation_required: number; unknown_cost: number; successful_videos: number; retry_count: number; success_rate: number; failure_rate: number; retry_rate: number; avg_elapsed_seconds: number | null; costs: GenerationCostTotal[]; breakdown: GenerationBreakdown[]; productionStats?: GenerationProductionStats };
export const listGenerationSteps = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => filters.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as Context;
    await assertGenerationAdmin(ctx);
    const { getAdminClient } = await import("./supabase-admin.server");
    const admin = getAdminClient();
    // Use the caller's RLS client even after checking role. No service-role read bypass.
    let query = ctx.supabase.from("generation_steps").select("*", { count: "exact" });
    if (data.status) query = query.eq("status", data.status);
    if (data.provider) query = query.eq("provider", data.provider);
    if (data.model) query = query.eq("model", data.model);
    if (data.operation) query = query.eq("operation", data.operation);
    if (data.workspaceId) query = query.eq("workspace_id", data.workspaceId);
    if (data.renderJobId) query = query.eq("render_job_id", data.renderJobId);
    const [page, stats] = await Promise.all([
      query.order("created_at", { ascending: false }).order("id", { ascending: false }).range(data.page * 30, data.page * 30 + 29),
      // Aggregate after strict role verification: render_jobs itself may have narrower workspace RLS.
      admin.rpc("generation_tracker_stats" as any, { p_status: data.status ?? null, p_provider: data.provider ?? null, p_workspace_id: data.workspaceId ?? null, p_render_job_id: data.renderJobId ?? null, p_model: data.model ?? null, p_operation: data.operation ?? null } as any),
    ]);
    if (page.error || stats.error) throw new Error("Generation tracker is unavailable.");
    const rows = (page.data ?? []) as GenerationStep[];
    const briefs: Record<string, string> = {};
    const workspaces: Record<string, string> = {};
    if (rows.length) {
      // Return bounded brief copy only, never entire provider/state/payload JSON.
      const [renderResult, workspaceResult] = await Promise.all([
        admin.from("render_jobs").select("id,brief_snapshot").in("id", [...new Set(rows.map(row => row.render_job_id))]),
        admin.from("workspaces").select("id,name").in("id", [...new Set(rows.map(row => row.workspace_id))]),
      ]);
      if (renderResult.error || workspaceResult.error) throw new Error("Generation context is unavailable.");
      for (const workspace of workspaceResult.data ?? []) workspaces[workspace.id] = workspace.name;
      for (const render of renderResult.data ?? []) {
        const snapshot = render.brief_snapshot;
        const hook = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && typeof snapshot["hook"] === "string" ? snapshot["hook"] : "Legacy brief unavailable";
        briefs[render.id] = hook.slice(0, 1200).replace(/https?:\/\/\S+/gi, "[link omitted]").replace(/\b(?:sk[-_][\w-]+|eyJ[\w.-]{20,})\b/g, "[redacted]");
      }
    }
    const summary = stats.data as unknown as GenerationStats;
    // Historic updated_at can be an approval edit, not the completion time. Never present it as generation speed.
    const containsLegacy = summary.breakdown.some((group) => group.provider === "legacy_unknown");
    const verifiedTiming = { ...summary, avg_elapsed_seconds: containsLegacy ? null : summary.avg_elapsed_seconds,
      breakdown: summary.breakdown.map((group) => group.provider === "legacy_unknown" ? { ...group, avg_elapsed_seconds: null } : group) };
    return { rows, briefs, workspaces, total: page.count ?? 0, stats: verifiedTiming };
  });

export const generationPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ renderJobId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertGenerationAdmin(context as Context);
    const { getAdminClient } = await import("./supabase-admin.server");
    const admin = getAdminClient();
    const { renderLinks } = await import("./asset-versions.server");
    const result = await admin.from("render_jobs").select("*").eq("id", data.renderJobId).single();
    if (result.error || !result.data) throw new Error("Render unavailable.");
    return renderLinks(admin, result.data, "Generation preview");
  });

export type GenerationCapability = CreativeCapability & { available: boolean; availabilityReason: string };
/** Configuration presence and documented controls only; no network calls or generation. */
export const generationCapabilities = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<GenerationCapability[]> => {
    await assertGenerationAdmin(context as Context);
    const [{ listCreativeCapabilities }, { getCreativeProviderAvailability }] = await Promise.all([
      import("./creative-providers/registry"), import("./creative-providers/adapters.server"),
    ]);
    const availability = getCreativeProviderAvailability();
    return listCreativeCapabilities().map(capability => {
      const state = availability.find(item => item.capabilityId === capability.id);
      return { ...capability, available: state?.available ?? false, availabilityReason: state?.reason ?? "not_integrated" };
    });
  });

/** Explicitly confirmed cancellation only; never submits or restarts generation. */
export const cancelGenerationStep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stepId: z.string().uuid(), confirmed: z.literal(true) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await assertGenerationAdmin(context as Context);
    // Keep the confirmation check at the mutation boundary, not only in the UI.
    if (data.confirmed !== true) throw new Error("Explicit cancellation confirmation is required.");
    const { getAdminClient } = await import("./supabase-admin.server");
    const admin = getAdminClient();
    const leafResult = await admin.from("generation_steps" as any).select("*").eq("id", data.stepId).single();
    const leaf = leafResult.data as unknown as GenerationStep | null;
    if (leafResult.error || !leaf) throw new Error("Generation step unavailable.");
    if (leaf.provider !== "higgsfield") throw new Error("This provider has no supported cancellation operation. Reconcile it in the provider dashboard.");
    if (!leaf.provider_job_id) throw new Error("No confirmed provider job ID is recorded. Reconcile this request in the provider dashboard; do not retry generation.");
    if (!["submitted", "running"].includes(leaf.status)) throw new Error("Only an active provider job can be canceled here.");
    const renderResult = await admin.from("render_jobs").select("*").eq("id", leaf.render_job_id).eq("workspace_id", leaf.workspace_id).eq("variant_id", leaf.variant_id).single();
    const render = renderResult.data;
    if (renderResult.error || !render) throw new Error("Render scope unavailable.");
    const [{ readProductionPlan }, { getCreativeCapability }, { cancelCreativeProviderJob, CreativeProviderError }] = await Promise.all([
      import("./production-plan"), import("./creative-providers/registry"), import("./creative-providers/adapters.server"),
    ]);
    const snapshot = render.brief_snapshot;
    const frozenPlan = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot["production_plan"] : null;
    const planStep = readProductionPlan(frozenPlan).steps.find(step => leaf.step_key === `provider:${step.id}`);
    if (!planStep) throw new Error("The frozen production plan does not identify this provider step. Reconcile it manually.");
    const capability = getCreativeCapability(planStep.capability_id);
    if (capability.provider !== leaf.provider || !capability.operations.cancel || capability.status !== "supported" || leaf.model !== (capability.endpoint ?? capability.id)) throw new Error("Provider cancellation does not match the recorded production step.");
    const claimedAt = new Date().toISOString();
    const claim = await admin.from("render_jobs").update({ phase: "provider_canceling", phase_claimed_at: claimedAt })
      .eq("id", render.id).eq("workspace_id", leaf.workspace_id).eq("status", "rendering").eq("phase", "provider_assets").is("phase_claimed_at", null).select("id").maybeSingle();
    if (claim.error || !claim.data) throw new Error("This render is currently advancing or is no longer cancelable. Refresh before trying again.");
    const restore = () => admin.from("render_jobs").update({ phase: "provider_assets", phase_claimed_at: null })
      .eq("id", render.id).eq("status", "rendering").eq("phase", "provider_canceling").eq("phase_claimed_at", claimedAt);
    let confirmedCancellation = false;
    try {
      const response = await cancelCreativeProviderJob({ capabilityId: capability.id, requestId: leaf.provider_job_id });
      if (response.status !== "canceled" || response.requestId !== leaf.provider_job_id) throw new Error("Cancellation not confirmed.");
      confirmedCancellation = true;
    } catch (error) {
      const definiteRejection = error instanceof CreativeProviderError && ["provider_rejected", "rate_limited", "invalid_input", "not_configured", "unsupported_operation"].includes(error.code);
      if (definiteRejection) {
        const restored = await restore();
        if (restored.error) throw new Error("Cancellation was rejected and the render claim needs manual reconciliation.");
        return { outcome: "rejected" as const, message: "Provider cancellation was rejected. The original job remains active; no replacement was submitted." };
      }
      // A timeout can mean the provider accepted cancellation. Preserve uncertainty and stop progression.
      await admin.from("generation_steps" as any).update({ status: "reconciliation_required", error_code: "cancellation_unconfirmed", updated_at: new Date().toISOString() } as any).eq("id", leaf.id);
      await admin.from("render_jobs").update({ status: "failed", phase: "cancellation_reconciliation", error: "Provider cancellation outcome is unknown. Reconcile the existing job before retrying.", phase_claimed_at: null })
        .eq("id", render.id).eq("phase", "provider_canceling").eq("phase_claimed_at", claimedAt);
      return { outcome: "reconciliation_required" as const, message: "Cancellation could not be confirmed. Check the existing request in the provider dashboard before any retry." };
    }
    if (!confirmedCancellation) throw new Error("Cancellation requires reconciliation.");
    const finishedAt = new Date().toISOString();
    const [leafSaved, renderSaved, rootSaved] = await Promise.all([
      admin.from("generation_steps" as any).update({ status: "failed", error_code: "provider_canceled", completed_at: finishedAt, updated_at: finishedAt } as any).eq("id", leaf.id),
      admin.from("render_jobs").update({ status: "failed", phase: "canceled", error: "Provider cancellation confirmed by an administrator.", phase_claimed_at: null })
        .eq("id", render.id).eq("phase", "provider_canceling").eq("phase_claimed_at", claimedAt),
      admin.from("generation_steps" as any).update({ status: "failed", error_code: "provider_canceled", completed_at: finishedAt, updated_at: finishedAt } as any).eq("render_job_id", render.id).eq("step_key", "production"),
    ]);
    if (leafSaved.error || renderSaved.error || rootSaved.error) throw new Error("Provider cancellation was confirmed, but local recording is incomplete. Reconcile this attempt before retrying.");
    return { outcome: "canceled" as const, message: "Provider cancellation confirmed. This production attempt is stopped; no replacement was submitted." };
  });

/** Short-lived preview for a contributed provider asset in this exact render's private folder. */
export const generationStepPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ stepId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertGenerationAdmin(context as Context);
    const { getAdminClient } = await import("./supabase-admin.server");
    const { safeStoragePath } = await import("./generation-tracker");
    const admin = getAdminClient();
    const result = await admin.from("generation_steps" as any).select("*").eq("id", data.stepId).single();
    const step = result.data as unknown as GenerationStep | null;
    const path = safeStoragePath(step?.output_storage_path);
    const prefix = step ? `${step.workspace_id}/renders/${step.render_job_id}/` : "";
    if (result.error || !step || step.status !== "completed" || !path || !path.startsWith(prefix) || !/^[a-z0-9_-]+\.[a-z0-9]+$/i.test(path.slice(prefix.length))) throw new Error("Contributed asset preview is unavailable.");
    const kind = /\.(mp4|webm)$/i.test(path) ? "video" : /\.(png|jpe?g|webp|gif)$/i.test(path) ? "image" : null;
    if (!kind) throw new Error("This media type cannot be previewed here.");
    const signed = await admin.storage.from("brand-assets-private").createSignedUrl(path, 900);
    if (signed.error || !signed.data?.signedUrl) throw new Error("Contributed asset preview is unavailable.");
    return { url: signed.data.signedUrl, kind };
  });
