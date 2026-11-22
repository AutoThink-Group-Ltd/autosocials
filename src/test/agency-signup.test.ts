import { describe, it, expect } from "vitest";
import { validateAgencyDetails, normalizeWebsite } from "@/lib/agency-signup";

describe("agency signup details", () => {
  it("requires an agency name", () => {
    expect(validateAgencyDetails("", "autothink.co.uk").ok).toBe(false);
  });
  it("requires an agency website", () => {
    expect(validateAgencyDetails("AutoThink Group", "").ok).toBe(false);
  });
  it("adds https:// to bare domains", () => {
    expect(normalizeWebsite("autothink.co.uk")).toBe("https://autothink.co.uk");
  });
  it("rejects non-addresses", () => {
    expect(normalizeWebsite("not a site")).toBeNull();
  });
});
