import { describe, expect, it } from "vitest";
import { extractWebsiteSocialProfiles, parseClientSocialProfile } from "./client-social-profiles";

describe("parseClientSocialProfile", () => {
  it("detects a Pinterest profile on its UK domain", () => {
    expect(parseClientSocialProfile("https://uk.pinterest.com/jamiltonupholstery/")).toEqual({
      platform: "pinterest",
      handle: "jamiltonupholstery",
      url: "https://uk.pinterest.com/jamiltonupholstery/",
    });
  });

  it("recognizes Substack publications, profiles and handles", () => {
    expect(parseClientSocialProfile("https://example.substack.com/")).toEqual({ platform: "substack", handle: "example", url: "https://example.substack.com/" });
    expect(parseClientSocialProfile("https://substack.com/@writer")?.handle).toBe("writer");
    expect(parseClientSocialProfile("@writer", "substack")?.handle).toBe("writer");
    expect(parseClientSocialProfile("https://example.substack.com/p/an-article")).toBeNull();
    expect(parseClientSocialProfile("https://example.substack.com.example.org/")).toBeNull();
  });

  it("recognizes Reddit user profiles and rejects posts", () => {
    expect(parseClientSocialProfile("https://www.reddit.com/user/example/")?.handle).toBe("example");
    expect(parseClientSocialProfile("https://reddit.com/u/example")?.platform).toBe("reddit");
    expect(parseClientSocialProfile("@example", "reddit")?.handle).toBe("example");
    expect(parseClientSocialProfile("https://reddit.com/r/example/comments/123/post")).toBeNull();
  });

  it("does not detect lookalike domains as social profiles", () => {
    expect(parseClientSocialProfile("https://uk.pinterest.com.example.org/jamiltonupholstery/")).toBeNull();
  });
});


describe("extractWebsiteSocialProfiles", () => {
  it("accepts URL objects while rejecting malformed and lookalike links", () => {
    const profiles = extractWebsiteSocialProfiles("", [
      { url: "https://instagram.com/example" },
      { url: "https://instagram.com.example.org/fake" },
      { bad: "https://tiktok.com/@fake" },
      "https://tiktok.com/@real",
    ]);
    expect(profiles.map((profile) => profile.handle).sort()).toEqual(["example", "real"]);
  });
});
