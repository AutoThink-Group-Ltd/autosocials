import { describe, expect, it } from "vitest";
import { targetFromSocialUrl, targetsFromText } from "./research";
import { normalizeApifyPosts } from "./research-provider.server";

describe("research targets", () => {
  it("accepts public profiles and ignores individual posts", () => {
    expect(targetFromSocialUrl("https://www.instagram.com/example/")?.id).toBe("instagram:example");
    expect(targetFromSocialUrl("https://www.tiktok.com/@example")?.id).toBe("tiktok:example");
    expect(targetFromSocialUrl("https://www.instagram.com/reel/abc123")).toBeNull();
    expect(targetFromSocialUrl("https://www.facebook.com/watch/abc123")).toBeNull();
  });

  it("deduplicates social links from a company website", () => {
    const targets = targetsFromText("Instagram https://instagram.com/example and https://www.instagram.com/example/; TikTok https://tiktok.com/@example");
    expect(targets.map((target) => target.id)).toEqual(["instagram:example", "tiktok:example"]);
  });
});

describe("public post normalization", () => {
  it("keeps unavailable metrics unknown and labels a video cover as thumbnail review", () => {
    const target = targetFromSocialUrl("https://www.tiktok.com/@example")!;
    const posts = normalizeApifyPosts("tiktok", target, [{ id: "123", webVideoUrl: "https://www.tiktok.com/@example/video/123", text: "A property tour", createTimeISO: "2026-10-30T10:00:00Z", videoMeta: { coverUrl: "https://images.example/cover.jpg" }, diggCount: 0 }]);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.metrics).toMatchObject({ likes: 0, views: null, shares: null });
    expect(posts[0]?.review_basis).toBe("thumbnail");
  });

  it("uses frame review only for explicit still frames", () => {
    const target = targetFromSocialUrl("https://www.instagram.com/example")!;
    const posts = normalizeApifyPosts("instagram", target, [{ id: "a", url: "https://www.instagram.com/p/a", type: "Video", frames: ["https://images.example/frame1.jpg", "https://images.example/frame2.jpg"] }]);
    expect(posts[0]?.review_basis).toBe("frames");
    expect(posts[0]?.frames).toHaveLength(2);
  });
});
