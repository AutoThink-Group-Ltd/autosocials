import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT, landingPath } from "@/lib/landing";

describe("landing", () => {
  it("super admins land on the admin console", () => {
    expect(landingPath({ isSuperAdmin: true, accountType: "direct" })).toBe("/app/admin");
  });
  it("regular users land on their Home overview", () => {
    expect(landingPath({ isSuperAdmin: false, accountType: "direct" })).toBe("/app/home");
  });
  it("agency without a workspace lands on /agency", () => {
    expect(landingPath({ isSuperAdmin: false, accountType: "agency", primaryWorkspaceId: null })).toBe("/agency");
  });
  it("agency users with a selected business land on its Home overview", () => {
    expect(landingPath({ isSuperAdmin: false, accountType: "agency", primaryWorkspaceId: "business" })).toBe("/app/create");
  });
  it("default layout puts Sam before Live View, nothing collapsed", () => {
    expect(DEFAULT_LAYOUT).toEqual({ order: "sam-live", samCollapsed: false, navCollapsed: false });
  });
});
