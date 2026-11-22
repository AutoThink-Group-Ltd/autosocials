import { describe, expect, it } from "vitest";
import { personalVideoInput } from "./research-provider.server";
import { extractResearchAudio } from "./research-frames.server";
import { fetchPersonalImage } from "./personal-brand-media.server";
import type { ResearchPost } from "./research";
const post = { id: "instagram:123", media_type: "video" } as ResearchPost;
describe("personal video input", () => {
  it("selects the matched post media and duration without persisting it", () => {
    expect(personalVideoInput("instagram", post, [{ id: "123", videoUrl: "https://cdn.example/video", videoDuration: 12 }])).toEqual({ id: "instagram:123", videoUrl: "https://cdn.example/video", durationSeconds: 12 });
  });
  it("does not inspect unknown duration or unrelated media", () => {
    expect(personalVideoInput("instagram", post, [{ id: "123", videoUrl: "https://cdn.example/video" }])).toBeNull();
    expect(personalVideoInput("instagram", post, [{ id: "456", videoUrl: "https://cdn.example/video", videoDuration: 12 }])).toBeNull();
  });
});

describe("personal image safety", () => {
  it("rejects local, untrusted and credential-bearing image URLs", async () => {
    expect(await fetchPersonalImage("http://127.0.0.1/x.jpg")).toBeNull();
    expect(await fetchPersonalImage("https://example.com/x.jpg")).toBeNull();
    expect(await fetchPersonalImage("https://user:pass@image.fbcdn.net/x.jpg")).toBeNull();
    expect(await fetchPersonalImage("https://user:pass@media.licdn.com/x.jpg")).toBeNull();
    expect(await fetchPersonalImage("https://media.licdn.com.evil.example/x.jpg")).toBeNull();
  });
});

describe("bounded audio extraction", () => {
  it("rejects unknown and over-five-minute durations before fetching", async () => {
    expect(await extractResearchAudio("https://untrusted.example/video", null)).toBeNull();
    expect(await extractResearchAudio("https://untrusted.example/video", 301)).toBeNull();
  });
});
