import { beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
vi.mock("./personal-brand-safe-media.server", () => ({ fetchPinnedPublicMedia: vi.fn() }));
import { fetchPinnedPublicMedia } from "./personal-brand-safe-media.server";
import { fetchResearchVideo } from "./research-frames.server";
const pinned = vi.mocked(fetchPinnedPublicMedia);
describe("video download", () => {
  beforeEach(() => pinned.mockReset());
  it("uses pinned fetch on every redirect and writes bounded video bytes", async () => {
    pinned.mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://b.fbcdn.net/video" } }));
    pinned.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "video/mp4" } }));
    const dir = await fs.mkdtemp(join(tmpdir(), "as-video-test-")); const path = join(dir, "test.mp4");
    try {
      await fetchResearchVideo("https://a.fbcdn.net/video", path);
      expect(pinned).toHaveBeenCalledTimes(2);
      expect(pinned.mock.calls[1]?.[0]).toBe("https://b.fbcdn.net/video");
      expect([...await fs.readFile(path)]).toEqual([1, 2, 3]);
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  });
  it("rejects non-video content", async () => {
    pinned.mockResolvedValueOnce(new Response("bad", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(fetchResearchVideo("https://a.fbcdn.net/video", join(tmpdir(), "unused-as-video"))).rejects.toThrow("Unexpected video content type");
  });
});
