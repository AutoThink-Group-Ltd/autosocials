// One safe-area spec for Sam's films, from Hamza's house rules (9:16 base 1080x1920),
// scaled for other sizes. Used by the designer prompt, the caption layer and the checker.

export type Zones = {
  width: number; height: number;
  safe: { left: number; right: number; top: number; bottom: number };
  headline: [number, number]; working: [number, number]; caption: [number, number]; footer: [number, number];
};

/** Zones in pixels for a W x H frame. Portrait follows the house rules; square/landscape use proportional bands. */
export function zonesFor(width: number, height: number): Zones {
  const portrait = height > width * 1.2;
  const sx = width / 1080;
  if (portrait) {
    const sy = height / 1920;
    const y = (n: number) => Math.round(n * sy);
    return {
      width, height,
      safe: { left: Math.round(96 * sx), right: Math.round(984 * sx), top: y(250), bottom: y(1520) },
      headline: [y(270), y(560)], working: [y(600), y(1330)], caption: [y(1350), y(1490)], footer: [y(1492), y(1520)],
    };
  }
  const y = (f: number) => Math.round(height * f);
  return {
    width, height,
    safe: { left: Math.round(width * 0.06), right: Math.round(width * 0.94), top: y(0.07), bottom: y(0.93) },
    headline: [y(0.08), y(0.28)], working: [y(0.3), y(0.72)], caption: [y(0.75), y(0.88)], footer: [y(0.89), y(0.93)],
  };
}

/** Plain-English zone brief for the designer prompt. */
export function zonesBrief(z: Zones): string {
  return `SAFE AREA (${z.width}x${z.height}, enforced): every essential element inside x ${z.safe.left} to ${z.safe.right}, y ${z.safe.top} to ${z.safe.bottom}.
Zones: headline y ${z.headline[0]} to ${z.headline[1]}; working area (product, UI, imagery) y ${z.working[0]} to ${z.working[1]}; CAPTION STRIP y ${z.caption[0]} to ${z.caption[1]} is reserved for the automatic captions, put NO text, UI or faces there; footer y ${z.footer[0]} to ${z.footer[1]}.
Position text blocks with explicit top/left in px (not bottom) so the zones can be checked.`;
}

/**
 * Static geometry check on the designer's CSS: any text-bearing rule positioned into the caption
 * strip or outside the safe area. It catches the common collision (scene copy pinned near the bottom)
 * before captions are laid over it.
 */
export function zoneProblems(html: string, z: Zones): string[] {
  const p: string[] = [];
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n").replace(/\.as-[\w-]+[^{]*\{[^}]*\}/g, "");
  const inline = [...html.matchAll(/<(h\d|p|span|div)[^>]*\bid="([^"]+)"[^>]*style="([^"]*)"/gi)].map((m) => [`#${m[2]}`, m[3]!] as const);
  const rules = [...[...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((r) => [r[1]!.trim(), r[2]!] as const), ...inline];
  const textish = /(head|title|copy|text|line|word|hook|cta|kicker|label|tag|quote|stat|h1|h2|h3|\bp\b)/i;
  for (const [sel, body] of rules) {
    if (!textish.test(sel) || /as-cap|#root|html|body|^\s*@/.test(sel)) continue;
    if (!/position\s*:\s*absolute/i.test(body) && !/\b(top|bottom)\s*:/i.test(body)) continue;
    const px = (k: string) => { const m = body.match(new RegExp(`(?:^|;|\\s)${k}\\s*:\\s*(-?[\\d.]+)px`, "i")); return m ? Number(m[1]) : null; };
    const top = px("top"); const bottom = px("bottom"); const height = px("height");
    if (bottom !== null) {
      const lowEdge = z.height - bottom;
      if (lowEdge > z.caption[0]) p.push(`${sel} sits in the caption strip (bottom:${bottom}px reaches y ${lowEdge}); keep text above y ${z.caption[0]}.`);
    }
    if (top !== null) {
      if (top < z.safe.top) p.push(`${sel} starts at y ${top}, above the safe area (y ${z.safe.top}).`);
      const end = top + (height ?? 0);
      if (top >= z.caption[0] || (height !== null && end > z.caption[0])) p.push(`${sel} runs into the caption strip (y ${top}${height !== null ? ` to ${end}` : ""}); keep text above y ${z.caption[0]}.`);
    }
    const left = px("left");
    if (left !== null && left < z.safe.left) p.push(`${sel} starts at x ${left}, outside the safe area (x ${z.safe.left}).`);
  }
  return [...new Set(p)].slice(0, 8);
}
