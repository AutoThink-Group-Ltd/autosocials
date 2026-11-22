import { afterEach, describe, expect, it, vi } from "vitest";
import { getCreativeCapability, listCreativeCapabilities, safeCreativeSettings, validateCreativeSettings } from "../lib/creative-providers/registry";
import { cancelCreativeProviderJob, CreativeProviderError, estimateCreativeProviderJob, getCreativeProviderAvailability, parseCreativeOutputUrl, parseCreativeProviderJob, pollCreativeProviderJob, submitCreativeProviderJob } from "../lib/creative-providers/adapters.server";

const env = { HF_API_KEY_ID: "test-id", HF_API_KEY_SECRET: "test-secret", GOLPO_API_KEY: "test-golpo" };
const requestId = "request-123";
const hfReceipt = { request_id: requestId, status: "queued", status_url: `https://api.higgsfield.ai/requests/${requestId}/status`, cancel_url: `https://api.higgsfield.ai/requests/${requestId}/cancel` };
const capabilityId = "higgsfield-seedance-text-video" as const;
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
afterEach(() => vi.restoreAllMocks());

describe("creative capability validation", () => {
  it("keeps provider credentials and connection status out of static metadata", () => {
    expect(listCreativeCapabilities().length).toBeGreaterThan(80);
    expect(JSON.stringify(listCreativeCapabilities())).not.toMatch(/test-secret|test-golpo/);
    const copy = getCreativeCapability(capabilityId); copy.notes.push("changed");
    expect(getCreativeCapability(capabilityId).notes).not.toContain("changed");
    expect(getCreativeProviderAvailability(env).find((v) => v.capabilityId === capabilityId)).toMatchObject({ available: true, reason: "configured_unverified" });
    expect(getCreativeProviderAvailability({}).every((v) => !v.available)).toBe(true);
    expect(getCreativeProviderAvailability(env).find((v) => v.provider === "tavus")).toMatchObject({ available: false, reason: "not_integrated" });
  });
  it("enforces endpoint-specific duration, framing, audio and image controls", () => {
    const metadata = getCreativeCapability(capabilityId);
    expect(metadata.documentation).toBe("https://docs.higgsfield.ai/docs/models/seedance-2/text-to-video.md");
    expect(metadata.controls?.find((c) => c.key === "duration")).toMatchObject({ type: "number", min: 4, max: 15, default: 5 });
    expect(getCreativeCapability("golpo-canvas").controls?.find((c) => c.key === "canvas_style_variant")?.options).toContain("modern_minimal_compact");
    expect(getCreativeCapability("higgsfield-seedance-video-edit").controls?.some((c) => c.key === "duration")).toBe(false);
    expect(validateCreativeSettings(capabilityId, { prompt: "Sunset" })).toMatchObject({ duration: 5, aspect_ratio: "9:16", generate_audio: true });
    expect(() => validateCreativeSettings(capabilityId, { prompt: "Sunset", duration: 16 })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-seedance-image-video", { image_url: "https://cdn.example.com/image.jpg", aspect_ratio: "9:16" })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-seedance-video-edit", { prompt: "Change scene", video_url: "https://cdn.example.com/a.mp4", duration: 10 })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-seedance-reference-video", {})).toThrow();
    expect(validateCreativeSettings("higgsfield-seedance-reference-video", { audio_urls: ["https://cdn.example.com/a.mp3"] })).toMatchObject({ duration: 5 });
    expect(() => validateCreativeSettings("higgsfield-image-edit", { prompt: "Blue product" })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-image-generate", { prompt: "Product", image_urls: ["https://cdn.example.com/a.jpg"] })).toThrow();
  });
  it("rejects invalid references and source-plus-reference video overflow", () => {
    for (const url of ["http://cdn.example.com/a.jpg", "https://user:secret@cdn.example.com/a.jpg", "https://127.0.0.1/a.jpg", "https://192.168.1.1/a.jpg"]) expect(() => validateCreativeSettings("higgsfield-image-edit", { prompt: "Edit", image_urls: [url] })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-seedance-video-edit", { prompt: "Edit", video_url: "https://cdn.example.com/a.mp4", video_urls: Array(10).fill("https://cdn.example.com/b.mp4") })).toThrow();
  });
  it("separates Golpo engines, checks paired media and forces private outputs", () => {
    expect(validateCreativeSettings("golpo-canvas", { prompt: "Explain gravity" })).toMatchObject({ timing: "0.5", golpo_video_engine: "golpo_canvas", visibility: "private" });
    expect(() => validateCreativeSettings("golpo-sketch", { prompt: "Explain", pen_animation_style: "pen" })).toThrow();
    expect(() => validateCreativeSettings("golpo-canvas", { prompt: "Explain", visibility: "public" })).toThrow();
    expect(() => validateCreativeSettings("golpo-canvas", { prompt: "Explain", custom_images: ["https://cdn.example.com/a.jpg"] })).toThrow();
    expect(() => validateCreativeSettings("golpo-canvas", { prompt: "Explain", use_ai_audio_at: [1] })).toThrow();
    expect(() => validateCreativeSettings("golpo-canvas", { prompt: "Explain", timing: 1 })).toThrow();
    const suppliedVideo = { prompt: "Explain", custom_videos: ["https://cdn.example.com/a.mp4"], custom_videos_description: ["Product demo"] };
    expect(() => validateCreativeSettings("golpo-canvas", { ...suppliedVideo, use_ai_audio_at: [1, 1] })).toThrow();
    expect(() => validateCreativeSettings("golpo-canvas", { ...suppliedVideo, use_ai_audio_at: [2] })).toThrow();
    expect(validateCreativeSettings("golpo-canvas", { ...suppliedVideo, use_ai_audio_at: [1] })).toMatchObject({ use_ai_audio_at: [1] });
  });
  it("redacts arbitrary text and signed URLs from trace settings", () => {
    const safe = safeCreativeSettings("golpo-canvas", { prompt: "Private campaign", narration_instructions: "Sensitive voice notes", custom_images: ["https://cdn.example.com/a.jpg?token=secret"], custom_images_description: ["Confidential product"], timing: "1" });
    expect(safe).toMatchObject({ timing: "1", has_prompt: true, custom_images_count: 1 });
    expect(JSON.stringify(safe)).not.toMatch(/Private|Sensitive|token|Confidential/);
  });
  it("uses AutoScribble's provider language names without silently changing unsupported narration", () => {
    expect(validateCreativeSettings("golpo-canvas", { prompt: "Explain" })).toMatchObject({ narration_language: "english" });
    expect(validateCreativeSettings("golpo-canvas", { prompt: "Explain", narration_language: "en-GB", onscreen_text_language: "ar" })).toMatchObject({ narration_language: "english", onscreen_text_language: "arabic" });
    expect(validateCreativeSettings("golpo-sketch", { prompt: "Explain", narration_language: "Spanish" })).toMatchObject({ narration_language: "spanish" });
    expect(() => validateCreativeSettings("golpo-canvas", { prompt: "Explain", narration_language: "unsupported-language" })).toThrow();
    expect(getCreativeCapability("golpo-canvas").controls?.find((c) => c.key === "narration_language")?.options).toContain("arabic");
  });
});

describe("creative provider HTTP contracts", () => {
  it("submits Higgsfield with native idempotency and normalized settings", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(hfReceipt));
    const result = await submitCreativeProviderJob({ capabilityId, settings: { prompt: "Sunset" }, idempotencyKey: "intent-1" }, { fetch: fetcher, env });
    expect(result).toMatchObject({ requestId, status: "queued", outputs: [] });
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.higgsfield.ai/bytedance/seedance-2.0/text-to-video");
    expect(init?.headers).toMatchObject({ Authorization: "Key test-id:test-secret", "Idempotency-Key": "intent-1" });
    expect(init?.redirect).toBe("error");
    expect(JSON.parse(init?.body as string)).toMatchObject({ prompt: "Sunset", duration: 5, aspect_ratio: "9:16" });
  });
  it("parses documented video/image results and moderation without leaking provider errors", () => {
    expect(parseCreativeProviderJob(capabilityId, { ...hfReceipt, status: "completed", video: { url: "https://cdn.example.com/a.mp4" } }).outputs).toEqual([{ type: "video", url: "https://cdn.example.com/a.mp4" }]);
    expect(parseCreativeProviderJob("higgsfield-image-generate", { ...hfReceipt, status: "completed", images: [{ url: "https://cdn.example.com/a.png" }] }).outputs[0].type).toBe("image");
    expect(parseCreativeProviderJob(capabilityId, { ...hfReceipt, status: "nsfw", error: "secret raw text" })).toMatchObject({ status: "moderated", errorCode: "content_moderated" });
    expect(() => parseCreativeProviderJob(capabilityId, { ...hfReceipt, status: "completed" })).toThrow(CreativeProviderError);
    expect(() => parseCreativeProviderJob(capabilityId, { ...hfReceipt, status: "unexpected" })).toThrow(CreativeProviderError);
    for (const url of ["https://127.0.0.1/a.mp4", "https://2130706433/a.mp4", "https://metadata.internal/a.mp4", "https://169.254.169.254/a.mp4", "https://cdn.example.com:8443/a.mp4"]) expect(() => parseCreativeOutputUrl(url)).toThrow();
  });
  it("resumes completed Seedance reference jobs whose expiry includes a UTC offset", async () => {
    const existingRequestId = "01a1a78f-aa96-73a3-b409-ecf2c1a8b019";
    const expiry = "2026-11-11T17:20:49.900307+00:00";
    const receipt = { status: "completed", request_id: existingRequestId, status_url: `https://api.higgsfield.ai/requests/${existingRequestId}/status`, cancel_url: `https://api.higgsfield.ai/requests/${existingRequestId}/cancel`, expires_at: expiry, video: { url: "https://cdn.example.com/existing-film.mp4" } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(receipt));
    await expect(pollCreativeProviderJob({ capabilityId: "higgsfield-seedance-reference-video", requestId: existingRequestId }, { fetch: fetcher, env })).resolves.toMatchObject({ requestId: existingRequestId, status: "completed", expiresAt: expiry, outputs: [{ type: "video", url: receipt.video.url }] });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0][1]?.method).toBe("GET");
    expect(() => parseCreativeProviderJob("higgsfield-seedance-reference-video", { ...receipt, video: { url: "https://127.0.0.1/private.mp4" } })).toThrow(CreativeProviderError);
    expect(() => parseCreativeProviderJob("higgsfield-seedance-reference-video", { ...receipt, expires_at: "not-a-date" })).toThrow(CreativeProviderError);
  });
  it("blocks credential exfiltration through untrusted poll or receipt URLs before fetch", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const statusUrl of ["https://evil.example/requests/request-123/status", "https://api.higgsfield.ai/requests/other/status", "https://api.higgsfield.ai/requests/request-123/status?redirect=evil", "https://api.higgsfield.ai:444/requests/request-123/status"]) {
      await expect(pollCreativeProviderJob({ capabilityId, requestId, statusUrl }, { fetch: fetcher, env })).rejects.toMatchObject({ code: "invalid_response" });
    }
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => parseCreativeProviderJob(capabilityId, { ...hfReceipt, cancel_url: "https://evil.example/cancel" })).toThrow(CreativeProviderError);
  });
  it("rejects poll receipts for a different request", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ request_id: "other", status: "queued" }));
    await expect(pollCreativeProviderJob({ capabilityId, requestId }, { fetch: fetcher, env })).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("normalizes successful queued cancellation and rejects cancellation after start", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(json({ detail: "Already running" }, 400));
    await expect(cancelCreativeProviderJob({ capabilityId, requestId }, { fetch: fetcher, env })).resolves.toMatchObject({ status: "canceled" });
    await expect(cancelCreativeProviderJob({ capabilityId, requestId }, { fetch: fetcher, env })).rejects.toMatchObject({ code: "provider_rejected", httpStatus: 400 });
  });
  it("estimates using the identical endpoint-specific body and exact USD string", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ usd: "0.1234" }));
    await expect(estimateCreativeProviderJob({ capabilityId, settings: { prompt: "Sunset" } }, { fetch: fetcher, env })).resolves.toEqual({ usd: "0.1234" });
    expect(fetcher.mock.calls[0][0]).toBe("https://api.higgsfield.ai/estimate/bytedance/seedance-2.0/text-to-video");
  });
  it("submits Golpo once without inventing idempotency and polls its job", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ job_id: "golpo-1" })).mockResolvedValueOnce(json({ job_id: "golpo-1", status: "completed", video_url: "https://cdn.example.com/g.mp4" }));
    const job = await submitCreativeProviderJob({ capabilityId: "golpo-sketch", settings: { prompt: "Explain gravity" }, idempotencyKey: "intent-2" }, { fetch: fetcher, env });
    expect(fetcher.mock.calls[0][0]).toBe("https://api.golpoai.com/api/v2/videos/generate");
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty("Idempotency-Key");
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ "x-api-key": "test-golpo", Authorization: "Bearer test-golpo" });
    expect(await pollCreativeProviderJob(job, { fetch: fetcher, env })).toMatchObject({ status: "completed", outputs: [{ type: "video", url: "https://cdn.example.com/g.mp4" }] });
    await expect(cancelCreativeProviderJob(job, { fetch: fetcher, env })).rejects.toMatchObject({ code: "unsupported_operation" });
  });
  it("accepts AutoScribble's known Golpo response aliases and still binds polling to the original job", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ id: "golpo-2" })).mockResolvedValueOnce(json({ id: "golpo-2", state: "SUCCEEDED", url: "https://cdn.example.com/g.mp4" })).mockResolvedValueOnce(json({ id: "other", state: "running" }));
    const job = await submitCreativeProviderJob({ capabilityId: "golpo-canvas", settings: { prompt: "Explain" }, idempotencyKey: "intent-alias" }, { fetch: fetcher, env });
    expect(job.requestId).toBe("golpo-2");
    expect(await pollCreativeProviderJob(job, { fetch: fetcher, env })).toMatchObject({ status: "completed", outputs: [{ type: "video", url: "https://cdn.example.com/g.mp4" }] });
    await expect(pollCreativeProviderJob(job, { fetch: fetcher, env })).rejects.toMatchObject({ code: "invalid_response" });
  });
  it("rejects incomplete, unknown or conflicting Golpo receipts instead of claiming success", () => {
    expect(() => parseCreativeProviderJob("golpo-canvas", { id: "job", state: "constructor" })).toThrow(CreativeProviderError);
    for (const value of [{ id: "job", state: "incomplete" }, { id: "job", state: "succeeded" }, { id: "job", job_id: "other", state: "running" }, { id: "job", status: "completed", state: "failed", url: "https://cdn.example.com/g.mp4" }]) expect(() => parseCreativeProviderJob("golpo-canvas", value)).toThrow(CreativeProviderError);
    expect(parseCreativeProviderJob("golpo-canvas", { id: "job", state: "failed", failure_reason: "private text" })).toMatchObject({ status: "failed", errorCode: "generation_failed" });
  });
  it("marks ambiguous Golpo network, server and malformed receipt failures for reconciliation without retry", async () => {
    for (const response of [() => Promise.reject(new Error("secret token in URL")), () => Promise.resolve(json({ detail: "secret" }, 503)), () => Promise.resolve(json({ unexpected: true }))]) {
      const fetcher = vi.fn<typeof fetch>().mockImplementation(response);
      const error = await submitCreativeProviderJob({ capabilityId: "golpo-canvas", settings: { prompt: "Explain" }, idempotencyKey: "intent-3" }, { fetch: fetcher, env }).catch((e: unknown) => e);
      expect(error).toMatchObject({ code: "reconciliation_required", retryable: false });
      expect(String(error)).not.toMatch(/secret|token/);
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
  it("enforces abort timeout without retrying a paid submission", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted")))));
    await expect(submitCreativeProviderJob({ capabilityId: "golpo-canvas", settings: { prompt: "Explain" }, idempotencyKey: "intent-timeout" }, { fetch: fetcher, env, timeoutMs: 5 })).rejects.toMatchObject({ code: "reconciliation_required" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("does not send requests with missing credentials or invalid settings", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(submitCreativeProviderJob({ capabilityId, settings: { prompt: "Explain" }, idempotencyKey: "intent-4" }, { fetch: fetcher, env: {} })).rejects.toMatchObject({ code: "not_configured" });
    await expect(submitCreativeProviderJob({ capabilityId, settings: { prompt: "" }, idempotencyKey: "intent-4" }, { fetch: fetcher, env })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
