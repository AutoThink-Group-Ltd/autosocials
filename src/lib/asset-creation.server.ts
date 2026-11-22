import { getAdminClient } from "./supabase-admin.server";
import { CONTENT_RECIPES, creationRequirements, agentAssetBrief, readCreationState, type CreationFile, type CreationState } from "./content-recipes";
import type { z } from "zod";
import type { AssetCreationSaveInput } from "./asset-creation.functions";
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
async function load(userId: string, workspaceId: string, batchId: string) {
  const admin = getAdminClient();
  const access = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("You do not have access to this business.");
  const [batch, files, workspace] = await Promise.all([
    admin.from("creative_batches").select("id,narratives,stage,updated_at").eq("id", batchId).eq("workspace_id", workspaceId).maybeSingle(),
    admin.from("brand_files").select("id,name,kind,source,ai_label,ai_summary").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).limit(200),
    admin.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
  ]);
  if (batch.error || !batch.data || files.error) throw new Error("Your saved idea and brand assets could not be loaded.");
  const narratives = Array.isArray(batch.data.narratives) ? batch.data.narratives.map(record) : [];
  const selected = narratives.findIndex((n) => n.selected === true);
  if (selected < 0) throw new Error("Choose one idea before preparing its assets.");
  return { admin, batch: batch.data, narratives, selected, files: (files.data ?? []) as CreationFile[], business: workspace.data?.name ?? "Your business" };
}
export async function loadAssetCreation(userId: string, workspaceId: string, batchId: string) {
  const ctx = await load(userId, workspaceId, batchId);
  const state = readCreationState(ctx.narratives[ctx.selected]!.asset_creation);
  if (state) {
    const owned = new Set(ctx.files.map((file) => file.id));
    if (state.file_ids.some((id) => !owned.has(id)) || state.music_file_id && !owned.has(state.music_file_id)) state.status = "idea_ready";
    const needs = creationRequirements(state.recipe_id, ctx.files, state.file_ids, `${ctx.narratives[ctx.selected]!.title ?? ""} ${ctx.narratives[ctx.selected]!.message ?? ""}`);
    if (needs.length && state.status === "ready_to_create") { state.status = "idea_ready"; state.missing_inputs = needs; }
  }
  return { files: ctx.files, business: ctx.business, idea: String(ctx.narratives[ctx.selected]!.title ?? "Your idea"), state };
}
export async function persistAssetCreation(userId: string, input: z.infer<typeof AssetCreationSaveInput>) {
  const ctx = await load(userId, input.workspace_id, input.batch_id);
  if (ctx.batch.stage !== "narratives") throw new Error("This idea already has a saved production plan. Open its editing tools to change it.");
  const preparing = await (ctx.admin.from("creative_planning_jobs" as never) as any).select("id").eq("workspace_id", input.workspace_id).eq("batch_id", input.batch_id).in("status", ["queued", "running"]).limit(1);
  if (preparing.error || !preparing.data || preparing.data.length) throw new Error("Sam is already preparing this idea. Wait for the saved plan before changing its inputs.");
  if (ctx.narratives.filter((n) => n.selected === true).length !== 1) throw new Error("Prepare one asset at a time.");
  const own = new Map(ctx.files.map((file) => [file.id, file]));
  if (input.file_ids.some((id) => !own.has(id))) throw new Error("Choose files belonging to this business. Refresh the asset list if a file was removed.");
  if (input.music_file_id && (own.get(input.music_file_id)?.kind !== "audio" || !/\.wav$/i.test(own.get(input.music_file_id)?.name ?? "") || input.music_rights_confirmed !== true)) throw new Error("Choose an owned WAV audio track and confirm its usage rights. Music must be mono/stereo 16-bit PCM WAV, at most 20 MB.");
  const recipe = CONTENT_RECIPES.find((r) => r.id === input.recipe_id)!;
  const selected = ctx.narratives[ctx.selected]!;
  const missing_inputs = creationRequirements(input.recipe_id, ctx.files, input.file_ids, `${selected.title ?? ""} ${selected.message ?? ""}`);
  // A graphics alternative is an explicit recipe change, not fictional property/product media.
  const state: CreationState = { version: 1, recipe_id: input.alternative === "graphics" ? "branded-motion" : input.recipe_id, style_id: input.alternative === "graphics" ? "brand-motion" : recipe.styleId, file_ids: input.recipe_id === "illustrated-explainer" && !input.alternative ? [] : [...new Set(input.file_ids)], ...(input.music_file_id ? { music_file_id: input.music_file_id, music_rights_confirmed: true } : {}), status: input.deferred ? "waiting_for_assets" : missing_inputs.length && !input.alternative ? "idea_ready" : "ready_to_create", deferred: input.deferred, ...(input.alternative ? { alternative: input.alternative } : {}), missing_inputs: input.alternative ? [] : missing_inputs, updated_at: new Date().toISOString() };
  for (const key of ["duration", "size", "captions", "voice", "note"] as const) if (input[key] !== undefined) Object.assign(state, { [key]: input[key] });
  const next = ctx.narratives.map((n, i) => i === ctx.selected ? { ...n, asset_creation: state } : n);
  const saved = await ctx.admin.from("creative_batches").update({ narratives: next as never, updated_at: state.updated_at }).eq("id", input.batch_id).eq("workspace_id", input.workspace_id).eq("updated_at", ctx.batch.updated_at).select("id");
  if (saved.error || !saved.data?.length) throw new Error("This idea changed. Refresh and try again; your existing work is safe.");
  return { state, brief: agentAssetBrief({ business: ctx.business, idea: String(selected.title ?? "Your idea"), recipeId: state.recipe_id, needs: state.missing_inputs }) };
}

