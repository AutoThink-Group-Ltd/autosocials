import { describe, expect, it, vi } from "vitest";
import { getCreativeCapability, safeCreativeSettings, validateCreativeSettings, type CreativeCapabilityId } from "../lib/creative-providers/registry";
import { listCreativeProviderPresets, submitCreativeProviderJob } from "../lib/creative-providers/adapters.server";

const picture = "https://cdn.example.com/product.jpg", clip = "https://cdn.example.com/motion.mp4", presetId = "c2143317-f28d-4c3c-a0b8-39bd547e08a7";
const env = { HF_API_KEY_ID: "fixture-id", HF_API_KEY_SECRET: "fixture-secret" };
function json(value: unknown) { return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } }); }

describe("Genjutsu and enhanced Marketing Studio contracts", () => {
  it("submits exact documented routes with ordered references and no invented controls", async () => {
    const cases: Array<[CreativeCapabilityId, string, Record<string, unknown>]> = [
      ["higgsfield-genjutsu-motion-transfer", "higgsfield/genjutsu/motion-transfer/v1.0", { video_url: clip, image_urls: [picture] }],
      ["higgsfield-genjutsu-object-swap", "higgsfield/genjutsu/object-swap/v1.0", { video_url: clip, image_urls: [picture] }],
      ["higgsfield-genjutsu-restyle", "higgsfield/genjutsu/restyle/v1.0", { video_url: clip, preset_id: presetId }],
      ["higgsfield-image-preset", "marketing-studio/image", { prompt: "Product portrait", preset_id: presetId, image_urls: [picture] }],
    ];
    for (const [capabilityId, endpoint, settings] of cases) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ request_id: "preset-fixture", status: "queued" }));
      await submitCreativeProviderJob({ capabilityId, settings, idempotencyKey: capabilityId }, { fetch: fetcher, env });
      expect(fetcher.mock.calls[0]![0]).toBe(`https://api.higgsfield.ai/${endpoint}`);
      expect(JSON.parse(String(fetcher.mock.calls[0]![1]?.body))).toMatchObject(settings);
      expect(getCreativeCapability(capabilityId).verification).toMatchObject({ registryVersion: 3, liveTestedAt: null, observedLatencyMs: null });
    }
  });
  it("enforces preset, quality and ordered image bounds before HTTP", () => {
    for (const patch of [{ preset_id: undefined }, { quality: "medium" }, { enhance_prompt: false }, { image_urls: [] }, { image_urls: [picture, picture, picture] }]) {
      expect(() => validateCreativeSettings("higgsfield-image-preset", { prompt: "Portrait", preset_id: presetId, image_urls: [picture], ...patch })).toThrow();
    }
    expect(() => validateCreativeSettings("higgsfield-genjutsu-motion-transfer", { video_url: clip, image_urls: [] })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-genjutsu-object-swap", { video_url: clip, image_urls: Array(9).fill(picture) })).toThrow();
    expect(() => validateCreativeSettings("higgsfield-genjutsu-restyle", { video_url: clip, preset_id: presetId, duration: 10 })).toThrow();
    expect(safeCreativeSettings("higgsfield-image-preset", { prompt: "Private product", preset_id: presetId, image_urls: [picture] })).toMatchObject({ image_urls_count: 1, has_preset_id: true, enhance_prompt: true });
  });
  it("retrieves current restyle presets with fixed authenticated URL", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ model: "higgsfield/genjutsu/restyle/v1.0", items: [{ id: presetId, name: "Example style", preview_url: picture }] }));
    await expect(listCreativeProviderPresets({ capabilityId: "higgsfield-genjutsu-restyle" }, { fetch: fetcher, env })).resolves.toEqual({ items: [{ id: presetId, name: "Example style", previewUrl: picture }], nextCursor: null, total: 1 });
    expect(fetcher.mock.calls[0]![0]).toBe("https://api.higgsfield.ai/models/higgsfield/genjutsu/restyle/v1.0/presets");
    await expect(listCreativeProviderPresets({ capabilityId: "higgsfield-genjutsu-restyle", cursor: 0 }, { fetch: fetcher, env })).rejects.toMatchObject({ code: "invalid_input" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("uses bounded Marketing Studio pagination and rejects nonadvancing cursors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ total: 1, cursor: null, items: [{ id: presetId, name: "Editorial", cover_image: null, metadata: { aspect_ratio: "3:4", group_name: "Product" } }] })).mockResolvedValueOnce(json({ total: 2, cursor: 0, items: [] }));
    await expect(listCreativeProviderPresets({ capabilityId: "higgsfield-image-preset", search: "Editorial", size: 50, cursor: 0 }, { fetch: fetcher, env })).resolves.toMatchObject({ nextCursor: null, total: 1, items: [{ id: presetId, aspectRatio: "3:4", groupName: "Product" }] });
    expect(fetcher.mock.calls[0]![0]).toBe("https://api.higgsfield.ai/marketing-studio/image/presets?size=50&cursor=0&search=Editorial");
    await expect(listCreativeProviderPresets({ capabilityId: "higgsfield-image-preset" }, { fetch: fetcher, env })).rejects.toMatchObject({ code: "invalid_response" });
  });
});
