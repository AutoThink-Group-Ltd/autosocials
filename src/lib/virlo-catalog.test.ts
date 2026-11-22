import { describe, expect, it } from "vitest";
import { asSchema } from "ai";
import { z } from "zod";
import { VirloOperationSchema, buildVirloOperation } from "./virlo-catalog";

const uuid = "4bcf8f69-3913-4df0-8701-104a182f8152";
describe("Virlo operation catalog", () => {
  it("exports an OpenAI-compatible schema while validating international hashtags", async () => {
    const schema = await asSchema(z.object({ action: VirloOperationSchema })).jsonSchema;
    expect(JSON.stringify(schema)).not.toContain("\\\\p{");
    expect(buildVirloOperation({ operation: "raw_hashtag", platform: "tiktok", hashtag: "#café" }).path).toContain("caf%C3%A9");
    expect(() => buildVirloOperation({ operation: "raw_hashtag", platform: "tiktok", hashtag: "bad/tag" })).toThrow();
  });
  it("builds the documented video and creator searches", () => {
    expect(
      buildVirloOperation({
        operation: "videos",
        query: "skin care",
        platform: "tiktok",
      }),
    ).toMatchObject({
      method: "POST",
      path: "/search/videos",
      body: {
        topics: ["skin care"],
        platforms: ["tiktok"],
        scope: "virlo_library",
        page: 1,
      },
      estimatedCostUsd: 0.05,
    });
    expect(
      buildVirloOperation({ operation: "creators", query: "skin care" }),
    ).toMatchObject({
      path: "/search/creators",
      body: { topics: ["skin care"] },
    });
  });
  it("requires a specific workspace-owned agent for agent searches", () => {
    expect(() => buildVirloOperation({ operation: "videos", query: "skin", scope: "agent" })).toThrow();
    expect(buildVirloOperation({ operation: "videos", query: "skin", scope: "agent", agent_id: uuid })).toMatchObject({ resourceId: uuid, estimatedCostUsd: 0, body: { scope: "agent", agent_id: uuid } });
  });
  it("builds public research routes without allowing arbitrary paths", () => {
    expect(buildVirloOperation({ operation: "recent_videos", platform: "tiktok" })).toMatchObject({ method: "GET", path: "/tiktok/videos/digest" });
    expect(buildVirloOperation({ operation: "sound_search", query: "lofi" })).toMatchObject({ path: "/sounds/search", estimatedCostUsd: 0.1 });
    expect(buildVirloOperation({ operation: "place_videos", place_id: uuid })).toMatchObject({ path: `/places/${uuid}/videos` });
    expect(buildVirloOperation({ operation: "tracking_data", kind: "creators", id: uuid, view: "posts" })).toMatchObject({ resourceId: uuid, path: `/tracking/creators/${uuid}/posts` });
    expect(() => buildVirloOperation({ operation: "tracking_data", kind: "videos", id: uuid, view: "posts" })).toThrow();
    expect(() => buildVirloOperation({ operation: "meta_ad", ad_id: "../secrets" })).toThrow();
  });
  it("passes supported video filters without widening a request", () => {
    expect(buildVirloOperation({ operation: "videos", query: "skin care", looks_like: "faceless", posted_after: "2026-10-01", platform: "tiktok", views_min: 10000, sort: "most_viral", content_types: ["video", "slideshow"] })).toMatchObject({ body: { topics: ["skin care"], looks_like: "faceless", posted_after: "2026-10-01", platforms: ["tiktok"], views_min: 10000, sort: "most_viral", content_types: ["video", "slideshow"] } });
  });
  it("passes requested creator criteria through to Virlo", () => {
    expect(buildVirloOperation({ operation: "creators", query: "skincare", creator_followers_min: 10000, creator_followers_max: 100000, creator_type: "individual", sort: "top_performing" })).toMatchObject({ body: { topics: ["skincare"], creator_followers_min: 10000, creator_followers_max: 100000, creator_type: "individual", sort: "top_performing" } });
  });
  it("does not allow callers to supply a path, method, host or undeclared input", () => {
    expect(() =>
      buildVirloOperation({
        operation: "videos",
        query: "skin",
        path: "/account/top-up",
      }),
    ).toThrow();
    expect(() =>
      buildVirloOperation({ operation: "../../account/top-up", query: "skin" }),
    ).toThrow();
    expect(() =>
      buildVirloOperation({
        operation: "tracking_data",
        kind: "videos",
        id: "../foo",
        view: "report",
      }),
    ).toThrow();
    expect(() =>
      buildVirloOperation({
        operation: "raw_creator",
        platform: "tiktok",
        handle: "a/b",
      }),
    ).toThrow();
    expect(() =>
      buildVirloOperation({
        operation: "video_lookup",
        platform: "tiktok",
        url: "https://evil.example/@x/video/1",
      }),
    ).toThrow();
  });
  it("requires an explicit schedule and confirmation for recurring research", () => {
    expect(() => buildVirloOperation({ operation: "research_start", intent: "skin care", keywords: ["skin care"], platforms: ["tiktok"], recurring: true })).toThrow();
    expect(buildVirloOperation({ operation: "research_start", intent: "skin care", keywords: ["skin care"], platforms: ["tiktok"], recurring: true, cadence: "weekly" })).toMatchObject({ confirmation: "recurring", recurring: true, estimatedCostUsd: 0.5, body: { is_recurring: true, cadence: "weekly" } });
    expect(buildVirloOperation({ operation: "research_update", id: uuid, active: false })).toMatchObject({ method: "PUT", confirmation: "recurring", resourceId: uuid, body: { active: false } });
  });
  it("records recurring starts and resumption as requiring confirmation", () => {
    expect(
      buildVirloOperation({
        operation: "track_creator",
        platform: "tiktok",
        handle: "person",
        cadence: "daily",
      }),
    ).toMatchObject({
      method: "POST",
      path: "/tracking/creators",
      confirmation: "recurring",
      recurring: true,
      estimatedCostUsd: 0.25,
    });
    expect(
      buildVirloOperation({
        operation: "tracking_update",
        kind: "creators",
        id: uuid,
        status: "active",
      }),
    ).toMatchObject({
      method: "PATCH",
      confirmation: "recurring",
      resourceId: uuid,
    });
    expect(
      buildVirloOperation({
        operation: "tracking_update",
        kind: "creators",
        id: uuid,
        status: "paused",
      }),
    ).toMatchObject({ confirmation: "none", recurring: false });
  });
  it("keeps provider resource IDs explicit for workspace ownership checks", () => {
    expect(
      buildVirloOperation({
        operation: "research_data",
        id: uuid,
        view: "outliers",
      }),
    ).toMatchObject({
      path: `/agents/${uuid}/creators/outliers`,
      resourceId: uuid,
    });
    expect(
      buildVirloOperation({
        operation: "lookup_status",
        id: uuid,
        lookup: "video",
      }),
    ).toMatchObject({
      path: `/satellite/video-outlier/status/${uuid}`,
      resourceId: uuid,
    });
  });
  it("requires bounded dates for hashtag rankings", () => {
    expect(
      buildVirloOperation({
        operation: "hashtags",
        start_date: "2026-11-01",
        end_date: "2026-11-14",
      }),
    ).toMatchObject({
      query: { start_date: "2026-11-01", end_date: "2026-11-14" },
    });
    expect(() =>
      buildVirloOperation({
        operation: "hashtags",
        start_date: "2026-01-01",
        end_date: "2026-11-14",
      }),
    ).toThrow();
  });
  it("limits costs to explicitly enabled add-ons and includes AI add-on price", () => {
    expect(
      buildVirloOperation({
        operation: "creator_lookup",
        platform: "instagram",
        handle: "example",
        audience: true,
        trends: true,
        intelligence: true,
      }).estimatedCostUsd,
    ).toBe(1.75);
    expect(
      buildVirloOperation({
        operation: "research_start",
        intent: "skin care",
        keywords: ["skin care"],
        platforms: ["tiktok"],
        intelligence: true,
      }),
    ).toMatchObject({
      estimatedCostUsd: 1.5,
      body: { is_recurring: false, data_intelligence_enabled: true },
    });
  });
});
