import { afterEach, describe, expect, it, vi } from "vitest";
import { browseYouTubePublic, readYouTubeVideos, searchYouTube, readYouTubeComments, researchYouTubeProduction } from "./youtube.server";
import { isVideoResearchIntent } from "./sam-youtube";

const id = "M7lc1UVf-VE";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const channelId = "UCabcdefghijklmnopqrstuv";
const publicVideo = { id, snippet: { title: "Demo", channelTitle: "Creator", channelId }, status: { embeddable: true } };
const publicChannel = { id: channelId, snippet: { title: "Creator", thumbnails: { default: { url: "https://example.com/avatar.jpg" } } }, contentDetails: { relatedPlaylists: { uploads: "UUabcdefghijklmnopqrstuv" } } };
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("YouTube public data boundary", () => {
  it("fetches GB popular videos and batch-decorates channel avatars", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const fetcher = vi.fn().mockResolvedValueOnce(json({ items: [publicVideo, { ...publicVideo, id: "abcdefghijk" }], nextPageToken: "NEXT=" })).mockResolvedValueOnce(json({ items: [publicChannel] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await browseYouTubePublic({ page_token: "OPAQUE=" });
    expect(result.next_page_token).toBe("NEXT=");
    expect(result.videos[0]).toMatchObject({ channelId, channelAvatarUrl: "https://example.com/avatar.jpg" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const home = new URL(String(fetcher.mock.calls[0]?.[0]));
    expect(Object.fromEntries(home.searchParams)).toMatchObject({ chart: "mostPopular", regionCode: "GB", maxResults: "8", pageToken: "OPAQUE=" });
    const channels = new URL(String(fetcher.mock.calls[1]?.[0]));
    expect(channels.searchParams.get("id")).toBe(channelId);
  });
  it.each([undefined, "date"] as const)("browses channel uploads with playlist pagination without search for order %s", async (order) => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const fetcher = vi.fn().mockResolvedValueOnce(json({ items: [publicChannel] })).mockResolvedValueOnce(json({ items: [{ contentDetails: { videoId: id } }], nextPageToken: "NEXT=" })).mockResolvedValueOnce(json({ items: [publicVideo] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await browseYouTubePublic({ channel_id: channelId, page_token: "PAGE=", order });
    expect(result.channel).toMatchObject({ id: channelId, title: "Creator" });
    expect(result.videos[0]?.channelAvatarUrl).toBe("https://example.com/avatar.jpg");
    expect(result.next_page_token).toBe("NEXT=");
    expect(fetcher.mock.calls.map((call) => new URL(String(call[0])).pathname.split("/").at(-1))).toEqual(["channels", "playlistItems", "videos"]);
    expect(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams.get("pageToken")).toBe("PAGE=");
  });
  it("uses official channel view ordering and preserves provider order across detail lookups", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const fetcher = vi.fn().mockResolvedValueOnce(json({ items: [publicChannel] }))
      .mockResolvedValueOnce(json({ items: [{ id: { videoId: "abcdefghijk" } }, { id: { videoId: id } }], nextPageToken: "NEXT=" }))
      .mockResolvedValueOnce(json({ items: [publicVideo, { ...publicVideo, id: "abcdefghijk" }] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await browseYouTubePublic({ channel_id: channelId, order: "viewCount", page_token: "PAGE=" });
    expect(result.videos.map((video) => video.id)).toEqual(["abcdefghijk", id]);
    expect(result.channel?.id).toBe(channelId);
    expect(result.next_page_token).toBe("NEXT=");
    expect(fetcher.mock.calls.map((call) => new URL(String(call[0])).pathname.split("/").at(-1))).toEqual(["channels", "search", "videos"]);
    expect(Object.fromEntries(new URL(String(fetcher.mock.calls[1]?.[0])).searchParams)).toMatchObject({ channelId, type: "video", order: "viewCount", pageToken: "PAGE=", maxResults: "8" });
  });
  it.each(["relevance", "date", "viewCount"] as const)("passes search order %s to the official API", async (order) => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const fetcher = vi.fn().mockResolvedValue(json({ items: [], nextPageToken: "NEXT=" }));
    vi.stubGlobal("fetch", fetcher);
    expect((await browseYouTubePublic({ query: "dragon", order, page_token: "PAGE=" })).next_page_token).toBe("NEXT=");
    expect(Object.fromEntries(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams)).toMatchObject({ q: "dragon", order, pageToken: "PAGE=" });
  });
  it("returns paginated search results with at most eight video references", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const fetcher = vi.fn().mockResolvedValueOnce(json({ items: [{ id: { videoId: id } }], nextPageToken: "NEXT=" })).mockResolvedValueOnce(json({ items: [{ ...publicVideo, snippet: { title: "Demo", channelTitle: "Creator" } }] }));
    vi.stubGlobal("fetch", fetcher);
    expect((await browseYouTubePublic({ query: "dragon", page_token: "PAGE=" })).next_page_token).toBe("NEXT=");
    expect(Object.fromEntries(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams)).toMatchObject({ q: "dragon", maxResults: "8", type: "video", pageToken: "PAGE=" });
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).searchParams.has("order")).toBe(false);
  });
  it.each([{ channel_id: "../../private" }, { page_token: "x".repeat(513) }, { page_token: "bad\nvalue" }, { query: "x" }, { query: "dragon", channel_id: channelId }])("rejects invalid browse input before provider requests: %o", async (input) => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(browseYouTubePublic(input)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("fails clearly when no API key is configured", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "");
    await expect(searchYouTube("cinematic property")).rejects.toThrow("YOUTUBE_API_KEY");
  });
  it("keeps missing counts unknown, unavailable IDs explicit and API keys out of URLs", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const fetcher = vi.fn().mockResolvedValue(json({ items: [{ id, snippet: { title: "Demo", channelTitle: "Creator", description: "A claim" }, status: { embeddable: false } }] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await readYouTubeVideos([id, "abcdefghijk"]);
    expect(result.videos[0]).toMatchObject({ title: "Demo", embeddable: false, available: true });
    expect(result.videos[0]?.viewCount).toBeUndefined();
    expect(result.videos[1]).toMatchObject({ available: false, embeddable: false });
    expect(String(fetcher.mock.calls[0]?.[0])).not.toContain("private-key");
    expect(fetcher.mock.calls[0]?.[1]?.headers["X-Goog-Api-Key"]).toBe("private-key");
  });
  it("uses official search then one batched metadata lookup", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const fetcher = vi.fn().mockResolvedValueOnce(json({ items: [{ id: { videoId: id } }] })).mockResolvedValueOnce(json({ items: [{ id, snippet: { title: "Demo", channelTitle: "Creator" }, statistics: { viewCount: "0", likeCount: "123" }, status: { embeddable: true } }] }));
    vi.stubGlobal("fetch", fetcher);
    const result = await searchYouTube("baby dragon giving birth");
    expect(result.video_ids).toEqual([id]);
    expect(result.videos[0]).toMatchObject({ viewCount: 0, likeCount: 123 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(new URL(String(fetcher.mock.calls[0]?.[0])).hostname).toBe("www.googleapis.com");
  });
  it("handles an empty search without a second request", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    const fetcher = vi.fn().mockResolvedValue(json({ items: [] })); vi.stubGlobal("fetch", fetcher);
    expect((await searchYouTube("nothing here")).videos).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("reports quota exhaustion without raw provider errors or secrets", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { message: "secret raw", errors: [{ reason: "quotaExceeded" }] } }, 403)));
    await expect(readYouTubeVideos([id])).rejects.toThrow("quota");
  });
  it("handles disabled comments explicitly", async () => {
    vi.stubEnv("YOUTUBE_API_KEY", "private-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { errors: [{ reason: "commentsDisabled" }] } }, 403)));
    expect(await readYouTubeComments(id)).toMatchObject({ comments: [], notice: "Comments are disabled for this video." });
  });
  it("rejects crafted IDs before issuing requests", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(readYouTubeVideos(["../../private"])).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not pretend external research is available without configuration", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    expect(await researchYouTubeProduction("Dragon", "Creator")).toMatchObject({ sources: [] });
  });
});

describe("research cannot enter the charged direct-video shortcut", () => {
  it.each(["What's the difference between Higgsfield models?", "Which model should I use for a property video?", "Find the baby dragon giving birth video", "Show me YouTube examples", "How was this made?", "Show me official Higgsfield demos for cinematic property video", "Recommend a Higgsfield model for cinematic property video", "Show me Higgsfield models for this property"])("routes %s to research", (message) => expect(isVideoResearchIntent(message)).toBe(true));
  it("preserves explicit generation intent", () => expect(isVideoResearchIntent("Animate these photos with Kling")).toBe(false));
});
