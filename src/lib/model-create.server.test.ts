import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ admin: { from: vi.fn(), rpc: vi.fn() }, plan: vi.fn(), queue: vi.fn(), kick: vi.fn(), availability: vi.fn(), ai: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => mocks.admin }));
vi.mock("./creative-planning.server", () => ({ planProductionAssets: mocks.plan }));
vi.mock("./creative.functions", () => ({ queueRender: mocks.queue, kickCreativeJobs: mocks.kick }));
vi.mock("./creative-providers/adapters.server", () => ({ getCreativeProviderAvailability: mocks.availability }));
vi.mock("./dossier.server", () => ({ aiChat: mocks.ai }));
vi.mock("./playbook.server", () => ({ getFacts: async () => null, writeBuildPrompt: async () => ({
  markdown: "### Scene 1: Product (0s to 60s)\n- On screen: **Meet our product**",
  data: { vo: [{ line: "Meet our product" }] },
  issues: [],
}) }));
vi.mock("./composition.server", () => ({ loadMotionKit: async () => ({ text: "" }) }));
vi.mock("./creative-direction", () => ({ creativeDirectionText: () => "Creative direction" }));
vi.mock("./content-credits.server", () => ({ getContentCreditRate: async () => ({ credits: 50, version: "44444444-4444-4444-8444-444444444444" }), quoteProductionCredits: async () => ({ credits: 50, lines: [{ step_key: "compositor", capability_id: "autotoast-hyperframes", duration_s: 60, rate_id: "44444444-4444-4444-8444-444444444444", credits: 50 }] }) }));
import { createModelVideoForUser, draftModelPromptForUser, getModelVideoRequestForUser } from "./model-create.server";
import type { ModelCreateRequest } from "./model-create.functions";

const ws = "11111111-1111-4111-8111-111111111111";
const request = "22222222-2222-4222-8222-222222222222";
const file = "33333333-3333-4333-8333-333333333333";
const input: ModelCreateRequest = { workspace_id: ws, request_id: request, prompt: "Animate our saved product photo", file_ids: [file], style_id: "brand-motion", duration: 60, size: "1080x1350", voice: "Kore", captions: "off", expected_credits: 50, expected_rate_id: "44444444-4444-4444-8444-444444444444" };
type Call = { table: string; operation: string; payload?: unknown; filters: Array<[string, unknown]> };
let calls: Call[];
let responses: (call: Call) => { data?: unknown; error?: unknown };
beforeEach(() => {
  vi.resetAllMocks(); calls = [];
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.admin.rpc.mockResolvedValue({ data: true, error: null });
  mocks.availability.mockReturnValue([{ capabilityId: "autotoast-hyperframes", available: true }]);
  mocks.queue.mockResolvedValue("render-id");
  mocks.plan.mockResolvedValue({ title: "Product", audience: "Customers", offer: "Product", voice: "Kore", voice_reason: "Warm", variants: [{ angle: input.prompt, duration_s: 60, size: input.size, file_ids: [file], beats: ["Reveal"], voiceover: "Meet our product", script: "Show it", hook: "Meet it", format: "Film", caption: "Caption", cta: "Discover", argument: "Product story", production_plan: { steps: [], direction: {}, video_style: { id: "brand-motion" } } }] });
  responses = (call) => ({ data: call.table === "brand_files" ? [{ id: file, name: "product.md", kind: "doc", extracted_text: "Product facts" }] : call.table === "creative_variants" && call.operation === "select" && call.filters.some(([key]) => key === "id") ? { version: 1, production_plan: {}, duration_s: 60 } : null, error: null });
  mocks.admin.from.mockImplementation((table: string) => {
    const call: Call = { table, operation: "select", filters: [] }; calls.push(call);
    const builder = {
      select: vi.fn().mockReturnThis(), insert: vi.fn((payload: unknown) => { call.operation = "insert"; call.payload = payload; return builder; }),
      update: vi.fn((payload: unknown) => { call.operation = "update"; call.payload = payload; return builder; }),
      eq: vi.fn((key: string, value: unknown) => { call.filters.push([key, value]); return builder; }),
      in: vi.fn((key: string, value: unknown) => { call.filters.push([key, value]); return builder; }), limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(() => Promise.resolve(responses(call))),
      single: vi.fn(() => Promise.resolve(responses(call))),
      then: (resolve: (value: unknown) => void) => Promise.resolve(responses(call)).then(resolve),
    }; return builder;
  });
});

