import { describe, expect, it } from "vitest";
import { campaignPostSchema, campaignTile } from "./content-campaign";
import { prepareCampaignTile } from "./content-campaign-design.server";
import { founderQuotes } from "./social-quote-sources";

const tile = campaignPostSchema.parse({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", date: "2026-11-20", platform: "linkedin", format: "tiles", title: "A useful idea", caption: "A practical lesson", brief: "An editorial illustration" });
describe("campaign tile direction", () => {
  it("keeps ordinary slots original in a mixed quote campaign", async () => {
    const result = await prepareCampaignTile(tile, "Some founder quotes and original posts");
    expect(result.design).toBeDefined();
    expect(result.quote).toBeUndefined();
  });
  it("preserves verified quote and design in the reviewed production tile", async () => {
    const design = { aspect: "portrait" as const, treatment: "typography" as const, composition: "full" as const, medium: "Ink and paper", accent: "#112233", emphasis: "", typeface: "serif" as const };
    const planned = await prepareCampaignTile({ ...tile, design, quote: founderQuotes[0]! }, "Include founder quotes");
    const snapshot = campaignTile(campaignPostSchema.parse(planned));
    expect(snapshot.design).toEqual(design);
    expect(snapshot.quote).toEqual(founderQuotes[0]);
  });
  it("removes an unverified attributed quote from tile and caption", async () => {
    const quote = { text: "An invented quote that is not in the source", speaker: "Imaginary Author", sourceTitle: "Unknown", sourceUrl: "https://example.com/source" };
    const result = await prepareCampaignTile({ ...tile, caption: `${quote.text} — ${quote.speaker}`, quote }, "An attributed quote");
    expect(result.quote).toBeUndefined();
    expect(result.quoteNotice).toMatch(/could not be confirmed/i);
    expect(result.caption).not.toContain(quote.text);
    expect(result.caption).not.toContain(quote.speaker);
  });
});
