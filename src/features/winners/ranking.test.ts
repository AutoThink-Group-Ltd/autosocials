import { describe, expect, it } from "vitest";
import { isFreshMeasurement, rankPosts, type PerformancePost } from "./ranking";

const post = (id: string, likes: number | null, extra: Partial<PerformancePost> = {}): PerformancePost => ({ id, accountId: "a", platform: "instagram", format: "video", publishedAt: "2026-11-01T00:00:00Z", measuredAt: "2026-11-05T00:00:00Z", likes, comments: null, shares: null, ...extra });

describe("rankPosts", () => {
  it("ranks using only metrics available across a comparable cohort", () => {
    const ranked = rankPosts([post("a", 10), post("b", 20, { comments: 5 }), post("c", 30)]);
    expect(ranked.map(p => p.id)).toEqual(["c", "b", "a"]);
    expect(ranked[0]).toMatchObject({ percentile: 100, metricsUsed: ["likes"], cohortSize: 3 });
  });
  it("does not compare different accounts, age bands or insufficient evidence", () => {
    const ranked = rankPosts([post("a", 10), post("b", 20, { accountId: "b" }), post("c", 30, { measuredAt: "2026-11-20T00:00:00Z" })]);
    expect(ranked.every(p => p.percentile === null)).toBe(true);
  });
  it("does not treat missing metrics or young posts as zero", () => {
    const ranked = rankPosts([post("a", null), post("b", 2), post("c", 3), post("d", 5, { measuredAt: "2026-11-01T12:00:00Z" })]);
    expect(ranked.every(p => p.score === null)).toBe(true);
  });
  it("can compare views without conflating them with reactions", () => {
    const ranked = rankPosts([post("a", 100, { views: 10 }), post("b", 1, { views: 100 }), post("c", 10, { views: 20 })], "views");
    expect(ranked[0]?.id).toBe("b");
    expect(ranked[0]?.metricsUsed).toEqual(["views"]);
  });
  it("rejects stale, invalid and implausibly future observations", () => {
    const now = Date.parse("2026-11-14T00:00:00Z");
    expect(isFreshMeasurement("2026-11-13T00:00:00Z", now)).toBe(true);
    expect(isFreshMeasurement("2026-11-01T00:00:00Z", now)).toBe(false);
    expect(isFreshMeasurement("2026-11-15T00:00:00Z", now)).toBe(false);
    expect(isFreshMeasurement("bad date", now)).toBe(false);
  });
});
