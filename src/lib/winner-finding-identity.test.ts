import { describe, expect, it } from "vitest";
import { dismissedFindingKey } from "./winner-finding-identity";

describe("dismissed findings", () => {
  const prior = [{ finding_key: "old", title: "Questions in opening hooks", source_post_ids: ["a", "b"] }];
  it("recognises a similar finding supported by an overlapping post", () => {
    expect(dismissedFindingKey("Opening hooks with questions", ["b", "c"], prior)).toBe("old");
  });
  it("does not suppress a different theme", () => {
    expect(dismissedFindingKey("Short videos with product demos", ["b", "c"], prior)).toBeNull();
  });
});
