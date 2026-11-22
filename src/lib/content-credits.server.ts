import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./supabase-admin.server";
import { creativeSettingsDuration, getCreativeCapability } from "./creative-providers/registry";
export class CreditAdmissionError extends Error {
  constructor(message: string, readonly reason?: "insufficient" | "allowance_unavailable" | "payment_pending") {
    super(message);
  }
}
export function assertApprovedVideoQuote(approval: { version?: number; credits?: number } | undefined, version: number, credits: number) {
  if (approval?.version !== version || approval.credits !== credits) throw new CreditAdmissionError("The video or its credit price changed. Review the current quote before creating.");
}

/** A 202 means payment is pending, never that credits are already usable. */
export async function attemptCreditAutoUpgrade(workspaceId: string, requestKey: string, credits: number): Promise<boolean> {
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!key) return false;
  try {
    const response = await fetch(`${supabaseUrl()}/functions/v1/credit-auto-upgrade`, { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ workspace_id: workspaceId, request_key: requestKey, required_credits: credits }), signal: AbortSignal.timeout(15000) });
    return response.status === 202;
  } catch { return false; }
}

/** Only the agreed one-minute, single-engine outputs have a customer price. */
export function videoCreditCapability(plan: unknown, duration: number | null): string {
  if (!duration || !Number.isSafeInteger(duration) || duration < 1 || !plan || typeof plan !== "object" || Array.isArray(plan)) throw new CreditAdmissionError("This video has no verified credit price yet.");
  const steps = (plan as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length !== 1 || !steps[0] || typeof steps[0] !== "object" || steps[0].role !== "finished_video") throw new CreditAdmissionError("This production has no verified credit price yet.");
  const supported = ["autotoast-hyperframes", "golpo-canvas", "golpo-sketch", "heygen-avatar"];
  if (typeof steps[0].capability_id !== "string" || (!supported.includes(steps[0].capability_id) && !steps[0].capability_id.startsWith("higgsfield-"))) throw new CreditAdmissionError("This model has no verified credit price yet.");
  return steps[0].capability_id;
}
export async function getContentCreditRate(db: SupabaseClient, capabilityId: string, duration: number) {
  const result = await db.rpc("get_content_credit_rate", { _capability_id: capabilityId, _duration_s: duration });
  const rate = result.data as { credits?: unknown; version?: unknown } | null;
  if (result.error || !rate || typeof rate.credits !== "number" || !Number.isSafeInteger(rate.credits) || rate.credits <= 0 || typeof rate.version !== "string") throw new CreditAdmissionError("This model has no active verified credit price.");
  return { credits: rate.credits, version: rate.version };
}

export type CreditQuoteLine = { step_key: string; capability_id: string; duration_s: number; rate_id: string; credits: number };
export function assertApprovedProductionQuote(approval: { version?: number; credits?: number; lines?: CreditQuoteLine[] } | undefined, version: number, quote: { credits: number; lines: CreditQuoteLine[] }) {
  assertApprovedVideoQuote(approval, version, quote.credits);
  if (JSON.stringify(approval?.lines) !== JSON.stringify(quote.lines)) throw new CreditAdmissionError("The credit price changed. Review the current quote before creating.");
}
/** Price every provider operation plus the compositor, if the plan needs one. */
export async function quoteProductionCredits(db: SupabaseClient, plan: unknown, duration: number | null, completedStepIds: readonly string[] = []): Promise<{ credits: number; lines: CreditQuoteLine[] }> {
  if (!duration || !Number.isSafeInteger(duration) || duration < 1 || !plan || typeof plan !== "object" || Array.isArray(plan)) throw new CreditAdmissionError("This production has no verified credit price.");
  const steps = (plan as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length > 6) throw new CreditAdmissionError("This production has no verified credit price.");
  const entries: { step_key: string; capability_id: string; duration_s: number }[] = [];
  const completed = new Set(completedStepIds);
  const seen = new Set<string>();
  let hasFinal = false;
  for (const [index, raw] of steps.entries()) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new CreditAdmissionError("This production has no verified credit price.");
    const step = raw as { id?: unknown; capability_id?: unknown; role?: unknown; settings?: unknown };
    if (typeof step.id !== "string" || seen.has(step.id) || typeof step.capability_id !== "string" || !["scene", "finished_video"].includes(String(step.role))) throw new CreditAdmissionError("This production has no verified credit price.");
    seen.add(step.id);
    const capability = getCreativeCapability(step.capability_id);
    if (capability.status !== "supported" || (step.role === "finished_video" && (hasFinal || index !== steps.length - 1 || capability.output !== "video"))) throw new CreditAdmissionError("This production has no verified credit price.");
    if (step.role === "finished_video") hasFinal = true;
    if (completed.has(step.id)) continue;
    let billedDuration = 0;
    if (capability.output === "video") {
      const settings = step.settings && typeof step.settings === "object" && !Array.isArray(step.settings) ? step.settings as Record<string, unknown> : {};
      const actual = creativeSettingsDuration(settings);
      billedDuration = actual ?? (capability.provider === "golpo" ? duration : 0);
      if (!Number.isSafeInteger(billedDuration) || billedDuration <= 0) throw new CreditAdmissionError("A video step has no verified duration price.");
    }
    entries.push({ step_key: `provider:${step.id}`, capability_id: step.capability_id, duration_s: billedDuration });
  }
  if ([...completed].some((id) => !seen.has(id))) throw new CreditAdmissionError("A completed production asset does not match the saved plan.");
  if (!hasFinal) entries.push({ step_key: "compositor", capability_id: "autotoast-hyperframes", duration_s: duration });
  const lines = await Promise.all(entries.map(async (entry) => { const rate = await getContentCreditRate(db, entry.capability_id, entry.duration_s); return { ...entry, rate_id: rate.version, credits: rate.credits }; }));
  return { credits: lines.reduce((sum, line) => sum + line.credits, 0), lines };
}

