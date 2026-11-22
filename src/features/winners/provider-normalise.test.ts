import { describe, expect, it } from "vitest";
import { normaliseMeta, normaliseTikTok, normaliseYouTube, observedCount, providerUrl } from "../../../supabase/functions/_shared/winner-normalise";

describe("provider observations", () => {
  it("keeps absent, hidden and invalid counts unknown", () => {
    expect([undefined, null, "", -1, "1.5", false].map(observedCount)).toEqual([null, null, null, null, null, null]);
    expect(observedCount("0")).toBe(0);
  });
  it("does not use unsafe links", () => {
    expect(providerUrl("javascript:alert(1)")).toBeNull();
    expect(providerUrl("https://user:pass@example.com/")).toBeNull();
  });
  it("uses the Facebook attachment when the post has no main image or message", () => {
    const image = "https://example.com/photo.jpg";
    const post = normaliseMeta("facebook", { id: "1", created_time: "2026-11-01", attachments: { data: [
      { title: "Shared photo", media: { image: { src: image } } },
    ] } });
    expect(post).toMatchObject({ thumbnail_url: image, caption: "Shared photo", format: "image" });
  });
  it("normalises each platform without inventing missing metrics", () => {
    expect(normaliseMeta("instagram", { id: "1", timestamp: "2026-11-01T00:00:00Z", media_type: "VIDEO", like_count: 0 })).toMatchObject({ likes: 0, comments_count: null, shares: null, views: null });
    expect(normaliseYouTube({ id: "abc", snippet: { publishedAt: "2026-11-01T00:00:00Z" }, statistics: { viewCount: "42" } })).toMatchObject({ views: 42, likes: null });
    expect(normaliseTikTok({ id: "1", create_time: 1, share_count: 5 })).toMatchObject({ shares: 5, views: null });
    expect(normaliseMeta("facebook", { id: "1" })).toBeNull();
  });
});
