import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ admin: { from: vi.fn(), auth: { admin: { listUsers: vi.fn(), getUserById: vi.fn(), generateLink: vi.fn() } } } }));
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => { let validate = (x: unknown) => x; const chain: any = { middleware: () => chain, inputValidator: (fn: typeof validate) => { validate = fn; return chain; }, handler: (fn: any) => (args: any) => fn({ ...args, data: validate(args.data) }) }; return chain; } }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/integrations/supabase/client.server", () => ({ supabaseAdmin: state.admin }));
import { listSwitchableUsers, startImpersonation } from "@/lib/impersonation.functions";
const actor = "00000000-0000-4000-8000-000000000001";
const targetId = "00000000-0000-4000-8000-000000000002";
function context(allowed = true) { return { userId: actor, supabase: { rpc: vi.fn().mockResolvedValue({ data: allowed }) } }; }
function table(result: unknown) { const chain: any = { select: () => chain, eq: () => chain, in: () => Promise.resolve(result), insert: () => chain, single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result), then: (resolve: any) => Promise.resolve(result).then(resolve) }; return chain; }
beforeEach(() => { vi.resetAllMocks(); });
describe("audited agency impersonation", () => {
  it("rejects non-superadmins before privileged reads", async () => {
    await expect((listSwitchableUsers as any)({ data: { accountType: "agency" }, context: context(false) })).rejects.toThrow("Forbidden");
    await expect((startImpersonation as any)({ data: { targetId }, context: context(false) })).rejects.toThrow("Forbidden");
    expect(state.admin.from).not.toHaveBeenCalled();
  });
  it("filters agencies before limiting results and excludes superadmins", async () => {
    const users = Array.from({ length: 60 }, (_, i) => ({ id: String(i), email: i + "@example.test", last_sign_in_at: String(100 - i) }));
    users.push({ id: targetId, email: "agency@example.test", last_sign_in_at: "0" });
    state.admin.auth.admin.listUsers.mockResolvedValue({ data: { users } });
    state.admin.from.mockImplementation((name: string) => table({ data: name === "user_roles" ? [{ user_id: "0" }] : users.map(u => ({ id: u.id, full_name: u.id, account_type: u.id === targetId || u.id === "0" ? "agency" : "direct" })) }));
    const result = await (listSwitchableUsers as any)({ data: { accountType: "agency" }, context: context() });
    expect(result.map((u: any) => u.id)).toEqual([targetId]);
  });
  it("never allows impersonating a superadmin", async () => {
    state.admin.from.mockReturnValue(table({ data: [{ user_id: targetId }] }));
    await expect((startImpersonation as any)({ data: { targetId }, context: context() })).rejects.toThrow("Super admins");
    expect(state.admin.auth.admin.generateLink).not.toHaveBeenCalled();
  });
  it.each(["agency", "direct"])("resolves %s context from the target profile", async (accountType) => {
    state.admin.from.mockImplementation((name: string) => table({ data: name === "user_roles" ? [] : name === "profiles" ? { full_name: "Target", account_type: accountType } : { id: actor } }));
    state.admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { email: "agency@example.test" } } });
    state.admin.auth.admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "test-token" } } });
    const result = await (startImpersonation as any)({ data: { targetId }, context: context() });
    expect(result.destination).toBe(accountType === "agency" ? "/agency" : "/app/create");
    expect(result.eventId).toBe(actor);
  });
  it("does not return a sign-in token if the audit write fails", async () => {
    state.admin.from.mockImplementation((name: string) => table(name === "user_roles" ? { data: [] } : { error: new Error("offline") }));
    state.admin.auth.admin.getUserById.mockResolvedValue({ data: { user: { email: "agency@example.test" } } });
    state.admin.auth.admin.generateLink.mockResolvedValue({ data: { properties: { hashed_token: "test-token" } } });
    await expect((startImpersonation as any)({ data: { targetId }, context: context() })).rejects.toThrow("record the switch");
  });
});
