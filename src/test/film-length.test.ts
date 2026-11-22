import { describe, it, expect } from "vitest";
import { wordBudget, narrationFit, exactFrames, lengthMismatch, pcmToWav, parseWav, wavSeconds } from "@/lib/film-length";
import { zonesFor, zoneProblems } from "@/lib/safe-zones";
import { validateComposition } from "@/lib/composition-rules";
import { buildCaptionLayer } from "@/lib/film-qa";

describe("film length", () => {
  it("30s film needs about 62 words, 15s about 28", () => {
    expect(wordBudget(30).target).toBe(62);
    expect(wordBudget(15).target).toBe(28);
  });
  it("10s of narration is too short for a 30s film", () => expect(narrationFit(10, 30)).toBe("short"));
  it("24s of narration fits a 30s film", () => expect(narrationFit(24, 30)).toBe("ok"));
  it("21.1s of a 30s film renders with a warning", () => expect(narrationFit(21.1, 30)).toBe("warn"));
  it("15s of a 30s film is too short", () => expect(narrationFit(15, 30)).toBe("short"));
  it("30.2s of a 30s film is too long", () => expect(narrationFit(30.2, 30)).toBe("long"));
  it("narration longer than the film is too long", () => expect(narrationFit(31, 30)).toBe("long"));
  it("30s is exactly 900 frames, 15s is 450", () => { expect(exactFrames(30)).toBe(900); expect(exactFrames(15)).toBe(450); });
  it("a 10s render of a 30s order is flagged", () => expect(lengthMismatch(10, 30)).toMatch(/10.0s/));
  it("a 30.2s render of a 30s order passes", () => expect(lengthMismatch(30.2, 30)).toBeNull());
  it("root duration must match to the frame", () => {
    const html = `<!doctype html><div data-composition-id="main" data-duration="29.5" class="clip" data-track-index="0"></div><script>const tl=gsap.timeline({paused:true});window.__timelines["main"]=tl;</script>`;
    expect(validateComposition({ html, duration: 30, files: [] }).join()).toMatch(/must be 30/);
  });
});

describe("safe zones and captions", () => {
  const z = zonesFor(1080, 1920);
  it("portrait caption strip is y 1350 to 1490", () => expect(z.caption).toEqual([1350, 1490]));
  it("flags a headline pinned into the caption strip", () =>
    expect(zoneProblems(`<style>.headline{position:absolute;bottom:420px;left:120px}</style>`, z).join()).toMatch(/caption strip/));
  it("accepts a headline in the headline zone", () =>
    expect(zoneProblems(`<style>.headline{position:absolute;top:300px;left:120px;height:200px}</style>`, z)).toEqual([]));
  it("captions sit inside the caption strip, on top via z-index", () => {
    const l = buildCaptionLayer({ words: [{ word: "Hi", start: 0, end: 1 }], width: 1080, height: 1920, synced: false, accent: "#000", font: "Arial", zone: z.caption });
    expect(l.css).toMatch(/top:1350px;height:140px/);
    expect(l.css).toMatch(/z-index:100/);
  });
});
