import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ begin: vi.fn(), update: vi.fn(), complete: vi.fn(), fail: vi.fn(), previous: vi.fn(), poll: vi.fn(), submit: vi.fn(), download: vi.fn(), upload: vi.fn() }));
vi.mock("../lib/generation-tracker.server", () => ({ beginStep: mocks.begin, updateStep: mocks.update, completeStep: mocks.complete, failStep: mocks.fail, previousGenerationStep: mocks.previous }));
vi.mock("../lib/creative-providers/adapters.server", async (original) => { const actual = await original<typeof import("../lib/creative-providers/adapters.server")>(); return { ...actual, pollCreativeProviderJob: mocks.poll, submitCreativeProviderJob: mocks.submit, getCreativeProviderAvailability: () => [{ capabilityId: "higgsfield-seedance-text-video", available: true }] }; });
vi.mock("../lib/creative-media.server", () => ({ downloadCreativeMedia: mocks.download }));
import { advanceProduction, isCreativeEngineState, productionRecoveryAction, PRODUCTION_LEASE_MS, RecoverableProductionError, resolvedStepSettings } from "../lib/production.server";
import type { AssetRow, RenderRow } from "../lib/asset-versions.server";
import type { getAdminClient } from "../lib/supabase-admin.server";

const now = Date.now(), old = new Date(now - PRODUCTION_LEASE_MS - 1).toISOString();
const base = { status: "preparing", phase: "designing", phase_claimed_at: old, started_at: old, created_at: old, provider_job_id: null, production_state: { engine_version: 1, outputs: {}, rootStepId: "root" } };
const known = { provider: "higgsfield", step_key: "provider:scene", provider_job_id: "remote-1", status: "running" };
const direction = Object.fromEntries(["audience", "objective", "insight", "argument", "hook", "story_mechanism", "composition", "motion", "imagery", "pacing", "ending", "typography", "sound", "evidence", "asset_strategy"].map((key) => [key, `Specific ${key}`]));
const plan = { version: 1, direction, steps: [{ id: "scene", capability_id: "higgsfield-seedance-text-video", purpose: "Illustrative scene", role: "scene", settings: { prompt: "Sunrise", duration: 5 }, reference_file_ids: [], reference_step_ids: [], illustrative: true }], assumptions: [], diversity_issues: [] };
function admin(files: Array<Record<string, unknown>> = [], uniqueUrls = false) {
  const database = { from: (table: string) => table === "brand_files" ? { select: () => ({ eq: () => Object.assign(Promise.resolve({ data: files, error: null }), { in: async () => ({ data: files, error: null }) }) }) } : { update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }) }, rpc: async (name: string) => name === "acquire_creative_provider_slot" ? { data: { acquired: true, slot_id: "slot", lease_token: "lease", reason: "existing" }, error: null } : { data: true, error: null }, storage: { from: () => ({ upload: mocks.upload, createSignedUrl: async (path: string) => ({ data: { signedUrl: uniqueUrls ? `https://cdn.example.com/${path}` : "https://cdn.example.com/source.mp4" }, error: null }) }) } };
  return database as unknown as ReturnType<typeof getAdminClient>;
}
beforeEach(() => { vi.clearAllMocks(); mocks.previous.mockResolvedValue(null); mocks.begin.mockResolvedValue({ created: false, step: { id: "step", status: "running", provider_job_id: "remote-1", created_at: new Date().toISOString() } }); mocks.poll.mockResolvedValue({ requestId: "remote-1", status: "completed", outputs: [{ type: "video", url: "https://cdn.example.com/a.mp4" }] }); mocks.upload.mockResolvedValue({ error: null }); mocks.complete.mockResolvedValue({}); mocks.download.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "video/mp4", extension: "mp4" }); });

describe("bounded production phase recovery", () => {
  it("never starts older queues and never reclaims a live lease", () => {
    expect(isCreativeEngineState({ outputs: {} })).toBe(false);
    expect(productionRecoveryAction({ ...base, production_state: {} }, [], now)).toBe("none");
    expect(productionRecoveryAction({ ...base, phase_claimed_at: new Date(now).toISOString() }, [known], now)).toBe("none");
  });
  it("resumes known provider/compositor IDs without repeating paid requests", () => {
    expect(productionRecoveryAction(base, [known], now)).toBe("provider_assets");
    expect(productionRecoveryAction(base, [{ ...known, step_key: "compositor", provider: "autotoast" }], now)).toBe("compositor");
    for (const phase of ["provider_poll", "provider_canceling", "provider_finalizing"]) expect(productionRecoveryAction({ ...base, status: "rendering", phase }, [known], now)).toBe("provider_assets");
    expect(productionRecoveryAction({ ...base, status: "rendering", phase: "finalizing", provider_job_id: "render-1" }, [], now)).toBe("compositor");
  });
  it("requires reconciliation for interrupted LLM/voice or unknown submitted provider outcomes", () => {
    expect(productionRecoveryAction(base, [{ ...known, provider: "openai", step_key: "build:openai:1", provider_job_id: null }], now)).toBe("reconcile");
    expect(productionRecoveryAction(base, [{ ...known, provider_job_id: null, status: "reserved" }], now)).toBe("reconcile");
    expect(productionRecoveryAction(base, [], now)).toBe("queued");
  });
});

