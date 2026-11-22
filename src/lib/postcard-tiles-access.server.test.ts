import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), operation: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
vi.mock("./brand-assets.functions", () => ({
  runBrandOperation: mocks.operation,
}));
import {
  createPostcardTile,
  checkPostcardTileStatus,
} from "./postcard-tiles.server";
const input = {
  workspace_id: "11111111-1111-4111-8111-111111111111",
  request_id: "22222222-2222-4222-8222-222222222222",
  headline: "A headline",
  supporting: "Support",
  direction: "Simple visual",
};
describe("Postcards tile access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("rejects an unauthorised workspace before provider or database operations", async () => {
    const from = vi.fn();
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      from,
    });
    await expect(createPostcardTile("user", input)).rejects.toThrow("access");
    expect(mocks.operation).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
    await expect(
      checkPostcardTileStatus("user", input.workspace_id, input.request_id),
    ).rejects.toThrow("access");
    expect(from).not.toHaveBeenCalled();
  });
  it("reports a retained nonsquare provider project without starting generation", async () => {
    const from = vi.fn((table: string) => {
      const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.maybeSingle.mockResolvedValue({
        data:
          table === "brand_work_operations"
            ? {
                status: "failed",
                result: { provider_project_id: "123", failure: "non_square" },
              }
            : { created_at: new Date().toISOString() },
        error: null,
      });
      return query;
    });
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from,
    });
    const result = await checkPostcardTileStatus(
      "user",
      input.workspace_id,
      input.request_id,
    );
    expect(result.status).toBe("reconciliation_required");
    if (result.status !== "reconciliation_required")
      throw new Error("Unexpected status");
    expect(result.message).toContain("verifiably square design");
    expect(mocks.operation).not.toHaveBeenCalled();
  });
});
