import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ steps: vi.fn(), media: vi.fn() }));
vi.mock("../lib/supabase-admin.server", () => ({ getAdminClient: vi.fn() }));
vi.mock("../lib/generation-tracker.server", () => ({ listRenderSteps: mocks.steps }));
vi.mock("../lib/render.server", () => ({ getMedia: mocks.media }));
import { readVideoPlan } from "../lib/video-plan.server";

const workspace = "workspace-a", variantId = "variant-a", renderId = "render-a";
const step = (fileIds: string[] = [], previous: string[] = []) => ({ id: "reference_film", capability_id: "higgsfield-wan-reference-video", purpose: "Create the selected reference film", role: "finished_video", reference_file_ids: fileIds, reference_step_ids: previous, settings: { prompt: "Frozen provider prompt", duration: 30, generate_audio: false }, illustrative: true });
const brief = (files: string[] = [], previous: string[] = []) => ({ hook: "Frozen title", voiceover: "Frozen narration", duration_s: 30, size: "1080x1920", script: "Frozen scene sequence", version: 1, beats: ["Frozen opening"], production_plan: { version: 1, steps: [step(files, previous)], direct_video: { audio_mode: "silent" } } });
const file = (id: string, storagePath = `${workspace}/uploads/${id}.jpg`) => ({ id, workspace_id: workspace, name: `${id}.jpg`, kind: "image", storage_path: storagePath, media_id: null, ai_summary: "Selected image" });

function fixture() {
  const state = {
    allowed: true,
    asset: { id: variantId, workspace_id: workspace, ...brief(), hook: "Edited title", script: "Edited script", duration_s: 15, version: 2 },
    render: { id: renderId, variant_id: variantId, workspace_id: workspace, version: 1, status: "failed", phase: "provider", brief_snapshot: brief(), production_state: { outputs: {} }, updated_at: "2026-11-04T12:00:00Z" },
    files: [] as ReturnType<typeof file>[],
    proofs: [] as Record<string, unknown>[],
  };
  const queries: { table: string; filters: Record<string, unknown> }[] = [];
  const sign = vi.fn(async (path: string) => ({ data: { signedUrl: `https://storage.example.com/preview/${path}` }, error: null }));
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    const query = { table, filters };
    queries.push(query);
    const resolve = () => {
      let rows: Record<string, unknown>[] = table === "creative_variants" ? [state.asset] : table === "render_jobs" ? [state.render] : table === "brand_files" ? state.files : table === "generation_steps" ? state.proofs : [];
      rows = rows.filter((row) => Object.entries(filters).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
      return { data: rows, error: null };
    };
    const chain = {
      select: () => chain,
      eq: (key: string, value: unknown) => { filters[key] = value; return chain; },
      in: (key: string, value: unknown[]) => { filters[key] = value; return chain; },
      limit: () => chain,
      single: async () => ({ ...resolve(), data: resolve().data[0] ?? null }),
      maybeSingle: async () => ({ ...resolve(), data: resolve().data[0] ?? null }),
      then: (resolvePromise: (value: unknown) => unknown) => Promise.resolve(resolve()).then(resolvePromise),
    };
    return chain;
  });
  const rpc = vi.fn(async () => ({ data: state.allowed, error: null }));
  const admin = { from, rpc, storage: { from: vi.fn(() => ({ createSignedUrl: sign })) } };
  const read = (render = renderId) => readVideoPlan(admin as unknown as Parameters<typeof readVideoPlan>[0], "user-a", { variant_id: variantId, render_id: render });
  return { state, queries, sign, from, rpc, read };
}

beforeEach(() => { vi.clearAllMocks(); mocks.steps.mockResolvedValue([]); });