describe("known provider output recovery", () => {
  it("keeps ingestion resumable and never submits again after a transient download failure", async () => {
    const job = { ...base, id: "render", workspace_id: "workspace", variant_id: "variant", created_by: "user" } as unknown as RenderRow;
    const asset = { id: "variant", production_plan: plan, duration_s: 15, voiceover: "Current approved narration" } as unknown as AssetRow;
    mocks.download.mockRejectedValueOnce(new Error("network timeout"));
    await expect(advanceProduction(admin(), job, asset)).rejects.toBeInstanceOf(RecoverableProductionError);
    const result = await advanceProduction(admin(), job, asset);
    expect(result.waiting).toBe(false); expect(result.state.engine_version).toBe(1);
    expect(result.state.outputs["scene"]).toMatchObject({ path: "workspace/renders/render/scene.mp4", stepId: "step" });
    expect(mocks.poll).toHaveBeenCalledTimes(2); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("overrides stale Golpo scripts with the current approved narration", async () => {
    const step = { id: "explain", capability_id: "golpo-canvas" as const, purpose: "Explain", role: "finished_video" as const, settings: { prompt: "Explain", custom_script: "Stale text", video_orientation: "horizontal", background_track: "documentary" }, reference_file_ids: [], reference_step_ids: [], illustrative: false };
    const settings = await resolvedStepSettings(admin(), "workspace", step, { engine_version: 1, outputs: {} }, 30, "Current approved narration", "1080x1920");
    expect(settings["custom_script"]).toBe("Current approved narration"); expect(settings["timing"]).toBe("0.5"); expect(settings["video_orientation"]).toBe("vertical"); expect(settings["background_track"]).toBeUndefined();
    await expect(resolvedStepSettings(admin(), "workspace", step, { engine_version: 1, outputs: {} }, 30, "Approved", "1080x1080")).rejects.toThrow("square");
  });
  it("rejects a shorter Higgsfield finished clip, including the model default, but allows it as a scene", async () => {
    const step = { ...plan.steps[0]!, capability_id: "higgsfield-seedance-text-video" as const, role: "finished_video" as const };
    for (const duration of [15, 30, 60]) {
      await expect(resolvedStepSettings(admin(), "workspace", step, { outputs: {} }, duration)).rejects.toThrow("approved finished duration");
      await expect(resolvedStepSettings(admin(), "workspace", { ...step, settings: { prompt: "Sunrise" } }, { outputs: {} }, duration)).rejects.toThrow("approved finished duration");
      const settings = await resolvedStepSettings(admin(), "workspace", { ...step, role: "scene" }, { outputs: {} }, duration);
      expect(settings["duration"]).toBe(5);
    }
    await expect(resolvedStepSettings(admin(), "workspace", { ...step, settings: { prompt: "Sunrise", duration: 15 } }, { outputs: {} }, 15)).resolves.toMatchObject({ duration: 15 });
  });
  it("preserves approved one-minute Golpo timing instead of applying clip duration limits", async () => {
    const step = { id: "explain", capability_id: "golpo-canvas" as const, purpose: "Explain", role: "finished_video" as const, settings: { prompt: "Explain", timing: "0.25" }, reference_file_ids: [], reference_step_ids: [], illustrative: false };
    await expect(resolvedStepSettings(admin(), "workspace", step, { outputs: {} }, 60, "Approved narration")).resolves.toMatchObject({ timing: "1", custom_script: "Approved narration" });
  });
  it("passes selected Golpo media once with a nonempty description even for long footage", async () => {
    const file = { id: "clip", kind: "video", mime: "video/mp4", storage_path: "workspace/clip.mp4", name: "demo.mp4", ai_summary: " ", duration_s: 90 };
    const step = { id: "explain", capability_id: "golpo-canvas" as const, purpose: "Explain", role: "finished_video" as const, settings: { prompt: "Explain" }, reference_file_ids: ["clip"], reference_step_ids: [], reference_roles: [{ source: "file" as const, id: "clip", role: "product" as const }, { source: "file" as const, id: "clip", role: "style" as const }], illustrative: false };
    await expect(resolvedStepSettings(admin([file]), "workspace", step, { outputs: {} }, 30, "Approved narration", "1080x1920")).resolves.toMatchObject({ custom_videos: ["https://cdn.example.com/source.mp4"], custom_videos_description: ["demo.mp4"] });
  });
  it("disables provider audio for assembled Seedance scenes even when the planner omitted that setting", async () => {
    const scene = { ...plan.steps[0]!, capability_id: "higgsfield-seedance-text-video" as const, role: "scene" as const, settings: { prompt: "An illustrative scene" } };
    await expect(resolvedStepSettings(admin(), "workspace", scene, { outputs: {} }, 15)).resolves.toMatchObject({ generate_audio: false });
    const reference = { ...scene, capability_id: "higgsfield-seedance-reference-video" as const, reference_file_ids: ["photo"] };
    const image = { id: "photo", kind: "image", mime: "image/png", storage_path: "workspace/photo.png", name: "photo.png" };
    await expect(resolvedStepSettings(admin([image]), "workspace", reference, { outputs: {} }, 15)).resolves.toMatchObject({ generate_audio: false, image_urls: ["https://cdn.example.com/source.mp4"] });
  });
  it("deduplicates reference roles in the Seedance 2.5 media payload", async () => {
    const files = [
      { id: "one", kind: "video", mime: "video/mp4", storage_path: "workspace/one.mp4", name: "one.mp4", duration_s: 18 },
    ];
    const step = { id: "reference", capability_id: "higgsfield-seedance-reference-video" as const, purpose: "Animate a reference", role: "scene" as const, settings: { prompt: "Show the idea" }, reference_file_ids: ["one"], reference_step_ids: [], reference_roles: [{ source: "file" as const, id: "one", role: "product" as const }, { source: "file" as const, id: "one", role: "style" as const }], illustrative: true };
    await expect(resolvedStepSettings(admin([files[0]!], true), "workspace", step, { outputs: {} }, 30)).resolves.toMatchObject({ video_urls: ["https://cdn.example.com/workspace/one.mp4"] });
    await expect(resolvedStepSettings(admin([{ ...files[0], duration_s: 45 }], true), "workspace", step, { outputs: {} }, 30)).resolves.toMatchObject({ video_urls: ["https://cdn.example.com/workspace/one.mp4"] });
  });
  it("permits direct video editing only when the verified source length matches the finished film", async () => {
    const step = { id: "edit", capability_id: "higgsfield-seedance-video-edit" as const, purpose: "Edit", role: "finished_video" as const, settings: { prompt: "Restyle the source" }, reference_file_ids: ["source"], reference_step_ids: [], illustrative: true };
    const source = { id: "source", kind: "video", mime: "video/mp4", storage_path: "workspace/source.mp4", media_id: null, ai_summary: "Approved source", name: "source.mp4", duration_s: 15 };
    await expect(resolvedStepSettings(admin([source]), "workspace", step, { outputs: {} }, 15)).resolves.toMatchObject({ video_url: "https://cdn.example.com/source.mp4" });
    await expect(resolvedStepSettings(admin([source]), "workspace", step, { outputs: {} }, 60)).rejects.toThrow("approved finished duration");
    const generatedSource = { ...step, reference_file_ids: [], reference_step_ids: ["prior"] };
    await expect(resolvedStepSettings(admin(), "workspace", generatedSource, { outputs: { prior: { path: "workspace/prior.mp4", kind: "video", mime: "video/mp4", bytes: 1, stepId: "prior-step" } } }, 15)).rejects.toThrow("approved finished duration");
  });
  it("maps Genjutsu motion and identity roles from owned media and keeps it as a scene", async () => {
    const files = [
      { id: "motion", kind: "video", mime: "video/mp4", storage_path: "workspace/motion.mp4", media_id: null, ai_summary: "Approved motion", name: "motion.mp4", duration_s: 8, size_bytes: 1000000, width: 1280, height: 720 },
      { id: "identity", kind: "image", mime: "image/png", storage_path: "workspace/identity.png", media_id: null, ai_summary: "Approved identity", name: "identity.png", size_bytes: 100000, width: 512, height: 512 },
    ];
    const step = { id: "transfer", capability_id: "higgsfield-genjutsu-motion-transfer" as const, purpose: "Move the approved character", role: "scene" as const, settings: { prompt: "Maintain identity" }, reference_file_ids: ["identity", "motion"], reference_step_ids: [], reference_roles: [{ source: "file" as const, id: "identity", role: "identity" as const }, { source: "file" as const, id: "motion", role: "motion" as const }], illustrative: true };
    await expect(resolvedStepSettings(admin(files), "workspace", step, { outputs: {} }, 30)).resolves.toMatchObject({ video_url: "https://cdn.example.com/source.mp4", image_urls: ["https://cdn.example.com/source.mp4"] });
    await expect(resolvedStepSettings(admin(files), "workspace", { ...step, role: "finished_video" }, { outputs: {} }, 30)).rejects.toThrow("scene");
  });
});
