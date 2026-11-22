import { describe, expect, it, vi } from "vitest";
import { getCreativeCapability, safeCreativeSettings, validateCreativeSettings } from "../lib/creative-providers/registry";
import { cancelCreativeProviderJob, estimateCreativeProviderJob, getCreativeProviderAvailability, pollCreativeProviderJob, submitCreativeProviderJob } from "../lib/creative-providers/adapters.server";
import { listVideoStyles } from "../lib/video-styles";
import { reconcileProductionReferences } from "../lib/production-plan";
import { kieReferenceEstimate } from "../lib/kie-pricing";

const options = { env: { KIE_API_KEY: "test-only" } };
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
describe("Kie guarded production integration", () => {
  it("registers only documented routes and requires server credentials", () => {
    const entries = getCreativeProviderAvailability({}).filter((item) => item.provider === "kie");
    expect(entries).toHaveLength(5);
    expect(entries.every((item) => !item.available)).toBe(true);
    expect(getCreativeProviderAvailability(options.env).filter((item) => item.provider === "kie").every((item) => item.available)).toBe(true);
    expect(listVideoStyles().filter((item) => item.provider === "Kie")).toHaveLength(5);
    expect(getCreativeCapability("kie-veo-text-video").verification?.liveTestedAt).toBeNull();
  });
  it("rejects unsupported pricing/settings and validates required references", () => {
    for (const settings of [{ prompt: "Scene", duration: 60 }, { prompt: "Scene", model: "invented" }, { prompt: "Scene", enable_fallback: true }]) expect(() => validateCreativeSettings("kie-veo-text-video", settings)).toThrow();
    expect(() => validateCreativeSettings("kie-nano-image-edit", { prompt: "Edit" })).toThrow();
    expect(() => validateCreativeSettings("kie-veo-reference-video", { prompt: "Scene", image_urls: Array(4).fill("https://cdn.example.com/ref.png") })).toThrow();
    expect(() => kieReferenceEstimate("kie-veo-text-video", { duration: 4, model: "veo3_lite", resolution: "720p" })).toThrow();
  });
  it("prices each strict supported setting from an explicit reference", async () => {
    expect(await estimateCreativeProviderJob({ capabilityId: "kie-nano-image", settings: { prompt: "Product", resolution: "2K" } }, options)).toEqual({ usd: "0.0600" });
    expect(await estimateCreativeProviderJob({ capabilityId: "kie-veo-text-video", settings: { prompt: "Scene", model: "veo3_lite", resolution: "1080p" } }, options)).toEqual({ usd: "0.1750" });
  });
  it("resolves a paid submit once and maps polling with actual consumed credits", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ code: 200, data: { taskId: "task-1" } })).mockResolvedValueOnce(json({ code: 200, data: { taskId: "task-1", state: "success", resultJson: JSON.stringify({ resultUrls: ["https://cdn.example.com/result.png"] }), creditsConsumed: 8 } }));
    const receipt = await submitCreativeProviderJob({ capabilityId: "kie-nano-image", settings: { prompt: "Product" }, idempotencyKey: "intent-1" }, { ...options, fetch: fetcher });
    expect(receipt.status).toBe("queued");
    expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toMatchObject({ model: "nano-banana-2", input: { prompt: "Product", resolution: "1K" } });
    expect(await pollCreativeProviderJob(receipt, { ...options, fetch: fetcher })).toMatchObject({ status: "completed", creditsConsumed: 8, outputs: [{ type: "image", url: "https://cdn.example.com/result.png" }] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects caller-controlled polling URLs and unsupported cancellation", async () => {
    const fetcher = vi.fn();
    await expect(pollCreativeProviderJob({ capabilityId: "kie-nano-image", requestId: "task-1", statusUrl: "https://attacker.example.com" }, { ...options, fetch: fetcher })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(cancelCreativeProviderJob({ capabilityId: "kie-nano-image", requestId: "task-1" }, options)).rejects.toMatchObject({ code: "unsupported_operation" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("marks an ambiguous submission for reconciliation without retry", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    await expect(submitCreativeProviderJob({ capabilityId: "kie-veo-text-video", settings: { prompt: "Scene" }, idempotencyKey: "intent-1" }, { ...options, fetch: fetcher })).rejects.toMatchObject({ code: "reconciliation_required", retryable: false });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("keeps source URLs and prompts out of traces and advisory media settings", () => {
    const settings = { prompt: "Private prompt", image_input: ["https://cdn.example.com/signed.png?token=private"] };
    const safe = safeCreativeSettings("kie-nano-image-edit", settings);
    expect(safe).toMatchObject({ has_prompt: true, image_input_count: 1 });
    expect(JSON.stringify(safe)).not.toMatch(/Private|token|https/);
    const proposal = reconcileProductionReferences({ steps: [{ settings_json: JSON.stringify(settings) }] }, []) as { steps: { settings_json: string }[] };
    expect(JSON.parse(proposal.steps[0]!.settings_json)).toEqual({ prompt: "Private prompt" });
  });
});
