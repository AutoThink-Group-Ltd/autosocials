/** Create Content wizard rules — pure, shared by UI and server. */
import { clampAssets, type VideoDuration } from "./content-rules";

export const WIZARD_STAGES = ["narratives", "briefs", "producing", "review"] as const;
export type WizardStage = (typeof WIZARD_STAGES)[number];
export const NARRATIVES_PER_REFRESH = 3;
export const MAX_NARRATIVES = 40;

export const NARRATIVE_TYPES = ["Promotional", "Educational", "Explainer", "Social proof", "Behind the scenes", "Problem/solution", "Data/Insight", "Offer"] as const;
export type NarrativeType = (typeof NARRATIVE_TYPES)[number];
export type Narrative = { id: string; title: string; message: string; why: string; selected: boolean; custom?: boolean; type?: string; treatment?: string; video_style?: import("./video-styles").VideoStyleSelection; production?: import("./production-plan").ProductionPlan & { video_style?: import("./video-styles").VideoStyleSelection }; createdAt?: string; libraryStatus?: "available" | "rejected" | "binned"; origin?: string; context_mode?: import("./creation-context-mode").CreationContextMode | undefined };
/** Unknown or missing types fall back to Explainer so every card shows a tag. */
export function narrativeType(t: string | undefined): NarrativeType {
  return (NARRATIVE_TYPES as readonly string[]).includes(t ?? "") ? (t as NarrativeType) : "Explainer";
}
/** Single-select by default: picking one clears the rest unless multi is on. */
export function toggleNarrative(list: Narrative[], id: string, multi: boolean): Narrative[] {
  return list.map((n) => (n.id === id ? { ...n, selected: !n.selected } : multi ? n : { ...n, selected: false }));
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Append fresh narratives, skipping any whose title repeats one already shown. */
export function mergeNarratives(existing: Narrative[], fresh: Omit<Narrative, "selected">[]): Narrative[] {
  const seen = new Set(existing.map((n) => norm(n.title)));
  const out = [...existing];
  for (const f of fresh) {
    const k = norm(f.title);
    if (!k || seen.has(k) || out.length >= MAX_NARRATIVES) continue;
    seen.add(k);
    out.push({ ...f, selected: false });
  }
  return out;
}

export const selectedNarratives = (list: Narrative[]) => list.filter((n) => n.selected && (n.libraryStatus ?? "available") === "available");

/** Keep at most the requested number of assets, never more than MAX_ASSETS_PER_BATCH. */
export function capAssets<T>(items: T[], count: number): T[] {
  return items.slice(0, clampAssets(count));
}

export type BreakdownItem = { n: number; duration: VideoDuration; narrative: string };

/** Start with 30-second films and use each picked narrative before repeating it. Users can choose 15s or 60s. */
export function suggestBreakdown(picked: Pick<Narrative, "title">[], count: number): BreakdownItem[] {
  if (!picked.length) return [];
  return Array.from({ length: clampAssets(count) }, (_, i) => ({ n: i + 1, duration: /\b15[ -]?(?:s|sec|second)/i.test(picked[i % picked.length]!.title) ? 15 : /\b60[ -]?(?:s|sec|second)/i.test(picked[i % picked.length]!.title) ? 60 : 30, narrative: picked[i % picked.length]!.title }));
}

/** A plan only counts if it produced at least one asset; otherwise the wizard stays on narratives. */
export const planAdvances = (assetCount: number) => assetCount > 0;

export type TileState = "brief" | "queued" | "building" | "failed" | "ready" | "approved" | "rebuilding";

/** One asset tile's state from its review state and latest render job. */
export function tileState(review: string, job: string | undefined, hasNote: boolean): TileState {
  if (job === "queued") return hasNote ? "rebuilding" : "queued";
  if (job === "preparing" || job === "rendering") return hasNote ? "rebuilding" : "building";
  if (job === "failed") return "failed";
  if (review === "approved") return "approved";
  if (job === "done") return "ready";
  return "brief";
}

export function batchSummary(states: TileState[]) {
  const approved = states.filter((s) => s === "approved").length;
  const rebuilding = states.filter((s) => s === "rebuilding").length;
  const building = states.filter((s) => s === "building" || s === "queued").length;
  const waiting = states.filter((s) => s === "ready").length;
  const failed = states.filter((s) => s === "failed").length;
  return { approved, rebuilding, building, waiting, failed, allTriaged: states.length > 0 && approved === states.length };
}

export const MAX_FILES_PER_ASSET = 6;

/** Keep only files from this workspace's library, de-duplicated and capped. */
export function keepLibraryFiles(ids: string[], own: Set<string>, max = MAX_FILES_PER_ASSET): string[] {
  return [...new Set(ids)].filter((id) => own.has(id)).slice(0, max);
}

/** After an Edit note the asset leaves review: rebuilds wait as needs_revision, brief-only reworks go back to draft. Never approved. */
export const reviewStateAfterEdit = (rebuild: boolean) => (rebuild ? "needs_revision" : "draft");

/** Approving sends the asset to Publish set up, not posted. */
export const APPROVED_POST_STATUS = "draft";

/** Typical seconds AutoToast needs to finish a render of this length (design + voice + encode). */
export const estimateRenderSeconds = (durationS: number) => 90 + durationS * 6;

/**
 * Progress for a render tile. Uses the server-reported % when present, otherwise
 * elapsed time against a typical render time — capped at 95% until it's really done.
 */
export function renderProgress(status: string | undefined, startedAt: string | undefined, durationS: number, now: number, reported?: number | null): { pct: number; etaS: number | null } {
  if (status === "done") return { pct: 100, etaS: 0 };
  if (!status || status === "failed") return { pct: 0, etaS: null };
  const total = estimateRenderSeconds(durationS);
  if (status === "queued") return { pct: 2, etaS: total };
  const elapsed = startedAt ? Math.max(0, (now - new Date(startedAt).getTime()) / 1000) : 0;
  const timePct = Math.round(5 + (elapsed / total) * 90);
  const pct = Math.min(95, Math.max(5, reported ?? 0, timePct));
  return { pct, etaS: Math.max(5, Math.round(total - elapsed)) };
}

/** Bulk batch delete: at most this many per request. */
export const MAX_BULK_BATCH_DELETE = 50;
/** True only when every requested batch was found and belongs to an accessible workspace. */
export function bulkDeleteAllowed(requested: string[], found: { id: string; workspace_id: string }[], canAccess: (ws: string) => boolean): boolean {
  if (!requested.length || requested.length > MAX_BULK_BATCH_DELETE) return false;
  const byId = new Map(found.map((f) => [f.id, f.workspace_id]));
  return requested.every((id) => { const ws = byId.get(id); return !!ws && canAccess(ws); });
}

export type AssetSpec = { narrative: string; duration: VideoDuration; size: string; style_id?: import("./video-styles").VideoStyleId | undefined; note?: string | undefined; captions?: "clean" | "off" | undefined };

/** Defaults from Sam's breakdown, keeping any choices the user already made for the same slot. */
export function seedSpecs(picked: Pick<Narrative, "title">[], count: number, prev: AssetSpec[] = []): AssetSpec[] {
  const titles = new Set(picked.map((p) => p.title));
  return suggestBreakdown(picked, count).map((b, i) => {
    const p = prev[i];
    return p ? { ...p, narrative: titles.has(p.narrative) ? p.narrative : b.narrative } : { narrative: b.narrative, duration: b.duration, size: "1080x1920" };
  });
}

/** User choices always win over what the AI returned. */
export function applySpec<T extends { duration_s?: number; size?: string; angle?: string }>(v: T, spec: AssetSpec | undefined): T & { captions?: "clean" | "off" } {
  return spec ? { ...v, duration_s: spec.duration, size: spec.size, angle: spec.narrative, captions: spec.captions ?? "clean" } : v;
}

/** Assets can only be moved into a folder from the same workspace. */
export const canMoveVariants = (variantWorkspaces: string[], targetWorkspace: string) =>
  variantWorkspaces.length > 0 && variantWorkspaces.every((w) => w === targetWorkspace);
