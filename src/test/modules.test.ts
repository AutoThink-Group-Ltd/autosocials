import { describe, it, expect } from "vitest";
import { validateModuleRegistry, MODULE_CONTRACTS } from "@/brand/modules";
import { canStartRender, needsNewDraft } from "@/lib/allowance";
import { filterBlocksForModule } from "@/lib/sam.blocks";

describe("module registry", () => {
  it("every stage registers a complete contract", () => {
    expect(validateModuleRegistry()).toEqual([]);
  });
  it("flags a stage with missing starters", () => {
    const broken = { ...MODULE_CONTRACTS, create: { ...MODULE_CONTRACTS.create, starters: [] } };
    expect(validateModuleRegistry(broken)).toContain("create: starters");
  });
  it("Sam cannot render a schedule block in Create batches", () => {
    const out = filterBlocksForModule("create", [{ type: "schedule", title: "x", items: [] }, { type: "text", text: "ok" }]);
    expect(out).toEqual([{ type: "text", text: "ok" }]);
  });
});

describe("generation allowance", () => {
  it("allows the 12th clip and blocks the 13th by default", () => {
    expect(canStartRender(11, null)).toBe(true);
    expect(canStartRender(12, null)).toBe(false);
  });
  it("respects a custom limit", () => {
    expect(canStartRender(20, 30)).toBe(true);
  });
});

describe("publishing handoff", () => {
  it("never creates a second draft for the same variant", () => {
    expect(needsNewDraft(["a"], "a")).toBe(false);
    expect(needsNewDraft(["a"], "b")).toBe(true);
  });
});
