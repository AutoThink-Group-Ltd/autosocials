import { describe, expect, it } from "vitest";
import { accountsForWorkspace, normalizeConnectedPosts } from "./personal-connected-feeds";
const now = Date.parse("2026-11-14T12:00:00Z");
const post = (permalink: string, timestamp = "2026-11-01T00:00:00Z") => ({ permalink, timestamp, caption: "Hello" });
describe("connected feed evidence", () => {
  it("accepts only HTTPS links on the requested platform and rejects lookalikes", () => {
    const rows = [post("https://www.instagram.com/p/one"), post("https://instagram.com.evil.test/p/two"), post("http://instagram.com/p/three"), post("https://x.com/user/status/1"), post("https://user:pass@instagram.com/p/four")];
    expect(normalizeConnectedPosts("instagram", rows, now).map((item) => item.url)).toEqual(["https://www.instagram.com/p/one"]);
  });
  it("enforces the one-year window, deduplicates, orders and caps posts", () => {
    const rows = [post("https://x.com/a/status/1", "2025-01-01T00:00:00Z"), post("https://x.com/a/status/2", "2026-11-15T00:00:00Z"), ...Array.from({length: 25}, (_, i) => post(`https://x.com/a/status/${i+3}`)), post("https://x.com/a/status/3")];
    const result = normalizeConnectedPosts("x", rows, now);
    expect(result).toHaveLength(20);
    expect(result.some((item) => item.url.endsWith("/1") || item.url.endsWith("/2"))).toBe(false);
    expect(new Set(result.map((item) => item.url)).size).toBe(20);
  });
  it("includes a five-month-old Facebook post within the connected feed window", () => {
    expect(normalizeConnectedPosts("facebook", [post("https://www.facebook.com/page/posts/1", "2026-06-01T00:00:00Z")], now)).toHaveLength(1);
  });
  it("keeps only accounts bound to the requested workspace", () => {
    expect(accountsForWorkspace("one", [{ workspace_id: "one", id: 1 }, { workspace_id: "two", id: 2 }])).toEqual([{ workspace_id: "one", id: 1 }]);
  });
});
