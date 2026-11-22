import { measuredNarrationTimeline } from "@/lib/frame-qa";
import { describe, it, expect } from "vitest";
import { parseReview, sampleTimes, loopOutcome, finishedSampleTimes, MAX_FIX_ROUNDS } from "@/lib/frame-qa";
import { isBuiltinPath, builtinFontSlug } from "@/lib/autotoast-builtins";
import { validateComposition } from "@/lib/composition-rules";

const major = { t: 4, kind: "text_overlap" as const, severity: "major" as const, detail: "Headline overlaps logo" };
describe("look check", () => {
  it("allows at most 2 fix rounds", () => expect(MAX_FIX_ROUNDS).toBe(2));
  it("malformed review is no verdict, not a pass", () => expect(parseReview("nope")).toBeNull());
  it("parses a valid review", () => expect(parseReview(JSON.stringify({ issues: [major] }))).toHaveLength(1));
  it("major issue left after fixes needs review", () => expect(loopOutcome(2, [major])).toBe("needs_review"));
  it("clean after a fix is 'fixed'", () => expect(loopOutcome(1, [])).toBe("fixed"));
  it("clean first time is 'passed'", () => expect(loopOutcome(0, [{ ...major, severity: "minor" }])).toBe("passed"));
  it("failed review is 'skipped'", () => expect(loopOutcome(0, null)).toBe("skipped"));
  it("30s film samples ≤30 frames incl. end card", () => { const t = sampleTimes(30, [0, 6, 12]); expect(t.length).toBeLessThanOrEqual(30); expect(t).toContain(29.5); expect(t).toContain(6.6); });
  it("finished check samples the opening, ending and action over time", () => {
    const times = finishedSampleTimes(30);
    expect(times[0]).toBe(0.1);
    expect(times.at(-1)).toBe(29.9);
    expect(times.length).toBeGreaterThan(12);
    expect(times.length).toBeLessThanOrEqual(24);
    expect(times.every((time, index) => index === 0 || time - times[index - 1]! <= 2.5)).toBe(true);
  });
});

describe("built-in libraries and fonts", () => {
  it("accepts GSAP plugins and hosted fonts", () => { expect(isBuiltinPath("_lib/gsap/DrawSVGPlugin.min.js")).toBe(true); expect(isBuiltinPath("_fonts/inter/700.css")).toBe(true); });
  it("rejects unknown fonts", () => expect(isBuiltinPath("_fonts/comic-sans/index.css")).toBe(false));
  it("maps family names", () => expect(builtinFontSlug("Plus Jakarta Sans")).toBe("plus-jakarta-sans"));
  it("composition using built-ins passes the file check", () => {
    const html = `<!doctype html><head><script src="_lib/gsap/gsap.min.js"></script><link rel="stylesheet" href="_fonts/sora/index.css"></head><div data-composition-id="main" data-duration="30" class="clip" data-track-index="0"></div><script>const tl=gsap.timeline({paused:true});window.__timelines["main"]=tl;</script>`;
    expect(validateComposition({ html, duration: 30, files: [] })).toEqual([]);
  });
});

it("requires complete measured timing for the saved narration", () => {
  expect(measuredNarrationTimeline("Hello world", [[0.1, 0.5], [0.6, 1]])).toContain("world (0.6–1s)");
  expect(measuredNarrationTimeline("Hello world", [[0.1, 0.5]])).toBeNull();
  expect(measuredNarrationTimeline("Hello world", [[0.1, 0.5], [0.4, 1]])).toBeNull();
  expect(measuredNarrationTimeline("Hello world", [[0.1, 0.5], [0.6, null]])).toBeNull();
});
