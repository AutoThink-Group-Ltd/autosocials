import { describe, expect, it, vi } from "vitest";
import { creativeSettingsDuration, getCreativeCapability, safeCreativeSettings, validateCreativeSettings, type CreativeCapabilityId } from "../lib/creative-providers/registry";
import { creativeRetryAfterMs, submitCreativeProviderJob } from "../lib/creative-providers/adapters.server";

const image = "https://cdn.example.com/first.jpg", last = "https://cdn.example.com/last.jpg", video = "https://cdn.example.com/source.mp4";
const env = { HF_API_KEY_ID: "fixture-id", HF_API_KEY_SECRET: "fixture-secret" };
const receipt = () => new Response(JSON.stringify({ request_id: "fixture-job", status: "queued" }), { headers: { "Content-Type": "application/json" } });

describe("documented creative model contracts", () => {
  it("preserves exact endpoint and keyframe parameter names through submission", async () => {
    const cases: Array<[CreativeCapabilityId, string, Record<string, unknown>]> = [
      ["higgsfield-ltx-fast-text-video", "lightricks/ltx-2.5/text-to-video/fast", { prompt: "Ocean scene", duration: 8, fps: 48, camera_movement: "dolly_in" }],
      ["higgsfield-ltx-fast-image-video", "lightricks/ltx-2.5/image-to-video/fast", { prompt: "Ocean scene", image_url: image, end_image_url: last }],
      ["higgsfield-kling3-image-video", "kling-video/v3.0/pro/image-to-video", { prompt: "Slow reveal", image_url: image, last_image_url: last }],
      ["higgsfield-kling-o3-keyframes", "kling-video/o3/first-last-frame", { prompt: "Slow reveal", first_frame_url: image, last_frame_url: last }],
      ["higgsfield-wan-reference-video", "alibaba/wan-3.0-prime/reference-to-video", { prompt: "Explain the guide", file_url: "https://cdn.example.com/guide.pdf" }],
      ["higgsfield-seedance-video-extend", "bytedance/seedance-2.5/video-extend", { prompt: "Continue the movement", video_url: video, duration: 12 }],
    ];
    for (const [capabilityId, endpoint, settings] of cases) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(receipt());
      await expect(submitCreativeProviderJob({ capabilityId, settings, idempotencyKey: `fixture-${capabilityId}` }, { fetch: fetcher, env })).resolves.toMatchObject({ requestId: "fixture-job", status: "queued" });
      const [url, init] = fetcher.mock.calls[0]!;
      expect(url).toBe(`https://api.higgsfield.ai/${endpoint}`);
      expect(JSON.parse(String(init?.body))).toMatchObject(settings);
      expect(init?.headers).toMatchObject({ "Idempotency-Key": `fixture-${capabilityId}` });
    }
  });
  it("rejects model controls that belong to a different route", () => {
    expect(() => validateCreativeSettings("higgsfield-ltx-fast-text-video", { prompt: "Scene", duration: 15 })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-ltx-fast-image-video", { prompt: "Scene", image_url: image, fps: 30 })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-kling3-image-video", { prompt: "Scene", image_url: image, end_image_url: last })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-kling-o3-keyframes", { prompt: "Scene", image_url: image })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-kling3-image-video", { prompt: "Scene", image_url: image, elements: ["not-account-id"] })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-wan-reference-video", { prompt: "Scene", file_url: image, link_url: "https://example.com/" })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-seedance-video-extend", { prompt: "Continue", video_url: video, video_urls: Array(10).fill(video) })).toThrow();
  });
  it("budgets custom Kling shots by their sum instead of top-level duration", () => {
    const parsed = validateCreativeSettings("higgsfield-kling-o3-keyframes", { prompt: "Two-stage reveal", first_frame_url: image, duration: 5, multi_shots: true, multi_prompt: [{ prompt: "Opening", duration: 10 }, { prompt: "Ending", duration: 12 }] });
    expect(creativeSettingsDuration(parsed)).toBe(22);
    expect(safeCreativeSettings("higgsfield-kling-o3-keyframes", parsed)).toMatchObject({ effective_duration: 22, multi_prompt_count: 2 });
    expect(() => validateCreativeSettings("higgsfield-kling-o3-keyframes", { prompt: "Scene", first_frame_url: image, multi_shots: true })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-kling3-image-video", { prompt: "Scene", image_url: image, multi_prompt: [{ prompt: "Shot", duration: 5 }] })).toThrow();
  });
  it("keeps document thinking explicit and does not call mocked timings live observations", () => {
    expect(validateCreativeSettings("higgsfield-wan-reference-video", { prompt: "Explain guide", file_url: "https://cdn.example.com/guide.md" })).toMatchObject({ enable_thinking: true });
    const capability = getCreativeCapability("higgsfield-ltx-fast-image-video");
    expect(capability.verification).toMatchObject({ registryVersion: 4, implemented: true, contractCheckedAt: "2026-11-02", liveTestedAt: null, observedLatencyMs: null });
    expect(capability.assetRoles).toMatchObject({ image_url: "first_frame", end_image_url: "last_frame" });
    expect(capability.controls?.find((control) => control.key === "duration")).toMatchObject({ type: "select", options: [6, 8, 10] });
  });
  it("retains Retry-After seconds and dates without retrying a rejected submission", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("busy", { status: 429, headers: { "Retry-After": "17" } }));
    await expect(submitCreativeProviderJob({ capabilityId: "higgsfield-ltx-fast-text-video", settings: { prompt: "Scene" }, idempotencyKey: "fixture-rate-limit" }, { fetch: fetcher, env })).rejects.toMatchObject({ code: "rate_limited", retryable: true, retryAfterMs: 17000 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(creativeRetryAfterMs("Mon, 02 Nov 2026 10:00:10 GMT", Date.parse("2026-11-02T10:00:00Z"))).toBe(10000);
    expect(creativeRetryAfterMs("invalid")).toBeUndefined();
  });
});
