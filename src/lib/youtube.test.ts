import { describe, expect, it } from "vitest";
import { BlockSchema, filterBlocksForModule } from "@/lib/sam.blocks";
import { MODULE_CONTRACTS } from "@/brand/modules";
import type { ModuleId } from "@/brand/tokens";
import { YouTubeBrowseInputSchema, YouTubeVideoSchema, youtubePlayerError, youtubeWatchUrl } from "./youtube";

const gallery = { type: "youtube_gallery", title: "References", query: "AI product video", video_ids: ["M7lc1UVf-VE"] };

describe("YouTube reference blocks", () => {
  it("limits sorting to supported search and channel orders", () => {
    const channel_id = "UCabcdefghijklmnopqrstuv";
    for (const order of ["relevance", "date", "viewCount"]) expect(YouTubeBrowseInputSchema.safeParse({ query: "dragon", order }).success).toBe(true);
    for (const order of ["date", "viewCount"]) expect(YouTubeBrowseInputSchema.safeParse({ channel_id, order }).success).toBe(true);
    expect(YouTubeBrowseInputSchema.safeParse({ query: "dragon", order: "oldest" }).success).toBe(false);
    expect(YouTubeBrowseInputSchema.safeParse({ order: "date" }).success).toBe(false);
    expect(YouTubeBrowseInputSchema.safeParse({ channel_id, order: "relevance" }).success).toBe(false);
  });
  it("allows references in every stage, preserving selection but stripping stale metadata", () => {
    const input = { ...gallery, selected_video_id: gallery.video_ids[0], videos: [{ title: "Old title", viewCount: 100 }] };
    const expected = { ...gallery, selected_video_id: gallery.video_ids[0] };
    expect(BlockSchema.parse(input)).toEqual(expected);
    for (const module of Object.keys(MODULE_CONTRACTS) as ModuleId[]) expect(filterBlocksForModule(module, [input])).toEqual([expected]);
  });

  it("rejects URLs, malformed IDs, invalid selection and oversized galleries", () => {
    for (const id of ["https://youtube.com/watch?v=M7lc1UVf-VE", "short", "<script>bad", "M7lc1UVf-VE?x"]) {
      expect(BlockSchema.safeParse({ ...gallery, video_ids: [id] }).success).toBe(false);
    }
    expect(BlockSchema.safeParse({ ...gallery, selected_video_id: "bad" }).success).toBe(false);
    expect(BlockSchema.safeParse({ ...gallery, video_ids: Array(9).fill(gallery.video_ids[0]) }).success).toBe(false);
    expect(BlockSchema.safeParse({ ...gallery, video_ids: [] }).success).toBe(false);
  });

  it("keeps unavailable metrics absent instead of turning them into zero", () => {
    const video = YouTubeVideoSchema.parse({ id: gallery.video_ids[0], title: "A reference", channelTitle: "Creator", description: "", embeddable: false, available: true });
    expect(video.viewCount).toBeUndefined();
    expect(video.likeCount).toBeUndefined();
    expect(video.commentCount).toBeUndefined();
  });

  it("uses validated direct YouTube links and specific playback fallbacks", () => {
    expect(youtubeWatchUrl(gallery.video_ids[0])).toBe("https://www.youtube.com/watch?v=M7lc1UVf-VE");
    expect(() => youtubeWatchUrl("javascript:bad")).toThrow();
    expect(youtubePlayerError(100)).toContain("private");
    expect(youtubePlayerError(101)).toContain("does not allow");
    expect(youtubePlayerError(150)).toBe(youtubePlayerError(101));
    expect(youtubePlayerError(153)).toContain("identify");
  });
});
