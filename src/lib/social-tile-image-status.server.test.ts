import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), operation: vi.fn(), pin: vi.fn().mockResolvedValue(null) }));
vi.mock("./brand-dna-store.server", () => ({ pinProductionDna: mocks.pin }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
vi.mock("./content-credits.server", () => ({ CreditAdmissionError: class CreditAdmissionError extends Error {}, getContentCreditRate: async () => ({ credits: 45, version: "rate-id" }), reserveCredits: vi.fn(), resolveCredits: vi.fn() }));
vi.mock("./brand-assets.functions", () => ({
  runBrandOperation: mocks.operation,
}));
import {
  checkSocialTileImageStatus,
  createSocialTileImage,
} from "./social-tile-image.server";

function query(data: unknown) {
  const q = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
  };
  q.select.mockReturnValue(q);
  q.eq.mockReturnValue(q);
  return q;
}
describe("social tile image admission and status", () => {
  beforeEach(() => {
    mocks.admin.mockReset();
    mocks.operation.mockReset();
    mocks.pin.mockReset().mockResolvedValue(null);
  });
  it("does not start a paid operation after admission denies the monthly limit", async () => {
    const previous = process.env["OPENAI_API_KEY"];
    process.env["OPENAI_API_KEY"] = "test";
    try {
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: true, error: null })
        .mockResolvedValueOnce({ data: { allowed: false }, error: null });
      mocks.admin.mockReturnValue({ rpc });
      expect(
        await createSocialTileImage("user", "workspace", "brief", "request", 45, "rate-id"),
      ).toMatchObject({ status: "limit_reached" });
      expect(mocks.operation).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env["OPENAI_API_KEY"];
      else process.env["OPENAI_API_KEY"] = previous;
    }
  });
  it("uses the deck pin before admission and pauses when identity is not ready", async () => {
    process.env["OPENAI_API_KEY"] = "test";
    try {
      const rpc = vi.fn().mockResolvedValue({ data:true, error:null });
      mocks.admin.mockReturnValue({rpc});
      mocks.pin.mockRejectedValueOnce(new Error("Brand DNA is being prepared"));
      await expect(createSocialTileImage("user", "workspace", "brief", "request", 45, "rate-id", undefined, {format:"carousel",job_id:"deck"})).rejects.toThrow("being prepared");
      expect(mocks.pin).toHaveBeenCalledWith(expect.anything(),"workspace","canvas-carousel:deck",undefined);
      expect(rpc).toHaveBeenCalledTimes(1);
      expect(mocks.operation).not.toHaveBeenCalled();
    } finally { delete process.env["OPENAI_API_KEY"]; }
  });
  it("reports an admitted but interrupted operation as requiring reconciliation", async () => {
    const admission = query({ created_at: new Date().toISOString() });
    const operation = query({
      status: "failed",
      updated_at: new Date().toISOString(),
      result: null,
    });
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn((table: string) =>
        table === "social_image_admissions" ? admission : operation,
      ),
    });
    expect(
      await checkSocialTileImageStatus("user", "workspace", "request"),
    ).toMatchObject({ status: "reconciliation_required" });
    expect(mocks.operation).not.toHaveBeenCalled();
  });
  it("reports not found only when both the admission and operation are absent", async () => {
    const absent = query(null);
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn().mockReturnValue(absent),
    });
    expect(
      await checkSocialTileImageStatus("user", "workspace", "request"),
    ).toEqual({ status: "not_found" });
    expect(mocks.operation).not.toHaveBeenCalled();
  });
});
