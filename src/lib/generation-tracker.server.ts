import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizeGenerationSettings, sanitizeUsage, safeStoragePath, type GenerationStep, type GenerationStatus, type ReviewStatus, type CostKind } from "./generation-tracker";

// This module is server-only. No callable client endpoint exposes ledger writes.
type Db = { from: (table: string) => any };
export async function previousGenerationStep(variantId: string, stepKey: string, excludeRenderJobId: string, db: Db = supabaseAdmin): Promise<GenerationStep | null> {
  const { data, error } = await db.from("generation_steps").select("*").eq("variant_id", variantId).eq("step_key", stepKey)
    .neq("render_job_id", excludeRenderJobId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error("Previous generation history could not be loaded; no provider submission is allowed.");
  return data as GenerationStep | null;
}
export async function listRenderSteps(renderJobId: string, db: Db = supabaseAdmin): Promise<GenerationStep[]> {
  const { data, error } = await db.from("generation_steps").select("*").eq("render_job_id", renderJobId).order("created_at", { ascending: true }).order("id", { ascending: true });
  if (error) throw new Error("Generation history could not be loaded; no provider submission is allowed.");
  return (data ?? []) as GenerationStep[];
}
/** Preflight for a NEW attempt. Existing provider work must be reconciled, even if its render failed.
 * The unpaid orchestration reservation is excluded; no paid reservation is reclaimed by time.
 */
export async function assertNoUncertainGeneration(variantId: string, db: Db = supabaseAdmin): Promise<void> {
  const { data, error } = await db.from("generation_steps").select("id").eq("variant_id", variantId)
    .neq("provider", "autosocials").in("status", ["reserved", "submitted", "running", "reconciliation_required"]).limit(1);
  if (error) throw new Error("Generation history could not be checked; no provider submission is allowed.");
  if (data?.length) throw new Error("An earlier provider generation is still active or requires reconciliation. Resolve it before creating a paid retry.");
}
export type BeginGenerationStep = {
  renderJobId: string; workspaceId: string; variantId: string; userId: string | null;
  initiator: "user" | "sam"; stepKey: string; provider: string; model: string; operation: string;
  settings?: unknown; briefSummary?: string; parentStepId?: string; retryOfStepId?: string;
};
/** The unique constraint reserves the paid operation before submission. Existing = NEVER submit again.
 * A crash after reservation is ambiguous; reconcile with the provider, never expire/reclaim a reservation.
 */
export async function beginStep(input: BeginGenerationStep, db: Db = supabaseAdmin) : Promise<{ created: boolean; step: GenerationStep }> {
  const row = { render_job_id: input.renderJobId, workspace_id: input.workspaceId, variant_id: input.variantId,
    user_id: input.userId, initiator: input.initiator, step_key: input.stepKey,
    provider: input.provider, model: input.model, operation: input.operation,
    parent_step_id: input.parentStepId ?? null, retry_of_step_id: input.retryOfStepId ?? null,
    // Brief text can contain user content; the immutable render brief remains on render_jobs.
    brief_summary: null, settings: sanitizeGenerationSettings(input.settings), status: "reserved" };
  const { data, error } = await db.from("generation_steps").insert(row).select("*").single();
  if (!error) return { created: true, step: data as GenerationStep };
  if (error.code !== "23505") throw new Error("Generation reservation could not be saved. No provider submission is allowed.");
  const existing = await db.from("generation_steps").select("*").eq("render_job_id", input.renderJobId).eq("step_key", input.stepKey).single();
  if (existing.error || !existing.data) throw new Error("Generation reservation could not be reconciled.");
  return { created: false, step: existing.data as GenerationStep };
}
export type GenerationStepUpdate = {
  settings?: unknown; status?: GenerationStatus; providerJobId?: string; providerRequestId?: string; modelVersion?: string; usage?: unknown;
  costAmount?: number | null; costCurrency?: string | null; costKind?: CostKind;
  outputStoragePath?: string | null; errorCode?: string;
  technicalStatus?: ReviewStatus; creativeStatus?: ReviewStatus;
};
function safeId(value: string | undefined): string | undefined {
  return value && /^[\w.:-]{1,200}$/.test(value) ? value : undefined;
}
export async function updateStep(id: string, patch: GenerationStepUpdate, db: Db = supabaseAdmin): Promise<GenerationStep> {
  const update: Partial<GenerationStep> = { updated_at: new Date().toISOString() };
  if (patch.settings !== undefined) update.settings = sanitizeGenerationSettings(patch.settings);
  if (patch.status) update.status = patch.status;
  if (patch.status === "submitted") update.submitted_at = new Date().toISOString();
  if (patch.status === "running") update.started_at = new Date().toISOString();
  if (patch.providerJobId !== undefined) update.provider_job_id = safeId(patch.providerJobId) ?? null;
  if (patch.providerRequestId !== undefined) update.provider_request_id = safeId(patch.providerRequestId) ?? null;
  if (patch.modelVersion !== undefined) update.model_version = safeId(patch.modelVersion) ?? null;
  if (patch.errorCode !== undefined) update.error_code = safeId(patch.errorCode) ?? "provider_error";
  if (patch.usage !== undefined) update.usage = sanitizeUsage(patch.usage);
  if (patch.costKind !== undefined) {
    const valid = patch.costKind !== "unknown" && typeof patch.costAmount === "number" && Number.isFinite(patch.costAmount) && patch.costAmount >= 0 && /^[A-Z]{3}$/.test(patch.costCurrency ?? "");
    update.cost_kind = valid ? patch.costKind : "unknown";
    update.cost_amount = valid ? patch.costAmount ?? null : null;
    update.cost_currency = valid ? patch.costCurrency ?? null : null;
  }
  if (patch.outputStoragePath !== undefined) update.output_storage_path = safeStoragePath(patch.outputStoragePath);
  if (patch.technicalStatus) update.technical_status = patch.technicalStatus;
  if (patch.creativeStatus) update.creative_status = patch.creativeStatus;
  if (patch.status === "completed" || patch.status === "failed") update.completed_at = new Date().toISOString();
  const { data, error } = await db.from("generation_steps").update(update).eq("id", id).select("*").single();
  if (error || !data) throw new Error("Generation progress could not be saved; reconcile before retrying.");
  return data as GenerationStep;
}
export const completeStep = (id: string, patch: Omit<GenerationStepUpdate, "status"> = {}, db?: Db) => updateStep(id, { ...patch, status: "completed" }, db);
export const failStep = (id: string, errorCode = "provider_error", uncertain = false, db?: Db) => updateStep(id, { status: uncertain ? "reconciliation_required" : "failed", errorCode }, db);

/** Only called after the existing authenticated, tenant-scoped human review succeeds. */
export async function markGenerationApproval(renderJobId: string, state: string, db: Db = supabaseAdmin) {
  const approval_status = state === "approved" ? "approved" : state === "rejected" ? "rejected" : "pending";
  const result = await db.from("generation_steps").update({ approval_status, updated_at: new Date().toISOString() }).eq("render_job_id", renderJobId);
  if (result.error) throw new Error("Human review was saved, but tracker feedback could not be updated.");
}
