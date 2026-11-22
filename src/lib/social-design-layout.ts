import type { SocialDesign } from "./social-design";
/** Shared accessible palette selection for browser and server output. */
export function socialDesignPalette(design: SocialDesign) {
  const valid = (value: string | undefined): value is string =>
    !!value && /^#[0-9a-f]{6}$/i.test(value);
  const luminance = (hex: string) => {
    const v = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0]! + 0.7152 * v[1]! + 0.0722 * v[2]!;
  };
  const paper = valid(design.paper) ? design.paper : "#171717";
  let ink = valid(design.ink) ? design.ink : "#ffffff";
  const p = luminance(paper),
    i = luminance(ink);
  if ((Math.max(p, i) + 0.05) / (Math.min(p, i) + 0.05) < 4.5)
    ink = p > 0.179 ? "#000000" : "#ffffff";
  return { paper, ink };
}
/** Wrap at word boundaries using the active font. The caller can resize text to fit an oversized word. */
export function socialDesignLines(
  text: string,
  width: number,
  measure: (value: string) => number,
): string[] {
  return text.split("\n").flatMap((part) => {
    if (!part.trim()) return [""];
    const lines: string[] = [];
    let line = "";
    for (const word of part.trim().split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > width) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  });
}
/** Locate the approved phrase once, then intersect that range with each rendered line. */
export function socialDesignEmphasis(lines: string[], phrase: string) {
  const needle = phrase.trim().replace(/\s+/g, " ").toLowerCase();
  const start = needle ? lines.join(" ").toLowerCase().indexOf(needle) : -1;
  let offset = 0;
  return lines.map((line) => {
    const from = Math.max(offset, start);
    const to = Math.min(offset + line.length, start + needle.length);
    const match =
      start >= 0 && to > from
        ? { start: from - offset, length: to - from }
        : null;
    offset += line.length + 1;
    return match;
  });
}
