import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";
import { authorizeResearch } from "./research.server";
import { virloAvailable } from "./virlo.server";
import { virloDb } from "./virlo-db.server";
import { VirloOperationSchema } from "./virlo-catalog";
import { executeVirloOperation } from "./virlo-execute.server";
import type { Json } from "@/integrations/supabase/types";

const workspace = z.object({ workspace_id: z.string().uuid() });
const kind = z.enum(["videos", "creators"]);
const search = workspace.extend({ kind, query: z.string().trim().min(2).max(200),
  platform: z.enum(["tiktok", "instagram", "youtube"]).optional(), page: z.number().int().min(1).max(40).default(1), request_id: z.string().uuid() });
const db = virloDb;

export const getVirloStatus = createServerFn({ method: "GET" }).inputValidator((input: unknown) => workspace.parse(input))
  .handler(async ({ data }) => { await authorizeResearch(data.workspace_id); return { configured: virloAvailable() }; });

export const searchVirloResearch = createServerFn({ method: "POST" }).inputValidator((input: unknown) => search.parse(input))
  .handler(async ({ data }) => {
    const user = await authorizeResearch(data.workspace_id);
    return executeVirloOperation({ workspace_id: data.workspace_id, request_id: data.request_id,
      operation: { operation: data.kind, query: data.query, page: data.page, ...(data.platform ? { platform: data.platform } : {}) } }, user.id);
  });

export const saveVirloResearch = createServerFn({ method: "POST" }).inputValidator((input: unknown) => workspace.extend({
  result_id: z.string().uuid(), title: z.string().trim().min(1).max(200),
}).parse(input)).handler(async ({ data }) => {
  await authorizeResearch(data.workspace_id);
  const result = await db().from("virlo_research_results").update({ saved: true, title: data.title })
    .eq("id", data.result_id).eq("workspace_id", data.workspace_id).select("id").maybeSingle();
  if (result.error || !result.data) throw new Error("Research result was not found in this workspace");
  return { ok: true };
});

export const listSavedVirloResearch = createServerFn({ method: "GET" }).inputValidator((input: unknown) => workspace.parse(input))
  .handler(async ({ data }) => {
    await authorizeResearch(data.workspace_id);
    const result = await db().from("virlo_research_results").select("id,title,kind,created_at,result")
      .eq("workspace_id", data.workspace_id).eq("saved", true).order("created_at", { ascending: false }).limit(50);
    if (result.error) throw new Error("Saved research is unavailable");
    return (result.data ?? []).map((row) => ({ id: String(row["id"]), title: String(row["title"]), kind: String(row["kind"]), created_at: String(row["created_at"]), data: row["result"] as Json }));
  });

export const listRecentVirloSearches = createServerFn({ method: "GET" }).inputValidator((input: unknown) => workspace.parse(input))
  .handler(async ({ data }) => {
    const user = await authorizeResearch(data.workspace_id);
    const result = await db().from("virlo_research_results").select("id,title,kind,created_at,result")
      .eq("workspace_id", data.workspace_id).eq("user_id", user.id).in("kind", ["videos", "creators"])
      .order("created_at", { ascending: false }).limit(10);
    if (result.error) throw new Error("Recent searches are unavailable");
    return (result.data ?? []).filter((row) => row["title"] !== row["kind"]).map((row) => ({
      id: String(row["id"]), title: String(row["title"]), kind: String(row["kind"]),
      created_at: String(row["created_at"]), data: row["result"] as Json,
    }));
  });

export const getVirloResearchResult = createServerFn({ method: "GET" }).inputValidator((input: unknown) => workspace.extend({ result_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    await authorizeResearch(data.workspace_id);
    const result = await db().from("virlo_research_results").select("id,title,kind,created_at,result")
      .eq("workspace_id", data.workspace_id).eq("id", data.result_id).maybeSingle();
    if (result.error || !result.data) throw new Error("This research result is unavailable in this business.");
    return { id: String(result.data["id"]), title: String(result.data["title"]), kind: String(result.data["kind"]), data: result.data["result"] as Json };
  });

export const listVirloResources = createServerFn({ method: "GET" }).inputValidator((input: unknown) => workspace.parse(input))
  .handler(async ({ data }) => {
    await authorizeResearch(data.workspace_id);
    const result = await db().from("virlo_research_resources").select("provider_id,kind,label,status,cadence").eq("workspace_id", data.workspace_id).or("status.neq.deleted,kind.neq.research").order("created_at", { ascending: false }).limit(100);
    if (result.error) throw new Error("Tracked research is unavailable");
    return (result.data ?? []).map((row) => ({ id: String(row["provider_id"]), kind: String(row["kind"]), label: String(row["label"]), status: String(row["status"]), cadence: typeof row["cadence"] === "string" ? row["cadence"] : null }));
  });

export const getVirloTrackingResource = createServerFn({ method: "GET" }).inputValidator((input: unknown) => workspace.extend({ provider_id: z.string().uuid(), kind: z.enum(["creators", "videos", "research"]) }).parse(input))
  .handler(async ({ data }) => {
    await authorizeResearch(data.workspace_id);
    const result = await db().from("virlo_research_resources").select("label,status,cadence").eq("workspace_id", data.workspace_id).eq("provider_id", data.provider_id).eq("kind", data.kind).maybeSingle();
    if (result.error || !result.data) throw new Error("This tracking item is unavailable in this business.");
    return { label: String(result.data["label"]), status: String(result.data["status"]), cadence: typeof result.data["cadence"] === "string" ? result.data["cadence"] : null };
  });

const operationInput = workspace.extend({
  operation: VirloOperationSchema, request_id: z.string().uuid(), confirmed: z.boolean().optional(),
});


export const runVirloOperation = createServerFn({ method: "POST" }).inputValidator((input: unknown) => operationInput.parse(input))
  .handler(async ({ data }) => { const user = await authorizeResearch(data.workspace_id); return executeVirloOperation(data, user.id); });
