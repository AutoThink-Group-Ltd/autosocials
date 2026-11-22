import { describe, expect, it, vi } from "vitest";
import { workspaceAccess } from "./publish-notifications.functions";

function fakeAdmin(options: { membership?: string; privileged?: boolean; agencyAccess?: boolean; linkedAgency?: string; adminOf?: string; failure?: boolean }) {
  const chain = (result: unknown) => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => result,
    then(resolve: (value: unknown) => void) { return Promise.resolve(result).then(resolve); } });
  return {
    from: vi.fn((table: string) => table === "workspace_members"
      ? chain({ data: options.membership ? { role: options.membership } : null, error: options.failure ? {} : null })
      : chain({ data: options.linkedAgency ? [{ agency_user_id: options.linkedAgency }] : [], error: null })),
    rpc: vi.fn(async (name: string, args: { _agency_owner?: string }) => ({
      data: name === "is_workspace_agency" ? !!options.agencyAccess : name === "is_workspace_member" ? !!options.membership || !!options.privileged : args._agency_owner === options.adminOf,
      error: null,
    })),
  };
}
const user = { id: "actor" };

describe("publishing notification access", () => {
  it("denies unrelated users and fails closed on permission lookup errors", async () => {
    await expect(workspaceAccess(fakeAdmin({}) as never, user, "client-a")).rejects.toThrow("access denied");
    await expect(workspaceAccess(fakeAdmin({ membership: "owner", failure: true }) as never, user, "client-a")).rejects.toThrow("check workspace access");
  });
  it("lets ordinary workspace members control only their own choice", async () => {
    const result = await workspaceAccess(fakeAdmin({ membership: "member" }) as never, user, "client-a");
    expect(result).toMatchObject({ canSelf: true, canManage: false });
    expect(await workspaceAccess(fakeAdmin({ membership: "admin" }) as never, user, "client-a")).toMatchObject({ canSelf: true, canManage: true });
  });
  it("only grants agency control for an administrator of the linked agency", async () => {
    expect(await workspaceAccess(fakeAdmin({ agencyAccess: true, linkedAgency: "agency-a", adminOf: "agency-a" }) as never, user, "client-a")).toMatchObject({ canSelf: true, canManage: true });
    expect(await workspaceAccess(fakeAdmin({ agencyAccess: true, linkedAgency: "agency-a", adminOf: "agency-b" }) as never, user, "client-a")).toMatchObject({ canSelf: true, canManage: false });
    await expect(workspaceAccess(fakeAdmin({ agencyAccess: false, linkedAgency: "agency-a", adminOf: "agency-a" }) as never, user, "client-b")).rejects.toThrow("access denied");
  });
  it("allows a super-admin with workspace access to manage and opt into their own notifications", async () => {
    expect(await workspaceAccess(fakeAdmin({ privileged: true }) as never, user, "client-a")).toMatchObject({ canSelf: true, canManage: true });
  });
});
