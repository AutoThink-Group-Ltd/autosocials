/** Colour helpers for the Brand Identity page. Pure functions — testable without a DOM. */

export interface Rgba { r: number; g: number; b: number; a: number }

/** True when a custom property holds bare HSL channels like `43 26% 95%` or `43 26% 95% / 0.5`. */
export function isHslChannels(raw: string): boolean {
  return /^-?\d+(\.\d+)?(deg)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%(\s*\/\s*[\d.]+%?)?$/.test(raw.trim());
}

/** Turn a raw custom-property value into a valid CSS colour expression. */
export function toColorExpression(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (isHslChannels(v)) return `hsl(${v})`;
  return v;
}

export function parseHex(hex: string): Rgba | null {
  const m = hex.trim().replace("#", "");
  if (![3, 4, 6, 8].includes(m.length) || /[^0-9a-f]/i.test(m)) return null;
  const full = m.length <= 4 ? m.split("").map((c) => c + c).join("") : m;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
}

export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  s /= 100; l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/** Parse hex, rgb(a) and hsl(a) / bare HSL channels. Returns null for formats needing a browser (e.g. oklch). */
export function parseColor(input: string): Rgba | null {
  const v = input.trim();
  if (v.startsWith("#")) return parseHex(v);
  const expr = isHslChannels(v) ? `hsl(${v})` : v;
  const rgb = expr.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (rgb) {
    return { r: Math.round(+rgb[1]!), g: Math.round(+rgb[2]!), b: Math.round(+rgb[3]!), a: alpha(rgb[4]) };
  }
  const hsl = expr.match(/^hsla?\(\s*(-?[\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (hsl) {
    const [r, g, b] = hslToRgb(+hsl[1]!, +hsl[2]!, +hsl[3]!);
    return { r, g, b, a: alpha(hsl[4]) };
  }
  return null;
}

function alpha(s?: string): number {
  if (!s) return 1;
  return s.endsWith("%") ? parseFloat(s) / 100 : parseFloat(s);
}

export function toHex({ r, g, b, a }: Rgba): string {
  const h = (n: number) => n.toString(16).padStart(2, "0").toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}${a < 1 ? h(Math.round(a * 255)) : ""}`;
}

export function toHslString({ r, g, b, a }: Rgba): string {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === rn ? (gn - bn) / d + (gn < bn ? 6 : 0) : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    h *= 60;
  }
  const base = `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  return a < 1 ? `hsla(${base} / ${+a.toFixed(2)})` : `hsl(${base})`;
}

/** Equal within rounding (HSL triplets in CSS are rounded to whole percents). Alpha must match closely. */
export function colorsMatch(a: Rgba, b: Rgba, tolerance = 3): boolean {
  return Math.abs(a.r - b.r) <= tolerance && Math.abs(a.g - b.g) <= tolerance && Math.abs(a.b - b.b) <= tolerance && Math.abs(a.a - b.a) <= 0.02;
}

function lum({ r, g, b }: Rgba): number {
  const c = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const [hi, lo] = [lum(fg), lum(bg)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}
