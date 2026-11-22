import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { IDEATION_PROGRESS_PREFIX } from "./ideation-status";

type SB = SupabaseClient<Database>;
export class IdeationStopped extends Error { constructor() { super("Sam's idea request was stopped."); this.name = "IdeationStopped"; } }
export const IDEATION_STOPPED_MESSAGE = "Stopped creating new narratives. Your existing ideas are still available.";

/** Caller verifies workspace membership. The persisted marker survives navigation and worker completion. */
export async function stopWorkspaceIdeation(sb: SB, workspaceId: string, userId?: string): Promise<{ stopped: number }> {
  if (userId) {
    const { ensureThread } = await import("./sam.context.server");
    const threadId = await ensureThread(sb, workspaceId, "create", userId);
    const marker = await sb.from("agent_messages").insert({ workspace_id: workspaceId, thread_id: threadId, role: "assistant", content: IDEATION_STOPPED_MESSAGE });
    if (marker.error) throw new Error("Could not record the stop request. Please try again.");
  }
  const result = await sb.from("agent_messages").update({ content: IDEATION_STOPPED_MESSAGE }).eq("workspace_id", workspaceId).eq("role", "assistant").like("content", `${IDEATION_PROGRESS_PREFIX}%`).select("id");
  if (result.error) throw new Error("Could not stop Sam's idea request. Please try again.");
  return { stopped: result.data?.length ?? 0 };
}

export async function assertIdeationActive(sb: SB, workspaceId: string, activityId: string, startedAt?: string) {
  if (startedAt) {
    const marker = await sb.from("agent_messages").select("id").eq("workspace_id", workspaceId).eq("role", "assistant").eq("content", IDEATION_STOPPED_MESSAGE).gte("created_at", startedAt).limit(1);
    if (marker.error) throw new Error("Could not check Sam's stop requests.");
    if (marker.data?.length) throw new IdeationStopped();
  }
  const result = await sb.from("agent_messages").select("content").eq("workspace_id", workspaceId).eq("id", activityId).maybeSingle();
  if (result.error) throw new Error("Could not check whether Sam's idea request was stopped.");
  if (!result.data?.content.startsWith(IDEATION_PROGRESS_PREFIX)) throw new IdeationStopped();
}

/** Only an active progress message may advance; a stopped marker can never be overwritten. */
export async function updateIdeationActivity(sb: SB, workspaceId: string, activityId: string, content: string) {
  const result = await sb.from("agent_messages").update({ content }).eq("workspace_id", workspaceId).eq("id", activityId).like("content", `${IDEATION_PROGRESS_PREFIX}%`).select("id");
  if (result.error) throw new Error("Could not save Sam's idea progress.");
  if (!result.data?.length) throw new IdeationStopped();
}

/** Remove only this stopped run's fresh IDs, rereading concurrent user edits before each CAS. */
export async function discardStoppedIdeas(sb: SB, workspaceId: string, batchId: string, freshIds: string[]) {
  const own = new Set(freshIds);
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await sb.from("creative_batches").select("narratives,updated_at").eq("workspace_id", workspaceId).eq("id", batchId).maybeSingle();
    if (current.error) throw new Error("Could not remove the stopped request's unfinished ideas.");
    if (!current.data) return;
    const list = Array.isArray(current.data.narratives) ? current.data.narratives : [];
    const kept = list.filter((idea) => !idea || typeof idea !== "object" || Array.isArray(idea) || !own.has(String(idea["id"])));
    if (kept.length === list.length) return;
    const saved = await sb.from("creative_batches").update({ narratives: kept, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("id", batchId).eq("updated_at", current.data.updated_at).select("id");
    if (saved.error) throw new Error("Could not remove the stopped request's unfinished ideas.");
    if (saved.data?.length) return;
  }
  throw new Error("The idea library changed while stopping. Refresh it to check the request's unfinished ideas.");
}
