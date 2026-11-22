import { describe, expect, it } from "vitest";
import { extractLinkedInPosts } from "./personal-linkedin";

describe("personal LinkedIn posts", () => {
  const now = Date.parse("2026-11-14T12:00:00Z");
  const post = { author: { publicIdentifier: "person" }, postedAt: { date: "2026-11-01T12:00:00Z" }, linkedinUrl: "https://www.linkedin.com/posts/person_123", content: "My own commentary" };
  const collect = (rows: unknown[]) => extractLinkedInPosts("https://www.linkedin.com/in/person/", { data: { alexandria: [{ data: { elements: rows } }] } }, now);
  it("keeps only recent, uniquely linked posts written by the saved profile", () => {
    const result = collect([post, post, { ...post, author: { publicIdentifier: "someone-else" } }, { ...post, repostedBy: { publicIdentifier: "person" } }, { ...post, linkedinUrl: "https://evil.example/posts/123" }, { ...post, postedAt: { date: "2026-01-01" } }]);
    expect(result).toHaveLength(1);
    expect(result[0]?.caption).toBe("My own commentary");
  });
  it("rejects provider errors and mismatched profile URLs", () => {
    expect(extractLinkedInPosts("https://www.linkedin.com/company/person/", { data: { alexandria: [{ data: { elements: [post] } }] } }, now)).toEqual([]);
    expect(extractLinkedInPosts("https://www.linkedin.com/in/person/", { data: { alexandria: [{ error: "unavailable", data: { elements: [post] } }] } }, now)).toEqual([]);
  });
  it("selects only the matched author's transient media", () => {
    const video = { videoUrl: "https://dms.licdn.com/video?token=temporary", thumbnailUrl: "https://media.licdn.com/cover" };
    expect(collect([{ ...post, postVideo: video }])[0]).toMatchObject({ videoUrl: video.videoUrl, coverUrl: video.thumbnailUrl });
    expect(collect([{ ...post, author: { publicIdentifier: "someone-else" }, postVideo: video }])).toEqual([]);
  });
});
