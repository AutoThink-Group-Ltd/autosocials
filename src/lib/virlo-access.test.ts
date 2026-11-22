import { describe, expect, it } from "vitest";
import { virloResourceKind } from "./virlo-access";
const id = "174b01d4-1d49-4f44-9cb9-05762309926e";
describe("Virlo resource access", () => {
  it("requires matching workspace resource types for all account-wide IDs", () => {
    expect(virloResourceKind({ operation: "lookup_status", lookup: "video", id })).toBe("lookup_video");
    expect(virloResourceKind({ operation: "tracking_data", kind: "creators", view: "report", id })).toBe("creators");
    expect(virloResourceKind({ operation: "tracking_update", kind: "videos", status: "paused", id })).toBe("videos");
    expect(virloResourceKind({ operation: "research_data", view: "videos", id })).toBe("research");
    expect(virloResourceKind({ operation: "research_delete", id })).toBe("research");
    expect(virloResourceKind({ operation: "untrack", kind: "videos", id })).toBe("videos");
    expect(virloResourceKind({ operation: "videos", query: "coffee", page: 1, scope: "virlo_library" })).toBeNull();
    expect(virloResourceKind({ operation: "videos", query: "coffee", page: 1, scope: "agent", agent_id: id })).toBe("research");
  });
});
