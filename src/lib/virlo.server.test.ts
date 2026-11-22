import { afterEach, describe, expect, it, vi } from "vitest";
import { buildVirloSearch, callVirlo, searchVirlo, VirloError } from "./virlo.server";
import { buildVirloOperation } from "./virlo-catalog";

describe("Virlo research transport", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("handles Virlo's empty successful removal response", async () => {
    vi.stubEnv("VIRLO_API_KEY", "test-secret"); vi.stubEnv("VIRLO_ENABLED", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    const id = "4c3f0031-7e08-4e28-a7c6-432118a60614";
    await expect(callVirlo(buildVirloOperation({ operation: "research_delete", id }))).resolves.toMatchObject({ data: { deleted: true }, receipt: { status: 204 } });
  });
  it("allows only a pure research-agent pause while disabled", async () => {
    vi.stubEnv("VIRLO_API_KEY", "test-secret"); vi.stubEnv("VIRLO_ENABLED", "false");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { active: false } }), { status: 200 }));
    vi.stubGlobal("fetch", fetcher);
    const id = "4c3f0031-7e08-4e28-a7c6-432118a60614";
    await expect(callVirlo(buildVirloOperation({ operation: "research_update", id, active: false }), true)).resolves.toMatchObject({ data: { active: false } });
    await expect(callVirlo(buildVirloOperation({ operation: "research_update", id, active: false, name: "Changed name" }), true)).rejects.toThrow("disabled");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("uses a fixed endpoint and documented library search shape", () => {
    expect(buildVirloSearch({ kind: "creators", query: " skincare ", platform: "tiktok", page: 2 })).toEqual({
      url: "https://api.virlo.ai/v1/search/creators",
      body: { scope: "virlo_library", topics: ["skincare"], platforms: ["tiktok"], page: 2 },
    });
    expect(() => buildVirloSearch({ kind: "videos", query: "x", page: 1 })).toThrow();
    expect(() => buildVirloSearch({ kind: "videos", query: "skincare", page: 41 })).toThrow();
  });

  it("does not make a request without configuration", async () => {
    vi.stubEnv("VIRLO_API_KEY", "");
    const fetcher = vi.fn();
    await expect(searchVirlo({ kind: "videos", query: "skincare" }, fetcher)).rejects.toThrow("not configured");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns the provider receipt without exposing the key", async () => {
    vi.stubEnv("VIRLO_API_KEY", "test-secret");
    vi.stubEnv("VIRLO_ENABLED", "true");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { videos: [] } }), { status: 200, headers: { "X-Cost": "0.05", "X-Credits-Used": "5" } }));
    const result = await searchVirlo({ kind: "videos", query: "skincare" }, fetcher);
    expect(result).toEqual({ data: { videos: [] }, receipt: { status: 200, costUsd: 0.05, creditsUsed: 5 } });
    expect(JSON.stringify(result)).not.toContain("test-secret");
  });

  it("does not retry uncertain failures", async () => {
    vi.stubEnv("VIRLO_API_KEY", "test-secret");
    vi.stubEnv("VIRLO_ENABLED", "true");
    const fetcher = vi.fn().mockRejectedValue(new Error("network failure"));
    await expect(searchVirlo({ kind: "videos", query: "skincare" }, fetcher)).rejects.toBeInstanceOf(VirloError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not contact Virlo when disabled even if a key exists", async () => {
    vi.stubEnv("VIRLO_API_KEY", "test-secret");
    vi.stubEnv("VIRLO_ENABLED", "false");
    const fetcher = vi.fn();
    await expect(searchVirlo({ kind: "videos", query: "skincare" }, fetcher)).rejects.toThrow("disabled");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends allowlisted operations without following redirects and retains reported cost", async () => {
    vi.stubEnv("VIRLO_API_KEY", "test-secret"); vi.stubEnv("VIRLO_ENABLED", "true");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { hooks: [] } }), { headers: { "X-Cost": "0.25" } }));
    vi.stubGlobal("fetch", fetcher);
    const result = await callVirlo(buildVirloOperation({ operation: "hooks", query: "coffee", page: 1 }));
    expect(result.receipt.costUsd).toBe(0.25);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", redirect: "error" });
  });

  it("allows only a confirmed tracking pause while the provider is disabled", async () => {
    vi.stubEnv("VIRLO_API_KEY", "test-secret"); vi.stubEnv("VIRLO_ENABLED", "false");
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { status: "paused" } })));
    vi.stubGlobal("fetch", fetcher);
    const pause = buildVirloOperation({ operation: "tracking_update", kind: "creators", id: "4c3f0031-7e08-4e28-a7c6-432118a60614", status: "paused" });
    await expect(callVirlo(pause, true)).resolves.toMatchObject({ data: { status: "paused" } });
    const resume = buildVirloOperation({ operation: "tracking_update", kind: "creators", id: "4c3f0031-7e08-4e28-a7c6-432118a60614", status: "active" });
    await expect(callVirlo(resume, true)).rejects.toThrow("disabled");
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
