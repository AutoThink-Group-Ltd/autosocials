import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), operation: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
vi.mock("./brand-assets.functions", () => ({
  runBrandOperation: mocks.operation,
}));
import { readSocialTileImage } from "./social-tile-image.server";

describe("social tile private image access", () => {
  beforeEach(() => {
    mocks.admin.mockReset();
  });
  it("rejects access before looking up a file when workspace membership fails", async () => {
    const from = vi.fn();
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      from,
    });
    await expect(
      readSocialTileImage("user", "workspace", "file"),
    ).rejects.toThrow("access");
    expect(from).not.toHaveBeenCalled();
  });
  it("never downloads a file whose stored path belongs to another workspace", async () => {
    const download = vi.fn();
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValue({
      data: {
        id: "file",
        kind: "image",
        size_bytes: 100,
        storage_path: "other/private.png",
      },
      error: null,
    });
    mocks.admin.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from: vi.fn().mockReturnValue(query),
      storage: { from: vi.fn().mockReturnValue({ download }) },
    });
    await expect(
      readSocialTileImage("user", "workspace", "file"),
    ).rejects.toThrow("unavailable");
    expect(query.eq).toHaveBeenCalledWith("workspace_id", "workspace");
    expect(download).not.toHaveBeenCalled();
  });
});
