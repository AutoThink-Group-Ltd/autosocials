import { describe, it, expect } from "vitest";
import { kindOf, isJunkPath, isReadableText } from "@/lib/brand-files";

describe("brand files", () => {
  it("recognises logos separately from other images", () => {
    expect(kindOf("01_brand/footfall_logo_wide.png")).toBe("logo");
    expect(kindOf("scene_01.png")).toBe("image");
  });
  it("skips zip junk", () => {
    expect(isJunkPath("__MACOSX/a.png")).toBe(true);
    expect(isJunkPath("brand/.DS_Store")).toBe(true);
    expect(isJunkPath("brand/logo.svg")).toBe(false);
  });
  it("reads markdown into Sam's context", () => {
    expect(isReadableText("guide.md")).toBe(true);
    expect(isReadableText("logo.png")).toBe(false);
  });
});

import { storesOnAutoToast } from "@/lib/brand-files";
describe("AutoToast storage routing", () => {
  it("sends video and audio to AutoToast", () => {
    for (const n of ["clip.mp4", "talk.MOV", "ep.mp3", "pod.m4a", "x.mkv", "a.flac"]) expect(storesOnAutoToast(n)).toBe(true);
  });
  it("keeps images, docs and markdown in Lovable Cloud", () => {
    for (const n of ["logo.png", "guide.md", "brief.pdf", "font.woff2"]) expect(storesOnAutoToast(n)).toBe(false);
  });
});
