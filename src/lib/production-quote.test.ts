import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ estimate: vi.fn(), submit: vi.fn(), soundtrack: vi.fn() }));
vi.mock("./creative-providers/adapters.server", async (original) => ({ ...await original<typeof import("./creative-providers/adapters.server")>(), estimateCreativeProviderJob: mocks.estimate, submitCreativeProviderJob: mocks.submit }));
vi.mock("./production-audio.server", () => ({ loadApprovedSoundtrack: mocks.soundtrack }));
import { quoteAssetProduction } from "./production.server";
import type { AssetRow } from "./asset-versions.server";
import type { getAdminClient } from "./supabase-admin.server";
const admin = {} as ReturnType<typeof getAdminClient>;
const asset = (steps: unknown[] = []) => ({ workspace_id: "workspace", duration_s: 15, voiceover: "Approved narration", size: "1080x1920", production_plan: { version: 1, steps } }) as unknown as AssetRow;
const scene = () => ({ id: "reaction", capability_id: "higgsfield-seedance-text-video", role: "scene", settings: { prompt: "Illustrative reaction", duration: 5, resolution: "720p", aspect_ratio: "9:16" }, reference_file_ids: [], reference_step_ids: [], illustrative: true });
beforeEach(() => { vi.clearAllMocks(); mocks.soundtrack.mockResolvedValue(null); mocks.estimate.mockResolvedValue({ usd: "1.5120" }); });
describe("read-only production quotes", () => {
  it("blocks clearly overlong approved copy before checking a paid provider", async () => {
    const result = await quoteAssetProduction(admin, { ...asset([scene()]), voiceover: "word ".repeat(50) });
    expect(result).toMatchObject({ ready: false, message: expect.stringContaining("script is too long") });
    expect(mocks.estimate).not.toHaveBeenCalled();
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("shows zero external generation separately from application usage for composition-only films", async () => {
    await expect(quoteAssetProduction(admin, asset())).resolves.toMatchObject({ ready: true, providerUsd: "0.0000", includesAppUsage: false });
    expect(mocks.estimate).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("quotes exact validated scene settings without submitting generation", async () => {
    await expect(quoteAssetProduction(admin, asset([scene()]))).resolves.toMatchObject({ ready: true, providerUsd: "1.5120" });
    expect(mocks.estimate).toHaveBeenCalledWith({ capabilityId: "higgsfield-seedance-text-video", settings: expect.objectContaining({ duration: 5, generate_audio: false }) });
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("fails closed for unknown prices, excessive prices and unresolved dependent inputs", async () => {
    mocks.estimate.mockRejectedValueOnce(new Error("Unsupported pricing"));
    await expect(quoteAssetProduction(admin, asset([scene()]))).resolves.toMatchObject({ ready: false, providerUsd: null });
    mocks.estimate.mockResolvedValueOnce({ usd: "100" });
    await expect(quoteAssetProduction(admin, asset([scene()]))).resolves.toMatchObject({ ready: false, providerUsd: null });
    await expect(quoteAssetProduction(admin, asset([{ ...scene(), reference_step_ids: ["unmade"] }]))).resolves.toMatchObject({ ready: false });
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("does not allow an assembled recipe to bypass narration through a direct final provider film", async () => {
    const direct = asset([{ ...scene(), role: "finished_video" }]);
    direct.production_plan = { ...(direct.production_plan as object), delivery: { mode: "assembled_ad" } } as never;
    await expect(quoteAssetProduction(admin, direct)).resolves.toMatchObject({ ready: false, message: expect.stringContaining("compositor assembly") });
    expect(mocks.estimate).not.toHaveBeenCalled(); expect(mocks.submit).not.toHaveBeenCalled();
  });
});
