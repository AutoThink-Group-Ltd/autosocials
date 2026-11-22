import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), prepare: vi.fn(), draft: vi.fn(), queue: vi.fn(), wake: vi.fn() }));
vi.mock("../lib/supabase-admin.server", () => ({ getAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../lib/direct-video.server", () => ({ prepareDirectVideo: mocks.prepare, createDirectVideoDraft: mocks.draft }));
vi.mock("../lib/creative.functions", () => ({ queueRender: mocks.queue, kickCreativeJobs: mocks.wake }));
vi.mock("../lib/content-credits.server", () => ({ getContentCreditRate: async () => ({ credits: 200, version: "77777777-7777-4777-8777-777777777777" }), videoCreditCapability: () => "higgsfield-seedance-reference-video" }));
import { executeDirectVideoChoice } from "../lib/direct-video-actions.server";

const ws = "11111111-1111-4111-8111-111111111111", canvasId = "22222222-2222-4222-8222-222222222222", threadId = "33333333-3333-4333-8333-333333333333", requestId = "44444444-4444-4444-8444-444444444444", fileId = "55555555-5555-4555-8555-555555555555", variantId = "66666666-6666-4666-8666-666666666666";
const capability = "higgsfield-seedance-reference-video";
const block = () => ({ type: "direct_video", title: "Make my film", request_id: requestId, status: "options", reason: "Choose a model", reference_count: 1, duration: 30, aspect_ratio: "9:16", resolution: "1080p", options: [{ id: capability, label: "Seedance 2.5" }], missing: [], message: "Create my 30-second film, 9:16, 1080p", thread_id: threadId, file_ids: [fileId] });
const prepared = () => ({ brief: { prompt: "Create my film", originalMessage: block().message, voiceover: "", editingInstructions: "", duration: 30, aspectRatio: "9:16", resolution: "1080p", requestedModel: null }, referenceIds: [fileId], options: [{ capabilityId: capability, label: "Seedance 2.5", settings: {} }], missing: [], reason: "Choose", matchedCapabilityId: null });
const input = () => ({ canvas_id: canvasId, index: 0, expected_version: 4, capability_id: capability, duration: 30 as const, aspect_ratio: "9:16" as const, resolution: "1080p" as const, expected_credits: 200, expected_rate_id: "77777777-7777-4777-8777-777777777777" });
let canvas: { id: string; workspace_id: string; module: string; version: number; blocks: ReturnType<typeof block>[] };
let updates: Array<{ payload: Record<string, unknown>; filters: Array<[string, unknown]> }>;
let claimSucceeds: boolean;
let conflictFinal: number;

beforeEach(() => {
  vi.clearAllMocks();
  canvas = { id: canvasId, workspace_id: ws, module: "create", version: 4, blocks: [block()] };
  updates = []; claimSucceeds = true; conflictFinal = 0;
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.prepare.mockResolvedValue(prepared());
  mocks.draft.mockResolvedValue({ batchId: requestId, variantId });
  mocks.queue.mockResolvedValue("render-id"); mocks.wake.mockResolvedValue(undefined);
  mocks.from.mockImplementation((table: string) => {
    let update: (typeof updates)[number] | undefined;
    const query: Record<string, any> = {
      select: () => query,
      eq: (key: string, value: unknown) => { update?.filters.push([key, value]); return query; },
      update: (payload: Record<string, unknown>) => { update = { payload: structuredClone(payload), filters: [] }; updates.push(update); return query; },
      single: async () => ({ data: table === "creative_variants" ? { version: 1, production_plan: {}, duration_s: 30 } : structuredClone(canvas), error: null }),
      maybeSingle: async () => {
        if (!claimSucceeds) return { data: null, error: null };
        if (update && updates.length > 1 && conflictFinal > 0) { conflictFinal--; canvas.version++; canvas.blocks[0] = { ...canvas.blocks[0]!, title: "Concurrent title" }; return { data: null, error: null }; }
        if (update) { canvas = { ...canvas, ...structuredClone(update.payload) } as typeof canvas; }
        return { data: { id: canvasId, version: canvas.version }, error: null };
      },
      insert: (payload: unknown) => { expect(table).toBe("agent_messages"); return Promise.resolve({ data: payload, error: null }); },
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
    };
    return query;
  });
});

describe("direct video admission actions", () => {
  it("rejects a forbidden workspace before preparation or admission", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });
    await expect(executeDirectVideoChoice("user", input())).rejects.toThrow("Forbidden");
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled(); expect(updates).toEqual([]);
  });
  it("rejects an incompatible choice before claiming or queuing", async () => {
    await expect(executeDirectVideoChoice("user", { ...input(), capability_id: "unavailable" })).rejects.toThrow("does not support");
    expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled(); expect(updates).toEqual([]);
  });
  it("rejects a stale credit quote before claiming or queuing", async () => {
    await expect(executeDirectVideoChoice("user", { ...input(), expected_credits: 100 })).rejects.toThrow("credit price changed");
    expect(updates).toEqual([]); expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled();
  });
  it("does not admit after losing the optimistic canvas claim", async () => {
    claimSucceeds = false;
    await expect(executeDirectVideoChoice("user", input())).rejects.toThrow("already being handled");
    expect(updates).toHaveLength(1); expect(updates[0]!.filters).toContainEqual(["version", 4]);
    expect(mocks.draft).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.wake).not.toHaveBeenCalled();
  });
  it("returns an already queued request without another admission", async () => {
    canvas.blocks[0] = { ...block(), status: "queued", batch_id: requestId, variant_id: variantId } as ReturnType<typeof block>;
    await expect(executeDirectVideoChoice("user", input())).resolves.toEqual({ batch_id: requestId, variant_id: variantId, version: 4 });
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.wake).not.toHaveBeenCalled(); expect(updates).toEqual([]);
  });
  it("claims once, queues the saved exact draft once, saves the queued card and wakes production", async () => {
    await expect(executeDirectVideoChoice("user", input())).resolves.toEqual({ batch_id: requestId, variant_id: variantId, version: 6 });
    expect(mocks.prepare).toHaveBeenCalledWith(expect.anything(), "user", ws, threadId, block().message, [fileId], { duration: 30, aspectRatio: "9:16", resolution: "1080p" });
    expect(mocks.draft).toHaveBeenCalledWith(expect.anything(), "user", ws, prepared(), capability, requestId);
    expect(mocks.queue).toHaveBeenCalledExactlyOnceWith(expect.anything(), "user", variantId, undefined, "user", undefined, undefined, { version: 1, credits: 200, lines: [{ step_key: "provider:reference_film", capability_id: capability, duration_s: 30, rate_id: input().expected_rate_id, credits: 200 }] });
    expect(updates).toHaveLength(2);
    expect(updates[0]!.payload).toMatchObject({ version: 5, blocks: [{ status: "starting" }] });
    expect(updates[1]!.payload).toMatchObject({ version: 6, blocks: [{ status: "queued", batch_id: requestId, variant_id: variantId }] });
    expect(updates[1]!.filters).toContainEqual(["version", 5]);
    expect(mocks.wake).toHaveBeenCalledTimes(1);
  });
  it("merges a final status after a concurrent edit without another admission", async () => {
    conflictFinal = 1;
    await expect(executeDirectVideoChoice("user", input())).resolves.toMatchObject({ variant_id: variantId, version: 7 });
    expect(canvas.blocks[0]).toMatchObject({ title: "Concurrent title", status: "queued", variant_id: variantId });
    expect(mocks.queue).toHaveBeenCalledTimes(1);
  });
  it("reports exhausted status conflicts without admitting a duplicate", async () => {
    conflictFinal = 3;
    await expect(executeDirectVideoChoice("user", input())).rejects.toThrow("status changed while saving");
    expect(mocks.queue).toHaveBeenCalledTimes(1);
  });
  it("records admission failure on the card without waking or retrying generation", async () => {
    mocks.queue.mockRejectedValue(new Error("Monthly allowance exhausted"));
    await expect(executeDirectVideoChoice("user", input())).rejects.toThrow("Monthly allowance exhausted");
    expect(mocks.queue).toHaveBeenCalledTimes(1); expect(mocks.wake).not.toHaveBeenCalled();
    expect(updates).toHaveLength(2);
    expect(updates[1]!.payload).toMatchObject({ version: 6, blocks: [{ status: "failed", batch_id: requestId, variant_id: variantId, error: "Monthly allowance exhausted" }] });
  });
});
