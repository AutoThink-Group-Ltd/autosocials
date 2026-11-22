import { describe, expect, it } from "vitest";
import { campaignProductionPosts } from "./content-campaign-production";
import type { ContentCampaign } from "./content-campaign";

describe("campaign production selection", () => {
  it("keeps captions paired while chunking supported formats around video and carousel posts", () => {
    const posts = Array.from({ length: 25 }, (_, index) => ({
      id: String(index), date: "2026-11-20", platform: "linkedin",
      format: index === 2 ? "video" as const : index === 5 ? "carousel" as const : index % 2 ? "written" as const : "tiles" as const,
      title: `Title ${index}`, caption: `Caption ${index}`, brief: `Brief ${index}`,
    }));
    const campaign = { posts } as ContentCampaign;
    const first = campaignProductionPosts(campaign, 0);
    const second = campaignProductionPosts(campaign, 20);
    expect(first).toHaveLength(20);
    expect(second).toHaveLength(3);
    expect([...first, ...second].map((post) => post.id)).toEqual(posts.filter((post) => post.format !== "video" && post.format !== "carousel").map((post) => post.id));
    expect(second[0]?.caption).toBe(`Caption ${second[0]?.id}`);
  });
});
