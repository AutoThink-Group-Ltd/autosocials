import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), user: vi.fn(), steps: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerOnlyFn: (fn: any) => fn, createServerFn: () => {
  let validate: (input: unknown) => unknown = (input) => input;
  const chain = { inputValidator: (fn: typeof validate) => { validate = fn; return chain; }, handler: (fn: (context: { data: unknown }) => unknown) => (input: { data: unknown }) => Promise.resolve().then(() => fn({ data: validate(input.data) })) };
  return chain;
} }));
vi.mock("../lib/supabase-admin.server", () => ({ requireUser: mocks.user, getAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../lib/brand-context.server", () => ({ requireBrandContext: vi.fn() }));
vi.mock("../lib/dossier.server", () => ({ aiChat: vi.fn(), loadDossierContext: vi.fn() }));
vi.mock("../lib/generation-tracker.server", () => ({ listRenderSteps: mocks.steps }));
import { buildProductionRetrySeed, retryFailedProduction } from "../lib/creative.functions";
import type { RenderRow } from "../lib/asset-versions.server";

const ws = "11111111-1111-4111-8111-111111111111", render = "22222222-2222-4222-8222-222222222222", variant = "33333333-3333-4333-8333-333333333333", active = "44444444-4444-4444-8444-444444444444";
const path = `${ws}/renders/${render}/scene_a.mp4`;
const source = () => ({ id: render, workspace_id: ws, variant_id: variant, status: "failed", version: 2,
  brief_snapshot: { hook: "Opening", voiceover: "Approved narration", duration_s: 30, beats: ["Opening"], production_plan: { version: 1, steps: [{ id: "scene_a", capability_id: "higgsfield-seedance-text-video" }, { id: "scene_b", capability_id: "higgsfield-seedance-text-video" }] } },
  production_state: { engine_version: 1, outputs: { scene_a: { path, kind: "video", mime: "video/mp4", bytes: 500, stepId: "old" } }, failed_steps: { scene_b: "Provider failed" }, polling: { scene_b: { attempt: 4 } } },
}) as unknown as RenderRow;
const completed = () => ({ id: "55555555-5555-4555-8555-555555555555", step_key: "provider:scene_a", status: "completed", provider: "higgsfield", model: "bytedance/seedance-2.0/text-to-video", provider_job_id: "accepted-a", output_storage_path: path, error_code: null });
const failed = () => ({ ...completed(), id: "66666666-6666-4666-8666-666666666666", step_key: "provider:scene_b", status: "failed", provider_job_id: "accepted-b", output_storage_path: null, error_code: "generation_failed" });
beforeEach(() => { vi.clearAllMocks(); mocks.user.mockResolvedValue({ id: "user" }); mocks.rpc.mockResolvedValue({ data: true, error: null }); mocks.steps.mockResolvedValue([completed(), failed()]); });

describe("targeted production retry", () => {
  it("carries only confirmed completed assets and starts with no old failure or polling state", () => {
    const seed = buildProductionRetrySeed(source(), [completed(), failed()]);
    expect(seed).toEqual({ source_render_id: render, outputs: { scene_a: { path, kind: "video", mime: "video/mp4", bytes: 500, stepId: completed().id } } });
    expect(seed).not.toHaveProperty("failed_steps"); expect(seed).not.toHaveProperty("polling");
  });
  it("blocks accepted, reserved and uncertain paid operations before creating a fresh attempt", () => {
    for (const status of ["reserved", "submitted", "running", "reconciliation_required"]) expect(() => buildProductionRetrySeed(source(), [completed(), { ...failed(), status }])).toThrow("active or uncertain");
    expect(() => buildProductionRetrySeed(source(), [completed(), { ...failed(), provider_job_id: null }])).toThrow("no confirmed job identity");
    expect(() => buildProductionRetrySeed(source(), [completed(), { ...failed(), provider_job_id: null, error_code: "rate_limited" }])).not.toThrow();
  });
  it("rejects forged, cross-attempt and incomplete saved outputs", () => {
    expect(() => buildProductionRetrySeed(source(), [failed()])).toThrow("no confirmed completion");
    const forged = source(); (forged.production_state as Record<string, any>)["outputs"].scene_a.path = `${ws}/renders/other/scene_a.mp4`;
    expect(() => buildProductionRetrySeed(forged, [completed(), failed()])).toThrow("outside this attempt");
    expect(() => buildProductionRetrySeed(source(), [{ ...completed(), model: "wrong-model" }, failed()])).toThrow("provider operation");
  });
  it("requires a failed current-engine attempt with the frozen original brief", () => {
    expect(() => buildProductionRetrySeed({ ...source(), status: "done" }, [completed()])).toThrow("failed production");
    expect(() => buildProductionRetrySeed({ ...source(), production_state: {} }, [completed()])).toThrow("older production");
    expect(() => buildProductionRetrySeed({ ...source(), brief_snapshot: null }, [completed()])).toThrow("original saved brief");
  });
  it("checks workspace membership before loading prior operations", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    mocks.from.mockReturnValue({ select: () => ({ eq: () => ({ single: async () => ({ data: { id: variant, workspace_id: ws, version: 2 }, error: null }) }) }) });
    const call = retryFailedProduction as unknown as (input: { data: unknown }) => Promise<unknown>;
    await expect(call({ data: { variant_id: variant, render_id: render, confirmed: true } })).rejects.toThrow("Forbidden");
    expect(mocks.steps).not.toHaveBeenCalled();
  });
  it("returns an already active retry without admitting or submitting another production", async () => {
    mocks.from.mockImplementation((table: string) => {
      const chain: Record<string, any> = {};
      for (const method of ["select", "eq", "in", "limit"]) chain[method] = () => chain;
      chain["single"] = async () => ({ data: table === "creative_variants" ? { ...source().brief_snapshot as object, id: variant, workspace_id: ws, version: 2 } : source(), error: null });
      chain["maybeSingle"] = async () => ({ data: { id: active, version: 2 }, error: null });
      return chain;
    });
    const call = retryFailedProduction as unknown as (input: { data: unknown }) => Promise<unknown>;
    await expect(call({ data: { variant_id: variant, render_id: render, confirmed: true } })).resolves.toEqual({ render_id: active, reused_assets: 1 });
    expect(mocks.rpc.mock.calls.map(([name]) => name)).not.toContain("admit_creative_render");
  });
  it("rejects mixing legacy same-version duration edits with completed old scenes", async () => {
    mocks.from.mockImplementation((table: string) => {
      const chain: Record<string, any> = {};
      for (const method of ["select", "eq"]) chain[method] = () => chain;
      chain["single"] = async () => ({ data: table === "creative_variants" ? { ...source().brief_snapshot as object, id: variant, workspace_id: ws, version: 2, duration_s: 15 } : source(), error: null });
      return chain;
    });
    const call = retryFailedProduction as unknown as (input: { data: unknown }) => Promise<unknown>;
    await expect(call({ data: { variant_id: variant, render_id: render, confirmed: true } })).rejects.toThrow("current brief");
  });
  it("rejects reusing completed scenes from an older brief version", async () => {
    mocks.from.mockImplementation((table: string) => {
      const chain: Record<string, any> = {};
      for (const method of ["select", "eq"]) chain[method] = () => chain;
      chain["single"] = async () => ({ data: table === "creative_variants" ? { id: variant, workspace_id: ws, version: 3 } : source(), error: null });
      return chain;
    });
    const call = retryFailedProduction as unknown as (input: { data: unknown }) => Promise<unknown>;
    await expect(call({ data: { variant_id: variant, render_id: render, confirmed: true } })).rejects.toThrow("current brief");
  });
  it("uses the current brief for a confirmed retry when an edited attempt has no completed outputs", async () => {
    mocks.steps.mockResolvedValue([{ ...failed(), provider_job_id: null, error_code: "production_preflight_failed" }]);
    mocks.from.mockImplementation((table: string) => {
      const chain: Record<string, any> = {};
      for (const method of ["select", "eq", "in", "limit"]) chain[method] = () => chain;
      chain["single"] = async () => ({ data: table === "creative_variants" ? { ...source().brief_snapshot as object, id: variant, workspace_id: ws, version: 3, duration_s: 15 } : { ...source(), production_state: { engine_version: 1, outputs: {} } }, error: null });
      chain["maybeSingle"] = async () => ({ data: { id: active, version: 3 }, error: null });
      return chain;
    });
    const call = retryFailedProduction as unknown as (input: { data: unknown }) => Promise<unknown>;
    await expect(call({ data: { variant_id: variant, render_id: render, confirmed: true } })).resolves.toEqual({ render_id: active, reused_assets: 0 });
  });
  it("requires explicit confirmation at the mutation boundary", async () => {
    const call = retryFailedProduction as unknown as (input: { data: unknown }) => Promise<unknown>;
    await expect(call({ data: { variant_id: variant, render_id: render } })).rejects.toThrow();
    expect(mocks.user).not.toHaveBeenCalled();
  });
});
