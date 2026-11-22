import { describe, expect, it } from "vitest";
import { companyChannelBrief, personalLinkedIn, profileDnaGuidelines, profileDnaSchema, profileGoalInterpretation } from "./profile-dna";

const profileUrl = "https://www.linkedin.com/in/example";
const stored = {
  sourceUrl: profileUrl, name: "Example", companyWebsite: null, role: null, employer: null, postCount: 0, topics: [],
  positioning: "Start with a useful decision the reader faces.", voice: "Provisional voice", palette: "sand",
  tiles: ["One", "Two", "Three"].map(headline => ({ headline, supporting: "Short supporting copy" })),
};

describe("Profile DNA goals", () => {
  it("keeps older records readable and doesn't infer an audience or goal from missing data", () => {
    expect(profileGoalInterpretation(profileDnaSchema.parse(stored))).toEqual({ knownFor: stored.positioning, audience: null, goal: null });
  });
  it("includes the displayed interpretation in the same planner context while leaving unknown fields unfilled", () => {
    const dna = profileDnaSchema.parse({ ...stored, interpretation: { knownFor: null, audience: null, goal: "Help readers compare two choices" } });
    expect(profileGoalInterpretation(dna)).toEqual({ knownFor: null, audience: null, goal: "Help readers compare two choices" });
    const context = profileDnaGuidelines(dna);
    expect(context).toContain("Help readers compare two choices");
    expect(context).toContain("explicit goals take priority");
  });
  it("recognizes personal URLs separately from company pages and topics about them", () => {
    expect(personalLinkedIn([{ url: "https://www.linkedin.com/company/example/" }])).toBeNull();
    expect(personalLinkedIn([{ url: profileUrl }])).toContain("/in/example");
    expect(companyChannelBrief("Write a post for our company LinkedIn page")).toBe(true);
    expect(companyChannelBrief("For my personal profile, explain why a company page can struggle to grow")).toBe(false);
  });
});
