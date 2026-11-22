import { describe, it, expect } from "vitest";
import { alignmentToWords, captionPages, buildCaptionLayer, captionsMatchScript, injectCaptions, imageHeader, treatment, mediaTreatmentProblems, coverageGaps, durationProblem, diversityProblems } from "@/lib/film-qa";
import { validateComposition } from "@/lib/composition-rules";

const align = (text: string) => {
  const chars = [...text]; return { characters: chars, character_start_times_seconds: chars.map((_, i) => i * 0.05), character_end_times_seconds: chars.map((_, i) => i * 0.05 + 0.05) };
};

describe("captions", () => {
  const script = "Grow your list, without the busywork. Ask Leo!";
  it("keeps whole words and punctuation from real alignment", () => {
    const w = alignmentToWords(align(script));
    expect(w.map((x) => x.word)).toEqual(["Grow", "your", "list,", "without", "the", "busywork.", "Ask", "Leo!"]);
    expect(w[0]!.start).toBe(0);
  });
  it("on-screen captions equal the script exactly", () => {
    const l = buildCaptionLayer({ words: alignmentToWords(align(script)), width: 1080, height: 1920, synced: true, accent: "#000", font: "sans-serif" });
    expect(captionsMatchScript(l.text, script)).toBe(true);
    expect(l.html).not.toMatch(/<span[^>]*>.<\/span>/); // never single characters
  });
  it("captions are whole phrases, never word-by-word highlights", () => {
    const l = buildCaptionLayer({ words: alignmentToWords(align(script)), width: 1080, height: 1920, synced: true, accent: "#000", font: "x" });
    expect(l.js).not.toMatch(/className/);
    expect(l.html).not.toMatch(/<span/);
    expect(l.html).toContain("Grow your list, without the busywork.");
  });
  it("splits long phrases into readable pages without losing words or timing", () => {
    const words = alignmentToWords(align("Permissions require clear ownership and an audit trail before anything goes live."));
    const pages = captionPages(words);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.words.map((word) => word.word).join(" ").length <= 48)).toBe(true);
    expect(pages.flatMap((page) => page.words)).toEqual(words);
    expect(pages[0]!.end).toBe(pages[1]!.start);
  });
  it("injected captions keep the render contract valid", () => {
    const base = `<!doctype html><html><head><script src="gsap.min.js"></script><style>a{}</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="15" data-width="1080" data-height="1920"><div class="clip" data-start="0" data-duration="15" data-track-index="0"></div></div><script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});window.__timelines["main"]=tl;</script></body></html>`;
    const l = buildCaptionLayer({ words: alignmentToWords(align("Hi there")), width: 1080, height: 1920, synced: true, accent: "#000", font: "x" });
    const out = injectCaptions(base, l);
    expect(out).toMatch(/data-composition-id="main"[^>]*><div id="cap0"/);
    expect(validateComposition({ html: out, duration: 15, files: [] })).toEqual([]);
  });
});

describe("portrait and logo", () => {
  it("dark-tiled logo and contain portrait are flagged (the S1/S3 faults)", () => {
    const html = `<style>.brand-icon{width:92px;border:1px solid #D4DEDE;background:#102326}.portrait{object-fit:contain}</style>`;
    const p = mediaTreatmentProblems(html).join(" ");
    expect(p).toMatch(/Dark background behind \.brand-icon/);
    expect(p).toMatch(/Border around \.brand-icon/);
    expect(p).toMatch(/portrait uses object-fit:contain/);
  });
  it("opaque portraits are always circle-masked", () => {
    expect(treatment({ media_role: "portrait", has_alpha: false, bg_tone: "dark", width: 1, height: 1, subject: null })).toMatch(/as-portrait"/);
    expect(treatment({ media_role: "logo", has_alpha: true, bg_tone: "transparent", width: 1, height: 1, subject: null })).toMatch(/as-logo/);
  });
  it("model-built captions are rejected", () => expect(mediaTreatmentProblems(`<div class="caption-bar">`).join()).toMatch(/caption layer/));
  it("reads PNG size and alpha", () => {
    const b = new Uint8Array(40); b.set([0x89, 0x50, 0x4e, 0x47]); const v = new DataView(b.buffer); v.setUint32(16, 800); v.setUint32(20, 600); b[25] = 6;
    expect(imageHeader(b.buffer)).toEqual({ width: 800, height: 600, hasAlpha: true });
  });
});

describe("timing", () => {
  it("finds vacant stretches between scenes", () => {
    const html = `<div class="clip" data-start="0" data-duration="4"></div><div class="clip" data-start="5" data-duration="10"></div>`;
    expect(coverageGaps(html, 15)).toEqual([[4, 5]]);
  });
  it("voiceover must fit 15s / 30s", () => {
    expect(durationProblem(16.2, 15)).toMatch(/too long/);
    expect(durationProblem(14, 15)).toBeNull();
    expect(durationProblem(28.5, 30)).toBeNull();
  });
});

describe("batch diversity", () => {
  it("rejects three assets with the same hook", () => {
    const v = { hook: "Email marketing without the usual complexity", cta: "Try Leo", beats: ["a"] };
    expect(diversityProblems([v, { ...v, beats: ["b"] }, { ...v, hook: "Stop fighting your list", beats: ["c"] }])).toContain("Two assets share the same hook.");
  });
  it("accepts genuinely different angles", () => {
    expect(diversityProblems([{ hook: "Your list stopped growing", cta: "Start free", beats: ["x"] }, { hook: "Pricing that punishes growth", cta: "See pricing", beats: ["y"] }])).toEqual([]);
  });
});

describe("one asset at a time", () => {
  it("defaults to one asset, supports a five-video batch", async () => {
    const r = await import("@/lib/content-rules");
    expect(r.DEFAULT_ASSETS).toBe(1);
    expect(r.MAX_ASSETS_PER_BATCH).toBe(4);
  });
  it("picking a narrative clears others unless more than one asset", async () => {
    const { toggleNarrative } = await import("@/lib/wizard");
    const l = [{ id: "a", title: "A", message: "", why: "", selected: true }, { id: "b", title: "B", message: "", why: "", selected: false }];
    expect(toggleNarrative(l, "b", false).map((n) => n.selected)).toEqual([false, true]);
    expect(toggleNarrative(l, "b", true).map((n) => n.selected)).toEqual([true, true]);
  });
  it("missing narrative type falls back to Explainer", async () => {
    const { narrativeType } = await import("@/lib/wizard");
    expect(narrativeType(undefined)).toBe("Explainer");
    expect(narrativeType("Promotional")).toBe("Promotional");
  });
  it("house rules never ask for an 'Illustrative example' disclaimer", async () => {
    const fs = await import("node:fs");
    for (const f of ["prompts/playbook/house-rules.md", "prompts/playbook/build-prompt-template.md"])
      expect(fs.readFileSync(f, "utf8")).not.toMatch(/Footer disclaimer|Footnote: \*\*Illustrative|\*\*Illustrative example ·/);
  });
});
