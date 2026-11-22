import { afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireUser: vi.fn(), rpc: vi.fn(), getAdminClient: vi.fn() }));
vi.mock("./supabase-admin.server", () => auth);
vi.mock("./youtube.server", () => ({ readYouTubeVideos: vi.fn(), readYouTubeComments: vi.fn(), browseYouTubePublic: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (handler: unknown) => handler }) }) }));
import { browseYouTube, YouTubeWorkspaceBrowseInputSchema } from "./youtube.functions";
import { requireYouTubeWorkspace, requireYouTubeBrowseQuota } from "./youtube-access.server";
import type { YouTubeBrowseInput } from "./youtube";
afterEach(() => vi.resetAllMocks());
describe("YouTube workspace access", () => {
  it.each([
    [{ query: "dragon", order: "date" }, "sam.search_youtube"],
    [{ channel_id: "UCabcdefghijklmnopqrstuv", order: "viewCount" }, "sam.search_youtube"],
    [{ channel_id: "UCabcdefghijklmnopqrstuv", order: "date" }, "youtube.browse"],
    [{ channel_id: "UCabcdefghijklmnopqrstuv" }, "youtube.browse"],
    [{}, "youtube.browse"],
  ] as const)("uses the correct quota for %o", async (input, intent) => {
    const query = { eq: vi.fn().mockReturnThis(), gte: vi.fn().mockResolvedValue({ count: 0, error: null }) };
    auth.requireUser.mockResolvedValue({ id: "user" }); auth.rpc.mockResolvedValue({ data: true, error: null });
    auth.getAdminClient.mockReturnValue({ rpc: auth.rpc, from: vi.fn().mockReturnValue({ select: () => query, insert: vi.fn().mockResolvedValue({ error: null }) }) });
    const handler = browseYouTube as unknown as (context: { data: YouTubeBrowseInput & { workspace_id: string } }) => Promise<unknown>;
    await handler({ data: { workspace_id: "workspace", ...input } });
    expect(query.eq).toHaveBeenCalledWith("intent", intent);
  });
  it("requires a valid workspace and bounded browse input", () => {
    expect(() => YouTubeWorkspaceBrowseInputSchema.parse({ workspace_id: "other", query: "dragon" })).toThrow();
    expect(() => YouTubeWorkspaceBrowseInputSchema.parse({ workspace_id: "11111111-1111-4111-8111-111111111111", channel_id: "https://youtube.com/channel/bad" })).toThrow();
  });
  it("shares Sam's search budget and records no public metadata", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const gte = vi.fn().mockResolvedValue({ count: 19, error: null });
    const eq = vi.fn().mockReturnThis();
    const select = vi.fn().mockReturnValue({ eq, gte });
    eq.mockReturnValue({ eq, gte });
    const from = vi.fn().mockReturnValue({ select, insert });
    auth.requireUser.mockResolvedValue({ id: "user" }); auth.rpc.mockResolvedValue({ data: true, error: null });
    auth.getAdminClient.mockReturnValue({ rpc: auth.rpc, from });
    await requireYouTubeBrowseQuota("workspace", true);
    expect(eq).toHaveBeenCalledWith("intent", "sam.search_youtube");
    expect(insert).toHaveBeenCalledWith({ workspace_id: "workspace", user_id: "user", intent: "sam.search_youtube", outcome: "requested", risk_level: "low", payload: {} });
    gte.mockResolvedValue({ count: 20, error: null });
    await expect(requireYouTubeBrowseQuota("workspace", true)).rejects.toThrow("20 YouTube searches");
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it("fails closed when browse usage or its audit record cannot be checked", async () => {
    const query = { eq: vi.fn().mockReturnThis(), gte: vi.fn().mockResolvedValue({ error: new Error("unavailable") }) };
    const insert = vi.fn().mockResolvedValue({ error: new Error("unavailable") });
    auth.requireUser.mockResolvedValue({ id: "user" }); auth.rpc.mockResolvedValue({ data: true, error: null });
    auth.getAdminClient.mockReturnValue({ rpc: auth.rpc, from: vi.fn().mockReturnValue({ select: () => query, insert }) });
    await expect(requireYouTubeBrowseQuota("workspace", false)).rejects.toThrow("usage couldn't be checked");
    expect(insert).not.toHaveBeenCalled();
    query.gte.mockResolvedValue({ error: null } as never);
    await expect(requireYouTubeBrowseQuota("workspace", false)).rejects.toThrow("couldn't be recorded");
  });
  it("rejects unsigned callers before using the service client", async () => {
    auth.requireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(requireYouTubeWorkspace("workspace")).rejects.toThrow("Unauthorized");
    expect(auth.getAdminClient).not.toHaveBeenCalled();
  });
  it("rejects inaccessible workspaces", async () => {
    auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue({ rpc: auth.rpc });
    auth.rpc.mockResolvedValue({ data: false, error: null });
    await expect(requireYouTubeWorkspace("other-workspace")).rejects.toThrow("access");
    expect(auth.rpc).toHaveBeenCalledWith("can_access_workspace", { _user_id: "user", _workspace_id: "other-workspace" });
  });
  it("accepts authorised workspace users", async () => {
    auth.requireUser.mockResolvedValue({ id: "user" }); auth.getAdminClient.mockReturnValue({ rpc: auth.rpc });
    auth.rpc.mockResolvedValue({ data: true, error: null });
    expect((await requireYouTubeWorkspace("workspace")).user.id).toBe("user");
  });
});
