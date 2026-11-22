import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Block } from "./sam.blocks";
import { MAX_NARRATIVES, narrativeType, type Narrative } from "./wizard";

const clean = (value: string | undefined, max: number) => (value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const keyOf = (value: Pick<Narrative, "title" | "message">) => `${value.title}|${value.message}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const storedNarratives = (value: unknown): Narrative[] => Array.isArray(value)
  ? value.filter((item): item is Narrative => !!item && typeof item === "object" && typeof item.id === "string" && typeof item.title === "string" && typeof item.message === "string")
  : [];

/** Save only validated Live View ideas, using the caller's workspace-scoped client. */
export async function persistChatNarratives(sb: SupabaseClient<Database>, options: {
  workspaceId: string; threadId: string; userId: string; canvasId: string; blocks: Block[];
}): Promise<{ saved: number }> {
  const now = new Date().toISOString();
  const candidates: Narrative[] = [];
  for (const block of options.blocks) {
    if (block.type !== "variants") continue;
    for (const item of block.items) {
      const title = clean(item.hook || item.angle, 160);
      if (!title) continue;
      candidates.push({
        id: crypto.randomUUID().slice(0, 8),
        title, message: clean(item.angle, 600), why: clean(item.notes, 600), selected: false,
        type: narrativeType(item.format), createdAt: now, libraryStatus: "available",
      });
    }
  }
  if (!candidates.length) return { saved: 0 };

  const goal = `sam-thread:${options.threadId}`;
  let pending = candidates;
  let saved = 0;
  let conflicts = 0;
  while (pending.length && conflicts < 3) {
    const result = await sb.from("creative_batches").select("id,narratives,updated_at")
      .eq("workspace_id", options.workspaceId).eq("goal", goal).eq("stage", "narratives")
      .order("created_at", { ascending: false }).limit(100);
    if (result.error) throw new Error("Could not load the narrative library.");
    const batches = result.data ?? [];
    const seen = new Set(batches.flatMap((batch) => storedNarratives(batch.narratives).map(keyOf)));
    pending = pending.filter((idea) => { const key = keyOf(idea); if (seen.has(key)) return false; seen.add(key); return true; });
    if (!pending.length) break;
    const open = batches.find((batch) => storedNarratives(batch.narratives).length < MAX_NARRATIVES);
    if (open) {
      const existing = storedNarratives(open.narratives);
      const chunk = pending.slice(0, MAX_NARRATIVES - existing.length);
      const update = await sb.from("creative_batches").update({ narratives: [...existing, ...chunk] as never, updated_at: new Date().toISOString() })
        .eq("id", open.id).eq("workspace_id", options.workspaceId).eq("updated_at", open.updated_at).select("id");
      if (update.error) throw new Error("Could not save the narrative library.");
      if (!update.data?.length) { conflicts++; continue; }
      conflicts = 0;
      saved += chunk.length;
      pending = pending.slice(chunk.length);
    } else {
      const chunk = pending.slice(0, MAX_NARRATIVES);
      const insert = await sb.from("creative_batches").insert({
        workspace_id: options.workspaceId, created_by: options.userId, title: "Sam’s narrative ideas",
        goal, audience: "", offer: "", destination: "", days: 3, stage: "narratives", narratives: chunk as never,
      }).select("id").single();
      if (insert.error) throw new Error("Could not save the narrative library.");
      saved += chunk.length;
      pending = pending.slice(chunk.length);
    }
  }
  if (pending.length) throw new Error("Some ideas could not be saved to the narrative library.");
  return { saved };
}
