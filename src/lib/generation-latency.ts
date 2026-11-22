import type { GenerationStep } from "./generation-tracker";

export type LatencySummary = { samples: number; medianSeconds: number | null; p95Seconds: number | null };
type TimedStep = Pick<GenerationStep, "step_key" | "provider" | "initiator" | "status" | "error_code" | "created_at" | "updated_at" | "started_at" | "submitted_at" | "completed_at">;

/** Nearest-rank P95, with a conventional midpoint median. Never replace missing timestamps. */
export function summarizeLatency(seconds: number[]): LatencySummary {
  const sorted = seconds.filter(value => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  const samples = sorted.length;
  if (!samples) return { samples: 0, medianSeconds: null, p95Seconds: null };
  const middle = Math.floor(samples / 2);
  return { samples, medianSeconds: samples % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2,
    p95Seconds: sorted[Math.max(0, Math.ceil(samples * 0.95) - 1)]! };
}

const secondsBetween = (start: string | null, end: string | null): number | null => {
  if (!start || !end) return null;
  const value = (Date.parse(end) - Date.parse(start)) / 1000;
  return Number.isFinite(value) && value >= 0 ? value : null;
};

/** A page sample, not global production analytics: filtered pages can contain partial chains. */
export function generationPageMetrics(rows: TimedStep[], now = Date.now()) {
  const production: number[] = [], queue: number[] = [], providerAndIngest: number[] = [], assemblyAndChecks: number[] = [];
  let failed = 0, cancelled = 0, active = 0, reconciliation = 0, staleActive = 0, excludedLegacy = 0;
  for (const step of rows) {
    const wasCancelled = /cancel(?:led|ed)/i.test(step.error_code ?? "") || String(step.status) === "cancelled";
    if (wasCancelled) cancelled++;
    else if (step.status === "failed") failed++;
    if (step.status === "reconciliation_required") reconciliation++;
    if (["reserved", "submitted", "running"].includes(step.status)) {
      active++;
      const updated = Date.parse(step.updated_at);
      if (Number.isFinite(updated) && now - updated >= 10 * 60 * 1000) staleActive++;
    }
    if (step.initiator === "legacy" || step.provider === "legacy_unknown") { excludedLegacy++; continue; }
    if (step.step_key === "production") {
      const queued = secondsBetween(step.created_at, step.started_at);
      if (queued !== null) queue.push(queued);
      if (step.status === "completed") {
        const elapsed = secondsBetween(step.created_at, step.completed_at);
        if (elapsed !== null) production.push(elapsed);
      }
    } else if (step.status === "completed") {
      const elapsed = secondsBetween(step.submitted_at, step.completed_at);
      if (elapsed !== null && step.step_key === "compositor") assemblyAndChecks.push(elapsed);
      else if (elapsed !== null && step.step_key.startsWith("provider:")) providerAndIngest.push(elapsed);
    }
  }
  return { production: summarizeLatency(production), queue: summarizeLatency(queue), providerAndIngest: summarizeLatency(providerAndIngest),
    assemblyAndChecks: summarizeLatency(assemblyAndChecks), failed, cancelled, active, reconciliation, staleActive, excludedLegacy };
}
