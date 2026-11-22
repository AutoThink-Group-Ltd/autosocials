import { describe, expect, it } from "vitest";
import { filterBlocksForModule } from "@/lib/sam.blocks";

describe("Outreach Live View", () => {
  it("accepts a campaign handoff only with a valid campaign ID", () => {
    const campaign_id = "e48c500a-8a71-46fc-9d49-7d76a922a1a5";
    expect(filterBlocksForModule("outreach", [{ type: "outreach_campaign", title: "Review campaign", campaign_id }])).toHaveLength(1);
    expect(filterBlocksForModule("outreach", [{ type: "outreach_campaign", title: "Review campaign", campaign_id: "bad" }])).toHaveLength(0);
    expect(filterBlocksForModule("create", [{ type: "outreach_campaign", title: "Review campaign", campaign_id }])).toHaveLength(0);
  });
});
