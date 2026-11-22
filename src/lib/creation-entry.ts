import { MAX_ASSETS_PER_BATCH, MAX_SOCIAL_TILES_PER_PLAN } from "./content-rules";
import type { Narrative } from "./wizard";
import type { CreationContextMode } from "./creation-context-mode";
export type CreationEntry = "ideas" | "brief" | "media" | "style";
export function creationEntry(value: string | null): CreationEntry {
  return value === "brief" || value === "media" || value === "style" ? value : "ideas";
}
export function creationQuantity(value: unknown, format: "video" | "tiles"): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(format === "video" ? MAX_ASSETS_PER_BATCH : MAX_SOCIAL_TILES_PER_PLAN, Math.max(1, Math.round(n))) : 1;
}
export function narrativesFromBrief(existing: Narrative[], brief: string, count: number, id: () => string, mode?: CreationContextMode): Narrative[] {
  const text = brief.trim();
  if (text.length < 3) return existing;
  const quantity = creationQuantity(count, "video");
  return [...existing.map((idea) => ({ ...idea, selected: false })), ...Array.from({ length: quantity }, (_, index) => ({
    id: id(), title: quantity > 1 ? `${text.slice(0, 145)} · Video ${index + 1}` : text.slice(0, 160),
    message: text.slice(0, 600), why: "Your own brief", selected: true, custom: true, type: "Promotional", ...(mode ? { context_mode: mode } : {}),
  }))];
}
