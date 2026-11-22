import { describe, expect, it } from "vitest";
import { connectedPostAttribution, limitPersonalFindingCitations, personalPostAttribution, personalProfileEvidence, validatePersonalBrandReport } from "./personal-brand-report";

const report = { version: 1, generatedAt: "2026-11-14T12:00:00Z", impression: [{ text: "A recurring theme", evidenceIds: ["p1"] }], themes: [], strengths: [], mixedSignals: [], opportunities: [], channels: [], evidence: [{ id: "p1", platform: "x", url: "https://x.com/example/status/1", date: null, caption: "A post", attribution: "unknown", basis: ["caption"] }] };
describe("personal brand report citations", () => {
  it("accepts findings backed by collected evidence", () => expect(validatePersonalBrandReport(report).impression).toHaveLength(1));
  it("rejects invented evidence references", () => expect(() => validatePersonalBrandReport({ ...report, impression: [{ text: "Claim", evidenceIds: ["invented"] }] })).toThrow("unknown evidence reference"));
  it("rejects unsafe evidence URLs", () => expect(() => validatePersonalBrandReport({ ...report, evidence: [{ ...report.evidence[0], url: "http://example.com" }] })).toThrow());
  it("bounds long citation lists while still rejecting invented citations", () => {
    const long = { ...report, channels: [{ platform: "x", findings: [{ text: "Theme", evidenceIds: Array(12).fill("p1") }] }] };
    expect(validatePersonalBrandReport(limitPersonalFindingCitations(long)).channels[0]?.findings[0]?.evidenceIds).toHaveLength(8);
    const invalid = { ...long, channels: [{ platform: "x", findings: [{ text: "Theme", evidenceIds: ["invented", ...Array(9).fill("p1")] }] }] };
    expect(() => validatePersonalBrandReport(limitPersonalFindingCitations(invalid))).toThrow("unknown evidence reference");
  });
});

describe("post attribution", () => {
  it("marks explicit retweets separately and leaves authorship unverified otherwise", () => {
    expect(personalPostAttribution("RT @someone: Their words")).toBe("repost");
    expect(personalPostAttribution("@someone My reply")).toBe("unknown");
  });
  it("recognizes connected X posts while preserving repost and other-platform uncertainty", () => {
    expect(connectedPostAttribution("x", "@other My reply")).toBe("authored");
    expect(connectedPostAttribution("x", "RT @other: Their words")).toBe("repost");
    expect(connectedPostAttribution("facebook", "A post")).toBe("unknown");
  });
});

it("rejects older evidence lacking attribution so it is regenerated", () => { const old = { ...report, evidence: [{ id: "p1", platform: "x", url: "https://x.com/example/status/1", date: null, caption: "RT @other: words", basis: ["caption"] }] }; expect(() => validatePersonalBrandReport(old)).toThrow(); });

it("uses a saved LinkedIn profile context as self-description, never a post", () => { const result = personalProfileEvidence("Profile: https://www.linkedin.com/in/example/\nProfile context: Founder and writer", "profile-1"); expect(result).toMatchObject({ attribution: "self_description", basis: ["profile"], caption: "Founder and writer" }); expect(personalProfileEvidence("Profile: https://x.com/example\nProfile context: spoof", "p")).toBeNull(); });
