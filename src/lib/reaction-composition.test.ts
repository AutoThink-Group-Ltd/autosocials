import { describe, expect, it } from "vitest";
import { validateComposition } from "./composition-rules";
import { zonesFor } from "./safe-zones";
import { reactionComposition } from "./reaction-composition";

const input = { width: 1080, height: 1920, duration: 15, demoPath: "assets/demo.mp4", demoSeconds: 6, avatarPath: "generated/avatar.mp4", avatarSeconds: 12, narrationSeconds: 12 };
describe("reaction composition", () => {
  it("keeps the real demo visible and synchronises the muted avatar to narration at zero", () => {
    const html = reactionComposition(input);
    expect(validateComposition({ html, duration: 15, files: [input.demoPath, input.avatarPath] })).toEqual([]);
    expect(html).toMatch(/id="avatar"[^>]*data-start="0"[^>]*data-duration="12"[^>]*data-media-start="0"[^>]*muted/);
    expect(html.match(/class="clip demo"/g)).toHaveLength(3);
    expect(html).toMatch(/id="demo2"[^>]*data-start="12"[^>]*data-duration="3"/);
    const z = zonesFor(input.width, input.height);
    expect(html).toContain(`top:${z.working[0]}px`);
    expect(z.working[1]).toBeLessThan(z.caption[0]);
  });
  it("rejects remote, traversal, missing and insufficient media", () => {
    expect(() => reactionComposition({ ...input, demoPath: "https://example.com/demo.mp4" })).toThrow();
    expect(() => reactionComposition({ ...input, demoPath: "assets/../secret.mp4" })).toThrow();
    expect(() => reactionComposition({ ...input, avatarSeconds: 9 })).toThrow();
    expect(() => reactionComposition({ ...input, demoSeconds: 0 })).toThrow();
  });
  it("uses the safe working area in landscape too", () => {
    const size = { width: 1920, height: 1080 };
    const html = reactionComposition({ ...input, ...size });
    expect(validateComposition({ html, duration: 15, files: [input.demoPath, input.avatarPath] })).toEqual([]);
    expect(html).toContain(`top:${zonesFor(size.width, size.height).working[0]}px`);
  });
});