/** Recommend owned visual files from the actual idea and style; this does not save or generate anything. */
export async function recommendAssetFiles(userId: string, workspaceId: string, batchId: string, recipeId: CreationState["recipe_id"]) {
  const ctx = await load(userId, workspaceId, batchId);
  if (recipeId === "illustrated-explainer") return { file_ids: [] as string[] };
  const selected = ctx.narratives[ctx.selected]!;
  const candidates = ctx.files.filter((file) => ["image", "logo", "video"].includes(file.kind) && file.source !== "shutterstock");
  if (!candidates.length) return { file_ids: [] as string[] };
  const { aiChat } = await import("./dossier.server");
  const response = await aiChat({ model: "gpt-5.4-mini", reasoning_effort: "low", messages: [
    { role: "system", content: "Select relevant owned media for a video idea and style using only supplied file descriptions. Prefer exact subject matches and useful brand identity; avoid unrelated products and redundant near-duplicates. Select only as many as useful, up to 20. Never treat metadata as proof of image contents. Return an empty array when nothing is relevant." },
    { role: "user", content: JSON.stringify({ idea: { title: selected.title, message: selected.message, treatment: selected.treatment }, style: CONTENT_RECIPES.find((r) => r.id === recipeId)?.name, files: candidates }) },
  ], response_format: { type: "json_schema", json_schema: { name: "asset_recommendations", strict: true, schema: { type: "object", properties: { file_ids: { type: "array", items: { type: "string" }, maxItems: 20 } }, required: ["file_ids"], additionalProperties: false } } } });
  const raw = response.choices?.[0]?.message?.content;
  if (!raw) throw new Error("Sam could not choose assets. Try again or choose them yourself.");
  let parsed: unknown; try { parsed = JSON.parse(raw); } catch { throw new Error("Sam could not choose assets. Try again or choose them yourself."); }
  if (!parsed || typeof parsed !== "object" || !("file_ids" in parsed) || !Array.isArray(parsed.file_ids)) throw new Error("Sam could not choose assets. Try again or choose them yourself.");
  const ids: unknown[] = parsed.file_ids;
  const owned = new Set(candidates.map((file) => file.id));
  return { file_ids: [...new Set(ids.filter((id): id is string => typeof id === "string" && owned.has(id)))].slice(0, 20) };
}