describe("manual Models production", () => {
  it("preserves actionable planner findings for the user and saved request", async () => {
    mocks.plan.mockRejectedValue(new Error("Asset planning remains unresolved after one rework: A generated scene exceeds the approved finished film duration."));
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("Planning could not finish: A generated scene exceeds the approved finished film duration.");
    const failure = calls.find((call) => call.table === "creative_batches" && call.operation === "update");
    expect(failure?.payload).toMatchObject({ narratives: [expect.objectContaining({ model_create_request: input, model_create_error: expect.stringContaining("scene exceeds"), why: expect.stringContaining("Create could not finish.") })] });
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("rejects inaccessible workspaces before reading files or planning", async () => {
    mocks.admin.rpc.mockResolvedValue({ data: false });
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("access");
    expect(mocks.admin.from).not.toHaveBeenCalled(); expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("rejects missing or another workspace's files before claiming production", async () => {
    responses = (call) => ({ data: call.table === "creative_batches" ? null : [], error: null });
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("selected file");
    expect(calls.find((call) => call.table === "brand_files")!.filters).toContainEqual(["workspace_id", ws]);
    expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("rejects an unavailable selected model without substituting", async () => {
    mocks.availability.mockReturnValue([]);
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("model is unavailable");
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("claims the request, preserves prompt/options, and uses normal render admission", async () => {
    const result = await createModelVideoForUser("user", input);
    expect(result.batch_id).toBe(request);
    expect(calls.find((call) => call.table === "creative_batches" && call.operation === "insert")?.payload).toMatchObject({ id: request, goal: input.prompt, created_by: "user", narratives: [expect.objectContaining({ model_create_request: input })] });
    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({ allowedFileIds: [file], picked: [expect.objectContaining({ message: input.prompt, custom: true })], specs: [expect.objectContaining({ style_id: "brand-motion", duration: 60, size: input.size, model_choice: "user" })] }));
    expect(calls.find((call) => call.table === "creative_variants" && call.operation === "insert")?.payload).toMatchObject({ voice_id: "builtin:Kore", captions: "off", file_ids: [file], script: expect.stringContaining(input.prompt), production_plan: expect.objectContaining({ selected_files_only: true }) });
    expect(mocks.queue).toHaveBeenCalledWith(mocks.admin, "user", result.variant_id, undefined, "user", undefined, undefined, { version: 1, credits: 50, lines: [{ step_key: "compositor", capability_id: "autotoast-hyperframes", duration_s: 60, rate_id: input.expected_rate_id, credits: 50 }] });
    expect(mocks.kick).toHaveBeenCalledTimes(1);
  });
  it("saves the Models storyboard for review without queuing production", async () => {
    const result = await createModelVideoForUser("user", { ...input, preview_only: true });
    expect(result).toMatchObject({ batch_id: request, preview: true });
    expect(calls.find((call) => call.table === "creative_variants" && call.operation === "insert")?.payload).toMatchObject({ batch_id: request, file_ids: [file], build_prompt: expect.stringContaining("Meet our product") });
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(mocks.kick).not.toHaveBeenCalled();
  });
  it("never queues a substituted model or unselected media", async () => {
    const plan = await mocks.plan();
    plan.variants[0].production_plan.video_style.id = "cinematic-scene";
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("request is saved");
    expect(mocks.queue).not.toHaveBeenCalled();
    plan.variants[0].production_plan.video_style.id = "brand-motion";
    plan.variants[0].file_ids = ["another-file"];
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("request is saved");
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("returns only an already queued, same-user same-workspace request on conflict", async () => {
    responses = (call) => {
      if (call.table === "brand_files") return { data: [{ id: file }] };
      if (call.table === "creative_batches") return call.operation === "insert" ? { error: { code: "23505" } } : { data: { id: request, workspace_id: ws, created_by: "user" } };
      return { data: [{ id: call.table === "creative_variants" ? "variant" : "render", status: "queued" }] };
    };
    expect(await createModelVideoForUser("user", input)).toEqual({ batch_id: request, variant_id: "variant" });
    expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
    await expect(createModelVideoForUser("another-user", input)).rejects.toThrow("cannot be resumed");
  });
  it("does not replay an interrupted claim or return success for missing admission", async () => {
    responses = (call) => call.table === "brand_files" ? { data: [{ id: file }] } : call.table === "creative_batches" ? call.operation === "insert" ? { error: { code: "23505" } } : { data: { workspace_id: ws, created_by: "user" } } : { data: [] };
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("already saved");
    expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("recovers accepted jobs before checking removed files or disabled providers", async () => {
    mocks.availability.mockReturnValue([]);
    responses = (call) => call.table === "creative_batches" ? { data: { workspace_id: ws, created_by: "user" } } : call.table === "creative_variants" ? { data: [{ id: "variant" }] } : call.table === "render_jobs" ? { data: [{ id: "render", status: "done" }] } : { error: new Error("File was removed") };
    expect(await createModelVideoForUser("user", input)).toEqual({ batch_id: request, variant_id: "variant" });
    expect(calls.some((call) => call.table === "brand_files")).toBe(false);
    expect(mocks.availability).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("saves a recoverable failure and never returns success if admission fails", async () => {
    mocks.queue.mockRejectedValue(Object.assign(new Error("Video allowance limit reached"), { modelCreateSafeToRevise: true }));
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("allowance limit");
    expect(calls.some((call) => call.table === "creative_variants" && call.operation === "update")).toBe(true);
    expect(calls.some((call) => call.table === "creative_batches" && call.operation === "update" && (call.payload as { title?: string }).title?.startsWith("Needs review:"))).toBe(true);
    expect(mocks.kick).not.toHaveBeenCalled();
  });
  it("does not mark uncertain queue transport failures safe for a new request", async () => {
    mocks.queue.mockRejectedValue(new Error("Network connection lost"));
    await expect(createModelVideoForUser("user", input)).rejects.toThrow("request is saved");
    expect(calls.some((call) => call.table === "creative_batches" && call.operation === "update" && (call.payload as { title?: string }).title?.startsWith("Needs review:"))).toBe(false);
    // A delayed admission may still arrive; the unmarked claim must stay protected.
    responses = (call) => ({ data: call.table === "creative_batches" ? { workspace_id: ws, created_by: "user", title: "Product", narratives: [] } : call.table === "creative_variants" ? [{ id: "variant" }] : [] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("preparing");
    expect(mocks.kick).not.toHaveBeenCalled();
  });
  it("drafts a bounded prompt with tools absent and never starts production", async () => {
    mocks.ai.mockResolvedValue({ choices: [{ message: { content: '{"prompt":"Show our product moving"}' } }] });
    expect(await draftModelPromptForUser("user", input)).toEqual({ prompt: "Show our product moving" });
    expect(mocks.ai.mock.calls[0]![0]).not.toHaveProperty("tools");
    expect(mocks.ai.mock.calls[0]![0].messages[1].content).toContain("Product facts");
    expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.plan).not.toHaveBeenCalled();
  });
});

describe("read-only Models request recovery", () => {
  const marker = [{ why: "Create could not finish. Review this saved request and production history before retrying." }];
  function statusResponses(options: { owner?: string; title?: string; narratives?: unknown; variants?: unknown[]; jobs?: unknown[]; steps?: unknown[]; errorTable?: string } = {}) {
    responses = (call) => {
      if (call.table === options.errorTable) return { error: new Error("Database unavailable") };
      if (call.table === "creative_batches") return { data: { workspace_id: ws, created_by: options.owner ?? "user", title: options.title ?? "Video request", narratives: options.narratives ?? [] } };
      if (call.table === "creative_variants") return { data: options.variants ?? [] };
      if (call.table === "generation_steps") return { data: options.steps ?? [] };
      return { data: options.jobs ?? [] };
    };
  }
  it("returns not_found for an unclaimed request", async () => {
    expect(await getModelVideoRequestForUser("user", input)).toEqual({ state: "not_found" });
  });
  it("rejects workspace or owner mismatches and performs no writes", async () => {
    statusResponses({ owner: "someone-else" });
    await expect(getModelVideoRequestForUser("user", input)).rejects.toThrow("cannot be resumed");
    expect(calls.every((call) => call.operation === "select")).toBe(true);
    mocks.admin.rpc.mockResolvedValue({ data: false });
    await expect(getModelVideoRequestForUser("user", input)).rejects.toThrow("access");
  });
  it("keeps a claimed request preparing until a persisted failure marker", async () => {
    statusResponses();
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("preparing");
    statusResponses({ title: "Needs review: user wording" });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("preparing");
    statusResponses({ title: "Needs review: original request", narratives: marker });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("failed");
  });
  it.each(["queued", "preparing", "rendering", "done"])("recovers %s jobs regardless of old failure markers", async (status) => {
    statusResponses({ title: "Needs review: video", narratives: marker, variants: [{ id: "variant" }], jobs: [{ id: "render", status }] });
    expect(await getModelVideoRequestForUser("user", input)).toEqual({ state: "queued", batch_id: request, variant_id: "variant" });
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("returns failed only for terminal jobs or a caught pre-admission failure", async () => {
    statusResponses({ variants: [{ id: "variant" }], jobs: [{ status: "failed" }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("failed");
    statusResponses({ variants: [{ id: "variant" }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("preparing");
    statusResponses({ title: "Needs review: video", narratives: marker, variants: [{ id: "variant" }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("failed");
    statusResponses({ title: "Needs review: video", narratives: marker, variants: [{ id: "variant" }], jobs: [{ status: "unknown" }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("preparing");
  });
  it("keeps failed renders awaiting reconciliation protected even with no pending ledger entries", async () => {
    statusResponses({ variants: [{ id: "variant" }], jobs: [{ status: "failed", phase: "reconciliation_required" }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("preparing");
  });
  it.each(["reserved", "submitted", "running", "reconciliation_required", "unknown"])("keeps failed renders with %s provider work protected", async (status) => {
    statusResponses({ variants: [{ id: "variant" }], jobs: [{ status: "failed" }], steps: [{ provider: "autotoast", status }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("preparing");
    expect(calls.find((call) => call.table === "generation_steps")?.filters).toEqual([["variant_id", "variant"], ["workspace_id", ws]]);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("requires a confirmed provider job identity or definite rejection for failed paid steps", async () => {
    statusResponses({ variants: [{ id: "variant" }], jobs: [{ status: "failed" }], steps: [{ provider: "autotoast", status: "failed", error_code: "unknown_error" }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("preparing");
    statusResponses({ variants: [{ id: "variant" }], jobs: [{ status: "failed" }], steps: [{ provider: "autotoast", status: "failed", error_code: "provider_rejected" }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("failed");
    statusResponses({ variants: [{ id: "variant" }], jobs: [{ status: "failed" }], steps: [{ provider: "autotoast", status: "failed", provider_job_id: "known-job" }, { provider: "autosocials", status: "reserved" }] });
    expect((await getModelVideoRequestForUser("user", input)).state).toBe("failed");
  });
  it.each(["creative_batches", "creative_variants", "render_jobs", "generation_steps"])("fails closed on uncertain %s lookup", async (errorTable) => {
    statusResponses({ variants: [{ id: "variant" }], errorTable });
    await expect(getModelVideoRequestForUser("user", input)).rejects.toThrow("could not be checked");
    expect(calls.every((call) => call.operation === "select")).toBe(true);
  });
});
