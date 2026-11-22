import { describe, expect, it } from "vitest";
import { tilePlanSchema } from "./social-tiles";

describe("social tile plan", () => {
  const tile = {
    headline: "A useful headline",
    supporting: "A clear supporting line",
  };
  it("accepts up to ten usable tiles", () => {
    expect(
      tilePlanSchema.safeParse({ brand: "Example", tiles: Array(10).fill(tile) })
        .success,
    ).toBe(true);
    expect(tilePlanSchema.safeParse({ brand: "Example", tiles: Array(11).fill(tile) }).success).toBe(false);
    expect(
      tilePlanSchema.safeParse({ brand: "Example", tiles: Array(0).fill(tile) })
        .success,
    ).toBe(false);
  });
  it("preserves editable design, evidence and private artwork IDs", () => {
    const designed = { ...tile, design: { aspect: "portrait", treatment: "illustration", composition: "right", medium: "Cut paper", accent: "#112233", emphasis: "useful", typeface: "serif", referenceIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] }, quote: { text: "A quote", speaker: "An author", sourceTitle: "Interview", sourceUrl: "https://example.com/interview" }, artwork: { requestId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", fileId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" } };
    expect(tilePlanSchema.parse({ brand: "Example", tiles: [designed] }).tiles[0]).toEqual(designed);
  });
  it("rejects empty or oversized headlines", () => {
    for (const headline of [" ", "x".repeat(81)]) {
      expect(
        tilePlanSchema.safeParse({
          brand: "Example",
          tiles: Array(5).fill({ ...tile, headline }),
        }).success,
      ).toBe(false);
    }
  });
});
