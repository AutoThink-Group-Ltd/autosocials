import {
  usesAutoTillShowcase,
  type BrandDna,
} from "./brand-dna";
import type { SocialDesign } from "./social-design";

export function dnaDirection(dna: BrandDna) {
  const surfaceRank = (surface: string) =>
    /marketing|published|external|export/i.test(surface)
      ? 0
      : /homepage|light|public/i.test(surface)
        ? 1
        : /website|root/i.test(surface)
          ? 2
          : /merchant|embed|dark|status|admin/i.test(surface)
            ? 3
            : 2;
  const colours = [...dna.colours].sort(
    (a, b) => surfaceRank(a.surface) - surfaceRank(b.surface),
  );
  const find = (role: RegExp) =>
    colours.find(
      (c) =>
        role.test(c.role.replace(/^--/, "")) && /^#[a-f\d]{6}$/i.test(c.hex),
    )?.hex;
  const faces = [...dna.fonts].sort(
    (a, b) => surfaceRank(a.surface) - surfaceRank(b.surface),
  );
  const heading =
    faces.find((f) => /display|head|title/i.test(f.role)) ?? faces[0];
  const body = faces.find((f) => /body|paragraph|ui/i.test(f.role)) ?? heading;
  return {
    ink: find(/^(ink|text(?:primary)?|foreground|text.primary)$/i),
    paper: find(/^(paper|background|canvas|ivory)$/i),
    accent:
      find(/^(accent|terracotta|coral|brand.accent)$/i) ??
      find(/^primary$/i) ??
      colours.find(
        (c) =>
          /rendered/i.test(c.surface) &&
          /background/.test(c.role) &&
          c.hex !== find(/^(paper|background|canvas|ivory)$/i) &&
          !/^#([0-9a-f])\1{5}$/i.test(c.hex),
      )?.hex,
    heading,
    body,
  };
}
export function directSocialDesign(
  design: SocialDesign,
  dna: BrandDna,
  format: "tile" | "carousel" = "tile",
): SocialDesign {
  const { ink, paper, accent } =
    format === "tile" ? socialTileDirection(dna) : dnaDirection(dna);
  return {
    ...design,
    ...(ink ? { ink } : {}),
    ...(paper ? { paper } : {}),
    ...(accent ? { accent } : {}),
  };
}

export const autoTillPaper = "#0D0D0D";
export const autoTillInk = "#F5F5F5";

export function socialTileDirection(dna: BrandDna) {
  const direction = dnaDirection(dna);
  const corrected = (role: RegExp) =>
    dna.colours.find(
      (c) =>
        c.evidence.status === "corrected" &&
        role.test(c.role) &&
        /^#[a-f\d]{6}$/i.test(c.hex),
    )?.hex;
  if (usesAutoTillShowcase(dna)) {
    return {
      ...direction,
      paper: corrected(/^(paper|background|canvas)$/i) ?? autoTillPaper,
      ink: corrected(/^(ink|text(?:primary)?|foreground)$/i) ?? autoTillInk,
      accent: corrected(/^(accent|primary)$/i) ?? autoTillInk,
    };
  }
  return direction;
}
