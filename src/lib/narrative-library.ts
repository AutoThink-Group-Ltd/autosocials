import type { Narrative } from "./wizard";
import { videoStyleForNarrative } from "./video-styles";

export type LibraryBatch = { id: string; goal: string; created_at: string; narratives: unknown };
export type LibraryAsset = { id: string; batch_id: string; angle: string; production_plan: unknown; render_jobs?: { id: string; status: string; created_at: string }[] };
export type LibraryIdea = {
  id: string; batch_id: string; narrative_id: string; title: string; message: string; why: string;
  type: string; treatment: string | null; created_at: string; source: string;
  status: "never_used" | "planned" | "in_production" | "failed" | "built" | "rejected" | "binned";
  asset_count: number; latest_variant_id: string | null; latest_render_id: string | null;
  video_style?: import("./video-styles").VideoStyleSelection | null;
};

export const narrativeKey = (batchId: string, narrative: Pick<Narrative, "id" | "origin">) => narrative.origin || `${batchId}:${narrative.id}`;

/** The original idea remains one library entry when it is reused in another asset batch. */
export function buildNarrativeLibrary(batches: LibraryBatch[], assets: LibraryAsset[]): LibraryIdea[] {
  const originals = new Map<string, { batch: LibraryBatch; narrative: Narrative }>();
  const byBatch = new Map<string, Narrative[]>();
  for (const batch of batches) {
    // Models prompts are saved production requests, not unused narrative ideas.
    // Their progress and recovery belong on Home and Models.
    const narratives = ((Array.isArray(batch.narratives) ? batch.narratives : []) as Narrative[])
      .filter((narrative) => !narrative?.why?.startsWith("Manual Models request."));
    byBatch.set(batch.id, narratives);
    for (const narrative of narratives) {
      if (!narrative?.id || !narrative.title) continue;
      const key = narrativeKey(batch.id, narrative);
      if (narrative.origin && narrative.origin !== `${batch.id}:${narrative.id}`) continue;
      originals.set(key, { batch, narrative });
    }
  }
  const related = new Map<string, LibraryAsset[]>();
  for (const asset of assets) {
    const plan = asset.production_plan && typeof asset.production_plan === "object" && !Array.isArray(asset.production_plan)
      ? asset.production_plan as Record<string, unknown> : {};
    let key = typeof plan["source_narrative_key"] === "string" ? plan["source_narrative_key"] : "";
    if (!key) {
      const match = (byBatch.get(asset.batch_id) ?? []).find((n) => n.title === asset.angle);
      if (match) key = narrativeKey(asset.batch_id, match);
    }
    if (key && originals.has(key)) related.set(key, [...(related.get(key) ?? []), asset]);
  }
  return [...originals].map(([id, { batch, narrative }]) => {
    const variants = related.get(id) ?? [];
    const latest = variants.flatMap((v) => (v.render_jobs ?? []).map((r) => ({ ...r, variant_id: v.id })))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    const built = variants.some((v) => (v.render_jobs ?? []).some((r) => r.status === "done"));
    const inProduction = variants.some((v) => (v.render_jobs ?? []).some((r) => ["queued", "preparing", "rendering"].includes(r.status)));
    const failed = !built && variants.some((v) => (v.render_jobs ?? []).some((r) => r.status === "failed"));
    const status: LibraryIdea["status"] = narrative.libraryStatus === "binned" ? "binned" : narrative.libraryStatus === "rejected" ? "rejected"
      : built ? "built" : inProduction ? "in_production" : failed ? "failed" : variants.length ? "planned" : "never_used";
    return { id, batch_id: batch.id, narrative_id: narrative.id, title: narrative.title, message: narrative.message ?? "", why: narrative.why ?? "",
      type: narrative.type ?? "Explainer", treatment: narrative.treatment ?? null, created_at: narrative.createdAt ?? batch.created_at,
      source: narrative.custom ? "user" : batch.goal?.startsWith("sam-thread:") ? "sam_chat" : "sam", status, asset_count: variants.length,
      latest_variant_id: latest?.variant_id ?? variants.at(-1)?.id ?? null, latest_render_id: latest?.id ?? null,
      video_style: videoStyleForNarrative(narrative) };
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));
}
