import { describe, expect, it } from "vitest";
import { colorsMatch, contrastRatio, parseColor, toHex } from "@/brand/color";
import { TOKEN_REGISTRY } from "@/brand/baseline";

describe("brand colour comparison", () => {
  it("treats HEX, rgb and HSL-channel forms of ivory as the same colour", () => {
    const hex = parseColor("#F5F3EE")!;
    const rgb = parseColor("rgb(245, 243, 238)")!;
    const hsl = parseColor("43 26% 95%")!;
    expect(colorsMatch(hex, rgb)).toBe(true);
    expect(colorsMatch(hex, hsl)).toBe(true);
  });

  it("flags a genuinely different colour as a mismatch", () => {
    expect(colorsMatch(parseColor("#F5F3EE")!, parseColor("#3B82F6")!)).toBe(false);
  });

  it("keeps alpha differences meaningful", () => {
    expect(colorsMatch(parseColor("rgba(23, 23, 21, 1)")!, parseColor("rgba(23, 23, 21, 0.5)")!)).toBe(false);
  });

  it("returns null rather than inventing a value for an unparseable token", () => {
    expect(parseColor("not-a-colour")).toBeNull();
  });

  it("the rounded carbon HSL in CSS still matches approved #171715", () => {
    expect(toHex(parseColor("60 3% 9%")!)).toBe("#181816");
    expect(colorsMatch(parseColor("60 3% 9%")!, parseColor("#171715")!)).toBe(true);
  });

  it("white on carbon passes AA", () => {
    expect(contrastRatio(parseColor("#FFFFFF")!, parseColor("#171715")!)).toBeGreaterThan(4.5);
  });

  it("every approved baseline value is valid hex", () => {
    for (const t of TOKEN_REGISTRY) if (t.approved) expect(parseColor(t.approved), t.cssVar).not.toBeNull();
  });
});
