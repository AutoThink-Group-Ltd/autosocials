import { describe, expect, it } from "vitest";
import { packCreativeEvidence } from "@/lib/creative-context";
describe("creative evidence coverage", () => {
  it("prioritises explicit context and marks omitted content as partial", () => {
    const packed = packCreativeEvidence([
      { id: "web", name: "Site", origin: "website", status: "read", text: "W".repeat(3000), detail: "" },
      { id: "brief", name: "Brief", origin: "explicit", status: "read", text: "Keep the approved price", detail: "" },
    ], 1100);
    expect(packed.indexOf("[brief]")).toBeLessThan(packed.indexOf("[web]"));
    expect(packed).toContain("website | partial");
  });
  it("does not describe an unread upload as missing", () => {
    expect(packCreativeEvidence([{ id: "file:1", name: "Reference", origin: "upload", status: "unread", text: "", detail: "Stored" }])).toContain("No inspected content available");
  });
});
