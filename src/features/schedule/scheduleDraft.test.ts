import { beforeEach, describe, expect, it } from "vitest";
import { clearScheduleDraft, readScheduleDraft, scheduleDraftKey, writeScheduleDraft } from "./scheduleDraft";

describe("schedule draft", () => {
  beforeEach(() => { const values = new Map<string, string>(); Object.defineProperty(window, "localStorage", { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } }); });
  it("isolates users and workspaces and retains an identical uncertain request", () => {
    const pendingRequest = { workspace_id: "w", items: [{ type: "tile" as const, id: "i", scheduled_at: "2026-11-20T09:00:00Z", captions: { facebook: "  Exact\ncaption  " }, account_ids: ["a"], immediate: true }], account_ids: ["a"], request_id: "request", confirmed: true as const };
    const draft = { selected: ["tile:i"], destinations: ["a"], day: "2026-11-20", clock: "09:00", startNow: true, items: [{ ...pendingRequest.items[0]!, title: "Tile" }], assumptions: "", uncertain: true, requestId: "request", pendingRequest };
    expect(writeScheduleDraft("u", "w", draft)).toBe(true);
    expect(writeScheduleDraft("u", "w", { ...draft, uncertain: false, pendingRequest: null })).toBe(false);
    expect(writeScheduleDraft("u", "w", { ...draft, pendingRequest: { ...pendingRequest, request_id: "another" } })).toBe(false);
    expect(readScheduleDraft("u", "w")?.pendingRequest).toEqual(pendingRequest);
    expect(readScheduleDraft("other", "w")).toBeNull();
    expect(readScheduleDraft("u", "other")).toBeNull();
    clearScheduleDraft("u", "w"); expect(window.localStorage.getItem(scheduleDraftKey("u", "w"))).toBeNull();
  });
  it("retains written post selections and text in a mixed draft", () => {
    const draft = { selected: ["tile:tile", "video:video", "written:post"], destinations: ["account"], day: "2026-11-20", clock: "09:00", startNow: false, items: [{ type: "written" as const, id: "post", title: "Post", source_caption: "Original post text", scheduled_at: "2026-11-20T09:00:00Z", captions: { linkedin: "Original post text" }, account_ids: ["account"] }], assumptions: "", uncertain: false, requestId: "request", pendingRequest: null };
    expect(writeScheduleDraft("u", "w", draft)).toBe(true);
    expect(readScheduleDraft("u", "w")?.items?.[0]?.captions.linkedin).toBe("Original post text");
    expect(readScheduleDraft("u", "w")?.items?.[0]?.source_caption).toBe("Original post text");
    const pendingRequest = { workspace_id: "w", items: [{ type: "written" as const, id: "post", source_caption: "Original post text", scheduled_at: "2026-11-20T09:00:00Z", captions: { linkedin: "Edited channel text" }, account_ids: ["account"], immediate: false }], account_ids: ["account"], request_id: "request", confirmed: true as const };
    expect(writeScheduleDraft("u", "w", { ...draft, uncertain: true, pendingRequest })).toBe(true);
    expect(readScheduleDraft("u", "w")?.pendingRequest).toEqual(pendingRequest);
  });
  it("rejects an uncertain draft without its retry payload", () => {
    window.localStorage.setItem(scheduleDraftKey("u", "w"), JSON.stringify({ selected: [], destinations: [], day: "", clock: "", startNow: false, items: null, assumptions: "", uncertain: true, requestId: "x", pendingRequest: null }));
    expect(readScheduleDraft("u", "w")).toBeNull();
  });
});

