import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: { rpc: vi.fn(), from: vi.fn() }, narratives: [] as unknown[], stage: "narratives", files: [] as unknown[], updates: [] as unknown[], active: [] as unknown[], changed: true }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => mocks.admin }));
import { persistAssetCreation, loadAssetCreation } from "./asset-creation.server";
const ws = "11111111-1111-4111-8111-111111111111", batch = "22222222-2222-4222-8222-222222222222", image = "33333333-3333-4333-8333-333333333333", audio = "44444444-4444-4444-8444-444444444444";
beforeEach(() => {
  vi.resetAllMocks(); mocks.narratives = [{ id: "idea", title: "A product demonstration", message: "Use the real app", selected: true, other_saved_field: "preserve" }]; mocks.files = [{ id: image, name: "Demo screenshot", kind: "image" }, { id: audio, name: "Licensed soundtrack.wav", kind: "audio" }]; mocks.stage = "narratives"; mocks.updates = []; mocks.active = []; mocks.changed = true;
  mocks.admin.rpc.mockResolvedValue({ data: true, error: null });
  mocks.admin.from.mockImplementation((table: string) => {
    let mutation = false;
    const q: Record<string, any> = {};
    for (const name of ["select", "eq", "order", "limit", "in"]) q[name] = () => q;
    q.update = (patch: unknown) => { mutation = true; mocks.updates.push(patch); return q; };
    q.maybeSingle = () => Promise.resolve({ data: table === "workspaces" ? { name: "Our app" } : { id: batch, stage: mocks.stage, narratives: mocks.narratives, updated_at: "2026-11-05T00:00:00Z" }, error: null });
    q.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve({ data: table === "brand_files" ? mocks.files : table === "creative_planning_jobs" ? mocks.active : mutation ? mocks.changed ? [{ id: batch }] : [] : [], error: null }).then(resolve, reject);
    return q;
  });
});
describe("saved asset requirements", () => {
  it("rejects workspace access before privileged state reads", async () => {
    mocks.admin.rpc.mockResolvedValue({ data: false, error: null });
    await expect(loadAssetCreation("user", ws, batch)).rejects.toThrow("access"); expect(mocks.admin.from).not.toHaveBeenCalled();
  });
  it("persists deferred requests with existing narrative fields intact", async () => {
    const result = await persistAssetCreation("user", { workspace_id: ws, batch_id: batch, recipe_id: "reaction-demo", file_ids: [], deferred: true });
    expect(result.state.status).toBe("waiting_for_assets"); expect(result.state.missing_inputs).toHaveLength(1);
    expect((mocks.updates[0] as any).narratives[0]).toMatchObject({ other_saved_field: "preserve", asset_creation: { deferred: true } });
  });
  it("rejects foreign files and audio without rights before writes", async () => {
    await expect(persistAssetCreation("user", { workspace_id: ws, batch_id: batch, recipe_id: "reaction-demo", file_ids: ["foreign"], deferred: false })).rejects.toThrow("belonging");
    await expect(persistAssetCreation("user", { workspace_id: ws, batch_id: batch, recipe_id: "branded-motion", file_ids: [], deferred: false, music_file_id: audio, music_rights_confirmed: false })).rejects.toThrow("rights");
    expect(mocks.updates).toEqual([]);
  });
  it("saves explicit demo-video and licensed-audio choices without creating a render", async () => {
    mocks.files = [{ id: image, name: "App walkthrough.mp4", kind: "video" }, { id: audio, name: "Licensed soundtrack.wav", kind: "audio" }];
    const result = await persistAssetCreation("user", { workspace_id: ws, batch_id: batch, recipe_id: "reaction-demo", file_ids: [image], deferred: false, music_file_id: audio, music_rights_confirmed: true });
    expect(result.state).toMatchObject({ status: "ready_to_create", file_ids: [image], music_file_id: audio });
    expect(mocks.admin.from.mock.calls.map(([table]) => table)).not.toContain("render_jobs");
  });
  it("changes the recipe explicitly when graphics alternative is chosen", async () => {
    const result = await persistAssetCreation("user", { workspace_id: ws, batch_id: batch, recipe_id: "reaction-demo", file_ids: [], deferred: false, alternative: "graphics" });
    expect(result.state).toMatchObject({ recipe_id: "branded-motion", style_id: "brand-motion", missing_inputs: [], status: "ready_to_create" });
  });
  it("refuses mutation while storyboard preparation is active or version changed", async () => {
    mocks.active = [{ id: "active" }]; await expect(persistAssetCreation("user", { workspace_id: ws, batch_id: batch, recipe_id: "branded-motion", file_ids: [], deferred: false })).rejects.toThrow("already preparing"); expect(mocks.updates).toEqual([]);
    mocks.active = []; mocks.changed = false; await expect(persistAssetCreation("user", { workspace_id: ws, batch_id: batch, recipe_id: "branded-motion", file_ids: [], deferred: false })).rejects.toThrow("changed");
  });
});
