import { describe, expect, it, vi } from "vitest";
import catalogue from "../lib/creative-providers/higgsfield-catalog.generated.json";
import { listCreativeCapabilities, validateCreativeSettings } from "../lib/creative-providers/registry";
import { submitCreativeProviderJob } from "../lib/creative-providers/adapters.server";
import { listVideoStyles } from "../lib/video-styles";

describe("Higgsfield documented catalogue", () => {
  it("maps every documented generation endpoint to a selectable production route", () => {
    const documented = catalogue;
    const capabilities = listCreativeCapabilities();
    const selectable = new Set(listVideoStyles().map((style) => style.capability_id));
    expect(catalogue).toHaveLength(83);
    expect(documented.filter((entry) => entry.kind === "video")).toHaveLength(67);
    expect(documented.filter((entry) => entry.kind === "image")).toHaveLength(16);
    expect(new Set(catalogue.map((entry) => entry.endpoint)).size).toBe(83);
    expect(catalogue.some((entry) => entry.kind === "training")).toBe(false);
    for (const entry of documented) {
      expect(capabilities.some((capability) => capability.endpoint === entry.endpoint && capability.status === "supported" && selectable.has(capability.id))).toBe(true);
    }
    expect(selectable.has("higgsfield-catalog-soul-id-create-character")).toBe(false);
  });

  it("validates a newly connected request using the provider schema and safe media URLs", () => {
    const id = "higgsfield-catalog-kling-2-6-pro-image-to-video";
    expect(validateCreativeSettings(id, { prompt: "Slow aerial view over London", image_url: "https://example.com/owned.jpg" })).toMatchObject({ prompt: "Slow aerial view over London" });
    expect(() => validateCreativeSettings(id, { prompt: "Test", image_url: "http://example.com/owned.jpg" })).toThrow();
    expect(() => validateCreativeSettings(id, { prompt: "Test", image_url: "https://example.com/owned.jpg", unlisted_control: true })).toThrow();
  });

  it("applies conditional defaults and prevents unsupported paid image batches or invalid Kling shots", () => {
    const o3 = "higgsfield-catalog-kling-o3-image-reference";
    expect(validateCreativeSettings(o3, { prompt: "An illustrative London street", image_urls: ["https://example.com/owned.jpg"] })).toMatchObject({ multi_shots: false });
    expect(() => validateCreativeSettings(o3, { prompt: "London", image_urls: ["https://example.com/owned.jpg"], multi_shots: true, multi_prompt: [{ prompt: "Shot", duration: 0 }] })).toThrow();
    expect(() => validateCreativeSettings(o3, { prompt: "London", image_urls: ["https://example.com/owned.jpg"], multi_shots: true, multi_prompt: [{ duration: 3 }] })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-catalog-soul-2-generate", { prompt: "London", batch_size: 4 })).toThrow();
  });

  it("submits a newly catalogued workflow to its exact provider endpoint", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ request_id: "new-request", status: "queued" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const job = await submitCreativeProviderJob({ capabilityId: "higgsfield-catalog-kling-2-6-pro-text-to-video", settings: { prompt: "Illustrative view of London" }, idempotencyKey: "test-new-route" }, { fetch: fetcher, env: { HF_API_KEY_ID: "id", HF_API_KEY_SECRET: "secret" } });
    expect(job).toMatchObject({ requestId: "new-request", status: "queued" });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.higgsfield.ai/kling-video/v2.6/pro/text-to-video");
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({ "Idempotency-Key": "test-new-route" });
  });
});
