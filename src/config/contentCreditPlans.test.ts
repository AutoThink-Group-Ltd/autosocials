import { describe, expect, it } from "vitest";
import { CONTENT_CREDIT_PLANS, CONTENT_CREDIT_BENCHMARKS, estimatedContent } from "./contentCreditPlans";

describe("proposed monthly content credit plans", () => {
  it("provides the agreed illustrative alternatives", () => {
    expect(CONTENT_CREDIT_PLANS.map(({ credits }) => estimatedContent(credits))).toEqual([
      { videos: 2, images: 12 }, { videos: 5, images: 30 },
      { videos: 9, images: 54 }, { videos: 25, images: 151 },
      { videos: 40, images: 242 },
    ]);
  });
  it("supports the agreed Pro daily mix for thirty days", () => {
    expect(30 * (200 + 2 * 33)).toBeLessThanOrEqual(CONTENT_CREDIT_PLANS[4].credits);
  });
  it("retains the average benchmarks behind the estimates", () => {
    const rates = Object.values(CONTENT_CREDIT_BENCHMARKS);
    const video = rates.filter((rate) => rate.unit === "60-second video");
    const image = rates.filter((rate) => rate.unit === "image");
    expect(video.reduce((sum, rate) => sum + rate.credits, 0) / video.length).toBe(200);
    expect(image.reduce((sum, rate) => sum + rate.credits, 0) / image.length).toBe(33);
  });
});