describe("authorised video production plans", () => {
  it("denies workspace non-members before loading renders, ledger, files or media", async () => {
    const f = fixture(); f.state.allowed = false;
    await expect(f.read()).rejects.toThrow("Forbidden");
    expect(f.queries.map((q) => q.table)).toEqual(["creative_variants"]);
    expect(f.rpc).toHaveBeenCalledWith("can_access_workspace", { _user_id: "user-a", _workspace_id: workspace });
    expect(mocks.steps).not.toHaveBeenCalled(); expect(f.sign).not.toHaveBeenCalled(); expect(mocks.media).not.toHaveBeenCalled();
  });

  it.each(["variant_id", "workspace_id"] as const)("rejects a render with the wrong %s", async (key) => {
    const f = fixture(); f.state.render[key] = "other";
    await expect(f.read()).rejects.toThrow("production attempt is unavailable");
    expect(f.queries.find((q) => q.table === "render_jobs")?.filters).toEqual({ id: renderId, variant_id: variantId, workspace_id: workspace });
    expect(mocks.steps).not.toHaveBeenCalled(); expect(f.sign).not.toHaveBeenCalled();
  });

  it("rejects a historical attempt without its saved brief instead of using the live edit", async () => {
    const f = fixture(); f.state.render.brief_snapshot = null as unknown as ReturnType<typeof brief>;
    await expect(f.read()).rejects.toThrow("saved plan for this older attempt is unavailable");
    expect(mocks.steps).not.toHaveBeenCalled(); expect(f.sign).not.toHaveBeenCalled();
  });

  it("shows frozen duration, script, narration and provider prompt despite later live edits", async () => {
    const f = fixture();
    const plan = await f.read();
    expect(plan).toMatchObject({ title: "Frozen title", duration: 30, version: 1, script: "Frozen scene sequence", voiceover: "Frozen narration", beats: ["Frozen opening"], snapshot: true, renderId });
    expect(plan.steps[0]).toMatchObject({ prompt: "Frozen provider prompt", status: "planned", settingsSource: "recorded_plan" });
    expect(mocks.steps).toHaveBeenCalledWith(renderId, expect.anything());
  });

  it("keeps saved reference order even when the database returns a different order", async () => {
    const f = fixture(); f.state.render.brief_snapshot = brief(["third", "first", "second"]);
    f.state.files = [file("first"), file("second"), file("third")];
    const plan = await f.read();
    expect(plan.steps[0].references.map((r) => r.id)).toEqual(["third", "first", "second"]);
    expect(plan.steps[0].references.every((r) => !!r.url)).toBe(true);
    expect(f.queries.find((q) => q.table === "brand_files")?.filters.workspace_id).toBe(workspace);
    expect(f.sign).toHaveBeenCalledWith(`${workspace}/uploads/first.jpg`, 900);
  });

  it("returns safe ledger settings and labelled estimates without exposing payload URLs or credentials", async () => {
    const f = fixture();
    mocks.steps.mockResolvedValue([{ step_key: "provider:reference_film", status: "running", provider_job_id: "accepted", settings: { duration: 30, resolution: "1080p", Authorization: "private-credential", image_urls: ["https://storage.example.com/private?token=secret"], prompt: "Hidden payload" }, cost_kind: "estimate", cost_currency: "USD", cost_amount: 1.25 }]);
    const plan = await f.read();
    expect(plan.steps[0]).toMatchObject({ status: "running", accepted: true, cost: { amount: 1.25, currency: "USD", kind: "estimate" }, settings: [{ label: "Duration", value: "30" }, { label: "Resolution", value: "1080p" }] });
    expect(JSON.stringify(plan)).not.toMatch(/private-credential|token=secret|Hidden payload/);
  });

  it("never signs traversing or cross-workspace file and generated-output paths", async () => {
    const f = fixture();
    f.state.render.brief_snapshot = brief(["traversal", "cross", "backslash"], ["generated_a", "generated_b"]);
    f.state.files = [file("traversal", `${workspace}/../workspace-b/private.jpg`), file("cross", "workspace-b/private.jpg"), file("backslash", `${workspace}/uploads\\private.jpg`)];
    f.state.render.production_state.outputs = { generated_a: { path: `${workspace}/../private.mp4`, kind: "video" }, generated_b: { path: "workspace-b/renders/other/video.mp4", kind: "video" } };
    const plan = await f.read();
    expect(plan.steps[0].references).toHaveLength(5);
    expect(plan.steps[0].references.every((r) => r.url === null)).toBe(true);
    expect(f.sign).not.toHaveBeenCalled(); expect(mocks.media).not.toHaveBeenCalled();
    expect(f.queries.some((q) => q.table === "generation_steps")).toBe(false);
  });

  it("requires completed ledger proof scoped to this workspace and variant before signing generated media", async () => {
    const f = fixture(); f.state.render.brief_snapshot = brief([], ["generated"]);
    const path = `${workspace}/renders/earlier/generated.mp4`;
    f.state.render.production_state.outputs = { generated: { path, kind: "video" } };
    f.state.proofs = [{ id: "proof", workspace_id: workspace, variant_id: "other-variant", status: "completed", output_storage_path: path }];
    const plan = await f.read();
    expect(plan.steps[0].references[0].url).toBeNull(); expect(f.sign).not.toHaveBeenCalled();
    expect(f.queries.find((q) => q.table === "generation_steps")?.filters).toEqual({ workspace_id: workspace, variant_id: variantId, status: "completed", output_storage_path: path });
  });
});
