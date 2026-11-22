import { getAdminClient } from "./supabase-admin.server";
import { getHomeOverviewForUser } from "./home-overview.server";
import type { HomeItemsResult } from "./home-actions.functions";

const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
type SavedRow = { id: string; workspace_id: string; batch_id?: string; updated_at: string; status?: string; narratives?: unknown; production_plan?: unknown; checkpoint?: unknown };
const tables = { batch: "creative_batches", variant: "creative_variants", planning: "creative_planning_jobs" } as const;

/** Patch one display marker while preserving source briefs, provider output and idempotency claims. */
export function homeTrashMetadata(value: unknown, at: string | null) {
  const next = { ...record(value) };
  if (at) next.home_trashed_at = at;
  else delete next.home_trashed_at;
  return Object.keys(next).length ? next : null;
}
export function homeTrashNarratives(value: unknown, at: string | null) {
  const entries = Array.isArray(value) ? [...value] : [];
  if (!at) return entries.flatMap((entry) => {
    const source = record(entry);
    if (!Object.prototype.hasOwnProperty.call(source, "home_trashed_at")) return [entry];
    const next = { ...source }; delete next.home_trashed_at;
    return next.home_metadata === true && Object.keys(next).length === 1 ? [] : [next];
  });
  let index = entries.findIndex((entry) => typeof record(entry).home_trashed_at === "string");
  if (index < 0) index = entries.findIndex((entry) => !!record(entry).model_create_request || String(record(entry).why ?? "").startsWith("Manual Models request."));
  if (index < 0) index = entries.findIndex((entry) => Object.keys(record(entry)).length > 0);
  if (index < 0) entries.push({ home_metadata: true, home_trashed_at: at });
  else entries[index] = { ...record(entries[index]), home_trashed_at: at };
  return entries;
}

/** Reversible display-only mutation. Every target is authorized and checked before the first write. */
export async function changeHomeTrashForUser(userId: string, workspaceId: string, ids: string[], trash: boolean): Promise<HomeItemsResult> {
  const canonical = await getHomeOverviewForUser(userId, workspaceId, trash ? "all" : "trash");
  if (!ids.length || ids.length > 20 || new Set(ids).size !== ids.length) throw new Error("Select between 1 and 20 different videos.");
  const selected = ids.map((id) => {
    const matches = canonical.filter((item) => item.id === id);
    if (matches.length !== 1) throw new Error("A selected video is no longer available in this business. Refresh Home.");
    const item = matches[0]!;
    if (trash && !item.trashed && !item.can_trash) throw new Error(item.trash_reason || "This video cannot be moved to Trash while work is active or uncertain.");
    return item;
  });
  const targets = selected.filter((item) => item.trashed !== trash);
  if (!targets.length) return { updated_ids: [] };
  const admin = getAdminClient();
  const table = (name: string) => admin.from(name as never) as any;
  const rows = new Map<string, SavedRow>();
  for (const kind of ["batch", "variant", "planning"] as const) {
    const group = targets.filter((item) => item.kind === kind);
    if (!group.length) continue;
    const columns = kind === "batch" ? "id,workspace_id,narratives,updated_at" : kind === "variant" ? "id,workspace_id,batch_id,production_plan,updated_at" : "id,workspace_id,batch_id,checkpoint,status,updated_at";
    const result = await table(tables[kind]).select(columns).eq("workspace_id", workspaceId).in("id", group.map((item) => item.id));
    if (result.error || !Array.isArray(result.data) || result.data.length !== group.length) throw new Error("A selected video's saved state could not be checked. Nothing was moved.");
    for (const row of result.data as SavedRow[]) {
      const item = group.find((candidate) => candidate.id === row.id);
      if (!item || row.workspace_id !== workspaceId || (kind !== "batch" && row.batch_id !== item.batch_id) || !row.updated_at) throw new Error("A selected video's ownership changed. Nothing was moved.");
      if (kind === "planning" && ["queued", "running"].includes(row.status ?? "")) throw new Error("Storyboard preparation is active. Wait for it to finish before changing its Trash state. Nothing was moved.");
      rows.set(row.id, row);
    }
  }
  if (trash) {
    const variantIds = targets.flatMap((item) => item.variant_id ? [item.variant_id] : []);
    if (variantIds.length) {
      const active = await admin.from("render_jobs").select("id").eq("workspace_id", workspaceId).in("variant_id", variantIds).in("status", ["queued", "preparing", "rendering"]).limit(1);
      if (active.error || !active.data || active.data.length) throw new Error("Production is active or its status could not be checked. Nothing was moved.");
    }
    const preparation = await table("creative_planning_jobs").select("id").eq("workspace_id", workspaceId).in("batch_id", [...new Set(targets.map((item) => item.batch_id))]).in("status", ["queued", "running"]).limit(1);
    if (preparation.error || !preparation.data || preparation.data.length) throw new Error("Storyboard preparation is active or its status could not be checked. Nothing was moved.");
  }
  const now = new Date().toISOString();
  const updated_ids: string[] = [], errors: Array<{ id: string; message: string }> = [];
  for (const item of targets) {
    const row = rows.get(item.id)!;
    const field = item.kind === "batch" ? "narratives" : item.kind === "variant" ? "production_plan" : "checkpoint";
    const metadata = item.kind === "batch" ? homeTrashNarratives(row.narratives, trash ? now : null) : homeTrashMetadata(row[field], trash ? now : null);
    // Planning recency controls latestNarrativePlan: display-only Trash must
    // not make an old request look like the current preparation attempt.
    const patch = item.kind === "planning" ? { [field]: metadata } : { [field]: metadata, updated_at: now };
    let query = table(tables[item.kind]).update(patch).eq("id", item.id).eq("workspace_id", workspaceId).eq("updated_at", row.updated_at);
    if (item.kind === "planning") {
      query = query.eq("status", row.status);
      const previousMarker = record(row.checkpoint).home_trashed_at;
      query = typeof previousMarker === "string" ? query.eq("checkpoint->>home_trashed_at", previousMarker) : query.is("checkpoint->>home_trashed_at", null);
    }
    const changed = await query.select("id");
    if (changed.error || !changed.data?.length) errors.push({ id: item.id, message: "This item changed or could not be saved. Refresh Home and try again." });
    else updated_ids.push(item.id);
  }
  // Keep restored/trashed child cards reachable in the bounded recent-batch view.
  const parentIds = [...new Set(targets.filter((item) => item.kind !== "batch" && updated_ids.includes(item.id)).map((item) => item.batch_id))];
  if (parentIds.length) {
    const touched = await admin.from("creative_batches").update({ updated_at: now }).eq("workspace_id", workspaceId).in("id", parentIds);
    if (touched.error) for (const item of targets.filter((candidate) => updated_ids.includes(candidate.id) && parentIds.includes(candidate.batch_id))) errors.push({ id: item.id, message: "The item was saved, but Home's recent-work ordering could not be refreshed." });
  }
  return { updated_ids, ...(errors.length ? { errors } : {}) };
}

