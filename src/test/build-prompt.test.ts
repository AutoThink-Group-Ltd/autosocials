import { describe, it, expect } from "vitest";
import { checkBuildPrompt, batchOpeningProblems, buildPromptMarkdown, type BuildPrompt } from "@/lib/build-prompt";

const base = (): BuildPrompt => ({
  different: "Opens on the audience card.", opening_visual: "Audience card with six rows", dont_open_on: ["price tiers"], story: "s", feel: "calm",
  sample_data: ["Sarah M."], trust_beat: "source line", sfx: [], music: "soft", guardrails: [], checklist: ["Frame 1 shows the idea"], review_times: [2, 14],
  scenes: [
    { name: "A", start: 0, end: 5, on_screen: ["They unsubscribed."], action: "", files: ["assets/leo.png"], sound: "" },
    { name: "B", start: 5, end: 10, on_screen: ["Still counted."], action: "", files: [], sound: "" },
    { name: "C", start: 10, end: 15, on_screen: ["examplemailer.com"], action: "", files: [], sound: "" },
  ],
  vo: [{ in: 0.3, out: 4.3, line: "They left your list months ago." }],
});

describe("build prompt house rules", () => {
  it("passes a clean 15s prompt", () => {
    expect(checkBuildPrompt(base(), { duration: 15, files: ["assets/leo.png"] })).toEqual([]);
  });
  it("scenes must cover exactly 0 to the duration", () => {
    const p = base(); p.scenes[2]!.end = 14;
    expect(checkBuildPrompt(p, { duration: 15 }).join()).toMatch(/end at exactly 15/);
    const q = base(); q.scenes[1]!.start = 6;
    expect(checkBuildPrompt(q, { duration: 15 }).join()).toMatch(/Gap or overlap/);
  });
  it("voiceover over 2.1 words a second fails", () => {
    const p = base(); p.vo = [{ in: 0, out: 2, line: "one two three four five six" }];
    expect(checkBuildPrompt(p, { duration: 15 }).join()).toMatch(/3.0 words a second/);
  });
  it("rejects em dashes and dollars", () => {
    const p = base(); p.scenes[0]!.on_screen = ["Save $20 — today"];
    const r = checkBuildPrompt(p, { duration: 15 }).join();
    expect(r).toMatch(/Em dash/); expect(r).toMatch(/Dollars/);
  });
  it("rejects banned claims from the facts sheet", () => {
    const p = base(); p.vo = [{ in: 0, out: 5, line: "Leo books meetings for you" }];
    expect(checkBuildPrompt(p, { duration: 15, facts: { does: [], does_not: [], banned_claims: ["books meetings"], banned_colours: [] } }).join()).toMatch(/Banned claim/);
  });
  it("rejects another brand's files", () => {
    expect(checkBuildPrompt(base(), { duration: 15, files: [] }).join()).toMatch(/isn't this brand's/);
  });
  it("each video in a set opens differently", () => {
    expect(batchOpeningProblems([{ hook: "Stop paying for ghosts", opening_visual: "audience card rows" }, { hook: "Stop paying for ghosts", opening_visual: "plan card" }])).toEqual(["Two videos open on the same hook."]);
  });
  it("renders the 13 sections with the exact frame count", () => {
    const md = buildPromptMarkdown(base(), { brand: "ExampleMailer", duration: 15, size: "1080x1920", hook: "They left" });
    expect(md).toContain("450 frames");
    expect(md).toContain("## Acceptance checklist");
  });
});
