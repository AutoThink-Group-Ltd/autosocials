import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ begin: vi.fn(), update: vi.fn(), complete: vi.fn(), fail: vi.fn(), previous: vi.fn(), poll: vi.fn(), submit: vi.fn(), estimate: vi.fn(), download: vi.fn(), upload: vi.fn() }));
vi.mock("../lib/generation-tracker.server", () => ({ beginStep: mocks.begin, updateStep: mocks.update, completeStep: mocks.complete, failStep: mocks.fail, previousGenerationStep: mocks.previous }));
vi.mock("../lib/creative-providers/adapters.server", async (original) => { const actual = await original<typeof import("../lib/creative-providers/adapters.server")>(); return { ...actual, pollCreativeProviderJob: mocks.poll, submitCreativeProviderJob: mocks.submit, estimateCreativeProviderJob: mocks.estimate, getCreativeProviderAvailability: () => [{ capabilityId: "higgsfield-seedance-text-video", available: true }] }; });
vi.mock("../lib/creative-media.server", () => ({ downloadCreativeMedia: mocks.download }));
import { advanceProduction, productionStepConcurrency } from "../lib/production.server";
import { CreativeProviderError } from "../lib/creative-providers/adapters.server";
import { MAX_PROVIDER_FILM_BYTES } from "../lib/content-rules";
import type { AssetRow, RenderRow } from "../lib/asset-versions.server";
import type { getAdminClient } from "../lib/supabase-admin.server";

