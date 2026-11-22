import { z } from "zod";
import { createHash } from "node:crypto";
import { callVirlo, VirloError, virloAvailable } from "./virlo.server";
import { virloDb } from "./virlo-db.server";
import { buildVirloOperation, VirloOperationSchema } from "./virlo-catalog";
import { virloResourceKind } from "./virlo-access";
import type { Json } from "@/integrations/supabase/types";

const db = virloDb;

/** Research-agent endpoints return an agent id and a distinct run/job id. */
export function virloResourceId(operation: string, result: Record<string, unknown>): unknown {
  return operation === "research_start" ? result["id"] : result["job_id"] ?? result["id"];
}
type VirloOperationInput = { workspace_id: string; request_id: string; operation: z.input<typeof VirloOperationSchema>; confirmed?: boolean | undefined };

export async function executeVirloOperation(data: VirloOperationInput, userId: string) {
  const op = VirloOperationSchema.parse(data.operation);
  const pauseOnly = (op.operation === "tracking_update" && op.status === "paused") || (op.operation === "research_update" && op.active === false && Object.entries(op).every(([key, value]) => ["operation", "id", "active"].includes(key) || value === undefined));
  if (!virloAvailable() && !pauseOnly) throw new Error("Research is not configured or is disabled");
  const request = buildVirloOperation(op);
  if (request.confirmation !== "none" && !data.confirmed) throw new Error(request.confirmation === "destructive" ? "Confirm this irreversible action first" : request.confirmation === "paid" ? "Confirm this paid Virlo data refresh first" : "Confirm the recurring research schedule first");
  if (request.resourceId) {
    const resourceKind = virloResourceKind(op);
    if (!resourceKind) throw new Error("This research action is not available");
    const owned = await db().from("virlo_research_resources").select("id").eq("workspace_id", data.workspace_id).eq("provider_id", request.resourceId).eq("kind", resourceKind).maybeSingle();
    if (owned.error || !owned.data) throw new Error("This research item is not available in this workspace");
  }
  const requestHash = createHash("sha256").update(JSON.stringify(op)).digest("hex");
  const operationMeta = op.operation === "track_creator" ? { platform: op.platform, handle: op.handle, cadence: op.cadence }
    : op.operation === "track_video" ? { platform: op.platform, url: op.url, cadence: op.cadence }
    : op.operation === "tracking_update" ? { kind: op.kind, provider_id: op.id, status: op.status } : null;
  const claim = await db().from("virlo_research_activity").insert({ workspace_id: data.workspace_id, user_id: userId, request_id: data.request_id, request_hash: requestHash, operation_meta: operationMeta,
    operation: op.operation, status: "started", estimated_cost_usd: request.estimatedCostUsd }).select("id").single();
  if (claim.error?.code === "23505") {
    const previous = await db().from("virlo_research_activity").select("id,request_hash,status").eq("workspace_id", data.workspace_id).eq("request_id", data.request_id).maybeSingle();
    if (previous.error || !previous.data || previous.data["request_hash"] !== requestHash) throw new Error("This request identifier is already in use");
    const found = await db().from("virlo_research_results").select("id,result").eq("workspace_id", data.workspace_id).eq("activity_id", String(previous.data["id"])).maybeSingle();
    if (!found.error && found.data) return { id: String(found.data["id"]), data: found.data["result"] as Json };
    throw new Error("This request was already submitted and its outcome needs checking. Do not start it again; contact an administrator.");
  }
  if (claim.error || !claim.data) throw new Error("Research usage could not be recorded");
  const activityId = String(claim.data["id"]);
  let response: Awaited<ReturnType<typeof callVirlo>>;
  try { response = await callVirlo(request, pauseOnly); }
  catch (error) {
    const receipt = error instanceof VirloError ? error.receipt : null;
    await db().from("virlo_research_activity").update({ status: receipt ? "failed" : "unknown", provider_status: receipt?.status ?? null,
      cost_usd: receipt?.costUsd ?? null, credits_used: receipt?.creditsUsed ?? null, updated_at: new Date().toISOString() }).eq("id", activityId).eq("workspace_id", data.workspace_id);
    throw error;
  }
  const providerResult = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {};
  const providerId = virloResourceId(op.operation, providerResult);
  const recordedProviderId = typeof providerId === "string" && z.string().uuid().safeParse(providerId).success ? providerId : null;
  const updated = await db().from("virlo_research_activity").update({ status: "completed", provider_status: response.receipt.status, provider_resource_id: recordedProviderId, cost_usd: response.receipt.costUsd,
    credits_used: response.receipt.creditsUsed, updated_at: new Date().toISOString() }).eq("id", activityId).eq("workspace_id", data.workspace_id);
  if (updated.error) throw new Error("Research completed but usage needs reconciliation; do not resubmit");
  const result = providerResult;
  const resourceKinds: Record<string, string> = { creator_lookup: "lookup_creator", video_lookup: "lookup_video", hashtag_lookup: "lookup_hashtag", sound_lookup: "lookup_sound", place_lookup: "lookup_place", research_start: "research", track_creator: "creators", track_video: "videos" };
  const resourceKind = resourceKinds[op.operation];
  if (resourceKind) {
    const providerId = virloResourceId(op.operation, result);
    if (typeof providerId === "string" && z.string().uuid().safeParse(providerId).success) {
      const label = "handle" in op ? op.handle : "url" in op ? op.url : "intent" in op ? op.intent : "query" in op ? op.query : "hashtag" in op ? op.hashtag : "sound_id" in op ? op.sound_id : op.operation.replaceAll("_", " ");
      const saved = await db().from("virlo_research_resources").insert({ workspace_id: data.workspace_id, user_id: userId, provider_id: providerId,
        kind: resourceKind, label: label.slice(0, 200), status: "active", cadence: "cadence" in op ? op.cadence ?? null : null });
      if (saved.error?.code === "23505" && (op.operation === "track_creator" || op.operation === "track_video")) {
        const restored = await db().from("virlo_research_resources").update({ status: "active", cadence: op.cadence }).eq("workspace_id", data.workspace_id).eq("kind", resourceKind).eq("provider_id", providerId);
        if (restored.error) throw new Error("Tracking started but its local status needs reconciliation.");
      } else if (saved.error && saved.error.code !== "23505") throw new Error("Research started but could not be linked to this workspace; contact an administrator before retrying");
    } else if (op.operation !== "place_lookup") throw new Error("Research started but its provider reference is unavailable; contact an administrator before retrying");
  }
  if (op.operation === "research_delete" || op.operation === "untrack") {
    const kind = op.operation === "research_delete" ? "research" : op.kind;
    const changed = await db().from("virlo_research_resources").update({ status: "deleted" }).eq("workspace_id", data.workspace_id).eq("kind", kind).eq("provider_id", op.id);
    if (changed.error) throw new Error("Virlo completed the removal, but its local status needs reconciliation.");
  }
  if (op.operation === "research_update") {
    const patch = { ...(op.active !== undefined ? { status: op.active ? "active" : "paused" } : {}), ...(op.cadence ? { cadence: op.cadence } : {}), ...(op.name ? { label: op.name } : {}) };
    if (Object.keys(patch).length) { const changed = await db().from("virlo_research_resources").update(patch).eq("workspace_id", data.workspace_id).eq("kind", "research").eq("provider_id", op.id);
      if (changed.error) throw new Error("Research changed at Virlo, but its local status needs reconciliation."); }
  }
  if (op.operation === "tracking_update") {
    const changed = await db().from("virlo_research_resources").update({ status: op.status }).eq("workspace_id", data.workspace_id).eq("kind", op.kind).eq("provider_id", op.id);
    if (changed.error) throw new Error("Tracking was updated at Virlo, but its local status needs reconciliation. Check the Virlo dashboard before retrying.");
  }
  const json = JSON.stringify(response.data);
  if (!json || json.length > 500_000) throw new Error("Research completed but its result is too large to save");
  const saved = await db().from("virlo_research_results").insert({ workspace_id: data.workspace_id, user_id: userId, activity_id: activityId,
    kind: op.operation, title: (op.operation === "videos" || op.operation === "creators") ? op.query : op.operation.replaceAll("_", " "), result: response.data }).select("id").single();
  if (saved.error || !saved.data) throw new Error("Research completed but its result could not be saved; contact an administrator before retrying");
  return { id: String(saved.data["id"]), data: response.data as Json };
}

