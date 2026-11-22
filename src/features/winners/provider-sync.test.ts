import { afterEach, describe, expect, it, vi } from "vitest";
import { metaPage, tiktokPage, youtubePage, type Account } from "../../../supabase/functions/_shared/winner-providers";

const account = (platform: string): Account => ({ id: "account", workspace_id: "workspace", platform, external_id: "external", access_token: "token", refresh_token: null, expires_at: null, scopes: [], status: "connected", is_enabled: true });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
afterEach(() => vi.unstubAllGlobals());

describe("social provider pages", () => {
  it("imports Meta pages and preserves a provider cursor and missing comments", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => String(input).includes("/comments?")
      ? response({ error: { message: "denied" } }, 403)
      : response({ data: [{ id: "ig1", timestamp: "2026-11-01T00:00:00Z", media_type: "VIDEO", like_count: 7 }], paging: { next: "present", cursors: { after: "next-page" } } })));
    const page = await metaPage(account("instagram"), "token", null);
    expect(page.cursor).toBe("next-page");
    expect(page.rows[0]).toMatchObject({ external_id: "ig1", likes: 7, shares: null, comments_status: "unavailable" });
  });
  it("loads a YouTube upload page, its observed counts and text comments", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("/channels?")) return response({ items: [{ contentDetails: { relatedPlaylists: { uploads: "uploads" } } }] });
      if (url.includes("/playlistItems?")) return response({ items: [{ contentDetails: { videoId: "v1" } }], nextPageToken: "next" });
      if (url.includes("/videos?")) return response({ items: [{ id: "v1", snippet: { publishedAt: "2026-11-01T00:00:00Z" }, statistics: { viewCount: "42" } }] });
      return response({ items: [{ snippet: { topLevelComment: { snippet: { textDisplay: "Helpful" } } } }] });
    }));
    const page = await youtubePage(account("youtube"), "token", null);
    expect(page.cursor).toBe("next");
    expect(page.rows[0]).toMatchObject({ views: 42, likes: null, comments: [{ text: "Helpful" }] });
  });
  it("imports TikTok metrics and clearly marks comment text unsupported", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({ data: { videos: [{ id: "t1", create_time: 1, view_count: 100 }], has_more: true, cursor: 123 }, error: { code: "ok" } })));
    const page = await tiktokPage("token", null);
    expect(page.cursor).toBe("123");
    expect(page.rows[0]).toMatchObject({ views: 100, likes: null, comments_status: "unsupported" });
  });
});
