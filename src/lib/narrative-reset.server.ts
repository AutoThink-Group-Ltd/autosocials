import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import { stopWorkspaceIdeation } from "./ideation-control.server";

type Batch = { id: string; narratives: Json; updated_at: string };
type Idea = Record<string, Json | undefined> & { id: string };
const PAGE_SIZE = 500;

const isIdea = (value: Json): value is Idea => !!value && typeof value === "object" && !Array.isArray(value) && typeof value["id"] === "string";
const ideas = (value: Json) => (Array.isArray(value) ? value.filter(isIdea) : []);
const originalKey = (batchId: string, idea: Idea) => typeof idea["origin"] === "string" && idea["origin"] ? idea["origin"] : `${batchId}:${idea.id}`;

async function readBatches(sb: SupabaseClient<Database>, workspaceId: string): Promise<Batch[]> {
  const batches: Batch[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const result = await sb.from("creative_batches").select("id,narratives,updated_at")
      .eq("workspace_id", workspaceId).order("id").range(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw new Error("Could not read the narrative library.");
    batches.push(...result.data);
    if (result.data.length < PAGE_SIZE) return batches;
  }
}

/** Counts come from stored ideas, never model-supplied claims. Caller must verify workspace access. */
export async function previewNarrativeReset(sb: SupabaseClient<Database>, workspaceId: string): Promise<{ count: number; active_count: number }> {
  const batches = await readBatches(sb, workspaceId);
  const all = new Set<string>();
  const active = new Set<string>();
  for (const batch of batches) for (const idea of ideas(batch.narratives)) {
    if (idea["libraryStatus"] === "binned") continue;
    const key = originalKey(batch.id, idea);
    all.add(key);
    if (idea["libraryStatus"] !== "rejected") active.add(key);
  }
  return { count: all.size, active_count: active.size };
}

/**
 * Reversible reset of the existing workspace library. Caller must verify access and explicit approval.
 * Every write uses workspace and version predicates. Concurrent edits are reread before retrying;
 * failures are reported instead of claiming a complete reset after partial progress.
 */
export async function resetNarrativeLibrary(sb: SupabaseClient<Database>, workspaceId: string, userId?: string): Promise<{ cleared: number; failed: boolean; remaining_batches: string[] }> {
  await stopWorkspaceIdeation(sb, workspaceId, userId);
  const batches = await readBatches(sb, workspaceId);
  const cleared = new Set<string>();
  const remaining: string[] = [];
  for (const initial of batches) {
    let batch: Batch | null = initial;
    let complete = false;
    for (let attempt = 0; attempt < 3 && batch; attempt++) {
      const current: Batch = batch;
      const pending = ideas(current.narratives).filter((idea) => idea["libraryStatus"] !== "binned" || idea["selected"] === true);
      if (!pending.length) { complete = true; break; }
      const updated = (current.narratives as Json[]).map((value) => isIdea(value) ? { ...value, selected: false, libraryStatus: "binned" } : value);
      const result = await sb.from("creative_batches").update({ narratives: updated, updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId).eq("id", current.id).eq("updated_at", current.updated_at).select("id");
      if (result.error) break;
      if (result.data?.length) {
        pending.filter((idea) => idea["libraryStatus"] !== "binned").forEach((idea) => cleared.add(originalKey(current.id, idea)));
        complete = true;
        break;
      }
      const reread: { data: Batch | null; error: { message: string } | null } = await sb.from("creative_batches").select("id,narratives,updated_at")
        .eq("workspace_id", workspaceId).eq("id", current.id).maybeSingle();
      if (reread.error) break;
      batch = reread.data;
      if (!batch) complete = true; // A concurrently removed batch has no remaining library ideas.
    }
    if (!complete) remaining.push(initial.id);
  }
  return { cleared: cleared.size, failed: remaining.length > 0, remaining_batches: remaining };
}
