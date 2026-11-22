import { describe, expect, it } from "vitest";
import { homeOverviewItems, modelFailureMarker, type HomeBatch, type HomeVariant, type HomeRender, type HomeLedgerStep, type HomePlanningJob } from "./home-overview";
import type { ModelCreateRequest } from "./model-create.functions";

const request = { workspace_id: "workspace", request_id: "batch", prompt: "London film", file_ids: [], style_id: "cinematic-scene", duration: 30, size: "1080x1920", captions: "clean" } as ModelCreateRequest;
const batch: HomeBatch = { id: "batch", workspace_id: "workspace", created_by: "user", title: "London film", stage: "briefs", narratives: [{ title: "London film", message: "A city journey", why: "Manual Models request. Owned files only." }], created_at: "2026-11-05T01:00:00Z", updated_at: "2026-11-05T01:01:00Z" };
const variant: HomeVariant = { id: "variant", batch_id: "batch", hook: "Arrive in London", script: "City journey", beats: ["Arrive", "Belong"], production_plan: {}, created_at: batch.created_at, updated_at: batch.updated_at };
const render: HomeRender = { id: "render", variant_id: "variant", status: "failed", phase: null, error: "Provider rejected this request", created_at: "2026-11-05T01:02:00Z", retry_engine_version: "1", saved_plan_version: "1" };
const build = (overrides: Partial<Parameters<typeof homeOverviewItems>[0]> = {}) => homeOverviewItems({ batches: [batch], variants: [], renders: [], steps: [], ...overrides })[0]!;

