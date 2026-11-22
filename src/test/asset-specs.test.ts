import { describe, it, expect } from "vitest";
import { applySpec, seedSpecs } from "@/lib/wizard";

describe("asset specs", () => {
  it("user length and format override the AI", () => {
    const v = applySpec({ duration_s: 15, size: "1080x1080", angle: "x" }, { narrative: "A", duration: 30, size: "1080x1920" });
    expect(v).toEqual({ duration_s: 30, size: "1080x1920", angle: "A", captions: "clean" });
  });
  it("keeps edits when the count grows", () => {
    const first = seedSpecs([{ title: "A" }], 1).map((s) => ({ ...s, duration: 30 as const, style_id: "cinematic-scene" as const }));
    const next = seedSpecs([{ title: "A" }], 2, first);
    expect(next).toHaveLength(2);
    expect(next[0]!.duration).toBe(30);
    expect(next[0]!.style_id).toBe("cinematic-scene");
  });
  it("swaps a narrative that is no longer picked", () => {
    const next = seedSpecs([{ title: "B" }], 1, [{ narrative: "A", duration: 30, size: "1080x1920" }]);
    expect(next[0]!.narrative).toBe("B");
  });
});
