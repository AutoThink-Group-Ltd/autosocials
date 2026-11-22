import { afterEach, describe, expect, it, vi } from "vitest";
import { assertApprovedProductionQuote, assertApprovedVideoQuote, videoCreditCapability, getContentCreditRate, quoteProductionCredits, reconcileFailedRenderCredits, reserveCredits } from "./content-credits.server";

describe("generation credit admission", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("identifies explicitly supported single-engine outputs", () => {
    expect(videoCreditCapability({ steps: [{ role: "finished_video", capability_id: "golpo-canvas" }] }, 60)).toBe("golpo-canvas");
    expect(videoCreditCapability({ steps: [{ role: "finished_video", capability_id: "higgsfield-seedance-text-video" }] }, 60)).toBe("higgsfield-seedance-text-video");
    expect(videoCreditCapability({ steps: [{ role: "finished_video", capability_id: "golpo-canvas" }] }, 30)).toBe("golpo-canvas");
    expect(() => videoCreditCapability({ steps: [{ role: "scene", capability_id: "golpo-canvas" }] }, 60)).toThrow();
  });
  it("never retries an existing reservation", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ data: { reservation_id: "existing", state: "reserved", reused: true } });
    await expect(reserveCredits({ rpc } as never, "workspace", "user", "request", 45, "openai-image", 0, "rate-id")).rejects.toThrow(/already has a credit reservation/);
  });
  it("requires approval of the current asset version and exact price", () => {
    expect(() => assertApprovedVideoQuote({ version: 3, credits: 50 }, 3, 50)).not.toThrow();
    expect(() => assertApprovedVideoQuote({ version: 2, credits: 50 }, 3, 50)).toThrow(/price changed/);
    expect(() => assertApprovedVideoQuote({ version: 3, credits: 49 }, 3, 50)).toThrow(/price changed/);
    expect(() => assertApprovedVideoQuote(undefined, 3, 50)).toThrow(/price changed/);
  });
  it("rejects a changed rate version or different step even if the total is unchanged", () => {
    const line = { step_key: "compositor", capability_id: "autotoast-hyperframes", duration_s: 60, rate_id: "rate-1", credits: 50 };
    const quote = { credits: 50, lines: [line] };
    expect(() => assertApprovedProductionQuote({ version: 2, credits: 50, lines: [line] }, 2, quote)).not.toThrow();
    expect(() => assertApprovedProductionQuote({ version: 2, credits: 50, lines: [{ ...line, rate_id: "rate-2" }] }, 2, quote)).toThrow(/price changed/);
    expect(() => assertApprovedProductionQuote({ version: 2, credits: 50, lines: [{ ...line, step_key: "provider:other" }] }, 2, quote)).toThrow(/price changed/);
  });
  it("stops generation when an opted-in upgrade is awaiting payment", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.test"); vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-key");
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 202 })); vi.stubGlobal("fetch", fetcher);
    const rpc = vi.fn().mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce({ error: { message: "Insufficient credits" } });
    await expect(reserveCredits({ rpc } as never, "workspace", "user", "request", 45, "openai-image", 0, "rate-id")).rejects.toThrow(/payment is pending/);
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("refuses missing and inactive prices", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null });
    await expect(getContentCreditRate({ rpc } as never, "openai-image", 0)).rejects.toThrow(/no active verified/);
  });
  it("reconciles only the reservation belonging to the stopped render", async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data: { id: "reservation" } }) };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    const rpc = vi.fn().mockResolvedValue({ data: { uncertain: true } });
    await reconcileFailedRenderCredits({ from: vi.fn().mockReturnValue(query), rpc } as never, "workspace", "render");
    expect(query.eq).toHaveBeenCalledWith("workspace_id", "workspace");
    expect(query.eq).toHaveBeenCalledWith("request_key", "render:render");
    expect(rpc).toHaveBeenCalledWith("reconcile_failed_composite_credit_reservation", { _reservation_id: "reservation" });
  });
  it("prices every generated step and adds the compositor when needed", async () => {
    const rpc = vi.fn().mockImplementation((_name, args) => Promise.resolve({ data: { credits: args._duration_s === 0 ? 45 : args._duration_s === 15 ? 100 : 50, version: `rate-${args._capability_id}` } }));
    const plan = { steps: [{ id: "scene1", role: "scene", capability_id: "higgsfield-seedance-text-video", settings: { duration: 15 } }, { id: "image1", role: "scene", capability_id: "higgsfield-image-generate", settings: {} }] };
    const quote = await quoteProductionCredits({ rpc } as never, plan, 60);
    expect(quote.credits).toBe(195);
    expect(quote.lines.map((line) => [line.capability_id, line.duration_s, line.credits])).toEqual([["higgsfield-seedance-text-video", 15, 100], ["higgsfield-image-generate", 0, 45], ["autotoast-hyperframes", 60, 50]]);
    expect(quote.lines.map((line) => line.step_key)).toEqual(["provider:scene1", "provider:image1", "compositor"]);
    expect((await quoteProductionCredits({ rpc } as never, { steps: [] }, 60)).credits).toBe(50);
    const retryQuote = await quoteProductionCredits({ rpc } as never, plan, 60, ["scene1"]);
    expect(retryQuote.credits).toBe(95);
    expect(retryQuote.lines.map((line) => line.step_key)).toEqual(["provider:image1", "compositor"]);
    await expect(quoteProductionCredits({ rpc } as never, plan, 60, ["unknown"])).rejects.toThrow(/does not match/);
  });
});
