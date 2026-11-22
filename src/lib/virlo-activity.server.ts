import { virloDb } from "./virlo-db.server";
import { searchVirlo, VirloError, type VirloSearch } from "./virlo.server";

/** A durable row precedes each paid request, including requests that time out. */
export async function recordedVirloSearch(workspaceId: string, userId: string, search: VirloSearch, signal?: AbortSignal) {
  const db = virloDb();
  let createQuery = db.from("virlo_research_activity").insert({
    workspace_id: workspaceId, user_id: userId, operation: `search_${search.kind}`, status: "started", estimated_cost_usd: 0.05,
  }).select("id");
  if (signal) createQuery = createQuery.abortSignal(signal);
  const created = await createQuery.single();
  if (created.error || !created.data) throw new Error("Research usage could not be recorded");
  const id = String(created.data["id"]);
  if (signal?.aborted) {
    await db.from("virlo_research_activity").update({ status: "failed", cost_usd: 0, credits_used: 0 }).eq("id", id).eq("workspace_id", workspaceId);
    throw new Error("Research was cancelled before submission");
  }
  let result: Awaited<ReturnType<typeof searchVirlo>>;
  try {
    result = await searchVirlo(search, fetch, signal);
  } catch (error) {
    const receipt = error instanceof VirloError ? error.receipt : null;
    await db.from("virlo_research_activity").update({ status: receipt ? "failed" : "unknown", provider_status: receipt?.status ?? null,
      cost_usd: receipt?.costUsd ?? null, credits_used: receipt?.creditsUsed ?? null, updated_at: new Date().toISOString(),
    }).eq("id", id).eq("workspace_id", workspaceId);
    throw error;
  }
  const updated = await db.from("virlo_research_activity").update({ status: "completed", provider_status: result.receipt.status,
    cost_usd: result.receipt.costUsd, credits_used: result.receipt.creditsUsed, updated_at: new Date().toISOString(),
  }).eq("id", id).eq("workspace_id", workspaceId);
  if (updated.error) throw new Error("Research usage needs reconciliation");
  return result.data;
}
