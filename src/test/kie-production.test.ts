import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ begin: vi.fn(), update: vi.fn(), complete: vi.fn(), fail: vi.fn(), previous: vi.fn(), poll: vi.fn(), submit: vi.fn(), download: vi.fn(), upload: vi.fn() }));
vi.mock("../lib/generation-tracker.server", () => ({ beginStep: mocks.begin, updateStep: mocks.update, completeStep: mocks.complete, failStep: mocks.fail, previousGenerationStep: mocks.previous }));
vi.mock("../lib/creative-providers/adapters.server", async (original) => { const actual = await original<typeof import("../lib/creative-providers/adapters.server")>(); return { ...actual, pollCreativeProviderJob: mocks.poll, submitCreativeProviderJob: mocks.submit, getCreativeProviderAvailability: () => [{ capabilityId: "kie-veo-text-video", available: true }, { capabilityId: "kie-nano-image-edit", available: true }, { capabilityId: "kie-veo-image-video", available: true }] }; });
vi.mock("../lib/creative-media.server", () => ({ downloadCreativeMedia: mocks.download }));
import { advanceProduction, resolvedStepSettings } from "../lib/production.server";
import type { AssetRow, RenderRow } from "../lib/asset-versions.server";
import type { getAdminClient } from "../lib/supabase-admin.server";

const file = (id: string, overrides: Record<string, unknown> = {}) => ({ id, workspace_id: "workspace", kind: "image", mime: "image/png", size_bytes: 100, storage_path: `workspace/${id}.png`, name: `${id}.png`, ...overrides });
function admin(files: Array<ReturnType<typeof file>> = []) {
  const db = { from: (table: string) => table === "brand_files" ? { select: () => ({ eq: (_column: string, workspace: string) => ({ in: async (_column: string, ids: string[]) => ({ data: files.filter(f => f.workspace_id === workspace && ids.includes(f.id)), error: null }) }) }) } : { update: () => ({ eq: () => ({ eq: async () => ({ error: null }), is: async () => ({ error: null }) }) }) }, rpc: async (name: string) => name === "acquire_creative_provider_slot" ? { data: { acquired: true, slot_id: "slot", lease_token: "lease", reason: "existing" }, error: null } : { data: true, error: null }, storage: { from: () => ({ upload: mocks.upload, createSignedUrl: async (path: string) => ({ data: { signedUrl: `https://cdn.example.com/${path}` }, error: null }) }) } };
  return db as unknown as ReturnType<typeof getAdminClient>;
}
const edit = { id: "edit", capability_id: "kie-nano-image-edit" as const, purpose: "Edit", role: "scene" as const, settings: { prompt: "Edit the image" }, reference_file_ids: ["a"], reference_step_ids: [], illustrative: true };
const frames = { ...edit, capability_id: "kie-veo-image-video" as const, reference_file_ids: ["last", "first"], reference_roles: [{ source: "file" as const, id: "last", role: "last_frame" as const }, { source: "file" as const, id: "first", role: "first_frame" as const }] };
const direction = Object.fromEntries(["audience", "objective", "insight", "argument", "hook", "story_mechanism", "composition", "motion", "imagery", "pacing", "ending", "typography", "sound", "evidence", "asset_strategy"].map(key => [key, `Specific ${key}`]));
beforeEach(() => { vi.clearAllMocks(); mocks.previous.mockResolvedValue(null); mocks.begin.mockResolvedValue({ created: false, step: { id: "step", status: "running", provider_job_id: "remote-1", settings: { resolution: "720p" }, created_at: new Date().toISOString() } }); mocks.poll.mockResolvedValue({ requestId: "remote-1", status: "completed", creditsConsumed: 12, outputs: [{ type: "video", url: "https://cdn.example.com/a.mp4" }] }); mocks.upload.mockResolvedValue({ error: null }); mocks.complete.mockResolvedValue({}); mocks.download.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "video/mp4", extension: "mp4" }); });
describe("Kie production integration", () => {
  it("binds only owned image inputs", async () => {
    await expect(resolvedStepSettings(admin([file("a")]), "workspace", edit, { outputs: {} }, 15)).resolves.toMatchObject({ image_input: ["https://cdn.example.com/workspace/a.png"] });
    await expect(resolvedStepSettings(admin([file("a", { workspace_id: "other" })]), "workspace", edit, { outputs: {} }, 15)).rejects.toThrow("no longer available");
  });
  it("orders approved first and last frames regardless of selection order", async () => {
    await expect(resolvedStepSettings(admin([file("first"), file("last")]), "workspace", frames, { outputs: {} }, 15)).resolves.toMatchObject({ image_urls: ["https://cdn.example.com/workspace/first.png", "https://cdn.example.com/workspace/last.png"] });
  });
  it("rejects unsupported reference formats", async () => {
    await expect(resolvedStepSettings(admin([file("a", { mime: "image/gif" })]), "workspace", edit, { outputs: {} }, 15)).rejects.toThrow("JPEG, PNG or WebP");
  });
  it("resumes a known Kie job, stores output and actual credits, and never resubmits", async () => {
    const db = admin();
    const job = { id: "render", workspace_id: "workspace", variant_id: "variant", created_by: "user", production_state: { engine_version: 1, outputs: {} } } as unknown as RenderRow;
    const scene = { id: "scene", capability_id: "kie-veo-text-video", purpose: "Scene", role: "scene", settings: { prompt: "Sunrise", resolution: "720p" }, reference_file_ids: [], reference_step_ids: [], illustrative: true };
    const asset = { id: "variant", production_plan: { version: 1, direction, steps: [scene], assumptions: [], diversity_issues: [] }, duration_s: 15, voiceover: "Approved" } as unknown as AssetRow;
    const result = await advanceProduction(db, job, asset);
    expect(result.state.outputs['scene']).toMatchObject({ path: "workspace/renders/render/scene.mp4", stepId: "step" });
    expect(mocks.complete).toHaveBeenCalledWith("step", expect.objectContaining({ usage: { credits: 12 } }), db);
    expect(mocks.poll).toHaveBeenCalledOnce(); expect(mocks.submit).not.toHaveBeenCalled();
  });
});
