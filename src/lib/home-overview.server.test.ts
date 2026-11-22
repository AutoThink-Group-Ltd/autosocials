import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: { rpc: vi.fn(), from: vi.fn() } }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => mocks.admin }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (handler: unknown) => handler }) }) }));
import { getHomeOverviewForUser } from "./home-overview.server";
import { modelFailureMarker } from "./home-overview";
const workspace = "11111111-1111-4111-8111-111111111111", batchId = "22222222-2222-4222-8222-222222222222";
const request = { workspace_id: workspace, request_id: batchId, prompt: "An illustrative London city film", file_ids: [], style_id: "cinematic-scene", duration: 30, size: "1080x1920", captions: "clean" };
const batch = () => ({ id: batchId, workspace_id: workspace, created_by: "user", title: "Needs review: London", stage: "briefs", created_at: "2026-11-05T01:00:00Z", updated_at: "2026-11-05T01:00:00Z", narratives: [{ title: "London", message: request.prompt, why: `Manual Models request. ${modelFailureMarker}`, model_create_request: request }] });
let rows: Record<string, unknown[]>;
let filters: Array<[string, string, unknown]>;
beforeEach(() => {
  vi.resetAllMocks(); rows = { creative_batches: [batch()], creative_variants: [], render_jobs: [], generation_steps: [], creative_planning_jobs: [] }; filters = [];
  mocks.admin.rpc.mockResolvedValue({ data: true, error: null });
  mocks.admin.from.mockImplementation((table: string) => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn((key: string, value: unknown) => { filters.push([table, key, value]); return query; }), in: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(), then: (resolve: (value: unknown) => void) => Promise.resolve({ data: rows[table], error: null }).then(resolve) };
    return query;
  });
});
describe("Home overview access", () => {
  it("rejects unauthorized workspaces before reading their saved work", async () => {
    mocks.admin.rpc.mockResolvedValue({ data: false });
    await expect(getHomeOverviewForUser("user", workspace)).rejects.toThrow("access");
    expect(mocks.admin.from).not.toHaveBeenCalled();
  });
  it("returns owned saved settings without revalidating mutable provider/files", async () => {
    const result = await getHomeOverviewForUser("user", workspace);
    expect(result[0]).toMatchObject({ action: "retry_model", resume_request: request, model_name: "Cinematic Scene" });
    expect(filters).toContainEqual(["creative_batches", "workspace_id", workspace]);
    expect(filters).toContainEqual(["creative_variants", "workspace_id", workspace]);
    expect(mocks.admin.from.mock.calls.map(([table]) => table)).not.toContain("brand_files");
  });
  it("does not expose another user's replay payload", async () => {
    const result = await getHomeOverviewForUser("another-user", workspace);
    expect(result[0].resume_request).toBeUndefined();
    expect(result[0].can_resume_model).toBe(false);
    expect(result[0].action).toBe("resume");
  });
  it("authorizes only the exact owner to recover a legacy session's settings", async () => {
    rows.creative_batches = [{ ...batch(), narratives: [{ message: request.prompt, why: `Manual Models request. ${modelFailureMarker}` }] }];
    expect((await getHomeOverviewForUser("user", workspace))[0]).toMatchObject({ can_resume_model: true, saved_prompt: request.prompt });
    expect((await getHomeOverviewForUser("another-user", workspace))[0].can_resume_model).toBe(false);
  });
  it.each(["workspace_id", "request_id"])("rejects persisted request %s mismatches", async (field) => {
    rows.creative_batches = [{ ...batch(), narratives: [{ why: `Manual Models request. ${modelFailureMarker}`, model_create_request: { ...request, [field]: "33333333-3333-4333-8333-333333333333" } }] }];
    expect((await getHomeOverviewForUser("user", workspace))[0].resume_request).toBeUndefined();
  });
  it("rejects unavailable reads instead of pretending the workspace has no work", async () => {
    rows.creative_batches = undefined as never;
    await expect(getHomeOverviewForUser("user", workspace)).rejects.toThrow("could not be loaded");
  });
  it("does not offer decisions from truncated production history", async () => {
    rows.creative_variants = [{ id: "variant", batch_id: batchId, hook: "London", script: "Story", beats: ["Arrival"], created_at: "2026-11-05T01:00:00Z", updated_at: "2026-11-05T01:00:00Z" }];
    rows.render_jobs = Array.from({ length: 500 }, (_, index) => ({ id: `render-${index}`, variant_id: "variant", status: "failed", phase: null, error: "Failed", created_at: "2026-11-05T01:00:00Z" }));
    await expect(getHomeOverviewForUser("user", workspace)).rejects.toThrow("could not be checked completely");
  });
  it("fails closed when storyboard preparation history cannot be read", async () => {
    rows.creative_planning_jobs = undefined as never;
    await expect(getHomeOverviewForUser("user", workspace)).rejects.toThrow("storyboard preparation progress could not be checked");
    expect(filters).toContainEqual(["creative_planning_jobs", "workspace_id", workspace]);
  });
});
