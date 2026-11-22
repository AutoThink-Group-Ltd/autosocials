import { describe, expect, it } from "vitest";
import { makePublicResearchSnapshot } from "./research-share.server";
import type { ResearchRun } from "./research";

describe("public research snapshot", () => {
  it("keeps public evidence and strips private workspace text and video frames", () => {
    const run: ResearchRun = {
      id: "run-id", query: "PRIVATE_SEARCH", question: "PRIVATE_CLIENT_EMAIL",
      reply: "PRIVATE_REPLY", status: "complete",
      created_at: "2026-11-02T10:00:00Z", updated_at: "2026-11-02T11:00:00Z",
      targets: [{ id: "instagram:example", platform: "instagram", handle: "example", url: "https://www.instagram.com/example" }],
      posts: [{ id: "post-1", platform: "instagram", url: "https://www.instagram.com/p/example", caption: "Public caption", published_at: "2026-11-01T10:00:00Z", thumbnail_url: "https://images.example/cover.jpg", media_type: "video", metrics: { likes: 5, views: null }, review_basis: "frames", frames: ["PRIVATE_FRAME_DATA"] }],
      errors: ["PRIVATE_PROVIDER_ERROR"],
      analysis: { summary: "PRIVATE_ANALYSIS_SUMMARY", findings: [{ title: "PRIVATE_ANALYSIS_FINDING", body: "PRIVATE_ANALYSIS_BODY", post_ids: ["post-1"] }], treatment: { title: "PRIVATE_TREATMENT", hook: "PRIVATE_HOOK", beats: ["PRIVATE_BEAT"], rationale: "PRIVATE_RATIONALE" }, reply: "PRIVATE_AI_REPLY" },
    };
    const snapshot = makePublicResearchSnapshot(run);
    const json = JSON.stringify(snapshot);
    expect(json).toContain("Public caption");
    expect(snapshot.analysis).toBeNull();
    for (const secret of ["PRIVATE_SEARCH", "PRIVATE_CLIENT_EMAIL", "PRIVATE_REPLY", "PRIVATE_AI_REPLY", "PRIVATE_FRAME_DATA", "PRIVATE_PROVIDER_ERROR", "PRIVATE_ANALYSIS_SUMMARY", "PRIVATE_ANALYSIS_FINDING", "PRIVATE_ANALYSIS_BODY", "PRIVATE_TREATMENT", "PRIVATE_HOOK", "PRIVATE_BEAT", "PRIVATE_RATIONALE"]) expect(json).not.toContain(secret);
    expect(snapshot.posts[0]?.metrics.views).toBeNull();
  });
});
