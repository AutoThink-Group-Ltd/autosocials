import { beforeEach, describe, expect, it, vi } from "vitest";
const ledger = vi.hoisted(() => ({ begin: vi.fn(), update: vi.fn(), complete: vi.fn(), fail: vi.fn(), previous: vi.fn() }));
vi.mock("../lib/generation-tracker.server", () => ({ beginStep: ledger.begin, updateStep: ledger.update, completeStep: ledger.complete, failStep: ledger.fail, previousGenerationStep: ledger.previous }));
import { trackedGenerationFetch, withProductionTrace } from "../lib/generation-context.server";
import type { getAdminClient } from "../lib/supabase-admin.server";
const admin = {} as ReturnType<typeof getAdminClient>;
const trace = { admin, renderJobId: "render", workspaceId: "workspace", variantId: "variant", userId: "user", rootStepId: "root" };
const url = "https://api.openai.com/v1/responses";
async function consume(body: string, contentType = "text/event-stream") {
  const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { headers: { "content-type": contentType } })); vi.stubGlobal("fetch", fetcher);
  await withProductionTrace(trace, async () => { const response = await trackedGenerationFetch(url, { method: "POST", body: JSON.stringify({ model: "test-model" }) }); await response.text(); });
  return fetcher;
}
beforeEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); ledger.previous.mockResolvedValue(null); ledger.begin.mockResolvedValue({ created: true, step: { id: "step" } }); ledger.update.mockResolvedValue({}); ledger.complete.mockResolvedValue({}); ledger.fail.mockResolvedValue({}); });
describe("generation trace interrupted stream recovery", () => {
  it("completes only after a verified Responses terminal event", async () => {
    await consume('data: {"type":"response.completed","response":{"status":"completed","model":"actual-model","usage":{"input_tokens":5,"output_tokens":7}}}\n\n');
    expect(ledger.complete).toHaveBeenCalledWith("step", expect.objectContaining({ modelVersion: "actual-model", usage: expect.objectContaining({ input_tokens: 5, output_tokens: 7 }) }), admin);
    expect(ledger.fail).not.toHaveBeenCalled();
  });
  it("records explicit HTTP200 stream failure instead of success", async () => {
    await expect(consume('data: {"type":"response.failed","response":{"status":"failed","error":{"message":"private provider detail"}}}\n\n')).rejects.toThrow("Provider generation failed");
    expect(ledger.complete).not.toHaveBeenCalled(); expect(ledger.fail).toHaveBeenCalledWith("step", "provider_stream_failed", false, admin);
  });
  it("requires reconciliation for premature stream EOF even after useful output", async () => {
    await expect(consume('data: {"type":"response.output_text.delta","delta":"partial output"}\n\n')).rejects.toThrow("reconciliation");
    expect(ledger.complete).not.toHaveBeenCalled(); expect(ledger.fail).toHaveBeenCalledWith("step", "stream_terminal_missing", true, admin);
  });
  it("supports chat finish plus DONE while treating HTTP200 JSON errors as failures", async () => {
    await consume('data: {"choices":[{"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
    expect(ledger.complete).toHaveBeenCalledOnce(); ledger.complete.mockClear();
    await expect(consume('{"error":{"message":"redacted"}}', "application/json")).rejects.toThrow("failed"); expect(ledger.complete).not.toHaveBeenCalled();
  });
  it("marks cancellation uncertain and does not send duplicate paid operations", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"response.created"}\n\n')); } }), { headers: { "content-type": "text/event-stream" } })));
    await withProductionTrace(trace, async () => { const result = await trackedGenerationFetch(url, { method: "POST" }); await result.body?.cancel(); });
    expect(ledger.fail).toHaveBeenCalledWith("step", "stream_canceled", true, admin);
    const fetcher = vi.fn<typeof fetch>(); vi.stubGlobal("fetch", fetcher); ledger.begin.mockResolvedValueOnce({ created: false, step: { id: "prior" } });
    await expect(withProductionTrace(trace, () => trackedGenerationFetch(url, { method: "POST" }))).rejects.toThrow("no duplicate"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves retry provenance and treats HTTP5xx submission as uncertain", async () => {
    ledger.previous.mockResolvedValue({ id: "previous-attempt" });
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response("unavailable", { status: 502 })));
    await withProductionTrace(trace, () => trackedGenerationFetch(url, { method: "POST" }));
    expect(ledger.begin).toHaveBeenCalledWith(expect.objectContaining({ retryOfStepId: "previous-attempt" }), admin);
    expect(ledger.update).toHaveBeenLastCalledWith("step", expect.objectContaining({ status: "reconciliation_required" }), admin);
  });
  it("keeps an explicit provider failure definitive when the caller cancels its reader", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('data: {"type":"response.failed","response":{"status":"failed"}}\n\n')); } }), { headers: { "content-type": "text/event-stream" } })));
    await withProductionTrace(trace, async () => { const result = await trackedGenerationFetch(url, { method: "POST" }); const reader = result.body?.getReader(); await reader?.read(); await reader?.cancel(); });
    expect(ledger.fail).toHaveBeenCalledWith("step", "provider_stream_failed", false, admin);
    expect(ledger.complete).not.toHaveBeenCalled();
  });
});
