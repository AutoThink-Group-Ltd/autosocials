import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), read: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
vi.mock("./social-tile-image.server", () => ({
  readSocialTileImage: mocks.read,
}));
import {
  getDesignLogoForUser,
  saveTileDesignForUser,
} from "./tile-design-draft.server";
const workspace = "10000000-0000-4000-8000-000000000001",
  id = "20000000-0000-4000-8000-000000000002",
  post = "30000000-0000-4000-8000-000000000003";
const tile = { headline: "Hello", supporting: "World" };
const payload = {
  plan: { brand: "Brand", tiles: [tile] },
  entries: [{ tile, requestId: id, postId: post, status: "pending" }],
};
function chain(result: unknown, log: string[]) {
  const q: any = {};
  for (const name of [
    "select",
    "eq",
    "insert",
    "update",
    "order",
    "limit",
    "like",
    "match",
  ])
    q[name] = (...args: unknown[]) => {
      log.push(`${name}:${JSON.stringify(args)}`);
      return q;
    };
  q.maybeSingle = async () => result;
  q.then = (resolve: (x: unknown) => void) => resolve(result);
  return q;
}
beforeEach(() => {
  vi.resetAllMocks();
});
describe("draft storage safeguards", () => {
  it("uses an atomic workspace and token match and rejects a stale version", async () => {
    const log: string[] = [];
    mocks.admin.mockReturnValue({
      rpc: async () => ({ data: true, error: null }),
      from: () => chain({ data: null, error: null }, log),
    });
    await expect(
      saveTileDesignForUser("user", {
        workspace_id: workspace,
        id,
        version: post,
        payload,
      }),
    ).rejects.toThrow("changed elsewhere");
    expect(log).toContain(
      `match:${JSON.stringify([{ workspace_id: workspace, kind: "tile-design-draft-v1", signature: id }])}`,
    );
    expect(log).toContain(`eq:${JSON.stringify(["token", post])}`);
  });
  it("requires workspace access before reading the manifest", async () => {
    const from = vi.fn();
    mocks.admin.mockReturnValue({
      rpc: async () => ({ data: false, error: null }),
      from,
    });
    await expect(
      saveTileDesignForUser("user", { workspace_id: workspace, id, payload }),
    ).rejects.toThrow("access denied");
    expect(from).not.toHaveBeenCalled();
  });
  it("skips foreign paths and reads only a workspace-owned verified logo", async () => {
    const log: string[] = [];
    const rows = {
      data: [
        { id: "bad", storage_path: "other/logo.png", size_bytes: 100 },
        { id, storage_path: `${workspace}/logos/logo.png`, size_bytes: 100 },
      ],
      error: null,
    };
    mocks.admin.mockReturnValue({
      rpc: async () => ({ data: true, error: null }),
      from: () => chain(rows, log),
    });
    mocks.read.mockResolvedValue({
      kind: "logo",
      data_url: "data:image/png;base64,AAA=",
    });
    await expect(getDesignLogoForUser("user", workspace)).resolves.toBe(
      "data:image/png;base64,AAA=",
    );
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(mocks.read).toHaveBeenCalledWith("user", workspace, id);
  });
});
