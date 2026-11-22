import { describe, expect, it } from "vitest";
import { generationPageMetrics, summarizeLatency } from "../lib/generation-latency";
import type { GenerationStep } from "../lib/generation-tracker";

const at = (seconds: number) => new Date(Date.UTC(2026, 10, 2) + seconds * 1000).toISOString();
const step = (patch: Partial<GenerationStep>) => ({ step_key: "production", provider: "autosocials", initiator: "user", status: "completed", error_code: null,
  created_at: at(0), updated_at: at(120), started_at: at(10), submitted_at: null, completed_at: at(120), ...patch }) as GenerationStep;

describe("measured generation timing", () => {
  it("reports sample sizes and tail latency without inventing missing values", () => {
    expect(summarizeLatency([1, 2, 3, 4, 100, NaN, -1])).toEqual({ samples: 5, medianSeconds: 3, p95Seconds: 100 });
    expect(summarizeLatency([])).toEqual({ samples: 0, medianSeconds: null, p95Seconds: null });
    const result = generationPageMetrics([step({}), step({ created_at: at(60), completed_at: at(30) }), step({ initiator: "legacy" }), step({ completed_at: null })]);
    expect(result.production).toEqual({ samples: 1, medianSeconds: 120, p95Seconds: 120 });
    expect(result.excludedLegacy).toBe(1);
  });
  it("keeps provider ingestion and composition checks labelled as combined measurements", () => {
    const result = generationPageMetrics([step({ step_key: "provider:scene", provider: "higgsfield", submitted_at: at(20), completed_at: at(100) }),
      step({ step_key: "compositor", provider: "autotoast", submitted_at: at(110), completed_at: at(170) })]);
    expect(result.providerAndIngest.medianSeconds).toBe(80);
    expect(result.assemblyAndChecks.medianSeconds).toBe(60);
    expect(result.production.samples).toBe(0);
  });
  it("retains failures, confirmed cancellations, reconciliation and stale active work", () => {
    const result = generationPageMetrics([step({ status: "failed" }), step({ status: "failed", error_code: "provider_canceled" }),
      step({ status: "reconciliation_required" }), step({ status: "running", updated_at: at(0), completed_at: null })], Date.parse(at(601)));
    expect(result).toMatchObject({ failed: 1, cancelled: 1, reconciliation: 1, active: 1, staleActive: 1 });
    expect(result.production.samples).toBe(0);
  });
});
