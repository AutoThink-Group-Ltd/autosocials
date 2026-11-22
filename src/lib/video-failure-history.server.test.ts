import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), from: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => ({ rpc: mocks.access, from: mocks.from }) }));
import { getSupportVideoFailureHistoryForUser, getVideoFailureHistoryForUser } from "./video-failure-history.server";

describe("video failure history access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { select: vi.fn(), eq: mocks.eq, order: mocks.order, limit: mocks.limit };
    query.select.mockReturnValue(query); mocks.eq.mockReturnValue(query); mocks.order.mockReturnValue(query);
    mocks.limit.mockResolvedValue({ data: [{ id: "event" }], error: null });
    mocks.from.mockReturnValue(query);
    mocks.access.mockResolvedValue({ data: true, error: null });
  });

  it("checks the super-admin role and scopes history to that workspace", async () => {
    await expect(getVideoFailureHistoryForUser("user-a", "workspace-a")).resolves.toEqual([{ id: "event" }]);
    expect(mocks.access).toHaveBeenCalledWith("has_role", { _user_id: "user-a", _role: "super_admin" });
    expect(mocks.from).toHaveBeenCalledWith("video_failure_events");
    expect(mocks.eq).toHaveBeenCalledWith("workspace_id", "workspace-a");
    expect(mocks.limit).toHaveBeenCalledWith(100);
  });

  it("does not query history when the admin role is denied or cannot be checked", async () => {
    mocks.access.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: null, error: new Error("unavailable") });
    await expect(getVideoFailureHistoryForUser("user-a", "workspace-b")).rejects.toThrow("Forbidden");
    await expect(getVideoFailureHistoryForUser("user-a", "workspace-b")).rejects.toThrow("Forbidden");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("lets only super admins query support history using their RLS client", async () => {
    const client = { rpc: mocks.access, from: mocks.from };
    mocks.access.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: true, error: null });
    await expect(getSupportVideoFailureHistoryForUser({ supabase: client, userId: "member" })).rejects.toThrow("Forbidden");
    expect(mocks.from).not.toHaveBeenCalled();
    await expect(getSupportVideoFailureHistoryForUser({ supabase: client, userId: "admin" }, "workspace-a")).resolves.toEqual([{ id: "event" }]);
    expect(mocks.access).toHaveBeenLastCalledWith("has_role", { _user_id: "admin", _role: "super_admin" });
    expect(mocks.eq).toHaveBeenCalledWith("workspace_id", "workspace-a");
  });
});
