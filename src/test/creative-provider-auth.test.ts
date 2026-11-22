import { describe, expect, it, vi } from "vitest";
import { estimateCreativeProviderJob, submitCreativeProviderJob } from "../lib/creative-providers/adapters.server";
const env = { HF_API_KEY_ID: "test-id", HF_API_KEY_SECRET: "test-secret" };
const capabilityId = "higgsfield-seedance-reference-video" as const;
const settings = { prompt: "Create the requested London film", duration: 30, resolution: "1080p", aspect_ratio: "9:16", generate_audio: false, image_urls: Array.from({ length: 10 }, (_, index) => `https://cdn.example.com/${index}.jpg`) };
describe("provider authentication failures", () => {
  it.each(["estimate", "submit"] as const)("classifies %s HTTP401 safely without retrying or exposing the response body", async (operation) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "Invalid credentials test-secret https://private.example.com/signed?token=sensitive" }), { status: 401 }));
    const call = operation === "estimate" ? estimateCreativeProviderJob({ capabilityId, settings }, { fetch: fetcher, env }) : submitCreativeProviderJob({ capabilityId, settings, idempotencyKey: "explicit-attempt" }, { fetch: fetcher, env });
    const error = await call.catch((failure: unknown) => failure);
    expect(error).toMatchObject({ code: "authentication_failed", provider: "higgsfield", httpStatus: 401, retryable: false });
    expect((error as Error).message).toContain("Higgsfield API credentials are invalid or expired");
    expect((error as Error).message).not.toMatch(/test-secret|private\.example|sensitive/);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]![0]).toBe(operation === "estimate" ? "https://api.higgsfield.ai/estimate/bytedance/seedance-2.5/reference-to-video" : "https://api.higgsfield.ai/bytedance/seedance-2.5/reference-to-video");
  });
});

it("reports descriptive pricing without treating it as a zero-cost estimate", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: "description", pricing_description: "Provider-specific pricing" }), { status: 200 }));
  await expect(estimateCreativeProviderJob({ capabilityId, settings }, { fetch: fetcher, env })).rejects.toThrow("Generation has not started because its cost cannot be checked");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("derives the Seedance image-reference quote from the documented token rate", async () => {
  const pricing_description = "For 16:9 video without video input, your request costs roughly $0.2056 per second of generated video at 480p, $0.4622 at 720p, and $1.1372 at 1080p. Each 1,000 video tokens costs $0.0214 at 480p or 720p and $0.0234 at 1080p. If video inputs are provided, the token rate is multiplied by 0.6.";
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ type: "description", pricing_description }), { status: 200 }));
  await expect(estimateCreativeProviderJob({ capabilityId, settings: { ...settings, duration: 15 } }, { fetch: fetcher, env })).resolves.toEqual({ usd: "17.0586" });
  await expect(estimateCreativeProviderJob({ capabilityId, settings: { ...settings, duration: 15, resolution: "720p" } }, { fetch: fetcher, env })).resolves.toEqual({ usd: "6.9336" });
});

it("calculates only the observed Seedance 2 token-metered contract and fails closed on unrecognised dimensions", async () => {
  const pricing_description = "Token-metered pricing. Billable video tokens = ceil(generated video seconds × output width × output height × 24 fps / 1024). Image and audio references do not count as video input. Per 1,000 video tokens: 480p/720p/1080p $0.014, 4K $0.008. Rates shown are before any applicable customer discount.";
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ type: "description", pricing_description }), { status: 200 }));
  const request = { capabilityId: "higgsfield-seedance-text-video" as const, settings: { prompt: "Illustrative reaction", duration: 5, resolution: "720p", aspect_ratio: "9:16", generate_audio: false } };
  await expect(estimateCreativeProviderJob(request, { fetch: fetcher, env })).resolves.toEqual({ usd: "1.5120" });
  await expect(estimateCreativeProviderJob({ ...request, settings: { ...request.settings, resolution: "1080p" } }, { fetch: fetcher, env })).resolves.toEqual({ usd: "3.4020" });
  await expect(estimateCreativeProviderJob({ ...request, settings: { ...request.settings, aspect_ratio: "1:1" } }, { fetch: fetcher, env })).rejects.toThrow("cannot be safely calculated");
});
