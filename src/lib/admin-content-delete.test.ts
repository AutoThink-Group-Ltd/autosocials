import { beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ requireUser: vi.fn(), getAdminClient: vi.fn() }));
vi.mock("@/lib/supabase-admin.server", () => fixture);
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { const chain = { inputValidator: () => chain, handler: (fn: unknown) => fn }; return chain; } }));
import { enqueueAdminContentDeletions, processAdminContentDeletions } from "./admin-content-delete.functions";

const enqueue = enqueueAdminContentDeletions as unknown as (arg: unknown) => Promise<unknown>;
const process = processAdminContentDeletions as unknown as (arg: unknown) => Promise<unknown>;
beforeEach(() => { vi.clearAllMocks(); fixture.requireUser.mockResolvedValue({ id: "admin" }); });

describe("permanent content deletion authorization", () => {
  it("rejects anonymous users before creating a privileged client", async () => {
    fixture.requireUser.mockRejectedValue(new Error("Unauthorized"));
    await expect(enqueue({ data: { confirmed: true, items: [] } })).rejects.toThrow("Unauthorized");
    await expect(process({ data: { kind: "video" } })).rejects.toThrow("Unauthorized");
    expect(fixture.getAdminClient).not.toHaveBeenCalled();
  });
  it("rejects non-super-admin users before reading or mutating the queue", async () => {
    const from = vi.fn(); const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    fixture.getAdminClient.mockReturnValue({ rpc, from });
    await expect(enqueue({ data: { confirmed: true, items: [] } })).rejects.toThrow("Forbidden");
    await expect(process({ data: { kind: "tile" } })).rejects.toThrow("Forbidden");
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("has_role", { _user_id: "admin", _role: "super_admin" });
  });
  it("passes only validated identifiers, never a client storage path, to the enqueue RPC", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: true }).mockResolvedValueOnce({ data: "queue-id" });
    fixture.getAdminClient.mockReturnValue({ rpc });
    const result = await enqueue({ data: { confirmed: true, items: [{ kind: "video", workspaceId: "workspace", target: "render" }] } });
    expect(result).toEqual([{ target: "render", workspaceId: "workspace" }]);
    expect(rpc).toHaveBeenLastCalledWith("enqueue_admin_content_deletion", { p_actor: "admin", p_kind: "video", p_workspace: "workspace", p_target: "render" });
  });
  it("finishes a failed request with no file and keeps it in the queue if cleanup fails", async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: true })
      .mockResolvedValueOnce({ data: { id: "queue", claim_token: "claim", storage_path: null } })
      .mockResolvedValueOnce({ error: { message: "cleanup failed" } })
      .mockResolvedValueOnce({ data: null });
    const updateChain = { eq: vi.fn() }; updateChain.eq.mockReturnValue(updateChain);
    const countChain = { eq: vi.fn() }; countChain.eq.mockReturnValueOnce(countChain).mockResolvedValueOnce({ count: 1 });
    const table = { update: vi.fn(() => updateChain), select: vi.fn(() => countChain) };
    fixture.getAdminClient.mockReturnValue({ rpc, from: () => table });
    const result = await process({ data: { kind: "tile" } });
    expect(result).toEqual({ completed: 0, pending: 1 });
    expect(rpc).toHaveBeenCalledWith("finish_admin_content_deletion", { p_id: "queue", p_claim: "claim" });
    expect(table.update).toHaveBeenCalledWith(expect.objectContaining({ last_error: "Database cleanup failed.", claim_token: null }));
  });
});
