export type TileProvider = "openai" | "recraft" | "ideogram";

/** Prefer the original OpenAI design path; choose alternatives only when it is not configured. */
export function chooseTileProvider(direction: string, available: TileProvider[]): { provider: TileProvider; style: string } {
  const text = direction.toLowerCase();
  const illustration = /\b(illustrat(?:ion|ed|ive)|vector|graphic|icon|geometric|abstract|artwork|artistic|watercolou?r|hand.drawn)\b/.test(text);
  const typography = /\b(typograph\w*|poster|headline|lettering|text.led|quote|infographic)\b/.test(text);
  const preferred: TileProvider[] = illustration ? ["openai", "recraft", "ideogram"] : typography ? ["openai", "ideogram", "recraft"] : ["openai", "recraft", "ideogram"];
  const provider = preferred.find(candidate => available.includes(candidate));
  if (!provider) throw new Error("No tile provider is configured.");
  return { provider, style: illustration ? "Illustration / brand references" : typography ? "Typography / brand references" : "Brand-guided editorial" };
}
