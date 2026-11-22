import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), prepare: vi.fn(), choose: vi.fn() }));
vi.mock("../lib/supabase-admin.server", () => ({ getAdminClient: () => ({ from: mocks.from }) }));
vi.mock("../lib/direct-video.server", () => ({ prepareDirectVideo: mocks.prepare }));
vi.mock("../lib/direct-video-actions.server", () => ({ executeDirectVideoChoice: mocks.choose }));
import { directVideoChat } from "../lib/direct-video-chat.server";

const ws = "11111111-1111-4111-8111-111111111111", canvasId = "22222222-2222-4222-8222-222222222222", threadId = "33333333-3333-4333-8333-333333333333", fileId = "44444444-4444-4444-8444-444444444444";
const capability = "higgsfield-seedance-reference-video";
const message = "Create a 30-second film using Seedance 2.5, 9:16, 1080p. Preserve the actual buildings. Do not invent property interiors, features or views. No people or generated logos. Silent source film; add the logo and voiceover in editing.";
const request = () => ({ userId: "user", workspaceId: ws, threadId, message, attachmentIds: [fileId], requestKey: "stable-request-1" });
const preparation = () => ({ brief: { prompt: message, originalMessage: message, editingInstructions: "Add logo and voiceover in editing", voiceover: "", duration: 30, aspectRatio: "9:16", resolution: "1080p", requestedModel: "Seedance 2.5" }, referenceIds: [fileId], options: [{ capabilityId: capability, label: "Seedance 2.5", settings: {} }], missing: [], reason: "Your requested model and settings are supported.", matchedCapabilityId: capability });
let previous: { id: string; version: number; title: string } | null;
let writes: Array<{ table: string; action: string; payload: any }>;
beforeEach(() => {
  vi.clearAllMocks(); previous = null; writes = [];
  mocks.prepare.mockResolvedValue(preparation());
  mocks.choose.mockResolvedValue({ version: 3, batch_id: canvasId, variant_id: fileId });
  mocks.from.mockImplementation((table: string) => {
    let action = "select"; let payload: any;
    const chain: Record<string, any> = {
      select: () => chain, eq: () => chain,
      insert: (value: unknown) => { action = "insert"; payload = structuredClone(value); writes.push({ table, action, payload }); return chain; },
      update: (value: unknown) => { action = "update"; payload = structuredClone(value); writes.push({ table, action, payload }); return chain; },
      maybeSingle: async () => ({ data: previous, error: null }),
      single: async () => ({ data: table === "canvases" ? { id: payload.id, version: 1, title: payload.title } : { id: "history-message" }, error: null }),
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve, reject),
    };
    return chain;
  });
});
const events = async (input = request()) => (await directVideoChat(input).text()).split("\n").filter((line) => line.startsWith("data: ") && line !== "data: [DONE]").map((line) => JSON.parse(line.slice(6)));

describe("direct video chat stream", () => {
  it("streams the saved options canvas and auto-admits an exact explicit request including negative visual constraints", async () => {
    const stream = await events();
    const canvas = writes.find((entry) => entry.table === "canvases" && entry.action === "insert")!.payload;
    expect(canvas.blocks).toEqual(expect.arrayContaining([expect.objectContaining({ type: "assets", file_ids: [fileId], layout: "grid" }), expect.objectContaining({ type: "direct_video", file_ids: [fileId], reference_count: 1 })]));
    expect(mocks.choose).toHaveBeenCalledExactlyOnceWith("user", { canvas_id: canvas.id, index: 1, expected_version: 1, capability_id: capability });
    expect(stream).toEqual(expect.arrayContaining([expect.objectContaining({ type: "tool-output-available", output: expect.objectContaining({ canvas_id: canvas.id }) }), expect.objectContaining({ type: "text-delta", delta: expect.stringContaining("generation request is saved") })]));
    expect(writes.find((entry) => entry.table === "agent_messages" && entry.action === "update")?.payload.content).toContain("generation request is saved");
  });
  it("shows choices without auto-starting when the named model is unsupported", async () => {
    mocks.prepare.mockResolvedValue({ ...preparation(), matchedCapabilityId: null, reason: "Kling 4.0 is unavailable. Choose a supported model." });
    const stream = await events({ ...request(), message: message.replace("Seedance 2.5", "Kling 4.0") });
    expect(mocks.choose).not.toHaveBeenCalled();
    expect(stream).toEqual(expect.arrayContaining([expect.objectContaining({ type: "text-delta", delta: expect.stringContaining("Kling 4.0 is unavailable") })]));
    expect(writes.find((entry) => entry.table === "canvases")?.payload.blocks[1].status).toBe("options");
  });
  it.each(["Review this prompt: ", "Do not start the film. "])("never auto-starts a review or withheld request: %s", async (prefix) => {
    await events({ ...request(), message: `${prefix}${message}` });
    expect(mocks.choose).not.toHaveBeenCalled();
  });
  it("does not auto-start without a stable user request key", async () => {
    const { requestKey: _requestKey, ...withoutKey } = request();
    await directVideoChat(withoutKey).text();
    expect(mocks.choose).not.toHaveBeenCalled();
  });
  it("replays an existing request canvas without preparation, insert or new admission", async () => {
    previous = { id: canvasId, version: 3, title: "Existing request" };
    const stream = await events();
    expect(mocks.prepare).not.toHaveBeenCalled(); expect(mocks.choose).not.toHaveBeenCalled(); expect(writes).toEqual([]);
    expect(stream).toEqual(expect.arrayContaining([expect.objectContaining({ type: "tool-output-available", output: { canvas_id: canvasId, version: 3, title: "Existing request" } }), expect.objectContaining({ type: "text-delta", delta: expect.stringContaining("existing video request") })]));
  });
  it("keeps the saved canvas visible and streams a final recovery message if automatic admission fails", async () => {
    mocks.choose.mockRejectedValue(new Error("Video allowance used up"));
    const stream = await events();
    expect(stream).toEqual(expect.arrayContaining([expect.objectContaining({ type: "tool-output-available", output: expect.objectContaining({ canvas_id: expect.any(String) }) }), expect.objectContaining({ type: "text-delta", delta: expect.stringContaining("Video allowance used up") }), expect.objectContaining({ type: "text-end" })]));
    expect(writes.find((entry) => entry.table === "agent_messages" && entry.action === "update")?.payload.content).toContain("Check the request in Live View before retrying");
  });
});
