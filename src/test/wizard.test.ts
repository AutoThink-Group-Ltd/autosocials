import { describe, it, expect } from "vitest";
import { mergeNarratives, capAssets, suggestBreakdown, planAdvances, tileState, batchSummary, type Narrative } from "@/lib/wizard";
import { buildComposition } from "@/lib/render.server";

const n = (title: string, selected = false): Narrative => ({ id: title, title, message: "", why: "", selected });

describe("create wizard", () => {
  it("lets several narratives be selected at once", () => {
    const list = [n("A", true), n("B", true), n("C")];
    expect(list.filter((x) => x.selected)).toHaveLength(2);
  });
  it("never repeats a narrative already shown", () => {
    const out = mergeNarratives([n("Save hours weekly")], [{ id: "x", title: "save hours, weekly!", message: "", why: "" }, { id: "y", title: "New angle", message: "", why: "" }]);
    expect(out.map((x) => x.title)).toEqual(["Save hours weekly", "New angle"]);
  });
  it("never makes more than 4 assets in one go", () => {
    expect(capAssets(Array.from({ length: 6 }, (_, i) => i), 10)).toHaveLength(4);
    expect(capAssets([1, 2, 3], 2)).toEqual([1, 2]);
    expect(suggestBreakdown([n("A")], 9)).toHaveLength(4);
  });
  it("an empty plan does not move on to the briefs", () => {
    expect(planAdvances(0)).toBe(false);
    expect(planAdvances(1)).toBe(true);
  });
  it("the breakdown covers every picked narrative before repeating", () => {
    expect(suggestBreakdown([n("A"), n("B")], 3).map((b) => b.narrative)).toEqual(["A", "B", "A"]);
  });
  it("an edit request shows the asset as rebuilding, not approved", () => {
    expect(tileState("draft", "rendering", true)).toBe("rebuilding");
    expect(tileState("approved", "rendering", true)).toBe("rebuilding");
    expect(tileState("approved", "failed", true)).toBe("failed");
    expect(tileState("approved", "done", false)).toBe("approved");
    expect(batchSummary(["approved", "ready"]).allTriaged).toBe(false);
  });
});

import { keepLibraryFiles, reviewStateAfterEdit, APPROVED_POST_STATUS } from "@/lib/wizard";
describe("create wizard review", () => {
  it("Edit sends the asset back out of approved", () => {
    expect(reviewStateAfterEdit(true)).toBe("needs_revision");
    expect(reviewStateAfterEdit(false)).toBe("draft");
  });
  it("Approve puts the asset in Publish as a draft, not posted", () => {
    expect(APPROVED_POST_STATUS).toBe("draft");
  });
  it("briefs only use files from this workspace, max 6", () => {
    const own = new Set(["a", "b", "c", "d", "e", "f", "g"]);
    expect(keepLibraryFiles(["a", "x", "a", "b"], own)).toEqual(["a", "b"]);
    expect(keepLibraryFiles(["a", "b", "c", "d", "e", "f", "g"], own)).toHaveLength(6);
  });
});

describe("videos use the brand's files", () => {
  it("puts the logo and one brand file behind each scene", () => {
    const html = buildComposition({ size: "1080x1920", duration: 15, hook: "Hook", beats: ["One", "Two"], cta: "Start", brand: "B",
      palette: { bg: "#000000", fg: "#ffffff", accent: "#ff0000" }, logo: "assets/logo.png",
      media: [{ path: "assets/a.png", type: "image" }, { path: "assets/b.mp4", type: "video" }] });
    expect(html).toContain('src="assets/logo.png"');
    expect(html).toContain('id="m0" class="clip media"');
    expect(html).toContain('<video id="m1"');
    expect(html).toContain('id="m2" class="clip media" data-start');
  });
  it("falls back to text on brand colour with no files", () => {
    const html = buildComposition({ size: "1080x1080", duration: 15, hook: "H", beats: [], cta: "C", brand: "B", palette: { bg: "#000000", fg: "#ffffff", accent: "#ff0000" } });
    expect(html).not.toContain("class=\"clip media\"");
  });
});

import { renderProgress, estimateRenderSeconds } from "@/lib/wizard";
describe("render progress", () => {
  const t0 = Date.parse("2026-10-19T10:00:00Z");
  it("is 100% when done", () => expect(renderProgress("done", undefined, 15, t0).pct).toBe(100));
  it("never shows more than 95% before it's done", () => expect(renderProgress("rendering", "2026-10-19T09:00:00Z", 15, t0).pct).toBe(95));
  it("moves with elapsed time", () => {
    const half = new Date(t0 - (estimateRenderSeconds(15) / 2) * 1000).toISOString();
    expect(renderProgress("rendering", half, 15, t0).pct).toBe(50);
  });
  it("prefers a higher reported figure", () => expect(renderProgress("rendering", new Date(t0).toISOString(), 15, t0, 70).pct).toBe(70));
});

import { canMoveVariants } from "@/lib/wizard";
describe("canMoveVariants", () => {
  it("allows moving within the same workspace", () => { expect(canMoveVariants(["a", "a"], "a")).toBe(true); });
  it("refuses a folder in another workspace", () => { expect(canMoveVariants(["a", "b"], "a")).toBe(false); });
});