export async function resolveRenderCredits(db: SupabaseClient, workspaceId: string, renderId: string, state: "settled" | "released" = "settled") {
  const result = await db.from("content_credit_reservations").select("id").eq("workspace_id", workspaceId).eq("request_key", `render:${renderId}`).maybeSingle();
  if (result.error) throw new Error("Credit reservation could not be checked.");
  if (result.data?.id) await resolveCredits(db, result.data.id, state);
}
/** Reconciliation itself decides which steps have definite evidence; uncertain lines stay held. */
export async function reconcileFailedRenderCredits(db: SupabaseClient, workspaceId: string, renderId: string) {
  const reservation = await db.from("content_credit_reservations").select("id").eq("workspace_id", workspaceId).eq("request_key", `render:${renderId}`).maybeSingle();
  if (reservation.error) throw new Error("Credit reservation could not be checked.");
  if (!reservation.data?.id) return;
  const result = await db.rpc("reconcile_failed_composite_credit_reservation", { _reservation_id: reservation.data.id });
  if (result.error) throw new Error("Failed production credits require reconciliation.");
}

/** A replayed request is safe only while its original reservation remains held. */
export async function reserveCredits(db: SupabaseClient, workspaceId: string, userId: string, requestKey: string, credits: number, capabilityId: string, duration: number, rateId: string) {
  const period = await db.rpc("ensure_free_content_credit_period", { _workspace_id: workspaceId, _user_id: userId });
  if (period.error) throw new CreditAdmissionError("This workspace has no available credit allowance. Check its billing setup or contact your workspace administrator.", "allowance_unavailable");
  const result = await db.rpc("reserve_priced_content_credits", { _workspace_id: workspaceId, _user_id: userId, _request_key: requestKey, _capability_id: capabilityId, _duration_s: duration, _rate_id: rateId, _expected_credits: credits });
  if (result.error) {
    if (result.error.message?.includes("Insufficient credits")) {
      if (await attemptCreditAutoUpgrade(workspaceId, requestKey, credits)) throw new CreditAdmissionError("Your upgrade payment is pending. Try again after payment is confirmed.", "payment_pending");
      throw new CreditAdmissionError("Not enough credits to create this image. Upgrade or wait for your next monthly allowance.", "insufficient");
    }
    throw new CreditAdmissionError("Credits could not be reserved. No content was generated.");
  }
  const data = result.data as { reservation_id?: unknown; state?: unknown; reused?: unknown } | null;
  if (!data || typeof data.reservation_id !== "string" || data.state !== "reserved" || data.reused !== false) throw new CreditAdmissionError("This request already has a credit reservation. Review the original request before retrying.");
  return data.reservation_id;
}

export async function resolveCredits(db: SupabaseClient, reservationId: string, state: "settled" | "released" | "reconciliation_required") {
  const result = await db.rpc("resolve_content_credit_reservation", { _reservation_id: reservationId, _state: state });
  if (result.error) throw new Error("Credit reservation needs reconciliation.");
}