describe("Home video stages", () => {
  it("keeps an agreed chat idea visible while waiting for real assets", () => {
    const waiting = { ...batch, goal: "sam-thread:chat", narratives: [{ title: "App reaction", message: "Show the real workflow", selected: true, asset_creation: { status: "waiting_for_assets", missing_inputs: ["App screenshots"] } }] };
    expect(build({ batches: [waiting] })).toMatchObject({ status: "Waiting for your assets", error: "Your idea is saved. App screenshots", action: "resume", stages: { narrative: "complete", storyboard: "pending", video: "pending" } });
  });
  it.each(["queued", "running", "failed"] as const)("shows real %s Create storyboard preparation", (status) => {
    const createBatch = { ...batch, goal: "sam-thread:chat", active_plan_id: null, narratives: [{ message: "Selected city story" }] };
    const planning: HomePlanningJob = { id: "plan", batch_id: batch.id, status, error: status === "failed" ? "Storyboard review failed" : null, picked: [{ title: "A selected story" }], created_at: batch.created_at, updated_at: batch.updated_at };
    expect(build({ batches: [createBatch], planningJobs: [planning] })).toMatchObject({ id: "plan", title: "A selected story", action: status === "failed" ? "retry_planning" : "resume", stages: { narrative: "complete", storyboard: status === "failed" ? "failed" : "active", video: "pending" } });
  });
  it("separates reversible Trash while preserving the video's real stages", () => {
    const inputs = { batches: [batch], variants: [{ ...variant, production_plan: { home_trashed_at: batch.updated_at } }], renders: [render], steps: [] };
    expect(homeOverviewItems(inputs)).toEqual([]);
    expect(homeOverviewItems({ ...inputs, view: "trash" })[0]).toMatchObject({ id: variant.id, kind: "variant", trashed: true, can_trash: false, stages: { narrative: "complete", storyboard: "complete", video: "failed" } });
    expect(build({ variants: [variant], renders: [{ ...render, status: "rendering" }] }).can_trash).toBe(false);
  });
  it("returns more than twenty deleted items while keeping the dashboard limit", () => {
    const variants = Array.from({ length: 25 }, (_, i) => ({ ...variant, id: `variant-${i}`, production_plan: { home_trashed_at: batch.updated_at } }));
    const renders = variants.map((item, i) => ({ ...render, id: `render-${i}`, variant_id: item.id }));
    const input = { batches: [batch], variants, renders, steps: [] };
    expect(homeOverviewItems({ ...input, view: "trash" })).toHaveLength(25);
    expect(homeOverviewItems({ ...input, variants: variants.map(item => ({ ...item, production_plan: {} })), view: "home" })).toHaveLength(20);
  });
  it("does not show partial or obsolete unused briefs as ready during a new planning job", () => {
    const createBatch = { ...batch, active_plan_id: "previous", narratives: [] };
    const planning: HomePlanningJob = { id: "plan", batch_id: batch.id, status: "running", error: null, created_at: batch.created_at, updated_at: batch.updated_at };
    const result = homeOverviewItems({ batches: [createBatch], variants: [{ ...variant, production_plan: { plan_id: "plan" } }, { ...variant, id: "obsolete", production_plan: { plan_id: "older" } }], renders: [], steps: [], planningJobs: [planning] });
    expect(result).toHaveLength(1); expect(result[0].id).toBe("plan");
  });
  it("shows a failed preplanning request at its actual failed stage and preserves Retry input", () => {
    const failed = { ...batch, title: "Needs review: London film", narratives: [{ title: "London film", message: request.prompt, why: `Manual Models request. ${modelFailureMarker}`, model_create_error: "Unsupported reference" }] };
    const item = build({ batches: [failed], requests: new Map([[batch.id, request]]) });
    expect(item).toMatchObject({ source: "models", action: "retry_model", error: "Unsupported reference", resume_request: request, stages: { narrative: "complete", storyboard: "failed", video: "pending" } });
  });
  it("keeps a Models claim preparing until an explicit terminal failure marker", () => {
    expect(build()).toMatchObject({ action: "resume", status: "Preparing storyboard", stages: { narrative: "complete", storyboard: "active", video: "pending" } });
    expect(build({ batches: [{ ...batch, title: "Needs review: user title" }] }).action).toBe("resume");
  });
  it("does not fabricate settings for old failed requests", () => {
    const failed = { ...batch, title: "Needs review: London film", narratives: [{ message: request.prompt, why: `Manual Models request. ${modelFailureMarker}` }] };
    expect(build({ batches: [failed] })).toMatchObject({ source: "models", action: "resume", saved_prompt: request.prompt });
    expect(build({ batches: [failed] }).resume_request).toBeUndefined();
  });
  it("shows a failed render after completed narrative and storyboard stages", () => {
    expect(build({ variants: [variant], renders: [render] })).toMatchObject({ action: "retry_render", render_id: render.id, status: "Video failed", stages: { narrative: "complete", storyboard: "complete", video: "failed" } });
  });
  it.each(["reserved", "submitted", "running", "reconciliation_required", "unknown"])("does not offer a paid retry for %s provider work", (status) => {
    const step: HomeLedgerStep = { render_job_id: render.id, provider: "higgsfield", status, provider_job_id: null, error_code: null };
    expect(build({ variants: [variant], renders: [render], steps: [step] }).action).toBe("reconcile");
  });
  it("fails closed for ledger errors, reconciliation phases and unknown failed provider identity", () => {
    expect(build({ variants: [variant], renders: [render], ledgerAvailable: false }).action).toBe("reconcile");
    expect(build({ variants: [variant], renders: [{ ...render, phase: "reconciliation_required" }] }).action).toBe("reconcile");
    expect(build({ variants: [variant], renders: [render], steps: [{ render_job_id: render.id, provider: "higgsfield", status: "failed", provider_job_id: null, error_code: "unknown_error" }] }).action).toBe("reconcile");
  });
  it.each(["queued", "preparing", "rendering"])("shows %s production without offering Retry", (status) => {
    expect(build({ variants: [variant], renders: [{ ...render, status }] })).toMatchObject({ action: "resume", stages: { video: "active" } });
  });
  it("keeps an older active attempt protected even when a newer job failed", () => {
    expect(build({ variants: [variant], renders: [render, { ...render, id: "active", status: "rendering", created_at: batch.created_at }] })).toMatchObject({ render_id: "active", action: "resume", stages: { video: "active" } });
  });
  it("shows completed videos and does not tick a missing storyboard", () => {
    expect(build({ variants: [variant], renders: [{ ...render, status: "done" }] })).toMatchObject({ action: "view", stages: { video: "complete" } });
    expect(build({ variants: [{ ...variant, script: "", beats: [], production_plan: { direction: {} } }] }).stages.storyboard).toBe("pending");
  });
  it("shows a failed admission after the saved storyboard without inventing a render attempt", () => {
    const failed = { ...batch, title: "Needs review: London", narratives: [{ message: request.prompt, why: `Manual Models request. ${modelFailureMarker}`, model_create_error: "Allowance reached" }] };
    expect(build({ batches: [failed], variants: [variant] })).toMatchObject({ action: "resume", status: "Video could not start", error: "Allowance reached", stages: { storyboard: "complete", video: "failed" } });
    expect(build({ batches: [failed], variants: [variant], requests: new Map([[batch.id, request]]) }).action).toBe("retry_model");
    expect(build({ variants: [variant], renders: [{ ...render, status: "unknown" }] }).action).toBe("reconcile");
  });
  it("bounds the visible recent work list", () => {
    expect(homeOverviewItems({ batches: Array.from({ length: 30 }, (_, i) => ({ ...batch, id: `batch-${i}` })), variants: [], renders: [], steps: [] })).toHaveLength(20);
  });
  it("does not show a narrative library or an empty placeholder as a video", () => {
    const library = { ...batch, id: "library", goal: "sam-thread:chat", narratives: [{ message: "A possible idea", selected: true }] };
    const placeholder = { ...batch, id: "empty", title: "New asset", goal: "", narratives: [] };
    expect(homeOverviewItems({ batches: [library, placeholder], variants: [], renders: [], steps: [] })).toEqual([]);
  });
  it("shows the latest attempt without confusing old success and failure", () => {
    expect(build({ variants: [variant], renders: [{ ...render, id: "old-done", status: "done", created_at: batch.created_at }, render] }).status).toBe("Video failed");
    expect(build({ variants: [variant], renders: [render, { ...render, id: "new-done", status: "done", created_at: "2026-11-05T01:03:00Z" }] }).status).toBe("Video ready");
  });
});
