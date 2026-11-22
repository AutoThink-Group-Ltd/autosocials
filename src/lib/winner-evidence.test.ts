import { describe, expect, it } from "vitest";
import { containsPerformanceClaim, freshWinnerEvidence } from "./winner-evidence";

describe("finding freshness", () => {
  const now = Date.parse("2026-11-14T00:00:00Z");
  it("requires at least two fresh source measurements", () => {
    expect(freshWinnerEvidence([{ analysis_method: "reviewed_v3", measured_at: "2026-11-13T00:00:00Z" }, { analysis_method: "reviewed_v3", measured_at: "2026-11-12T00:00:00Z" }], now)).toBe(true);
    expect(freshWinnerEvidence([{ analysis_method: "reviewed_v3", measured_at: "2026-11-13T00:00:00Z" }, { analysis_method: "reviewed_v3", measured_at: "2026-10-01T00:00:00Z" }], now)).toBe(false);
    expect(freshWinnerEvidence([{ measured_at: "2026-11-13T00:00:00Z" }, { measured_at: "2026-11-12T00:00:00Z" }], now)).toBe(false);
    expect(freshWinnerEvidence([], now)).toBe(false);
  });
  it("rejects model-written performance comparisons", () => {
    expect(containsPerformanceClaim("Some posts were in the middle of the range")).toBe(true);
    expect(containsPerformanceClaim("This theme performed better")).toBe(true);
    expect(containsPerformanceClaim("Try a question as the opening hook.")).toBe(false);
  });
});
