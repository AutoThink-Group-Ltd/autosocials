import { describe, it, expect } from "vitest";
import { isInviteUsable, agencyPathAllowed, canManageAgency, memberSeesClient } from "@/lib/invites";

describe("invite rules", () => {
  const now = new Date("2026-10-19T12:00:00Z");
  it("pending invite before expiry works", () => expect(isInviteUsable("pending", "2026-10-26T12:00:00Z", now)).toBe(true));
  it("expired invite is rejected", () => expect(isInviteUsable("pending", "2026-10-18T12:00:00Z", now)).toBe(false));
  it("an invitation without an expiry is not usable", () => expect(isInviteUsable("pending", null, now)).toBe(false));
  it("used invite is rejected", () => expect(isInviteUsable("accepted", "2026-10-26T12:00:00Z", now)).toBe(false));
  it("cancelled invite is rejected", () => expect(isInviteUsable("cancelled", null, now)).toBe(false));
  it("members can't open billing, team or settings", () => {
    expect(agencyPathAllowed("/agency/revenue", "member")).toBe(false);
    expect(agencyPathAllowed("/agency/team", "member")).toBe(false);
    expect(agencyPathAllowed("/agency/settings", "member")).toBe(false);
    expect(agencyPathAllowed("/agency/clients", "member")).toBe(true);
  });
  it("admins and owners manage the agency", () => {
    expect(canManageAgency("admin")).toBe(true);
    expect(canManageAgency("owner")).toBe(true);
    expect(canManageAgency("member")).toBe(false);
    expect(agencyPathAllowed("/agency/revenue", "admin")).toBe(true);
  });
  it("member with specific clients only sees those", () => {
    const emp = { role: "member", client_access: "specific", client_ids: ["a"] };
    expect(memberSeesClient(emp, "a")).toBe(true);
    expect(memberSeesClient(emp, "b")).toBe(false);
    expect(memberSeesClient({ ...emp, role: "admin" }, "b")).toBe(true);
  });
});
