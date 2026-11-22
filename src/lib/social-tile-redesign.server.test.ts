import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), create: vi.fn(), read: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
vi.mock("./sam-tile-design.server", () => ({ createSamTile: mocks.create }));
vi.mock("./social-tile-image.server", () => ({ readSocialTileImage: mocks.read }));
import { redesignTile } from "./social-tile-redesign.server";

const request = { workspace_id: "workspace", original_request_id: "original", expected_file_id: "old-file", headline: "Headline", supporting: "", direction: "Editorial", expected_provider: "openai" as const, expected_credits: 45, expected_rate_id: "rate" };
describe("redesigning a saved tile", () => {
  beforeEach(() => vi.clearAllMocks());
  it("only replaces the expected ready file after the new design succeeds", async () => {
    let file = "old-file";
    const filters: [string, unknown][] = [];
    const query: any = {
      select: () => query,
      update: (value: any) => { query.updateValue = value; return query; },
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      maybeSingle: async () => {
        if (query.updateValue) {
          expect(filters).toContainEqual(["result->>file_id", "old-file"]);
          file = query.updateValue.result.file_id;
          query.updateValue = undefined;
          return { data: { result: { file_id: file } }, error: null };
        }
        return { data: { status: "complete", result: { file_id: file } }, error: null };
      },
    };
    mocks.admin.mockReturnValue({ rpc: async () => ({ data: true }), from: () => query });
    mocks.create.mockImplementation(async (_user, input) => ({ status: "ready", file_id: input.request_id, data_url: "image" }));
    mocks.read.mockImplementation(async (_user, _ws, id) => ({ file_id: id, data_url: "image" }));
    const first = await redesignTile("user", request);
    expect(first.status).toBe("ready");
    const second = await redesignTile("user", request);
    expect(second).toEqual(first);
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("does not generate when workspace access is denied", async () => {
    mocks.admin.mockReturnValue({ rpc: async () => ({ data: false }) });
    await expect(redesignTile("user", request)).rejects.toThrow("access");
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
