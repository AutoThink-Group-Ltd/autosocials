export type BrandPalette = {
  swatches: string[];
  primary: string | null;
  accent: string | null;
  background: string | null;
  text: string | null;
  source_url: string;
};

export function hexColour(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!match) return null;
  const digits = match[1]!.toUpperCase();
  return `#${digits.length === 3 ? [...digits].map((digit) => digit + digit).join("") : digits}`;
}

/** Firecrawl returns semantic website colours; don't infer a palette from page photography. */
export function paletteFromBranding(branding: unknown, sourceUrl: string): BrandPalette | null {
  if (!branding || typeof branding !== "object") return null;
  const root = branding as Record<string, unknown>;
  const raw = root["colors"] ?? root["colours"];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const colors = raw as Record<string, unknown>;
  const value = (key: string) => hexColour(colors[key]);
  const primary = value("primary");
  const accent = value("accent");
  const background = value("background");
  const text = value("textPrimary") ?? value("text");
  const secondary = value("secondary");
  const swatches = [...new Set([primary, accent, secondary, background, text].filter((v): v is string => !!v))];
  if (!swatches.length) return null;
  return { swatches, primary, accent, background, text, source_url: sourceUrl };
}

export function paletteFromWebsiteFile(content: string): BrandPalette | null {
  const source = content.match(/^Source: (https?:\/\/\S+)/m)?.[1];
  const branding = content.match(/## Branding detected\s*```json\s*([\s\S]*?)```/);
  if (!source || !branding) return null;
  try { return paletteFromBranding(JSON.parse(branding[1]!), source); } catch { return null; }
}

export function mergePalette(existing: BrandPalette | null | undefined, detected: BrandPalette | null): BrandPalette | null {
  if (!detected) return existing ?? null;
  if (!existing) return detected;
  if (existing.source_url && existing.source_url !== detected.source_url) return detected;
  return {
    ...detected,
    swatches: [...new Set([...detected.swatches, ...existing.swatches])].slice(0, 12),
    primary: existing.primary ?? detected.primary,
    accent: existing.accent ?? detected.accent,
    background: existing.background ?? detected.background,
    text: existing.text ?? detected.text,
  };
}

export function resolvedColourGaps(gaps: unknown): string[] {
  if (!Array.isArray(gaps)) return [];
  return gaps.filter((gap): gap is string => typeof gap === "string").flatMap((gap) => {
    if (/^no brand colou?r specifications or font names supplied\.?$/i.test(gap.trim())) return ["No font names supplied."];
    if (/^no (confirmed )?brand colou?rs( supplied)?\.?$/i.test(gap.trim())) return [];
    return [gap];
  });
}
