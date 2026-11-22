import { describe, expect, it, vi } from "vitest";
import { estimateCreativeProviderJob, getCreativeProviderAvailability, pollCreativeProviderJob, submitCreativeProviderJob } from "./adapters.server";

const env = { HEYGEN_API_KEY: "test-key", RENDER_SERVER_URL: "https://renderer.example", RENDER_SERVER_SECRET: "test-render" };
const base = { avatar_id: "Daphne_public_4", duration: 30, aspect_ratio: "9:16" };

describe("HeyGen production adapter", () => {
  it("reports a configured route as unverified until a paid render succeeds", () => {
    expect(getCreativeProviderAvailability(env).find((entry) => entry.capabilityId === "heygen-avatar")).toMatchObject({ available: true, reason: "configured_unverified" });
  });
  it("calculates a conservative quote from the approved duration without submitting", async () => {
    const fetcher = vi.fn();
    await expect(estimateCreativeProviderJob({ capabilityId: "heygen-avatar", settings: base }, { env, fetch: fetcher })).resolves.toEqual({ usd: "0.4950" });
    expect(fetcher).not.toHaveBeenCalled();
    await expect(estimateCreativeProviderJob({ capabilityId: "heygen-avatar", settings: { ...base, duration: 61 } }, { env })).rejects.toMatchObject({ code: "invalid_input" });
  });
  it("requires the trusted narration URL at submission and preserves the idempotency key", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { video_id: "v_123" } })));
    await expect(submitCreativeProviderJob({ capabilityId: "heygen-avatar", settings: base, idempotencyKey: "job_123" }, { env, fetch: fetcher })).rejects.toMatchObject({ code: "invalid_input" });
    const result = await submitCreativeProviderJob({ capabilityId: "heygen-avatar", settings: { ...base, audio_url: "https://storage.example.com/signed.wav" }, idempotencyKey: "job_123" }, { env, fetch: fetcher });
    expect(result).toMatchObject({ requestId: "v_123", status: "queued" });
    expect(fetcher.mock.calls[0][1].headers["Idempotency-Key"]).toBe("job_123");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toMatchObject({ audio_url: "https://storage.example.com/signed.wav", engine: { type: "avatar_iii" } });
  });
  it("backs off when polling is rate limited", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 429, headers: { "Retry-After": "3" } }));
    await expect(pollCreativeProviderJob({ capabilityId: "heygen-avatar", requestId: "v_123" }, { env, fetch: fetcher })).rejects.toMatchObject({ code: "rate_limited", retryable: true, retryAfterMs: 3000 });
  });
  it("never follows caller-controlled poll URLs and returns completed output", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { id: "v_123", status: "completed", video_url: "https://files.heygen.ai/a.mp4", duration: 20 } })));
    await expect(pollCreativeProviderJob({ capabilityId: "heygen-avatar", requestId: "v_123", statusUrl: "https://evil.example" }, { env, fetch: fetcher })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(pollCreativeProviderJob({ capabilityId: "heygen-avatar", requestId: "v_123" }, { env, fetch: fetcher })).resolves.toMatchObject({ status: "completed", durationSeconds: 20, outputs: [{ type: "video", url: "https://files.heygen.ai/a.mp4" }] });
  });
  it("marks ambiguous submission as requiring reconciliation", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    await expect(submitCreativeProviderJob({ capabilityId: "heygen-avatar", settings: { ...base, audio_url: "https://storage.example.com/signed.wav" }, idempotencyKey: "job_123" }, { env, fetch: fetcher })).rejects.toMatchObject({ code: "reconciliation_required" });
  });
});
