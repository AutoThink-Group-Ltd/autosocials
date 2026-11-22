import { describe, expect, it } from "vitest";
import { mergePalette, paletteFromBranding, paletteFromWebsiteFile, resolvedColourGaps } from "./brand-palette";

const branding = { colors: { primary: "#e2058b", accent: "#be0475", secondary: "#337ab7", background: "#fff", text: "#333" } };
const source = "https://www.living-london.net/";

describe("website brand palette", () => {
  it("extracts semantic colours from the scanner response and saved website file", () => {
    const palette = paletteFromBranding(branding, source);
    expect(palette).toMatchObject({ primary: "#E2058B", accent: "#BE0475", background: "#FFFFFF", text: "#333333", source_url: source });
    const saved = `Source: ${source}\n\n## Branding detected\n\`\`\`json\n${JSON.stringify(branding)}\n\`\`\``;
    expect(paletteFromWebsiteFile(saved)).toEqual(palette);
  });

  it("preserves a user's primary and accent choices when the profile is rebuilt", () => {
    const detected = paletteFromBranding(branding, source)!;
    expect(mergePalette({ ...detected, primary: "#EB0791", accent: "#353436" }, detected)).toMatchObject({ primary: "#EB0791", accent: "#353436" });
  });

  it("clears a resolved colour gap without hiding the missing font", () => {
    expect(resolvedColourGaps(["No brand colour specifications or font names supplied.", "No logo supplied."])).toEqual(["No font names supplied.", "No logo supplied."]);
  });
});