const direction = Object.fromEntries(["audience", "objective", "insight", "argument", "hook", "story_mechanism", "composition", "motion", "imagery", "pacing", "ending", "typography", "sound", "evidence", "asset_strategy"].map((key) => [key, `Specific ${key}`]));
const scene = (id: string, dependencies: string[] = [], role = "scene") => ({ id, capability_id: "higgsfield-seedance-text-video", purpose: "Illustrative scene", role, settings: { prompt: "Sunrise", duration: 5 }, reference_file_ids: [], reference_step_ids: dependencies, illustrative: true });
const job = (state: unknown = { engine_version: 1, outputs: {} }) => ({ id: "render", workspace_id: "workspace", variant_id: "variant", created_by: "user", production_state: state }) as unknown as RenderRow;
const asset = (steps: ReturnType<typeof scene>[]) => ({ id: "variant", production_plan: { version: 1, direction, steps, assumptions: [], diversity_issues: [] }, duration_s: 15, voiceover: "Approved narration" }) as unknown as AssetRow;
const complete = (id: string) => ({ requestId: id, status: "completed", outputs: [{ type: "video", url: "https://cdn.example.com/scene.mp4" }] });
function database() {
  const writes: Array<Record<string, unknown>> = [];
  const db = { from: (table: string) => table === "brand_files" ? { select: () => ({ eq: async () => ({ data: [], error: null }) }) } : { update: (patch: Record<string, unknown>) => { writes.push(structuredClone(patch)); return { eq: () => ({ eq: async () => ({ error: null }), is: async () => ({ error: null }) }) }; } }, rpc: async (name: string) => name === "acquire_creative_provider_slot" ? { data: { acquired: true, slot_id: "slot", lease_token: "lease", reason: "existing" }, error: null } : { data: true, error: null }, storage: { from: () => ({ upload: mocks.upload, createSignedUrl: async () => ({ data: { signedUrl: "https://cdn.example.com/prior.mp4" } }) }) } };
  return { db: db as unknown as ReturnType<typeof getAdminClient>, writes };
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("CREATIVE_VIDEO_STEP_CONCURRENCY", "2");
  mocks.previous.mockResolvedValue(null);
  mocks.estimate.mockResolvedValue({ usd: "0.10" });
  mocks.begin.mockImplementation(async ({ stepKey }: { stepKey: string }) => ({ created: false, step: { id: stepKey, status: "running", provider_job_id: stepKey, created_at: "2026-01-01T00:00:00Z" } }));
  mocks.poll.mockImplementation(async ({ requestId }: { requestId: string }) => complete(requestId));
  mocks.download.mockResolvedValue({ bytes: new Uint8Array([1]), contentType: "video/mp4", extension: "mp4" });
  mocks.upload.mockResolvedValue({ error: null }); mocks.complete.mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe("bounded independent production waves", () => {
  it.each(["finished_video", "scene"] as const)("uses a bounded larger download allowance only for a %s", async (role) => {
    const { db } = database();
    await advanceProduction(db, job(), asset([scene("output", [], role)]));
    expect(mocks.download).toHaveBeenCalledOnce();
    expect(mocks.download).toHaveBeenCalledWith("https://cdn.example.com/scene.mp4", role === "finished_video" ? { expected: "video", maxBytes: 100 * 1024 * 1024 } : { expected: "video" });
    expect(MAX_PROVIDER_FILM_BYTES).toBe(100 * 1024 * 1024);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it.each(["estimate", "submit"] as const)("records a definite rejected authentication failure at %s without retrying paid generation", async (phase) => {
    const { db } = database();
    mocks.begin.mockResolvedValue({ created: true, step: { id: "reserved-step", status: "reserved", provider_job_id: null } });
    const failure = new CreativeProviderError("authentication_failed", "higgsfield", false, 401);
    if (phase === "estimate") mocks.estimate.mockRejectedValue(failure);
    else mocks.submit.mockRejectedValue(failure);
    await expect(advanceProduction(db, job(), asset([scene("a")]))).rejects.toThrow("API credentials are invalid or expired");
    expect(mocks.fail).toHaveBeenCalledWith("reserved-step", "authentication_failed", false, db);
    expect(mocks.submit).toHaveBeenCalledTimes(phase === "estimate" ? 0 : 1);
    expect(mocks.poll).not.toHaveBeenCalled();
  });
  it("records resolved request settings without the provider prompt or access-bearing URLs", async () => {
    const { db } = database();
    mocks.begin.mockResolvedValue({ created: true, step: { id: "reserved-step", status: "reserved", provider_job_id: null } });
    mocks.submit.mockResolvedValue({ requestId: "provider-job", status: "running", outputs: [] });
    await advanceProduction(db, job(), asset([scene("a")]));
    const submitted = mocks.update.mock.calls.find(([, patch]) => patch.status === "submitted")?.[1];
    expect(submitted.settings).toMatchObject({ settings_source: "resolved_request", duration: 5, has_prompt: true });
    expect(submitted.settings).not.toHaveProperty("prompt");
    expect(JSON.stringify(submitted.settings)).not.toContain("http");
  });
  it("defaults to two steps and caps configurable concurrency at four", () => {
    expect(productionStepConcurrency()).toBe(2);
    expect(productionStepConcurrency("20")).toBe(4);
    for (const invalid of ["0", "-1", "bad", "1.5"]) expect(productionStepConcurrency(invalid)).toBe(2);
  });
  it("polls two independent shots together and merges both outputs in one state write", async () => {
    let active = 0, peak = 0;
    mocks.poll.mockImplementation(async ({ requestId }: { requestId: string }) => { active++; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 5)); active--; return complete(requestId); });
    const { db, writes } = database();
    const result = await advanceProduction(db, job(), asset([scene("a"), scene("b"), scene("c")]));
    expect(peak).toBe(2); expect(mocks.poll).toHaveBeenCalledTimes(2);
    expect(Object.keys(result.state.outputs)).toEqual(["a", "b"]); expect(result.waiting).toBe(true);
    expect(writes).toHaveLength(1); expect(writes[0]?.["production_state"]).toMatchObject({ outputs: { a: { stepId: "provider:a" }, b: { stepId: "provider:b" } } });
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("waits for dependency output before advancing the dependent shot", async () => {
    const { db } = database(), film = asset([scene("a"), scene("b", ["a"])]);
    const first = await advanceProduction(db, job(), film);
    expect(mocks.begin).toHaveBeenCalledTimes(1); expect(first.state.outputs["a"]).toBeDefined(); expect(first.state.outputs["b"]).toBeUndefined();
    const second = await advanceProduction(db, job(first.state), film);
    expect(mocks.begin).toHaveBeenCalledTimes(2); expect(second.waiting).toBe(false); expect(second.state.outputs["b"]).toBeDefined();
  });
  it("does not start a finished provider film while any sibling ingredient remains active", async () => {
    const { db } = database(), film = asset([scene("a"), scene("b"), scene("final", [], "finished_video")]);
    mocks.poll.mockImplementation(async ({ requestId }: { requestId: string }) => requestId === "provider:b" ? { requestId, status: "running", outputs: [] } : complete(requestId));
    const result = await advanceProduction(db, job(), film);
    await advanceProduction(db, job(result.state), film);
    expect(mocks.begin.mock.calls.map((call) => call[0].stepKey)).toEqual(["provider:a", "provider:b", "provider:b"]);
  });
  it("saves a successful sibling before surfacing another shot's failure", async () => {
    const { db, writes } = database();
    mocks.poll.mockImplementation(async ({ requestId }: { requestId: string }) => requestId === "provider:a" ? { requestId, status: "failed", outputs: [] } : complete(requestId));
    await expect(advanceProduction(db, job(), asset([scene("a"), scene("b")]))).rejects.toThrow("did not complete");
    expect(writes[0]?.["production_state"]).toMatchObject({ outputs: { b: { stepId: "provider:b" } } });
    expect(mocks.complete).toHaveBeenCalledWith("provider:b", expect.anything(), db);
    expect(mocks.fail).toHaveBeenCalledWith("provider:a", "provider_terminal_failed", false, db);
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("retains uncertain reservations without submitting a duplicate after restart", async () => {
    const { db } = database();
    mocks.begin.mockResolvedValue({ created: false, step: { id: "uncertain", status: "reserved", provider_job_id: null } });
    await expect(advanceProduction(db, job(), asset([scene("a")]))).rejects.toThrow("reconciliation");
    expect(mocks.submit).not.toHaveBeenCalled(); expect(mocks.poll).not.toHaveBeenCalled();
  });
  it("ingests already accepted siblings after a fatal shot error without starting more paid work", async () => {
    const { db, writes } = database(), film = asset([scene("a"), scene("b"), scene("c")]);
    mocks.poll.mockImplementation(async ({ requestId }: { requestId: string }) => requestId === "provider:a"
      ? { requestId, status: "failed", outputs: [] } : { requestId, status: "running", outputs: [] });
    const first = await advanceProduction(db, job(), film);
    expect(first.waiting).toBe(true); expect(first.state.active_steps).toEqual(["b"]);
    expect(first.state.failed_steps?.["a"]).toContain("did not complete");
    mocks.poll.mockImplementation(async ({ requestId }: { requestId: string }) => complete(requestId));
    await expect(advanceProduction(db, job(first.state), film)).rejects.toThrow("did not complete");
    expect(mocks.begin.mock.calls.map((call) => call[0].stepKey)).toEqual(["provider:a", "provider:b", "provider:b"]);
    expect(writes.at(-1)?.["production_state"]).toMatchObject({ outputs: { b: { stepId: "provider:b" } }, active_steps: [] });
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("persists Retry-After and avoids polling again before the provider permits it", async () => {
    const { db } = database();
    mocks.poll.mockRejectedValue(new CreativeProviderError("rate_limited", "higgsfield", true, 429, 30_000));
    const first = await advanceProduction(db, job(), asset([scene("a")]));
    expect(Date.parse(first.state.polling!["a"]!.nextAttemptAt) - Date.now()).toBeGreaterThan(29_000);
    await advanceProduction(db, job(first.state), asset([scene("a")]));
    expect(mocks.poll).toHaveBeenCalledTimes(1); expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("continues tracking an old known provider job rather than abandoning it by elapsed time", async () => {
    const { db } = database();
    const result = await advanceProduction(db, job(), asset([scene("a")]));
    expect(result.waiting).toBe(false); expect(mocks.fail).not.toHaveBeenCalled(); expect(mocks.poll).toHaveBeenCalledTimes(1);
  });
});