/** Restart only the exact saved ordinary storyboard input through its existing idempotent queue. */
export async function retryHomePlanningForUser(userId: string, workspaceId: string, jobId: string) {
  const canonical = await getHomeOverviewForUser(userId, workspaceId, "all");
  const admin = getAdminClient();
  const result = await (admin.from("creative_planning_jobs" as never) as any).select("*").eq("id", jobId).eq("workspace_id", workspaceId).maybeSingle();
  const source = result.data as { id: string; batch_id: string; workspace_id: string; status: string; input: unknown; checkpoint?: unknown } | null;
  if (result.error || !source || source.workspace_id !== workspaceId) throw new Error("This saved storyboard request is not available in this business.");
  const batch = await admin.from("creative_batches").select("id,workspace_id").eq("id", source.batch_id).eq("workspace_id", workspaceId).maybeSingle();
  if (batch.error || !batch.data || batch.data.workspace_id !== workspaceId) throw new Error("This storyboard's business could not be verified.");
  if (record(source.checkpoint).home_trashed_at) throw new Error("Restore this storyboard from Trash before retrying it.");
  const { latestNarrativePlan, enqueueNarrativePlan } = await import("./narrative-planning.server");
  const latest = await latestNarrativePlan(admin, source.batch_id);
  if (latest && ["queued", "running", "completed"].includes(latest.status)) return latest;
  const item = canonical.find((candidate) => candidate.id === jobId && candidate.kind === "planning" && candidate.batch_id === source.batch_id);
  if (!item || item.trashed || item.action !== "retry_planning" || source.status !== "failed" || latest?.job_id !== jobId) throw new Error("This storyboard request changed. Refresh Home before retrying.");
  const input = record(source.input);
  if (input.batch_id !== source.batch_id || !Array.isArray(input.picked) || !input.picked.length) throw new Error("This storyboard's original settings could not be recovered. Open Create Assets to review it.");
  const queued = await enqueueNarrativePlan(admin, { workspaceId, userId, batchId: source.batch_id, input, retry: true });
  const { kickCreativeJobs } = await import("./creative.functions");
  await kickCreativeJobs(admin);
  return queued;
}
