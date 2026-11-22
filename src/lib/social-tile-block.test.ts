import { describe, expect, it } from "vitest";
import { filterBlocksForModule } from "./sam.blocks";

describe("social tiles canvas contract", () => {
  const block = {
    type: "social_tiles",
    title: "Create five social tiles",
    brief: "Create five tiles for cleaning",
  };
  it("accepts a bounded handoff only in Create", () => {
    expect(filterBlocksForModule("create", [block])).toEqual([block]);
    expect(filterBlocksForModule("schedule", [block])).toEqual([]);
    expect(
      filterBlocksForModule("create", [{ ...block, brief: "x".repeat(2001) }]),
    ).toEqual([]);
  });
});
