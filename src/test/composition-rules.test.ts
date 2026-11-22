import { describe, it, expect } from "vitest";
import { validateComposition, packKit, captionTimings } from "@/lib/composition-rules";

const good = `<!doctype html><html><head><script src="gsap.min.js"></script><style>@font-face{font-family:B;src:url("fonts/brand-700.woff2")}</style></head><body>
<div id="root" data-composition-id="main" data-start="0" data-duration="15" data-width="1080" data-height="1920">
<img class="clip" src="assets/leo.png" data-start="0" data-duration="15" data-track-index="0"></div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});window.__timelines["main"]=tl;</script></body></html>`;
const files = ["assets/leo.png", "fonts/brand-700.woff2"];

describe("validateComposition", () => {
  it("accepts a well-formed design", () => expect(validateComposition({ html: good, duration: 15, files })).toEqual([]));
  it("rejects files that are not the brand's", () =>
    expect(validateComposition({ html: good.replace("assets/leo.png", "assets/stranger.png"), duration: 15, files }).join()).toMatch(/Unknown files/));
  it("rejects external URLs", () =>
    expect(validateComposition({ html: good.replace("assets/leo.png", "https://x.com/a.png"), duration: 15, files }).join()).toMatch(/external/));
  it("rejects randomness and wrong length", () => {
    const p = validateComposition({ html: good.replace("const tl", "Math.random();const tl"), duration: 30, files }).join();
    expect(p).toMatch(/randomness/); expect(p).toMatch(/data-duration must be 30/);
  });
  it("rejects em dashes on screen", () =>
    expect(validateComposition({ html: good.replace("</div>", "<p>Hi — there</p></div>"), duration: 15, files }).join()).toMatch(/em dash/));
});

describe("packKit", () => {
  it("keeps only kit docs, approved copy before storyboard", () => {
    const r = packKit([{ name: "08-storyboard.md", text: "s" }, { name: "notes.md", text: "n" }, { name: "06-approved-on-screen-copy.md", text: "c" }]);
    expect(r.used).toEqual(["06-approved-on-screen-copy.md", "08-storyboard.md"]);
  });
});

it("caption timings span the voice length", () => {
  const t = captionTimings("Grow your list not your bill", 3);
  expect(t).toHaveLength(6); expect(t.at(-1)!.end).toBeCloseTo(2.9, 1);
});

describe("composition text and logo checks", () => {
  const base = (body: string) => `<!doctype html><html><head><script src="gsap.min.js"></script></head><body><div id="root" class="clip" data-composition-id="main" data-start="0" data-duration="15" data-track-index="0">${body}</div><script>const tl = gsap.timeline({paused:true}); window.__timelines=window.__timelines||{}; window.__timelines["main"]=tl;</script></body></html>`;
  it("rejects splitting text into characters", () => {
    expect(validateComposition({ html: base(`<script>"abc".split("")</script>`), duration: 15, files: [] })).toContain("Animate whole words; never split text into characters.");
  });
  it("rejects a border around the logo", () => {
    expect(validateComposition({ html: base(`<img class="logo" src="assets/logo.png" style="border:4px solid #000">`), duration: 15, files: ["assets/logo.png"] })).toContain("No borders or outlines around logo images.");
  });
});
