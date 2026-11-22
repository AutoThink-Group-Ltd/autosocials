import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { aiChat, loadDossierContext } from "./dossier.server";
import { requireBrandContext } from "./brand-context.server";
import { requireUser, getAdminClient } from "./supabase-admin.server";
import { canStartRender, needsNewDraft } from "./allowance";
import { APPROVED_POST_STATUS, applySpec, capAssets, suggestBreakdown, planAdvances, keepLibraryFiles, reviewStateAfterEdit, mergeNarratives, selectedNarratives, NARRATIVES_PER_REFRESH, MAX_NARRATIVES, WIZARD_STAGES, NARRATIVE_TYPES, narrativeType, canMoveVariants, type Narrative } from "./wizard";
import { MAX_ASSETS_PER_BATCH, clampAssets, MAX_BATCH_DAYS, NEW_BATCH_SIZES, RENDER_CONCURRENCY, VIDEO_SIZES, canShare, clampDays, maxVideos, normaliseDuration } from "./content-rules";
import { BUILTIN_PREFIX, BUILTIN_NAMES, BUILTIN_VOICES, resolveVoice, toBuiltinId, voiceSource } from "./integrations";
import { withAssetDuration, assetBriefPatch, assetBriefSnapshot, assetWithSnapshot, hasBriefSnapshot, preserveAssetBrief, renderLinks, resolvePrimaryRender, snapshotForRender, snapshotRecord } from "./asset-versions.server";
import type { AssetRow, RenderRow } from "./asset-versions.server";
import { activePlanningVariants, readProductionPlan } from "./production-plan";
import { narrativeKey } from "./narrative-library";
import { resetNarrativeLibrary } from "./narrative-reset.server";
import { assertIdeationActive, discardStoppedIdeas, IDEATION_STOPPED_MESSAGE, IdeationStopped, stopWorkspaceIdeation, updateIdeationActivity } from "./ideation-control.server";
import { VIDEO_STYLE_IDS, listVideoStyles } from "./video-styles";
import { getCreativeCapability } from "./creative-providers/registry";

type Admin = ReturnType<typeof getAdminClient>;

const assertMember = createServerOnlyFn(async function assertMember(userId: string, ws: string) {
  const admin = getAdminClient();
  const { data } = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: ws });
  if (!data) throw new Error("Forbidden");
  return admin;
});

const systemFolder = createServerOnlyFn(async function systemFolder(admin: Admin, ws: string, name: string) {
  const { data } = await admin.from("asset_folders").select("id").eq("workspace_id", ws).eq("name", name).is("parent_id", null).limit(1).maybeSingle();
  if (data) return data.id;
  const ins = await admin.from("asset_folders").insert({ workspace_id: ws, name, is_system: true }).select("id").single();
  return ins.data?.id ?? null;
});

const STR = { type: "string" } as const;
const PLAN_SCHEMA = {
  type: "object", additionalProperties: false,
  required: ["title", "audience", "offer", "voice", "voice_reason", "variants"],
  properties: {
    title: STR, audience: STR, offer: STR,
    voice: { type: "string", enum: BUILTIN_NAMES }, voice_reason: STR,
    variants: { type: "array", items: {
      type: "object", additionalProperties: false,
      required: ["day", "angle", "hook", "format", "duration_s", "size", "beats", "voiceover", "script", "caption", "cta"],
      properties: {
        day: { type: "integer" }, angle: STR, hook: STR, format: STR,
        duration_s: { type: "integer", enum: [15, 30, 60] },
        size: { type: "string", enum: [...NEW_BATCH_SIZES] },
        beats: { type: "array", items: STR }, voiceover: STR, script: STR, caption: STR, cta: STR,
      },
    } },
  },
};

const WIZARD_PLAN_SCHEMA = (() => {
  const v = PLAN_SCHEMA.properties.variants.items;
  return { ...PLAN_SCHEMA, properties: { ...PLAN_SCHEMA.properties, variants: { type: "array", items: { ...v, required: [...v.required, "file_ids", "argument"], properties: { ...v.properties, file_ids: { type: "array", items: STR }, argument: STR } } } } };
})();

const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Legacy entry point shares production-aware planning; schedules at most two assets/day. */
export const planBatch = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    workspace_id: z.string().uuid(), goal: z.string().trim().min(3).max(1000),
    days: z.number().int().min(1).max(MAX_BATCH_DAYS), starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => { const parsed = new Date(`${date}T00:00:00Z`); return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date; }, "Choose a valid start date"),
  }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    const days = clampDays(data.days);
    const count = Math.min(MAX_ASSETS_PER_BATCH, maxVideos(days));
    const picked: Narrative[] = [{ id: crypto.randomUUID(), title: data.goal.slice(0, 160), message: data.goal, why: "The user's requested content goal.", selected: true, custom: true }];
    const specs = suggestBreakdown(picked, count).map((spec) => ({ narrative: spec.narrative, duration: spec.duration, size: "1080x1920" as const, note: data.goal }));
    const { planProductionAssets } = await import("./creative-planning.server");
    const plan = await planProductionAssets({ admin, userId: user.id, workspaceId: data.workspace_id, picked, specs, voice: null });
    if (plan.variants.length !== count || plan.variants.some((v) => !v.production_plan.direction)) throw new Error("Sam couldn't prepare the complete production plan. Please try again.");
    const { creativeDirectionText } = await import("./creative-direction");
    const planId = crypto.randomUUID();
    const b = await admin.from("creative_batches").insert({
      workspace_id: data.workspace_id, title: plan.title.slice(0, 120), goal: data.goal, days, starts_on: data.starts_on,
      audience: plan.audience ?? "", offer: plan.offer ?? "", destination: "", created_by: user.id,
      voice_id: toBuiltinId(plan.voice), voice_reason: (plan.voice_reason ?? "").slice(0, 300),
      stage: "briefs", narratives: picked as never,
    }).select("id").single();
    if (b.error) throw new Error(b.error.message);
    const rows = plan.variants.map((v, i) => ({
      workspace_id: data.workspace_id, batch_id: b.data.id, position: i,
      planned_for: addDays(data.starts_on, Math.floor(i / 2)), duration_s: v.duration_s, size: v.size,
      beats: v.beats, voiceover: v.voiceover, angle: v.angle, narrative: v.angle, hook: v.hook, format: v.format,
      script: `${v.script}\n\nSTRUCTURED CREATIVE DIRECTION:\n${creativeDirectionText(v.production_plan.direction!)}`,
      caption: v.caption, cta: v.cta, file_ids: v.file_ids, argument: v.argument,
      production_plan: { ...v.production_plan, plan_id: planId, source_narrative_key: narrativeKey(b.data.id, picked[0]!) } as never,
      // The queue prepares a missing composition prompt before production; this plan is not a failed prompt review.
      build_prompt: null, build_prompt_issues: [],
    }));
    const ins = await admin.from("creative_variants").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
    return { batchId: b.data.id };
  });

/** Edit a card. Creative changes bump the version and send it back to draft. */
export const updateVariant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    id: z.string().uuid(), hook: z.string().max(500).optional(), voiceover: z.string().max(4000).optional(),
    caption: z.string().max(4000).optional(), selected: z.boolean().optional(),
    duration_s: z.union([z.literal(15), z.literal(30), z.literal(60)]).optional(), size: z.enum(VIDEO_SIZES).optional(),
    voice_id: z.string().max(80).nullable().optional(),
    beats: z.array(z.string().max(1000)).max(10).optional(), cta: z.string().max(500).optional(),
    file_ids: z.array(z.string().uuid()).max(20).optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: v } = await admin.from("creative_variants").select("*").eq("id", data.id).single();
    if (!v) throw new Error("Not found");
    await assertMember(user.id, v.workspace_id);
    const { id, ...raw } = data;
    const patch = Object.fromEntries(Object.entries(raw).filter(([, x]) => x !== undefined)) as { hook?: string; voiceover?: string; caption?: string; selected?: boolean; duration_s?: number; size?: string; voice_id?: string | null; beats?: string[]; cta?: string; file_ids?: string[] };
    if (patch.file_ids) {
      const { data: mine } = await admin.from("brand_files").select("id").eq("workspace_id", v.workspace_id).in("id", patch.file_ids);
      patch.file_ids = keepLibraryFiles(patch.file_ids, new Set((mine ?? []).map((f) => f.id)));
    }
    if (patch.voice_id !== undefined && patch.voice_id !== null && voiceSource(patch.voice_id) === "builtin" && !toBuiltinId(patch.voice_id)) throw new Error("Unknown voice");
    const next = patch.duration_s === undefined ? v : withAssetDuration(v, patch.duration_s);
    const planChanged = JSON.stringify(next.production_plan) !== JSON.stringify(v.production_plan);
    const creative = planChanged || patch.beats !== undefined || patch.file_ids !== undefined || (["hook", "voiceover", "caption", "cta", "duration_s", "size", "voice_id"] as const).some((k) => patch[k] !== undefined && patch[k] !== v[k]);
    if (creative) await preserveAssetBrief(admin, v);
    const r = await admin.from("creative_variants").update({ ...patch, ...(planChanged ? { production_plan: next.production_plan } : {}), ...(creative ? { version: v.version + 1, review_state: "draft" } : {}) }).eq("id", id).eq("version", v.version).select("id").maybeSingle();
    if (r.error || !r.data) throw new Error(r.error?.message ?? "The brief changed while editing. Refresh before trying again.");
    return { ok: true };
  });

export const deleteVariant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: v } = await admin.from("creative_variants").select("workspace_id").eq("id", data.id).single();
    if (!v) throw new Error("Not found");
    await assertMember(user.id, v.workspace_id);
    // Renders cascade; any Publish draft keeps its post but loses the link.
    const r = await admin.from("creative_variants").delete().eq("id", data.id);
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

/** Rename a batch. */
export const renameBatch = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: b } = await admin.from("creative_batches").select("workspace_id").eq("id", data.id).single();
    if (!b) throw new Error("Not found");
    await assertMember(user.id, b.workspace_id);
    const r = await admin.from("creative_batches").update({ title: data.title }).eq("id", data.id);
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

/** Create an empty folder (stored as a batch) for organising assets. */
export const createFolder = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), title: z.string().trim().min(1).max(120) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertMember(user.id, data.workspace_id);
    const admin = getAdminClient();
    const starts = new Date().toISOString().slice(0, 10);
    const r = await admin.from("creative_batches").insert({
      workspace_id: data.workspace_id, title: data.title, goal: "", days: 3, starts_on: starts, created_by: user.id,
      audience: "", offer: "", destination: "", stage: "narratives",
    }).select("id").single();
    if (r.error) throw new Error(r.error.message);
    return { id: r.data.id };
  });

/** Move assets into another folder in the same workspace. */
export const moveVariants = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(50), target: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: t } = await admin.from("creative_batches").select("workspace_id").eq("id", data.target).single();
    if (!t) throw new Error("Folder not found");
    await assertMember(user.id, t.workspace_id);
    const { data: vs } = await admin.from("creative_variants").select("id,workspace_id").in("id", data.ids);
    if (!vs || vs.length !== data.ids.length || !canMoveVariants(vs.map((v) => v.workspace_id), t.workspace_id)) throw new Error("Those assets can't go into that folder");
    const { data: last } = await admin.from("creative_variants").select("position").eq("batch_id", data.target).order("position", { ascending: false }).limit(1);
    let pos = (last?.[0]?.position ?? -1) + 1;
    for (const id of data.ids) {
      const r = await admin.from("creative_variants").update({ batch_id: data.target, position: pos++ }).eq("id", id);
      if (r.error) throw new Error(r.error.message);
    }
    return { ok: true };
  });

/** Delete a whole batch with its assets and renders (Publish drafts stay). */
export const deleteBatch = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: b } = await admin.from("creative_batches").select("workspace_id").eq("id", data.id).single();
    if (!b) throw new Error("Not found");
    await assertMember(user.id, b.workspace_id);
    const r = await admin.from("creative_batches").delete().eq("id", data.id);
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

/** Delete several batches at once; every one must be in a workspace the caller can access. */
export const deleteBatches = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(50) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { bulkDeleteAllowed } = await import("./wizard");
    const { data: rows } = await admin.from("creative_batches").select("id,workspace_id").in("id", data.ids);
    const wss = [...new Set((rows ?? []).map((r) => r.workspace_id))];
    const ok = new Set<string>();
    for (const ws of wss) { const { data: a } = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: ws }); if (a) ok.add(ws); }
    if (!bulkDeleteAllowed(data.ids, rows ?? [], (ws) => ok.has(ws))) throw new Error("Forbidden");
    const r = await admin.from("creative_batches").delete().in("id", data.ids);
    if (r.error) throw new Error(r.error.message);
    return { deleted: data.ids.length };
  });

const creditLinesSchema = z.array(z.object({ step_key: z.string().min(1).max(100), capability_id: z.string().min(1).max(200), duration_s: z.number().int().nonnegative(), rate_id: z.string().uuid(), credits: z.number().int().positive() }).strict()).min(1).max(7);
/** Queue one render (explicit user action). The pump sends it to AutoToast. */
export const getAssetProductionQuote = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ variant_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser(), admin = getAdminClient();
    const result = await admin.from("creative_variants").select("*").eq("id", data.variant_id).maybeSingle();
    if (result.error || !result.data) throw new Error("This saved asset is unavailable.");
    await assertMember(user.id, result.data.workspace_id);
    const quote = await (await import("./production.server")).quoteAssetProduction(admin, result.data);
    try {
      const { quoteProductionCredits } = await import("./content-credits.server");
      const price = await quoteProductionCredits(admin as unknown as import("@supabase/supabase-js").SupabaseClient, result.data.production_plan, result.data.duration_s);
      return { ...quote, creditCost: price.credits, creditLines: price.lines, creditRateId: price.lines.length === 1 ? price.lines[0]!.rate_id : null, creditVersion: result.data.version };
    } catch {
      return { ...quote, ready: false, creditCost: null, creditLines: [], creditRateId: null, creditVersion: result.data.version, message: "This production does not yet have a verified credit price. No generation has started." };
    }
  });

export const startRender = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ variant_id: z.string().uuid(), origin: z.enum(["user", "sam"]).default("user"), expected_version: z.number().int().optional(), expected_credits: z.number().int().positive().optional(), expected_rate_id: z.string().uuid().optional(), expected_lines: creditLinesSchema.optional() }).parse(i))
  .handler(async ({ data }) => {
    const request = productionRequest();
    const user = await requireUser();
    const admin = getAdminClient();
    await queueRender(admin, user.id, data.variant_id, undefined, data.origin, undefined, request, { version: data.expected_version, credits: data.expected_credits, rateId: data.expected_rate_id, lines: data.expected_lines });
    await kickCreativeJobs(admin);
    return { ok: true };
  });

const preflightRender = createServerOnlyFn(async function preflightRender(admin: Admin, userId: string, v: AssetRow) {
    await assertMember(userId, v.workspace_id);
    const { assertNoUncertainGeneration } = await import("./generation-tracker.server");
    await assertNoUncertainGeneration(v.id, admin);
    if (Array.isArray(v.build_prompt_issues) && v.build_prompt_issues.length) throw new Error("This brief still has unresolved production checks. Review its build prompt before creating the video.");
    // Validate ownership, format and rights before admission or any paid work.
    await (await import("./production-audio.server")).loadApprovedSoundtrack(admin, v.workspace_id, v.production_plan);
    if (readProductionPlan(v.production_plan).steps.some((step) => step.capability_id === "heygen-avatar")) {
      const demo = await (await import("./production.server")).reactionDemo(admin, v.workspace_id, v.file_ids ?? []);
      const packed = await loadRenderAssets(admin, v.workspace_id, [demo.id], true);
      if (!packed.media.some((item) => item.type === "video" && item.path.startsWith(`assets/${demo.id}.`))) throw new Error("The selected demonstration cannot be loaded for video assembly. Upload a supported video and try again.");
    }
    const quote = await (await import("./production.server")).quoteAssetProduction(admin, v);
    if (!quote.ready) throw new Error(`This video is not ready to create: ${quote.message}`);
    // The planner keeps subjective creative notes for review. They do not block a user's explicit Create action.
    const directPlan = readProductionPlan(v.production_plan);
    const directMetadata = snapshotRecord(snapshotRecord(v.production_plan)?.["direct_video"]);
    const silentDirect = directMetadata?.["audio_mode"] === "silent" && directPlan.steps.length === 1 && directPlan.steps[0]?.role === "finished_video"
      && (directPlan.steps[0].settings["generate_audio"] === false || directPlan.steps[0].settings["sound"] === "off");
    if (!v.voiceover.trim() && !silentDirect) throw new Error("Add a voiceover script first.");
    if (silentDirect) return;
    // Admission and allowance are checked atomically in admit_creative_render.

    const { resolveElevenLabsKey } = await import("./integrations.server");
    const [voiceSettings, batchVoice] = await Promise.all([
      admin.from("workspace_voice_settings").select("brand_voice_id,auto_pick").eq("workspace_id", v.workspace_id).maybeSingle(),
      admin.from("creative_batches").select("voice_id").eq("id", v.batch_id).maybeSingle(),
    ]);
    if (voiceSettings.error || batchVoice.error) throw new Error("Couldn't check this video's voice settings.");
    const voiceId = resolveVoice(v.voice_id, snapshotRecord(v.production_plan)?.["standalone"] === true ? null : voiceSettings.data, batchVoice.data?.voice_id);
    if (voiceSource(voiceId) === "elevenlabs" && !(await resolveElevenLabsKey(v.workspace_id))) throw new Error("This video's voice is an ElevenLabs voice, but no ElevenLabs key is set. Pick a built-in voice or add a key.");
});

type RetryOutput = { path: string; kind: "image" | "video"; mime: string; bytes: number; stepId: string };
export type ProductionRetrySeed = { source_render_id: string; outputs: Record<string, RetryOutput> };
type ProductionRequest = { server_received_at: string; run_id: string; expected_count: number };
const productionRequest = (): ProductionRequest => ({ server_received_at: new Date().toISOString(), run_id: crypto.randomUUID(), expected_count: 1 });
type RetryLedgerStep = { id: string; step_key: string; status: string; provider: string; model: string; provider_job_id: string | null; output_storage_path: string | null; error_code: string | null };

/** Carry only completed, ledger-backed assets from the exact failed attempt. */
export function buildProductionRetrySeed(source: Pick<RenderRow, "id" | "workspace_id" | "status" | "production_state" | "brief_snapshot">, steps: RetryLedgerStep[]): ProductionRetrySeed {
  if (source.status !== "failed" || !hasBriefSnapshot(source.brief_snapshot)) throw new Error("Choose a failed production with its original saved brief.");
  if (steps.some((step) => step.provider !== "autosocials" && !["completed", "failed"].includes(step.status))) throw new Error("An earlier paid operation is active or uncertain. Reconcile it before retrying.");
  const definiteNoJobFailures = new Set(["provider_rejected", "authentication_failed", "rate_limited", "invalid_input", "not_configured", "production_preflight_failed", "provider_stream_failed", "http_400", "http_401", "http_403", "http_404", "http_413", "http_415", "http_422", "http_429", "user_confirmed_retry_after_unknown"]);
  if (steps.some((step) => step.provider !== "autosocials" && step.status === "failed" && !step.provider_job_id && !definiteNoJobFailures.has(step.error_code ?? ""))) throw new Error("A failed provider operation has no confirmed job identity or definite rejection. Reconcile it before retrying.");
  const state = source.production_state;
  if (!state || typeof state !== "object" || Array.isArray(state) || state["engine_version"] !== 1) throw new Error("This older production cannot safely reuse individual assets.");
  const outputs = state["outputs"];
  const plan = readProductionPlan(snapshotRecord(source.brief_snapshot)?.["production_plan"]);
  const carried: Record<string, RetryOutput> = {};
  for (const [id, value] of Object.entries(outputs && typeof outputs === "object" && !Array.isArray(outputs) ? outputs : {})) {
    const step = plan.steps.find((candidate) => candidate.id === id);
    const ledger = steps.find((candidate) => candidate.step_key === `provider:${id}`);
    if (!step || !ledger || ledger.status !== "completed" || !ledger.output_storage_path) throw new Error("A saved production asset has no confirmed completion record.");
    // An avatar is tied to the exact narration of its original render. A new
    // attempt gets a new recording and must never reuse the old lip movements.
    if (step.capability_id === "heygen-avatar") continue;
    const capability = getCreativeCapability(step.capability_id);
    if (ledger.provider !== capability.provider || ledger.model !== (capability.endpoint ?? capability.id)) throw new Error("A saved production asset does not match its provider operation.");
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("A saved production asset is invalid.");
    const output = value as Record<string, unknown>;
    const path = ledger.output_storage_path;
    const prefix = `${source.workspace_id}/renders/${source.id}/`;
    if (output["path"] !== path || !path.startsWith(prefix) || !/^[a-z][a-z0-9_-]{0,30}\.(mp4|webm|png|jpe?g|webp)$/i.test(path.slice(prefix.length)) || path.slice(prefix.length).split(".")[0] !== id) throw new Error("A saved production asset is outside this attempt.");
    if (output["kind"] !== capability.output || typeof output["mime"] !== "string") throw new Error("A saved production asset has invalid media metadata.");
    carried[id] = { path, kind: output["kind"] as "image" | "video", mime: output["mime"], bytes: typeof output["bytes"] === "number" && Number.isFinite(output["bytes"]) && output["bytes"] >= 0 ? output["bytes"] : 0, stepId: ledger.id };
  }
  return { source_render_id: source.id, outputs: carried };
}

function retryOutputsForQueuedJob(job: RenderRow): Record<string, RetryOutput> {
  const raw = snapshotRecord(job.brief_snapshot)?.["production_retry"];
  if (!raw) return {};
  const output = z.object({ path: z.string(), kind: z.enum(["image", "video"]), mime: z.string(), bytes: z.number().finite().nonnegative(), stepId: z.string().uuid() }).strict();
  const seed = z.object({ source_render_id: z.string().uuid(), outputs: z.record(z.string(), output) }).strict().parse(raw);
  const ids = new Set(readProductionPlan(snapshotRecord(job.brief_snapshot)?.["production_plan"]).steps.map((step) => step.id));
  for (const [id, value] of Object.entries(seed.outputs)) {
    const prefix = `${job.workspace_id}/renders/${seed.source_render_id}/`;
    if (!ids.has(id) || !value.path.startsWith(prefix) || !/^[a-z][a-z0-9_-]{0,30}\.(mp4|webm|png|jpe?g|webp)$/i.test(value.path.slice(prefix.length)) || value.path.slice(prefix.length).split(".")[0] !== id) throw new Error("A queued retry asset has invalid ownership.");
  }
  return seed.outputs;
}

/** Price a retry from the saved failed attempt without mutating its ledger. */
export const getRetryProductionQuote = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ variant_id: z.string().uuid(), render_id: z.string().uuid() }).strict().parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser(), admin = getAdminClient();
    const variant = await admin.from("creative_variants").select("*").eq("id", data.variant_id).single();
    if (variant.error || !variant.data) throw new Error("Video unavailable.");
    await assertMember(user.id, variant.data.workspace_id);
    const source = await admin.from("render_jobs").select("*").eq("id", data.render_id).eq("variant_id", data.variant_id).eq("workspace_id", variant.data.workspace_id).single();
    if (source.error || !source.data) throw new Error("This failed attempt is unavailable.");
    const steps = await (await import("./generation-tracker.server")).listRenderSteps(source.data.id, admin);
    const seed = buildProductionRetrySeed(source.data, steps);
    const completedStepIds = Object.keys(seed.outputs).sort();
    const changed = source.data.version !== variant.data.version || JSON.stringify(assetBriefSnapshot(assetWithSnapshot(variant.data, source.data.brief_snapshot))) !== JSON.stringify(assetBriefSnapshot(variant.data));
    if (changed && completedStepIds.length) throw new Error("This failed attempt no longer matches the current brief. Create the updated version without reusing old scenes.");
    const db = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const original = await db.from("content_credit_reservations").select("id").eq("workspace_id", variant.data.workspace_id).eq("request_key", `render:${source.data.id}`).maybeSingle();
    if (original.error || !original.data) throw new Error("The original credit reservation is unavailable for reconciliation.");
    const { quoteProductionCredits } = await import("./content-credits.server");
    const brief = changed ? variant.data : assetWithSnapshot(variant.data, source.data.brief_snapshot);
    const price = await quoteProductionCredits(db, brief.production_plan, brief.duration_s, completedStepIds);
    if (!price.lines.length || price.credits < 1) throw new Error("This recovery has no new paid steps and needs manual reconciliation.");
    return { sourceRenderId: source.data.id, creditVersion: variant.data.version, creditCost: price.credits, creditLines: price.lines, completedStepIds };
  });

/** Explicit retry resumes only missing work; completed scenes are retained in owned storage. */
export const retryFailedProduction = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ variant_id: z.string().uuid(), render_id: z.string().uuid(), confirmed: z.literal(true), expected_version: z.number().int().optional(), expected_credits: z.number().int().positive().optional(), expected_rate_id: z.string().uuid().optional(), expected_lines: creditLinesSchema.optional(), expected_completed_step_ids: z.array(z.string().max(31)).max(6).optional() }).strict().parse(i))
  .handler(async ({ data }) => {
    const request = productionRequest();
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: variant, error: variantError } = await admin.from("creative_variants").select("*").eq("id", data.variant_id).single();
    if (variantError || !variant) throw new Error("Video unavailable.");
    await assertMember(user.id, variant.workspace_id);
    const { data: source, error: sourceError } = await admin.from("render_jobs").select("*").eq("id", data.render_id).eq("variant_id", variant.id).eq("workspace_id", variant.workspace_id).single();
    if (sourceError || !source) throw new Error("This failed attempt is unavailable.");
    const changed = source.version !== variant.version || (source.brief_snapshot && JSON.stringify(assetBriefSnapshot(assetWithSnapshot(variant, source.brief_snapshot))) !== JSON.stringify(assetBriefSnapshot(variant)));
    const { listRenderSteps } = await import("./generation-tracker.server");
    const steps = await listRenderSteps(source.id, admin);
    const uncertain = steps.filter((step) => step.provider !== "autosocials" && ["reserved", "submitted", "running", "reconciliation_required"].includes(step.status));
    if (uncertain.length) {
      throw new Error("This provider request is still active or uncertain. Reconcile it before retrying.");
    }
    const seed = buildProductionRetrySeed(source, steps);
    // An edited brief can be retried only without mixing in completed old scenes.
    if (changed && Object.keys(seed.outputs).length) throw new Error("This failed attempt no longer matches the current brief. Create the updated version without reusing old scenes.");
    const active = await admin.from("render_jobs").select("id,version").eq("variant_id", variant.id).in("status", ["queued", "preparing", "rendering"]).limit(1).maybeSingle();
    if (active.error) throw new Error("The current production status could not be checked.");
    if (active.data) {
      if (active.data.version !== variant.version) throw new Error("A different version of this video is already active.");
      return { render_id: active.data.id, reused_assets: Object.keys(seed.outputs).length };
    }
    const completedStepIds = Object.keys(seed.outputs).sort();
    if (JSON.stringify([...(data.expected_completed_step_ids ?? [])].sort()) !== JSON.stringify(completedStepIds)) throw new Error("The recovered assets changed. Review the retry quote again.");
    const db = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const original = await db.from("content_credit_reservations").select("id").eq("workspace_id", variant.workspace_id).eq("request_key", `render:${source.id}`).maybeSingle();
    if (original.error || !original.data) throw new Error("The original credit reservation is unavailable for reconciliation.");
    const reconciled = await db.rpc("reconcile_failed_composite_credit_reservation", { _reservation_id: original.data.id });
    if (reconciled.error || !reconciled.data || reconciled.data.uncertain !== false || !Array.isArray(reconciled.data.settled_steps) || completedStepIds.some((id) => !reconciled.data.settled_steps.includes(`provider:${id}`))) throw new Error("The original credit reservation needs reconciliation before retrying.");
    const renderId = await queueRender(admin, user.id, variant.id, changed ? "Start updated brief after confirmed retry; no old outputs reused." : "Retry unfinished work; reuse completed production assets.", "user", changed ? undefined : { source, seed }, request, { version: data.expected_version, credits: data.expected_credits, rateId: data.expected_rate_id, lines: data.expected_lines });
    await kickCreativeJobs(admin);
    return { render_id: renderId, reused_assets: Object.keys(seed.outputs).length };
  });

export const queueRender = createServerOnlyFn(async function queueRender(admin: Admin, userId: string, variantId: string, revisionNote?: string, initiator: "user" | "sam" = "user", retry?: { source: RenderRow; seed: ProductionRetrySeed }, request = productionRequest(), approval?: { version?: number; credits?: number; rateId?: string; lines?: import("./content-credits.server").CreditQuoteLine[] }) {
    const { data: v } = await admin.from("creative_variants").select("*").eq("id", variantId).single();
    if (!v) throw new Error("Not found");
    await assertMember(userId, v.workspace_id);
    if (approval?.version !== undefined && approval.version !== v.version) throw new Error("This video changed. Review its updated plan and price before creating it.");
    const { data: active, error: activeError } = await admin.from("render_jobs").select("id,version").eq("variant_id", v.id).in("status", ["queued", "preparing", "rendering"]).limit(1).maybeSingle();
    if (activeError) throw new Error(activeError.message);
    if (active) {
      if (active.version !== v.version) throw new Error("A different version of this video is already active.");
      return active.id;
    }
    const { pinProductionDna } = await import("./brand-dna-store.server");
    const previousDnaId = retry ? snapshotRecord(retry.source.brief_snapshot)?.["brand_dna_version_id"] : undefined;
    const brief = retry ? assetWithSnapshot(v, retry.source.brief_snapshot) : v;
    const standalone = snapshotRecord(brief.production_plan)?.["standalone"] === true;
    // Legacy retries retain their original unversioned identity; new work is atomically pinned.
    const dna = standalone || (retry && typeof previousDnaId !== "string") ? null : await pinProductionDna(admin, v.workspace_id, `video:${request.run_id}:${v.id}`, typeof previousDnaId === "string" ? previousDnaId : undefined);
    const dnaVersionId = dna?.id ?? null;
    if (retry && retry.source.version !== v.version) throw new Error("The video changed before its retry was queued.");
    try { await preflightRender(admin, userId, brief); }
    catch (error) {
      // No admission was dispatched: manual creation can safely revise this rejected setup.
      throw Object.assign(error instanceof Error ? error : new Error("Production checks failed."), { modelCreateSafeToRevise: true });
    }
    const creditDb = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const { quoteProductionCredits, assertApprovedProductionQuote } = await import("./content-credits.server");
    const rate = await quoteProductionCredits(creditDb, brief.production_plan, brief.duration_s, retry ? Object.keys(retry.seed.outputs) : []);
    const credits = rate.credits;
    assertApprovedProductionQuote(approval, v.version, rate);
    const period = await creditDb.rpc("ensure_free_content_credit_period", { _workspace_id: v.workspace_id, _user_id: userId });
    if (period.error) throw Object.assign(new Error("The workspace's credit allowance could not be established. No video was started."), { modelCreateSafeToRevise: true });
    const ins = await creditDb.rpc("admit_composite_credit_render", { _variant_id: v.id, _expected_version: v.version, _user_id: userId,
      _brief_snapshot: { ...snapshotRecord(assetBriefSnapshot({ ...brief, review_state: "draft" })), production_request: request, brand_dna_version_id: dnaVersionId, ...(retry ? { production_retry: retry.seed } : {}) }, _revision_note: revisionNote ?? null, _lines: rate.lines });
    if (ins.error?.code === "P0001" && ins.error.message.includes("Insufficient credits")) {
      const { attemptCreditAutoUpgrade } = await import("./content-credits.server");
      if (await attemptCreditAutoUpgrade(v.workspace_id, `video:${v.id}:${v.version}`, credits)) throw new Error("Your upgrade payment is pending. Try again after payment is confirmed.");
      throw new Error("Not enough credits for this video. Upgrade or wait for your next monthly allowance.");
    }
    if (ins.error) throw Object.assign(new Error(ins.error.message), {
      // Transport failures may hide a successful admission. Only explicit database rejections are terminal.
      modelCreateSafeToRevise: ["P0001", "23514", "42501", "22023"].includes(ins.error.code),
    });
    const admission = z.object({ render_id: z.string().uuid(), reused: z.boolean() }).parse(ins.data);
    if (admission.reused) return admission.render_id;
    try {
      const { beginStep, previousGenerationStep } = await import("./generation-tracker.server");
      const previous = await previousGenerationStep(v.id, "production", admission.render_id, admin);
      const root = await beginStep({ renderJobId: admission.render_id, workspaceId: v.workspace_id, variantId: v.id, userId, initiator, stepKey: "production", provider: "autosocials", model: "creative-engine-v1", operation: "produce_video", ...(previous ? { retryOfStepId: previous.id } : {}) }, admin);
      const linked = await admin.from("render_jobs").update({ production_state: { engine_version: 1, outputs: retry?.seed.outputs ?? {}, rootStepId: root.step.id } }).eq("id", admission.render_id).eq("status", "queued");
      if (linked.error) throw new Error("Could not link this production attempt.");
    } catch {
      const stopped = await admin.from("render_jobs").update({ status: "failed", error: "Production history could not be reserved." }).eq("id", admission.render_id).eq("status", "queued").eq("phase", "queued").select("id").maybeSingle();
      if (stopped.data) {
        const { resolveRenderCredits } = await import("./content-credits.server");
        await resolveRenderCredits(creditDb, v.workspace_id, admission.render_id, "released");
        throw new Error("Production history could not be reserved. No generation was started.");
      }
      throw new Error("Production setup needs reconciliation before another request can be started.");
    }
    if (!v.primary_render_id) await admin.from("creative_variants").update({ review_state: "draft" }).eq("id", v.id).eq("version", v.version);
    return admission.render_id;
});

/** Wake the authenticated background worker; the database schedule is the durable fallback. */
export const kickCreativeJobs = createServerOnlyFn(async function kickCreativeJobs(admin: Admin) {
  const wake = await admin.rpc("advance_creative_engine_jobs");
  if (wake.error) console.warn("Creative worker wake failed; the scheduled continuation will retry.");
});

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_ASSET_BYTES = 36 * 1024 * 1024; // base64 grows ~33%; AutoToast caps requests at 60 MB

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const extOf = (name: string, mime: string | null) => (name.match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? mime?.split("/")[1]?.replace("jpeg", "jpg").replace("svg+xml", "svg") ?? "png").toLowerCase();

/**
 * The brief's hand-picked brand files, packed for HyperFrames (renders run offline):
 * Lovable Cloud images go in as base64 project files, AutoToast-stored clips by media_id.
 * Falls back to the workspace's latest logo when the brief has none.
 */
const loadRenderAssets = createServerOnlyFn(async function loadRenderAssets(admin: Admin, ws: string, ids: string[], selectedFilesOnly = false) {
  type Row = { id: string; kind: string; mime: string | null; name: string; storage_path: string | null; media_id: string | null; size_bytes: number | null; ai_summary: string | null; width: number | null; height: number | null; has_alpha: boolean | null; bg_tone: string | null; media_role: string | null; subject: string | null; inspected_at: string | null };
  const cols = "id,kind,mime,name,storage_path,media_id,size_bytes,ai_summary,width,height,has_alpha,bg_tone,media_role,subject,inspected_at";
  const picked = ids.length ? ((await admin.from("brand_files").select(cols).eq("workspace_id", ws).in("id", ids)).data ?? []) as Row[] : [];
  const rows = ids.map((id) => picked.find((r) => r.id === id)).filter((r): r is Row => !!r);
  if (!selectedFilesOnly && !rows.some((r) => r.kind === "logo")) {
    const { data: lg } = await admin.from("brand_files").select(cols).eq("workspace_id", ws).eq("kind", "logo").order("created_at", { ascending: false }).limit(1);
    if (lg?.[0]) rows.unshift(lg[0] as Row);
  }
  const { inspectImage } = await import("./media-inspect.server");
  const { treatment } = await import("./film-qa");
  const files: Record<string, string | { base64: string } | { media_id: string }> = {};
  const media: { path: string; type: "image" | "video" }[] = [];
  const catalog: { path: string; name: string; kind: string; summary: string }[] = [];
  const images: { path: string; dataUrl: string }[] = [];
  let logo: string | null = null; let total = 0;
  for (const f of rows) {
    const ownedStorage = !!f.storage_path?.startsWith(`${ws}/`) && !f.storage_path.split("/").some((part) => !part || part === "." || part === "..") && !f.storage_path.includes("\\");
    const isVideo = f.kind === "video" || (f.mime ?? "").startsWith("video/");
    if (isVideo) {
      if (f.media_id && f.storage_path === `autotoast:${f.media_id}`) { const p = `assets/${f.id}.mp4`; files[p] = { media_id: f.media_id }; media.push({ path: p, type: "video" }); catalog.push({ path: p, name: f.name, kind: "video", summary: (f.ai_summary ?? "Uploaded clip; no current temporal inspection.").slice(0, 160) }); }
      else if (ownedStorage && (f.size_bytes ?? 0) <= MAX_ASSET_BYTES && total + (f.size_bytes ?? 0) <= MAX_ASSET_BYTES) {
        const result = await admin.storage.from("brand-assets-private").download(f.storage_path!);
        if (!result.error && result.data && result.data.size + total <= MAX_ASSET_BYTES) {
          const bytes = new Uint8Array(await result.data.arrayBuffer());
          const identified = (await import("./creative-media.server")).inspectCreativeMediaBytes(bytes, "video");
          if (identified) {
            total += bytes.byteLength;
            const p = `assets/${f.id}.${identified.extension}`;
            files[p] = { base64: Buffer.from(bytes).toString("base64") }; media.push({ path: p, type: "video" });
            catalog.push({ path: p, name: f.name, kind: "video", summary: (f.ai_summary ?? "Owned uploaded footage. No current temporal inspection; do not infer unseen actions or claims.").slice(0, 500) });
          }
        }
      }
      continue;
    }
    if (!(f.kind === "logo" || f.kind === "image" || (f.mime ?? "").startsWith("image/")) || !ownedStorage) continue;
    const size = f.size_bytes ?? 0;
    if (size > MAX_IMAGE_BYTES || total + size > MAX_ASSET_BYTES) continue;
    const dl = await admin.storage.from("brand-assets-private").download(f.storage_path!);
    if (dl.error || !dl.data) continue;
    const buf = await dl.data.arrayBuffer();
    if (buf.byteLength > MAX_IMAGE_BYTES || total + buf.byteLength > MAX_ASSET_BYTES) continue;
    total += buf.byteLength;
    const p = `assets/${f.id}.${extOf(f.name, f.mime)}`;
    const b64 = toBase64(buf);
    files[p] = { base64: b64 };
    // Look at the pixels once; every later video reuses the saved inspection.
    const m = f.inspected_at ? { width: f.width, height: f.height, has_alpha: f.has_alpha, bg_tone: f.bg_tone as never, media_role: f.media_role as never, subject: f.subject }
      : await inspectImage(admin, f.id, f.kind, f.mime ?? "image/png", buf);
    const facts = [m.media_role, m.width && m.height ? `${m.width}x${m.height}` : null, m.has_alpha ? "transparent" : "opaque", m.bg_tone ? `${m.bg_tone} background` : null, m.subject].filter(Boolean).join(", ");
    catalog.push({ path: p, name: f.name, kind: f.kind, summary: `${facts}. Treatment: ${treatment(m)}. ${(f.ai_summary ?? "").slice(0, 120)}` });
    if (images.length < 6 && buf.byteLength < 1_500_000) images.push({ path: p, dataUrl: `data:${f.mime || "image/png"};base64,${b64}` });
    if ((f.kind === "logo" || m.media_role === "logo") && !logo) logo = p; else media.push({ path: p, type: "image" });
  }
  return { files, media, logo, catalog, images };
});

/** Claim global slots atomically, then advance independent videos together. */
const pump = createServerOnlyFn(async function pump(admin: Admin) {
  const configured = Number(process.env["CREATIVE_GLOBAL_ACTIVE_VIDEOS"] ?? RENDER_CONCURRENCY);
  const globalLimit = Number.isInteger(configured) && configured > 0 ? Math.min(configured, 16) : RENDER_CONCURRENCY;
  // A Vercel worker has a five-minute ceiling. Keep each invocation focused on
  // one asset so a multi-video batch cannot make every render share that limit.
  const claim = await admin.rpc("claim_creative_render_jobs", { _max_claims: 1, _global_limit: globalLimit });
  if (claim.error) throw new Error(claim.error.message);
  const ids = claim.data ?? [];
  if (!ids.length) return;
  const { data: queued, error: queuedError } = await admin.from("render_jobs").select("*").in("id", ids);
  if (queuedError) throw new Error(queuedError.message);
  const { pickPalette, synthesiseVoice, synthesiseBuiltInVoice, submitRenderJob } = await import("./render.server");
  const { resolveElevenLabsKey } = await import("./integrations.server");
  const processJob = async (j: RenderRow) => {
    try {
      const { beginStep, updateStep, previousGenerationStep } = await import("./generation-tracker.server");
      const root = await beginStep({ renderJobId: j.id, workspaceId: j.workspace_id, variantId: j.variant_id, userId: j.created_by, initiator: "user", stepKey: "production", provider: "autosocials", model: "creative-engine-v1", operation: "produce_video" }, admin);
      await updateStep(root.step.id, { status: "running" }, admin);
      const { withProductionTrace } = await import("./generation-context.server");
      await withProductionTrace({ admin, renderJobId: j.id, workspaceId: j.workspace_id, variantId: j.variant_id, userId: j.created_by, rootStepId: root.step.id }, async () => {
      const { data: live } = await admin.from("creative_variants").select("*").eq("id", j.variant_id!).single();
      if (!live) throw new Error("Video card was removed.");
      const v = assetWithSnapshot(live, j.brief_snapshot);
      const standalone = snapshotRecord(v.production_plan)?.["standalone"] === true;
      const selectedFilesOnly = standalone || snapshotRecord(v.production_plan)?.["selected_files_only"] === true;
      const dnaId = snapshotRecord(j.brief_snapshot)?.["brand_dna_version_id"];
      const dna = !standalone && typeof dnaId === "string" ? await (await import("./brand-dna-store.server")).readProductionDna(admin, j.workspace_id, dnaId) : null;
      const { advanceProduction, productionCompositionAssets } = await import("./production.server");
      const currentState = j.production_state && typeof j.production_state === "object" && !Array.isArray(j.production_state) ? j.production_state : {};
      const currentOutputs = currentState["outputs"] && typeof currentState["outputs"] === "object" && !Array.isArray(currentState["outputs"]) ? currentState["outputs"] : {};
      const retryOutputs = retryOutputsForQueuedJob(j);
      const productionState = { ...currentState, outputs: { ...retryOutputs, ...currentOutputs }, rootStepId: root.step.id };
      const reaction = readProductionPlan(v.production_plan).steps.some((step) => step.capability_id === "heygen-avatar");
      let reactionAudioPath = j.audio_path;
      if (reaction && !reactionAudioPath) {
        const [{ data: voiceSettings, error: voiceError }, { data: batchVoice, error: batchError }] = await Promise.all([
          standalone ? { data: null, error: null } : admin.from("workspace_voice_settings").select("brand_voice_id,auto_pick").eq("workspace_id", j.workspace_id).maybeSingle(),
          admin.from("creative_batches").select("voice_id").eq("id", v.batch_id).maybeSingle(),
        ]);
        if (voiceError || batchError) throw new Error("Could not check the selected narration voice.");
        const selectedVoice = resolveVoice(v.voice_id, voiceSettings, batchVoice?.voice_id);
        const narrationProvider = voiceSource(selectedVoice) === "builtin" ? "openai" : "elevenlabs";
        // The exact same recording must drive HeyGen and the finished render. Reserve it
        // before any paid request; an interrupted request is never silently repeated.
        const narration = await beginStep({ renderJobId: j.id, workspaceId: j.workspace_id, variantId: v.id, userId: j.created_by, initiator: "sam", stepKey: "reaction-narration", parentStepId: root.step.id, provider: narrationProvider, model: "narration", operation: "synthesise_reaction_narration" }, admin);
        if (!narration.created) {
          if (narration.step.status !== "completed" || !narration.step.output_storage_path) throw new Error("The previous narration attempt requires reconciliation before another paid request.");
          reactionAudioPath = narration.step.output_storage_path;
        } else {
          let narrationRequested = false, narrationReturned = false;
          try {
            const voiceKey = voiceSource(selectedVoice) === "builtin" ? null : await resolveElevenLabsKey(j.workspace_id);
            if (voiceSource(selectedVoice) !== "builtin" && !voiceKey) throw new Error("No ElevenLabs key is set.");
            await updateStep(narration.step.id, { status: "submitted" }, admin);
            narrationRequested = true;
            const audio = voiceSource(selectedVoice) === "builtin"
              ? await synthesiseBuiltInVoice(selectedVoice.slice(BUILTIN_PREFIX.length), v.voiceover)
              : await synthesiseVoice(voiceKey!.key, selectedVoice, v.voiceover);
            narrationReturned = true;
            const length = await import("./film-length");
            const wav = length.parseWav(audio);
            if (!wav || length.narrationFit(length.wavSeconds(wav), v.duration_s) === "long" || length.narrationFit(length.wavSeconds(wav), v.duration_s) === "short") throw new Error("The narration does not fit the selected video duration. Adjust the script before creating this video.");
            reactionAudioPath = `${j.workspace_id}/renders/${j.id}.reaction.wav`;
            const saved = await admin.storage.from("brand-assets-private").upload(reactionAudioPath, audio, { contentType: "audio/wav", upsert: false });
            if (saved.error) throw new Error("Could not save reaction narration.");
            await (await import("./generation-tracker.server")).completeStep(narration.step.id, { outputStoragePath: reactionAudioPath }, admin);
          } catch (e) {
            await (await import("./generation-tracker.server")).failStep(narration.step.id, narrationReturned || !narrationRequested ? "production_preflight_failed" : "narration_reconciliation_required", narrationRequested && !narrationReturned, admin);
            throw e;
          }
        }
        const saved = await admin.from("render_jobs").update({ audio_path: reactionAudioPath }).eq("id", j.id).eq("status", "preparing").select("id").maybeSingle();
        if (saved.error || !saved.data) throw new Error("The saved narration needs reconciliation before production can continue.");
      }
      if (Object.keys(retryOutputs).length) {
        const seeded = await admin.from("render_jobs").update({ production_state: productionState as never }).eq("id", j.id).eq("status", "preparing").select("id").maybeSingle();
        if (seeded.error || !seeded.data) throw new (await import("./production.server")).RecoverableProductionError();
      }
      const production = await advanceProduction(admin, { ...j, audio_path: reactionAudioPath, production_state: productionState as never }, v);
      if (production.waiting) {
        await admin.from("render_jobs").update({ status: "rendering", phase: "provider_assets", phase_claimed_at: null, production_state: production.state as never }).eq("id", j.id);
        return;
      }
      if (production.finalOutput) {
        await completeProviderFilm(admin, j, production.finalOutput.path);
        return;
      }
      const [{ data: vs }, { data: prof }, { data: wsRow }] = await Promise.all([
        standalone ? { data: null } : admin.from("workspace_voice_settings").select("brand_voice_id,auto_pick").eq("workspace_id", j.workspace_id).maybeSingle(),
        standalone ? { data: null } : admin.from("brand_profiles").select("profile").eq("workspace_id", j.workspace_id).maybeSingle(),
        standalone ? { data: null } : admin.from("workspaces").select("name").eq("id", j.workspace_id).single(),
      ]);
      const { data: bt } = await admin.from("creative_batches").select("voice_id").eq("id", v.batch_id).maybeSingle();
      const voiceId = resolveVoice(v.voice_id, vs, bt?.voice_id);
      if (!v.build_prompt?.trim()) {
        const [pb, compositor] = await Promise.all([import("./playbook.server"), import("./composition.server")]);
        const [kit, facts, assets] = await Promise.all([standalone ? { text: "" } : compositor.loadMotionKit(admin, j.workspace_id), standalone ? null : pb.getFacts(admin, j.workspace_id), loadRenderAssets(admin, j.workspace_id, v.file_ids ?? [], selectedFilesOnly)]);
        const out = await pb.writeBuildPrompt({ id: v.id, hook: v.hook, narrative: v.narrative ?? v.angle, argument: v.argument, beats: (v.beats as string[]) ?? [], voiceover: v.voiceover, cta: v.cta, script: v.script, duration_s: v.duration_s, size: v.size, production_plan: v.production_plan, files: assets.catalog.map((f) => ({ path: f.path, name: f.name, note: f.summary })) }, { brand: wsRow?.name ?? "", kit: kit.text, facts, otherOpenings: [] });
        if (!out || out.issues.length) {
          await admin.from("creative_variants").update({ build_prompt_issues: out?.issues.length ? out.issues : ["Build prompt preparation failed."] }).eq("id", v.id).eq("version", j.version ?? v.version);
          throw new Error("The build prompt has unresolved checks. No paid voice was generated.");
        }
        // The queued immutable brief's narration remains the approved source of truth.
        v.build_prompt = out.markdown;
        const prepared = await admin.from("render_jobs").update({ brief_snapshot: { ...snapshotRecord(assetBriefSnapshot(v)), brand_dna_version_id: dnaId ?? null }, phase_claimed_at: new Date().toISOString() }).eq("id", j.id).eq("status", "preparing");
        if (prepared.error) throw new Error("Could not save the prepared build prompt.");
      }
      // Voice is WAV (24 kHz PCM); the film length comes from durationSeconds on the render job.
      const ext = "wav"; const mime = "audio/wav";
      let alignment: Parameters<typeof import("./film-qa").alignmentToWords>[0] | null = null;
      const fl = await import("./film-length");
      const speak = async (text: string) => {
        if (voiceSource(voiceId) === "builtin") return { audio: await synthesiseBuiltInVoice(voiceId.slice(BUILTIN_PREFIX.length), text), alignment: null };
        const key = await resolveElevenLabsKey(j.workspace_id);
        if (!key) throw new Error("No ElevenLabs key is set.");
        const { synthesiseVoiceTimed } = await import("./render.server");
        // An ambiguous paid voice request must not silently create a second recording.
        return synthesiseVoiceTimed(key.key, voiceId, text);
      };
      const spokenSecs = (a: ArrayBuffer, al: typeof alignment) => {
        if (al) return Math.max(...al.character_end_times_seconds, 0);
        const w = fl.parseWav(a); return w ? fl.wavSeconds(w) : 0;
      };
      const reactionAudio = reaction && reactionAudioPath ? await admin.storage.from("brand-assets-private").download(reactionAudioPath) : null;
      if (reaction && (!reactionAudio || reactionAudio.error || !reactionAudio.data)) throw new Error("The saved reaction narration is unavailable.");
      const spoken = reactionAudio?.data ? { audio: await reactionAudio.data.arrayBuffer(), alignment: null } : await speak(v.voiceover);
      const secs = spokenSecs(spoken.audio, spoken.alignment);
      const fit = fl.narrationFit(secs, v.duration_s);
      if (fit === "short" || fit === "long") {
        const msg = `The approved narration runs ${secs.toFixed(1)}s for a ${v.duration_s}s video. Edit the script or choose another duration, then approve it again.`;
        await admin.from("render_jobs").update({ qa_issues: [msg] }).eq("id", j.id);
        throw new Error(msg);
      }
      const holdS = Math.max(0, v.duration_s - secs);
      const lengthNotes = fit === "warn" ? [`Voiceover is ${secs.toFixed(0)}s; visuals hold the last ${holdS.toFixed(0)}s.`] : [];
      const holdPrompt = fit === "warn" ? `The voiceover ends at ${secs.toFixed(1)}s but the film is ${v.duration_s}s. Extend the final approved scene with motion for ${holdS.toFixed(1)}s and preserve its copy.` : "";
      alignment = spoken.alignment;
      // Length is set on the render job (durationSeconds), so the voiceover no longer needs silence padding.
      const soundtrack = await (await import("./production-audio.server")).loadApprovedSoundtrack(admin, j.workspace_id, v.production_plan);
      const audio = soundtrack ? (await import("./production-audio")).mixNarrationAndMusic(spoken.audio, soundtrack, v.duration_s) : spoken.audio;
      const audioPath = reaction && !soundtrack && reactionAudioPath ? reactionAudioPath : `${j.workspace_id}/renders/${j.id}.${ext}`;
      if (audioPath !== reactionAudioPath) {
        const up = await admin.storage.from("brand-assets-private").upload(audioPath, audio, { contentType: mime, upsert: true });
        if (up.error) throw new Error("Couldn't store the voiceover.");
      }
      const signed = await admin.storage.from("brand-assets-private").createSignedUrl(audioPath, 3600);
      if (!signed.data?.signedUrl) throw new Error("Couldn't share the voiceover with the render server.");
      const profile = (prof?.profile ?? {}) as { name?: string; colours?: unknown; palette?: { primary?: string | null; accent?: string | null; background?: string | null; text?: string | null } };
      const assets = await loadRenderAssets(admin, j.workspace_id, v.file_ids ?? [], selectedFilesOnly);
      const selectedDnaLogo = dna?.dna.assets.find(a => a.id === dna.dna.logoId && a.kind === "logo" && a.reusable && a.path?.startsWith(`${j.workspace_id}/`) && !a.path.includes("\\") && !a.path.split("/").some(p => !p || p === "." || p === ".."));
      if (selectedDnaLogo?.path) {
        const bytes = await (await import("./brand-dna-store.server")).readDnaBytes(admin, j.workspace_id, selectedDnaLogo.path);
        if (bytes.length > MAX_IMAGE_BYTES) throw new Error("The saved Brand DNA logo is too large.");
        const sharp = (await import("sharp")).default;
        const png = await sharp(bytes, { limitInputPixels: 20_000_000 }).rotate().png().toBuffer();
        const path = "assets/brand-dna-logo.png";
        assets.files[path] = { base64: png.toString("base64") };
        assets.catalog.unshift({ path, name: selectedDnaLogo.label, kind: "logo", summary: "Selected Brand DNA logo. Treatment: as-logo. Use the actual supplied mark; never recreate it." });
        assets.images.unshift({ path, dataUrl: `data:image/png;base64,${png.toString("base64")}` });
        assets.logo = path;
      }
      const generated = await productionCompositionAssets(admin, j.workspace_id, production.state);
      Object.assign(assets.files, generated.files);
      assets.catalog.push(...generated.catalog);
      const dnaColour = (role: RegExp) => dna?.dna.colours.find(c => role.test(c.role))?.hex;
      const palette = dna ? pickPalette(undefined, { primary: dnaColour(/primary/i) ?? null, accent: dnaColour(/accent|secondary/i) ?? null, background: dnaColour(/background|surface/i) ?? null, text: dnaColour(/text|foreground/i) ?? null }) : pickPalette(profile.colours, profile.palette);
      const brand = dna?.dna.name || profile.name || wsRow?.name || "";
      // Sam designs the video from the brand's motion kit. There is no silent fallback:
      // a design that fails the checks is reported, never quietly swapped for the old template.
      const { loadMotionKit, kitFont, loadBrandFont, designComposition } = await import("./composition.server");
      const qa = await import("./film-qa");
      const kit = standalone ? { text: "" } : await loadMotionKit(admin, j.workspace_id);
      const family = dna?.dna.fonts[0]?.family || kitFont(kit.text, (profile as { fonts?: unknown }).fonts);
      let font = await loadBrandFont(family);
      const fontAsset = dna?.dna.assets.find(a => a.id === dna.dna.fonts[0]?.assetId && a.kind === "font" && a.reusable && a.path?.startsWith(`${j.workspace_id}/`) && !a.path.includes("\\") && !a.path.split("/").some(p => !p || p === "." || p === ".."));
      if (fontAsset?.path) {
        const ext = fontAsset.path.split(".").pop()?.toLowerCase();
        const format = ext === "woff2" ? "woff2" : ext === "woff" ? "woff" : ext === "ttf" ? "truetype" : ext === "otf" ? "opentype" : null;
        if (!format) throw new Error("The saved Brand DNA font format is not supported for video.");
        const bytes = await (await import("./brand-dna-store.server")).readDnaBytes(admin, j.workspace_id, fontAsset.path);
        if (bytes.length > 5_000_000) throw new Error("The saved Brand DNA font is too large.");
        const path = `fonts/dna-brand.${ext}`;
        font = { files: { [path]: { base64: bytes.toString("base64") } }, css: `@font-face{font-family:"Brand";src:url("${path}") format("${format}");font-display:block}` };
      }
      const files = { ...assets.files, ...(font?.files ?? {}) };
      if (Buffer.byteLength(JSON.stringify(files), "utf8") > 50 * 1024 * 1024) throw new Error("The selected footage and generated assets exceed the compositor payload limit. Select shorter clips or fewer large assets.");
      const vv = v as { composition_html?: string | null; review_note?: string | null; narrative?: string; argument?: string | null; build_prompt?: string | null };
      const { data: refs } = standalone ? { data: [] } : await admin.from("creative_variants").select("composition_html").eq("workspace_id", j.workspace_id).or("is_reference.eq.true,review_state.eq.approved").not("composition_html", "is", null).neq("id", v.id).order("updated_at", { ascending: false }).limit(2);
      const { HOUSE_RULES } = await import("./playbook.server");
      // Inspect the generated speech itself. Its measured words drive both captions and scene pacing.
      const narrationWav = fl.parseWav(spoken.audio);
      if (!narrationWav) throw new Error("Could not verify the generated narration audio.");
      const words = await (await import("./narration-verification.server")).verifyNarration(spoken.audio, v.voiceover, fl.wavSeconds(narrationWav));
      const designed = reaction ? await (async () => {
        const demo = await (await import("./production.server")).reactionDemo(admin, j.workspace_id, v.file_ids ?? []);
        const demoPath = assets.media.find((item) => item.type === "video" && item.path.startsWith(`assets/${demo.id}.`))?.path;
        const step = readProductionPlan(v.production_plan).steps.find((item) => item.capability_id === "heygen-avatar");
        const avatar = step ? production.state.outputs[step.id] : undefined;
        const avatarPath = step && avatar ? `generated/${step.id}.${avatar.path.split(".").pop()}` : undefined;
        if (!demoPath || !avatarPath || !avatar?.durationSeconds || !files[avatarPath]) throw new Error("The verified demonstration or presenter video is unavailable for assembly.");
        const { width, height } = (await import("./content-rules")).parseSize(v.size);
        const html = (await import("./reaction-composition")).reactionComposition({ width, height, duration: v.duration_s, demoPath, demoSeconds: demo.seconds, avatarPath, avatarSeconds: avatar.durationSeconds, narrationSeconds: secs });
        return { html, report: null, problems: [] as string[] };
      })() : await designComposition({
        kit: [dna?.guidelines, kit.text].filter(Boolean).join("\n\n"), size: v.size, duration: v.duration_s, brand, palette,
        brief: { narrative: vv.narrative ?? v.angle, hook: v.hook, beats: (v.beats as string[]) ?? [], voiceover: v.voiceover, cta: v.cta, script: v.script, caption: v.caption, argument: vv.argument ?? "" },
        audioSeconds: secs, words, files: assets.catalog, images: assets.images, fontCss: font?.css ?? null, fontFamily: family,
        previousHtml: vv.review_note ? (vv.composition_html ?? null) : null, revisionNote: vv.review_note ?? null,
        buildPrompt: [vv.build_prompt ?? "", holdPrompt].filter(Boolean).join("\n\n") || null, houseRules: HOUSE_RULES, references: (refs ?? []).map((r) => r.composition_html as string),
      }, Object.keys(files));
      if (designed.report) await admin.from("creative_variants").update({ build_report: designed.report }).eq("id", v.id).eq("version", j.version ?? v.version);
      if (!designed.html) {
        await admin.from("creative_variants").update({ design_mode: "failed" }).eq("id", v.id).eq("version", j.version ?? v.version);
        await admin.from("render_jobs").update({ qa_issues: designed.problems }).eq("id", j.id);
        throw new Error("Sam's design didn't pass the quality checks, so no video was made. Ask her to try again.");
      }
      const { width: W, height: H } = (await import("./content-rules")).parseSize(v.size);
      const { zonesFor } = await import("./safe-zones");
      const layer = qa.buildCaptionLayer({ zone: zonesFor(W, H).caption, words, width: W, height: H, synced: true, accent: palette.accent, font: font ? '"Brand",sans-serif' : "Helvetica,Arial,sans-serif" });
      const capsOn = (v as { captions?: string }).captions !== "off";
      if (capsOn && !qa.captionsMatchScript(layer.text, v.voiceover)) throw new Error("Captions didn't match the script.");
      const treated = designed.html.replace(/<\/style>/i, `${qa.TREATMENT_CSS}</style>`);
      const captioned = capsOn ? qa.injectCaptions(treated, layer) : treated;
      const { validateComposition } = await import("./composition-rules");
      const { approvedCopyProblems } = await import("./composition.server");
      const staticOk = (h: string) => !approvedCopyProblems(h, v.build_prompt).length && validateComposition({ html: h, duration: v.duration_s, files: Object.keys(files) }).length === 0 && (!capsOn || qa.captionsMatchScript(layer.text, v.voiceover));
      // Look check: Sam previews real frames, finds clashes and repairs the design (max 2 rounds) before rendering.
      await admin.from("render_jobs").update({ phase: "checking", phase_claimed_at: new Date().toISOString() }).eq("id", j.id);
      const { lookCheckLoop } = await import("./frame-qa.server");
      // The worker has a five-minute limit. A slow design must not leave a
      // preview request stranded just before the deadline; static checks and
      // the final export review still run, and the skipped look check is shown.
      const elapsed = Date.now() - Date.parse(j.started_at ?? j.created_at);
      const looked = reaction ? { html: captioned, qa: { status: "skipped" as const, rounds: 0, issues: ["Reaction timing is fixed to the saved narration. Review the finished video before publishing."] } } : Number.isFinite(elapsed) && elapsed > 120_000
        ? { html: captioned, qa: { status: "skipped" as const, rounds: 0, issues: ["Frame preview was skipped because design used the worker's time budget. The finished export still needs playback review."] } }
        : await lookCheckLoop({ html: captioned, duration: v.duration_s, files, size: v.size, brand, hook: v.hook, palette, kit: kit.text, accept: staticOk });
      const technicalStatus = looked.qa.status === "needs_review" ? "needs_review" : looked.qa.status === "skipped" ? "unverified" : "pending";
      await admin.from("render_jobs").update({ technical_status: technicalStatus, frame_qa: { ...looked.qa, narration: { status: "verified", source: "transcribed_audio", word_count: words.length, word_times: words.map(({ start, end }) => [start, end]) } } }).eq("id", j.id);
      const html = looked.html;
      const finalProblems = [...validateComposition({ html, duration: v.duration_s, files: Object.keys(files) }), ...approvedCopyProblems(html, v.build_prompt)];
      if (finalProblems.length) { await admin.from("render_jobs").update({ qa_issues: finalProblems }).eq("id", j.id); throw new Error("The finished design failed its final check, so no video was made."); }
      await admin.from("creative_variants").update({ design_mode: "custom", composition_html: html }).eq("id", v.id).eq("version", j.version ?? v.version);
      await admin.from("render_jobs").update({ composition_html: html, brief_snapshot: { ...snapshotRecord(assetBriefSnapshot({ ...v, composition_html: html, design_mode: "custom", build_report: designed.report ?? v.build_report })), brand_dna_version_id: dnaId ?? null }, caption_mode: "synced", qa_issues: [...lengthNotes, ...designed.problems], frame_qa: { ...looked.qa, narration: { status: "verified", source: "transcribed_audio", word_count: words.length, word_times: words.map(({ start, end }) => [start, end]) } } }).eq("id", j.id);
      const previousCompositor = await previousGenerationStep(v.id, "compositor", j.id, admin);
      const compositor = await beginStep({ renderJobId: j.id, workspaceId: j.workspace_id, variantId: v.id, userId: j.created_by, initiator: "sam", stepKey: "compositor", parentStepId: root.step.id, provider: "autotoast", model: "hyperframes", operation: "POST /v1/render-jobs", settings: { width: W, height: H, duration: v.duration_s, fps: 30, caption_mode: "synced" }, ...(previousCompositor ? { retryOfStepId: previousCompositor.id } : {}) }, admin);
      if (!compositor.created) throw new Error("A prior compositor request needs reconciliation; no duplicate render was submitted.");
      let providerId: string;
      try {
        await updateStep(compositor.step.id, { status: "submitted" }, admin);
        providerId = await submitRenderJob({ idempotencyKey: j.id, size: v.size, html, audioUrl: signed.data.signedUrl, durationSeconds: v.duration_s, files });
        await updateStep(compositor.step.id, { status: "running", providerJobId: providerId }, admin);
      } catch {
        await (await import("./generation-tracker.server")).failStep(compositor.step.id, "compositor_submission_uncertain", true, admin);
        throw new Error("The render submission could not be reconciled. Its idempotency key has been retained; do not create another paid attempt.");
      }
      const submitted = await admin.from("render_jobs").update({ status: "rendering", provider_job_id: providerId, audio_path: audioPath, phase: "rendering", phase_claimed_at: null }).eq("id", j.id);
      if (submitted.error) throw new (await import("./production.server")).RecoverableProductionError();
      });
    } catch (e) {
      const { RecoverableProductionError } = await import("./production.server");
      if (e instanceof RecoverableProductionError) {
        const { listRenderSteps } = await import("./generation-tracker.server");
        const compositor = (await listRenderSteps(j.id, admin)).find((s) => s.step_key === "compositor" && s.provider_job_id);
        await admin.from("render_jobs").update({ status: "rendering", phase: compositor ? "rendering" : "provider_assets", phase_claimed_at: null, ...(compositor?.provider_job_id ? { provider_job_id: compositor.provider_job_id } : {}) }).eq("id", j.id);
        return;
      }
      await admin.from("render_jobs").update({ status: "failed", phase_claimed_at: null, error: e instanceof Error ? e.message : "Render failed" }).eq("id", j.id);
      const { listRenderSteps, failStep } = await import("./generation-tracker.server");
      const steps = await listRenderSteps(j.id, admin);
      const root = steps.find((s) => s.step_key === "production");
      if (root) await failStep(root.id, "production_failed", false, admin);
      await (await import("./content-credits.server")).reconcileFailedRenderCredits(admin as unknown as import("@supabase/supabase-js").SupabaseClient, j.workspace_id, j.id).catch(() => console.error("Failed production credits require reconciliation", { render_id: j.id }));
    }
  };
  await Promise.allSettled((queued ?? []).map(processJob));
});

const completeProviderFilm = createServerOnlyFn(async function completeProviderFilm(admin: Admin, job: RenderRow, path: string) {
  await admin.from("render_jobs").update({ status: "rendering", phase: "provider_finalizing", phase_claimed_at: new Date().toISOString() }).eq("id", job.id);
  const snapshot = snapshotRecord(job.brief_snapshot);
  const plan = (await import("./production-plan")).readProductionPlan(snapshot?.["production_plan"]);
  if (plan.steps.some((step) => step.role === "finished_video" && step.capability_id.startsWith("golpo-"))) {
    const targetSize = snapshot?.["size"], targetSeconds = snapshot?.["duration_s"];
    if (typeof targetSize !== "string" || typeof targetSeconds !== "number") throw new Error("The approved Golpo delivery settings are missing.");
    const delivered = `${job.workspace_id}/renders/${job.id}/golpo-delivery.mp4`;
    const existingDelivery = await admin.storage.from("brand-assets-private").info(delivered);
    if (existingDelivery.error) {
      const original = await admin.storage.from("brand-assets-private").download(path);
      if (original.error || !original.data) throw new Error("The Golpo source film is unavailable for final delivery.");
      const bytes = await (await import("./golpo-delivery.server")).normalizeGolpoFilm(original.data, targetSize, targetSeconds);
      const savedDelivery = await admin.storage.from("brand-assets-private").upload(delivered, bytes, { contentType: "video/mp4", upsert: false });
      if (savedDelivery.error) throw new Error("Could not store the normalized Golpo film.");
    }
    path = delivered;
  }
  const extension = path.toLowerCase().endsWith(".webm") ? "webm" : "mp4";
  const mime = extension === "webm" ? "video/webm" : "video/mp4";
  try {
  const folder = await systemFolder(admin, job.workspace_id, "Drafts");
  const title = typeof snapshot?.["hook"] === "string" ? snapshot["hook"] : "Generated film";
  const existing = await admin.from("brand_files").select("id").eq("workspace_id", job.workspace_id).eq("storage_path", path).limit(1);
  if (!existing.data?.length) {
    const insert = await admin.from("brand_files").insert({ workspace_id: job.workspace_id, folder_id: folder, name: `${title.slice(0, 60)}.${extension}`, kind: "video", mime, storage_path: path, source: "render", created_by: job.created_by });
    if (insert.error) throw new Error("Could not register the generated film.");
  }
  const playback = await admin.storage.from("brand-assets-private").createSignedUrl(path, 60);
  if (playback.error || !playback.data?.signedUrl) throw new Error("Could not make the stored film available for playback.");
  const saved = await admin.from("render_jobs").update({ status: "done", phase: "review", phase_claimed_at: null, error: null, storage_path: path, playback_ready_at: new Date().toISOString(), technical_status: "unverified", creative_status: "unverified", qa_issues: ["Provider output saved and a playback link is available. Exported text, timing, audio balance and creative quality require human playback review."], frame_qa: { status: "skipped", rounds: 0, issues: ["No temporal export inspection available for this provider output."], after: { status: "skipped", issues: [] } } } as never).eq("id", job.id);
  if (saved.error) throw new Error("Could not save the generated film state.");
  await finishGenerationLedger(admin, job.id, path, "unverified", "unverified");
  } catch { throw new (await import("./production.server")).RecoverableProductionError(); }
});

const finishGenerationLedger = createServerOnlyFn(async function finishGenerationLedger(admin: Admin, jobId: string, path: string, technical: "passed" | "needs_review" | "unverified", creative: "passed" | "needs_review" | "unverified") {
  const { listRenderSteps, completeStep } = await import("./generation-tracker.server");
  const steps = await listRenderSteps(jobId, admin);
  for (const step of steps.filter((s) => ["production", "compositor"].includes(s.step_key))) await completeStep(step.id, { outputStoragePath: path, technicalStatus: technical, creativeStatus: creative }, admin);
  const job = await admin.from("render_jobs").select("workspace_id").eq("id", jobId).single();
  if (job.error || !job.data) throw new Error("Unable to identify the credit workspace.");
  const { resolveRenderCredits } = await import("./content-credits.server");
  await resolveRenderCredits(admin as unknown as import("@supabase/supabase-js").SupabaseClient, job.data.workspace_id, jobId);
});

/** Exported temporal samples: technical findings and independent creative review remain separate. */
const finishedLookCheck = createServerOnlyFn(async function finishedLookCheck(admin: Admin, jobId: string, providerId: string, target: number | null, variantId: string | null, path: string) {
  try {
    const [{ getJobFrames }, { reviewFrames }, { finishedSampleTimes, measuredNarrationTimeline, majorIssues, describe }] = await Promise.all([import("./render.server"), import("./frame-qa.server"), import("./frame-qa")]);
    const { data: row } = await admin.from("render_jobs").select("frame_qa,brief_snapshot,workspace_id,qa_issues").eq("id", jobId).single();
    const { data: v } = variantId ? await admin.from("creative_variants").select("*").eq("id", variantId).eq("workspace_id", row?.workspace_id ?? "").single() : { data: null };
    if (!row || !v) throw new Error("Export review context unavailable.");
    const brief = assetWithSnapshot(v, row.brief_snapshot);
    const standalone = snapshotRecord(brief.production_plan)?.["standalone"] === true;
    const context = await (await import("./creative-context.server")).loadCreativeContext(admin, row.workspace_id, standalone ? brief.narrative ?? brief.angle : "", undefined, undefined, standalone ? "standalone" : undefined);
    const prev = (row?.frame_qa ?? { status: "skipped", rounds: 0, issues: [] }) as import("./frame-qa").FrameQa;
    const frames = await getJobFrames(providerId, finishedSampleTimes(target ?? 15));
    const coverage = (await import("./export-review")).exportFrameCoverage(frames, target ?? brief.duration_s);
    if (!coverage.sufficient) throw new Error("Export frame coverage is incomplete.");
    const spokenTimeline = measuredNarrationTimeline(brief.voiceover, prev.narration?.word_times);
    if (!spokenTimeline || prev.narration?.status !== "verified") throw new Error("Measured narration timing is unavailable for this export.");
    // Verify the exported track, not just the source WAV used to build the film.
    let videoBytes: ArrayBuffer;
    if (path.startsWith("autotoast:")) {
      const media = await (await import("./render.server")).getMedia(path.slice(10));
      if (!media.download_url) throw new Error("Export audio is unavailable for checking.");
      const downloaded = await (await import("./creative-media.server")).downloadCreativeMedia(media.download_url, { expected: "video", maxBytes: 100 * 1024 * 1024 });
      videoBytes = new Uint8Array(downloaded.bytes).buffer;
    } else {
      const stored = await admin.storage.from("brand-assets-private").download(path);
      if (stored.error || !stored.data || stored.data.size > 100 * 1024 * 1024) throw new Error("Export audio is unavailable for checking.");
      videoBytes = await stored.data.arrayBuffer();
    }
    const exportAudio = await (await import("./export-audio.server")).extractExportAudio(videoBytes);
    const exportedWords = await (await import("./narration-verification.server")).verifyNarration(exportAudio, brief.voiceover, target ?? brief.duration_s, "export");
    if (exportedWords.some((word, index) => Math.abs(word.start - prev.narration!.word_times![index]![0]!) > 0.6)) throw new Error("Export narration timing differs from the verified source.");
    const issues = await reviewFrames(frames, { brand: context.brand, hook: brief.hook, size: brief.size, palette: { bg: "", fg: "", accent: "" }, kit: context.text, spokenTimeline });
    const after = issues === null ? { status: "skipped" as const, issues: [] } : { status: majorIssues(issues).length ? "needs_review" as const : "passed" as const, issues: majorIssues(issues).map(describe) };
    const { reviewCreativeExport } = await import("./export-review.server");
    const creative = await reviewCreativeExport({ frames, brief, brand: context.brand, evidence: context.text, recent: context.recent.filter((entry) => entry.hook !== brief.hook), durationSeconds: target ?? brief.duration_s });
    const technical = after.status === "needs_review" || prev.status === "needs_review" || prev.after?.status === "needs_review" ? "needs_review" : after.status === "passed" && prev.narration?.status === "verified" ? "passed" : "unverified";
    await admin.from("render_jobs").update({ technical_status: technical, creative_status: creative.status, qa_issues: [...(Array.isArray(row.qa_issues) ? row.qa_issues : []), ...after.issues, ...creative.issues, ...creative.limitations], frame_qa: { ...prev, after, final_audio: { status: "verified" }, sample_times: frames.map((f) => f.t), creative_review: creative } }).eq("id", jobId);
  } catch {
    const { data: existing } = await admin.from("render_jobs").select("technical_status,creative_status,qa_issues,frame_qa").eq("id", jobId).single();
    const frame = existing?.frame_qa as { status?: string; after?: { status?: string } } | null;
    const critical = ["needs_review", "failed"].includes(existing?.technical_status ?? "") || frame?.status === "needs_review" || frame?.after?.status === "needs_review";
    await admin.from("render_jobs").update({ technical_status: critical ? "needs_review" : "unverified", creative_status: existing?.creative_status === "needs_review" ? "needs_review" : "unverified", qa_issues: [...(Array.isArray(existing?.qa_issues) ? existing.qa_issues : []), "Export review was unavailable. Full playback, motion and audio require human inspection."] }).eq("id", jobId);
  }
});

/** Poll in-flight renders; store finished MP4s in Brand Assets → Drafts. */
export const refreshRenders = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    return refreshWorkspaceRenders(admin, data.workspace_id);
  });

/** Shared by the authenticated workspace poll and the authenticated background job endpoint. */
const refreshWorkspaceRenders = createServerOnlyFn(async function refreshWorkspaceRenders(admin: Admin, workspaceId: string, engineOnly = false) {
    const { productionRecoveryAction, PRODUCTION_LEASE_MS, RecoverableProductionError, isCreativeEngineState } = await import("./production.server");
    const { listRenderSteps, failStep } = await import("./generation-tracker.server");
    const stale = await admin.from("render_jobs").select("*").eq("workspace_id", workspaceId).contains("production_state", { engine_version: 1 }).in("status", ["preparing", "rendering"]).limit(20);
    if (stale.error) throw new Error("Could not inspect production recovery leases.");
    for (const row of stale.data ?? []) {
      const stamp = Date.parse(row.phase_claimed_at ?? row.started_at ?? row.created_at);
      if (Number.isFinite(stamp) && Date.now() - stamp < PRODUCTION_LEASE_MS) continue;
      const steps = await listRenderSteps(row.id, admin);
      const action = productionRecoveryAction(row, steps);
      if (action === "none") continue;
      const known = row.provider_job_id ?? steps.find((s) => s.step_key === "compositor")?.provider_job_id;
      let reclaim = admin.from("render_jobs").update(action === "reconcile" ? { status: "failed", phase: "reconciliation_required", phase_claimed_at: null, error: "Interrupted production requires reconciliation. No paid operation was repeated." } : { status: action === "queued" ? "queued" : "rendering", phase: action === "compositor" ? "rendering" : action === "queued" ? "assets_ready" : "provider_assets", phase_claimed_at: null, ...(known ? { provider_job_id: known } : {}) }).eq("id", row.id).eq("status", row.status);
      reclaim = row.phase_claimed_at ? reclaim.eq("phase_claimed_at", row.phase_claimed_at) : reclaim.is("phase_claimed_at", null);
      const claimed = await reclaim.select("id");
      if (!claimed.data?.length) continue;
      if (action === "reconcile") for (const step of steps.filter((s) => ["reserved", "submitted", "running"].includes(s.status))) await failStep(step.id, "interrupted_preparation", step.provider !== "autosocials", admin);
    }
    const { getRenderJob } = await import("./render.server");
    const { lengthMismatch } = await import("./film-length");
    const lengthOff = (s: { durationSeconds?: number | null; duration_s?: number | null }, j: { target?: number | null }) => j.target ? lengthMismatch(s.durationSeconds ?? s.duration_s, j.target) : null;
    const { data: jobRows } = await admin.from("render_jobs").select("*").eq("workspace_id", workspaceId).eq("status", "rendering").limit(12);
    const ids = [...new Set((jobRows ?? []).map((r) => r.variant_id).filter(Boolean))] as string[];
    const { data: durs } = ids.length ? await admin.from("creative_variants").select("id,duration_s").in("id", ids) : { data: [] };
    const jobs = (jobRows ?? []).filter((r) => !engineOnly || isCreativeEngineState(r.production_state)).map((r) => {
      const snapshot = snapshotRecord(r.brief_snapshot);
      return { ...r, target: typeof snapshot?.["duration_s"] === "number" ? snapshot["duration_s"] : (durs ?? []).find((d) => d.id === r.variant_id)?.duration_s ?? null, hook: typeof snapshot?.["hook"] === "string" ? snapshot["hook"] : null };
    });
    let updated = 0;
    for (const j of jobs ?? []) {
      if (j.phase === "provider_assets") {
        const claim = await admin.from("render_jobs").update({ phase: "provider_poll", phase_claimed_at: new Date().toISOString() }).eq("id", j.id).eq("phase", "provider_assets").select("id");
        if (!claim.data?.length) continue;
        try {
          const { data: live } = await admin.from("creative_variants").select("*").eq("id", j.variant_id).eq("workspace_id", workspaceId).single();
          if (!live) throw new Error("The production brief is unavailable.");
          const result = await (await import("./production.server")).advanceProduction(admin, j, assetWithSnapshot(live, j.brief_snapshot));
          if (result.finalOutput) await completeProviderFilm(admin, j, result.finalOutput.path);
          else await admin.from("render_jobs").update({ phase: result.waiting ? "provider_assets" : "assets_ready", phase_claimed_at: null, status: result.waiting ? "rendering" : "queued", production_state: result.state as never }).eq("id", j.id);
          updated++;
        } catch (e) {
          if (e instanceof RecoverableProductionError) {
            await admin.from("render_jobs").update({ status: "rendering", phase: "provider_assets", phase_claimed_at: null, error: "Output ingestion is pending; the existing provider job will be resumed." }).eq("id", j.id);
            continue;
          }
          await admin.from("render_jobs").update({ status: "failed", phase_claimed_at: null, error: e instanceof Error ? e.message : "Provider progress could not be verified." }).eq("id", j.id);
          await (await import("./content-credits.server")).reconcileFailedRenderCredits(admin as unknown as import("@supabase/supabase-js").SupabaseClient, workspaceId, j.id).catch(() => console.error("Failed production credits require reconciliation", { render_id: j.id }));
        }
        continue;
      }
      if (["provider_poll", "provider_finalizing", "finalizing"].includes(j.phase ?? "")) continue;
      if (!j.provider_job_id) continue;
      const s = await getRenderJob(j.provider_job_id).catch(() => null);
      if (!s) continue;
      if (s.status === "failed") {
        const stopped = await admin.from("render_jobs").update({ status: "failed", phase_claimed_at: null, error: "The compositor reported a failed render." }).eq("id", j.id).eq("status", "rendering").select("id").maybeSingle();
        if (stopped.error || !stopped.data) continue;
        const { listRenderSteps, failStep } = await import("./generation-tracker.server");
        for (const step of (await listRenderSteps(j.id, admin)).filter((s) => ["production", "compositor"].includes(s.step_key))) await failStep(step.id, "compositor_failed", false, admin);
        await (await import("./content-credits.server")).reconcileFailedRenderCredits(admin as unknown as import("@supabase/supabase-js").SupabaseClient, workspaceId, j.id).catch(() => console.error("Failed production credits require reconciliation", { render_id: j.id }));
        updated++;
      } else if (s.status === "ready" && (s.media_id || s.downloadUrl)) {
        let finalizingClaim = admin.from("render_jobs").update({ phase: "finalizing", phase_claimed_at: new Date().toISOString() }).eq("id", j.id).eq("status", "rendering");
        finalizingClaim = j.phase === null ? finalizingClaim.is("phase", null) : finalizingClaim.eq("phase", j.phase);
        const claimed = await finalizingClaim.select("id");
        if (!claimed.data?.length) continue;
        try {
          let path = s.media_id ? `autotoast:${s.media_id}` : "";
          let sizeBytes = s.sizeBytes ?? 0;
          if (!path && s.downloadUrl) {
            const storageStart = await admin.from("render_jobs").update({ storage_started_at: new Date().toISOString() } as never).eq("id", j.id).is("storage_started_at", null);
            if (storageStart.error) throw new Error("Could not record output ingestion.");
            const media = await (await import("./creative-media.server")).downloadCreativeMedia(s.downloadUrl, { expected: "video" });
            path = `${workspaceId}/renders/${j.id}.${media.extension}`; sizeBytes = media.bytes.byteLength;
            const up = await admin.storage.from("brand-assets-private").upload(path, media.bytes, { contentType: media.contentType, upsert: true });
            if (up.error) throw new Error("Could not persist the exported film.");
            const stored = await admin.from("render_jobs").update({ storage_completed_at: new Date().toISOString() } as never).eq("id", j.id).is("storage_completed_at", null);
            if (stored.error) throw new Error("Could not record output storage completion.");
          }
          if (s.media_id) {
            const media = await (await import("./render.server")).getMedia(s.media_id);
            if (!media.playback_url && !media.download_url) throw new Error("The compositor has no playback link for its finished media.");
          } else {
            const playback = await admin.storage.from("brand-assets-private").createSignedUrl(path, 60);
            if (playback.error || !playback.data?.signedUrl) throw new Error("Could not make the stored film available for playback.");
          }
          const { listRenderSteps, beginStep } = await import("./generation-tracker.server");
          let root = (await listRenderSteps(j.id, admin)).find((step) => step.step_key === "production");
          if (!root) root = (await beginStep({ renderJobId: j.id, workspaceId, variantId: j.variant_id, userId: j.created_by, initiator: "user", stepKey: "production", provider: "autosocials", model: "creative-engine-v1", operation: "finalize_legacy_video" }, admin)).step;
          const { withProductionTrace } = await import("./generation-context.server");
          await withProductionTrace({ admin, renderJobId: j.id, workspaceId, variantId: j.variant_id, userId: j.created_by, rootStepId: root.id, phase: "export_review" }, () => finishedLookCheck(admin, j.id, j.provider_job_id!, j.target, j.variant_id, path));
          const { data: reviewed } = await admin.from("render_jobs").select("technical_status,creative_status,qa_issues").eq("id", j.id).single();
          const lengthIssue = lengthOff(s, j);
          const durationUnknown = !Number.isFinite(s.durationSeconds ?? s.duration_s);
          const technical = lengthIssue ? "needs_review" : durationUnknown ? "unverified" : reviewed?.technical_status === "needs_review" ? "needs_review" : reviewed?.technical_status === "passed" ? "passed" : "unverified";
          const creative = reviewed?.creative_status === "passed" ? "passed" : reviewed?.creative_status === "needs_review" ? "needs_review" : "unverified";
          const folder = await systemFolder(admin, workspaceId, "Drafts");
          const existing = await admin.from("brand_files").select("id").eq("workspace_id", workspaceId).eq("storage_path", path).limit(1);
          if (!existing.data?.length) {
            const file = await admin.from("brand_files").insert({ workspace_id: workspaceId, folder_id: folder, name: `${(j.hook ?? "Video").slice(0, 60)} v${j.version ?? 1}.mp4`, kind: "video", mime: "video/mp4", size_bytes: sizeBytes, storage_path: path, media_id: s.media_id ?? null, transcript_status: "skipped", source: "render", created_by: j.created_by });
            if (file.error) throw new Error("Could not register the exported film.");
          }
          const saved = await admin.from("render_jobs").update({ status: "done", phase: "review", phase_claimed_at: null, storage_path: path, playback_ready_at: new Date().toISOString(), technical_status: technical, creative_status: creative, ...(lengthIssue ? { qa_issues: [lengthIssue, ...(Array.isArray(reviewed?.qa_issues) ? reviewed.qa_issues : [])] } : {}) } as never).eq("id", j.id);
          if (saved.error) throw new Error("Could not save the finished film state.");
          await finishGenerationLedger(admin, j.id, path, technical, creative);
          updated++;
        } catch {
          const expired = Date.now() - Date.parse(j.created_at) > 6 * 60 * 60 * 1000;
          await admin.from("render_jobs").update({ status: expired ? "failed" : "rendering", phase: expired ? "reconciliation_required" : "rendering", phase_claimed_at: null, error: expired ? "Export ingestion exceeded its recovery window; reconcile the existing provider job." : "Export ingestion is pending; the existing compositor job will be resumed." }).eq("id", j.id);
        }
      }
    }
    if (!engineOnly) await pump(admin);
    await (await import("./creative-render-alerts.server")).notifyFailedRenderJobs(admin, workspaceId);
    return { updated };
});

/** Server-only background entry: advances explicitly requested planning and rendering only. */
export const runCreativeJobs = createServerOnlyFn(async function runCreativeJobs() {
  const admin = getAdminClient();
  const { data, error } = await admin.from("render_jobs").select("workspace_id").contains("production_state", { engine_version: 1 }).in("status", ["queued", "preparing", "rendering"]).order("created_at").limit(50);
  if (error) throw new Error("Could not inspect the production queue.");
  let updated = await (await import("./narrative-planning.server")).runNarrativePlanningJobs(admin, executeNarrativePlanningJob);
  for (const workspaceId of [...new Set((data ?? []).map((job) => job.workspace_id))].slice(0, 8)) updated += (await refreshWorkspaceRenders(admin, workspaceId, true)).updated;
  await pump(admin);
  return { updated };
});

/** Review a rendered video: approve, request changes or reject. */
export const reviewVariant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), render_id: z.string().uuid().optional(), state: z.enum(["approved", "needs_revision", "rejected", "draft"]), note: z.string().max(1000).optional() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: v } = await admin.from("creative_variants").select("*").eq("id", data.id).single();
    if (!v) throw new Error("Not found");
    await assertMember(user.id, v.workspace_id);
    if (data.state === "approved") {
      const candidate = data.render_id ? (await admin.from("render_jobs").select("*").eq("id", data.render_id).eq("variant_id", v.id).eq("workspace_id", v.workspace_id).single()).data : (await resolvePrimaryRender(admin, v.id))?.render;
      if (!candidate || candidate.status !== "done") throw new Error("Wait for a finished video before approving it.");
      const { qualityApprovalProblem } = await import("./export-review");
      const gate = qualityApprovalProblem({ technicalStatus: candidate.technical_status, creativeStatus: candidate.creative_status, frameQa: candidate.frame_qa as import("./frame-qa").FrameQa | null, qaIssues: candidate.qa_issues });
      if (gate.problem) throw new Error(gate.problem);
    }
    const reviewed = await admin.rpc("review_asset_render", { _variant_id: v.id, _render_id: data.render_id ?? null, _state: data.state, _note: data.note ?? null, _user_id: user.id });
    if (reviewed.error) throw new Error(reviewed.error.message);
    const result = z.object({ render_id: z.string().uuid().nullable() }).parse(reviewed.data);
    if (result.render_id) await (await import("./generation-tracker.server")).markGenerationApproval(result.render_id, data.state, admin);
    const { data: job } = result.render_id ? await admin.from("render_jobs").select("storage_path").eq("id", result.render_id).eq("variant_id", v.id).maybeSingle() : { data: null };
    if (job?.storage_path) {
      const folder = await systemFolder(admin, v.workspace_id, data.state === "approved" ? "Ready to share" : data.state === "rejected" ? "Rejected" : "Drafts");
      await admin.from("brand_files").update({ folder_id: folder }).eq("workspace_id", v.workspace_id).eq("storage_path", job.storage_path);
    }
    return { ok: true };
  });

/** Signed download — approved videos only. */
export const downloadApproved = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const primary = await resolvePrimaryRender(admin, data.id);
    if (!primary) throw new Error("Not found");
    await assertMember(user.id, primary.asset.workspace_id);
    if (!canShare(primary.brief.review_state)) throw new Error("Approve this video before downloading it.");
    if (!primary.render) throw new Error("No finished video yet.");
    return { url: (await renderLinks(admin, primary.render, primary.brief.hook)).download_url };
  });

/** Hand approved videos to Publish as drafts on their planned day (once per variant). */
export const sendToPublish = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), variant_ids: z.array(z.string().uuid()).min(1).max(50) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    const { data: existing } = await admin.from("posts").select("variant_id").eq("workspace_id", data.workspace_id).in("variant_id", data.variant_ids);
    const have = (existing ?? []).map((p) => p.variant_id!).filter(Boolean);
    let created = 0;
    for (const vid of data.variant_ids) {
      if (!needsNewDraft(have, vid)) continue;
      const primary = await resolvePrimaryRender(admin, vid);
      if (!primary) continue;
      const { brief: v, render } = primary;
      if (v.workspace_id !== data.workspace_id || !canShare(v.review_state)) continue;
      if (!render?.storage_path) continue;
      let bytes: ArrayBuffer;
      if (render.storage_path.startsWith("autotoast:")) {
        const { getMedia } = await import("./render.server");
        const link = (await getMedia(render.storage_path.slice(10))).download_url;
        const res = link ? await fetch(link) : null;
        if (!res?.ok) continue;
        bytes = await res.arrayBuffer();
      } else {
        const media = await admin.storage.from("brand-assets-private").download(render.storage_path);
        if (media.error) continue;
        bytes = await media.data.arrayBuffer();
      }
      const mediaPath = `${data.workspace_id}/renders/${vid}.mp4`;
      await admin.storage.from("post-media").upload(mediaPath, bytes, { contentType: "video/mp4", upsert: true });
      const p = await admin.from("posts").insert({
        workspace_id: data.workspace_id, created_by: user.id, status: APPROVED_POST_STATUS, variant_id: vid, created_via: "sam_batch",
        caption: [v.caption, v.cta].filter(Boolean).join("\n\n"), post_type: "video",
        scheduled_at: v.planned_for ? `${v.planned_for}T09:00:00Z` : null,
      }).select("id").single();
      if (p.error) throw new Error(p.error.message);
      await admin.from("post_media").insert({ post_id: p.data.id, kind: "video", storage_path: mediaPath, mime: "video/mp4" });
      created++;
    }
    return { created, skipped: data.variant_ids.length - created };
  });

// ───────────── Create Content wizard ─────────────

const NARRATIVE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["narratives"],
  properties: { narratives: { type: "array", items: { type: "object", additionalProperties: false, required: ["title", "message", "why", "type"], properties: { title: STR, message: STR, why: STR, type: { type: "string", enum: [...NARRATIVE_TYPES] } } } } },
};

const NarrativeZ = z.object({ id: z.string().max(60), title: z.string().max(160), message: z.string().max(700), why: z.string().max(1200), selected: z.boolean(), custom: z.boolean().optional(), type: z.string().max(40).optional(), treatment: z.string().max(1200).optional(), createdAt: z.string().datetime().optional(), libraryStatus: z.enum(["available", "rejected", "binned"]).optional(), origin: z.string().max(120).optional(), context_mode: z.enum(["goals", "idea", "standalone"]).optional() });

const loadBatch = createServerOnlyFn(async function loadBatch(userId: string, batchId: string) {
  const admin = getAdminClient();
  const { data: b } = await admin.from("creative_batches").select("id,workspace_id,stage,narratives,days,starts_on,updated_at,active_plan_id").eq("id", batchId).single();
  if (!b) throw new Error("Batch not found");
  await assertMember(userId, b.workspace_id);
  return { admin, b, narratives: (Array.isArray(b.narratives) ? b.narratives : []) as Narrative[] };
});

const rid = () => crypto.randomUUID().slice(0, 8);

/** Stop narrative drafting only; provider video jobs are unaffected. */
export const stopSamIdeation = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    return stopWorkspaceIdeation(admin, data.workspace_id, user.id);
  });

/** A confirmed fresh start bins this client's ideas while preserving plans and rendered assets. */
export const clearNarrativesForFreshStart = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    const result = await resetNarrativeLibrary(admin, data.workspace_id, user.id);
    if (result.failed) throw new Error("Some narratives could not be cleared. Refresh the idea stream and try again.");
    return { cleared: result.cleared };
  });

/** Open a fresh wizard batch, seeded with Sam's current brand suggestions as narratives. */
export const startWizardBatch = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), fresh: z.literal(true).optional() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    const since = new Date(Date.now() - 86400000).toISOString();
    const recent = admin.from("creative_batches").select("id,narratives").eq("workspace_id", data.workspace_id).not("goal", "like", "sam-thread:%").eq("stage", "narratives").gte("created_at", since);
    if (data.fresh) recent.eq("created_by", user.id);
    const { data: open } = await recent.order("created_at", { ascending: false }).limit(5);
    for (const o of open ?? []) {
      if (data.fresh && (!Array.isArray(o.narratives) || o.narratives.length)) continue;
      const { count } = await admin.from("creative_variants").select("id", { count: "exact", head: true }).eq("batch_id", o.id);
      if (!count) return { batchId: o.id, reused: true };
    }
    // Start with an empty idea stream; Sam creates brand-grounded narratives on request.
    const seed: Omit<Narrative, "selected">[] = [];
    const starts = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const ins = await admin.from("creative_batches").insert({
      workspace_id: data.workspace_id, title: "New asset", goal: "", days: 3, starts_on: starts, created_by: user.id,
      audience: "", offer: "", destination: "", stage: "narratives", narratives: mergeNarratives([], seed) as never,
    }).select("id").single();
    if (ins.error) throw new Error(ins.error.message);
    return { batchId: ins.data.id, reused: false, seeded: seed.length };
  });

/** One click: Sam writes NARRATIVES_PER_REFRESH fresh messaging angles, never repeating shown ones. */
export const moreNarratives = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ batch_id: z.string().uuid(), from_goals: z.literal(true).optional() }).parse(i))
  .handler(async ({ data }) => {
    const startedAt = new Date().toISOString();
    const user = await requireUser();
    const { admin, b, narratives } = await loadBatch(user.id, data.batch_id);
    const { ideationIsActive } = await import("./ideation-status");
    const { data: recentIdeation, error: ideationError } = await admin.from("agent_messages")
      .select("content,created_at").eq("workspace_id", b.workspace_id).eq("role", "assistant")
      .like("content", "Sam is working on four new narratives.%")
      .gte("created_at", new Date(Date.now() - 7 * 60_000).toISOString())
      .order("created_at", { ascending: false }).limit(1);
    if (ideationError) throw new Error("Could not check Sam's current idea request.");
    if (ideationIsActive(recentIdeation?.[0])) return { added: 0, batchId: b.id, alreadyRunning: true };
    // Show this button-triggered work in the same durable conversation as Sam's chat.
    // These are observable workflow milestones, not private model reasoning.
    let activityId: string | null = null;
    try {
      const { ensureThread } = await import("./sam.context.server");
      const threadId = await ensureThread(admin, b.workspace_id, "create", user.id);
      const request = await admin.from("agent_messages").insert({ thread_id: threadId, workspace_id: b.workspace_id, role: "user", content: data.from_goals ? "Generate video ideas from my Goals and DNA." : "More ideas from Sam, please." });
      if (request.error) throw request.error;
      const activity = await admin.from("agent_messages").insert({ thread_id: threadId, workspace_id: b.workspace_id, role: "assistant", content: "Sam is working on four new narratives.\n\nReviewing the brand, audience and source material…" }).select("id").single();
      if (activity.error) throw activity.error;
      activityId = activity.data.id;
    } catch { throw new Error("Sam's idea request could not be saved, so drafting has not started. Please try again."); }
    if (!activityId) throw new Error("Sam's idea request could not be saved, so drafting has not started.");
    const assertActive = () => assertIdeationActive(admin, b.workspace_id, activityId!, startedAt);
    const updateActivity = (content: string) => updateIdeationActivity(admin, b.workspace_id, activityId!, content);
    let savedBatchId: string | null = null;
    let freshIds: string[] = [];
    try {
    await assertActive();
    const { proposeNarratives } = await import("./creative-planning.server");
    // Keep proposal history bounded while allowing the stream to grow beyond a
    // single batch. Earlier ideas remain searchable in the library.
    const { data: recentBatches, error: historyError } = await admin.from("creative_batches").select("narratives")
      .eq("workspace_id", b.workspace_id).order("created_at", { ascending: false }).limit(20);
    if (historyError) throw new Error("Could not read recent narrative history.");
    const history = [...narratives, ...(recentBatches ?? []).flatMap((row) => Array.isArray(row.narratives) ? row.narratives as Narrative[] : [])];
    const seenTitles = new Set<string>();
    const recent = history.filter((n) => {
      const key = n.title?.trim().toLowerCase();
      if (!key || seenTitles.has(key)) return false;
      seenTitles.add(key); return true;
    }).slice(0, 100);
    const proposed = await proposeNarratives({ admin, userId: user.id, workspaceId: b.workspace_id, existing: recent.filter((idea) => idea.context_mode !== "standalone"), count: NARRATIVES_PER_REFRESH, fromGoals: data.from_goals, brief: data.from_goals ? "" : narratives.filter((n) => n.custom && n.libraryStatus !== "binned" && n.context_mode !== "standalone").map((n) => n.message || n.title).join("\n"), assertActive, onProgress: async (step) => {
      const detail = step === "evidence" ? "Reviewing the brand, audience and source material…" : step === "drafting" ? "Building specific, useful story angles…" : "Checking source support, clarity and variety…";
      await updateActivity(`Sam is working on four new narratives.\n\n${detail}`);
    } });
    await assertActive();
    const fresh = proposed.map((n) => ({ ...n, id: rid(), type: narrativeType(n.type), createdAt: new Date().toISOString(), libraryStatus: "available" as const, ...(data.from_goals ? { context_mode: "goals" as const } : {}) }));
    freshIds = fresh.map((idea) => idea.id);
    if (narratives.length > MAX_NARRATIVES - NARRATIVES_PER_REFRESH) {
      const starts = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      await assertActive();
      const inserted = await admin.from("creative_batches").insert({ workspace_id: b.workspace_id, title: "More ideas from Sam", goal: "", days: 3, starts_on: starts,
        created_by: user.id, audience: "", offer: "", destination: "", stage: "narratives", narratives: mergeNarratives([], fresh) as never }).select("id").single();
      if (inserted.error) throw new Error(inserted.error.message);
      savedBatchId = inserted.data.id;
      await assertActive();
      await updateActivity(`I saved ${fresh.length} new narratives to your idea stream:\n\n${fresh.map((n) => `- **${n.title}** — ${n.message}`).join("\n")}\n\nSelect your favourites in the library to generate videos.`);
      return { added: fresh.length, batchId: inserted.data.id };
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      await assertActive();
      const current = await loadBatch(user.id, b.id);
      const merged = mergeNarratives(current.narratives, fresh);
      const result = await admin.from("creative_batches").update({ narratives: merged as never, updated_at: new Date().toISOString() })
        .eq("id", b.id).eq("workspace_id", b.workspace_id).eq("updated_at", current.b.updated_at).select("id");
      if (result.error) throw new Error(result.error.message);
      if (result.data?.length) {
        savedBatchId = b.id;
        await assertActive();
        const added = merged.length - current.narratives.length;
        await updateActivity(added ? `I saved ${added} new narratives to your idea stream:\n\n${fresh.slice(0, added).map((n) => `- **${n.title}** — ${n.message}`).join("\n")}\n\nSelect your favourites in the library to generate videos.` : "I couldn't find a distinct new angle this time. Your saved ideas are still available in the library.");
        return { added, batchId: b.id };
      }
    }
    throw new Error("Ideas changed while Sam was saving them. Please ask her to try again.");
    } catch (error) {
      let stopped = error instanceof IdeationStopped;
      if (!stopped) {
        try { await assertActive(); } catch (checkError) { if (checkError instanceof IdeationStopped) stopped = true; }
      }
      if (stopped) {
        if (savedBatchId && freshIds.length) await discardStoppedIdeas(admin, b.workspace_id, savedBatchId, freshIds);
        try { await updateActivity(IDEATION_STOPPED_MESSAGE); } catch (stopError) { if (!(stopError instanceof IdeationStopped)) throw stopError; }
        return { added: 0, batchId: b.id, cancelled: true };
      }
      try { await updateActivity("I couldn't save a supportable new set this time. Your existing ideas are still available. Try a more specific brief or ask me again."); }
      catch (checkError) {
        if (checkError instanceof IdeationStopped) {
          if (savedBatchId && freshIds.length) await discardStoppedIdeas(admin, b.workspace_id, savedBatchId, freshIds);
          try { await updateActivity(IDEATION_STOPPED_MESSAGE); } catch (stopError) { if (!(stopError instanceof IdeationStopped)) throw stopError; }
          return { added: 0, batchId: b.id, cancelled: true };
        }
      }
      throw error;
    }
  });

/** Save selection / custom narratives / batch length and start date. */
export const saveWizard = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    batch_id: z.string().uuid(), narratives: z.array(NarrativeZ).max(40).optional(),
    days: z.number().int().min(1).max(MAX_BATCH_DAYS).optional(), starts_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    stage: z.enum(WIZARD_STAGES).optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { admin, b, narratives: stored } = await loadBatch(user.id, data.batch_id);
    const { batch_id, ...patch } = data;
    // Client changes selections/copy, never provider routing. Preserve only the server's saved recipe.
    if (patch.narratives) patch.narratives = [...patch.narratives.map((n) => {
      const previous = stored.find((s) => s.id === n.id && s.title === n.title && s.message === n.message);
      const creation = previous && (previous as unknown as Record<string, unknown>)["asset_creation"];
      return { ...n, createdAt: previous?.createdAt ?? new Date().toISOString(), libraryStatus: previous?.libraryStatus ?? "available", origin: previous?.origin ?? `${b.id}:${n.id}`, ...(previous?.production ? { production: previous.production } : {}), ...(creation ? { asset_creation: creation } : {}) };
    }), ...stored.filter((s) => !patch.narratives!.some((n) => n.id === s.id))];
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const r = await admin.from("creative_batches").update({ ...clean, updated_at: new Date().toISOString() } as never).eq("id", b.id).eq("workspace_id", b.workspace_id).eq("updated_at", b.updated_at).select("id");
    if (r.error) throw new Error(r.error.message);
    if (!r.data?.length) throw new Error("This asset changed while you were editing. Please try again.");
    return { ok: true, batch_id };
  });

/** Reject or bin an idea without deleting its source or any related asset. */
export const setNarrativeLibraryStatus = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ batch_id: z.string().uuid(), narrative_id: z.string().max(60), status: z.enum(["available", "rejected", "binned"]) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { admin, b, narratives } = await loadBatch(user.id, data.batch_id);
    if (!narratives.some((n) => n.id === data.narrative_id)) throw new Error("Narrative not found");
    const updated = narratives.map((n) => n.id === data.narrative_id ? { ...n, selected: data.status === "available" ? n.selected : false, libraryStatus: data.status } : n);
    const result = await admin.from("creative_batches").update({ narratives: updated as never, updated_at: new Date().toISOString() }).eq("id", b.id).eq("workspace_id", b.workspace_id).eq("updated_at", b.updated_at).select("id");
    if (result.error) throw new Error(result.error.message);
    if (!result.data?.length) throw new Error("This idea changed while you were editing it. Please try again.");
    return { ok: true };
  });

/** Make a fresh asset plan from a saved idea; the original stays in the library. */
export const startAssetFromNarrative = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ ideas: z.array(z.object({ batch_id: z.string().uuid(), narrative_id: z.string().max(60) })).min(1).max(MAX_ASSETS_PER_BATCH), count: z.number().int().min(1).max(MAX_ASSETS_PER_BATCH).optional() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const selected = await Promise.all(data.ideas.map(async (idea) => {
      const { admin, b, narratives } = await loadBatch(user.id, idea.batch_id);
      const original = narratives.find((n) => n.id === idea.narrative_id);
      if (!original) throw new Error("Narrative not found");
      if (original.libraryStatus && original.libraryStatus !== "available") throw new Error("Restore this idea before using it.");
      return { admin, b, original };
    }));
    const workspaceId = selected[0]!.b.workspace_id;
    if (selected.some((entry) => entry.b.workspace_id !== workspaceId)) throw new Error("Ideas must belong to one business.");
    const keys = selected.map(({ b, original }) => narrativeKey(b.id, original));
    if (new Set(keys).size !== keys.length) throw new Error("Choose each idea only once.");
    const starts = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    if (data.count && selected.length !== 1) throw new Error("Choose one idea when requesting multiple videos.");
    const sources = data.count ? Array.from({ length: data.count }, () => selected[0]!) : selected;
    const clones: Narrative[] = sources.map(({ b, original }, index) => ({ ...original, title: sources.length > 1 ? `${original.title.slice(0, 145)} · Video ${index + 1}` : original.title, id: rid(), selected: true, origin: narrativeKey(b.id, original), createdAt: original.createdAt ?? new Date().toISOString(), libraryStatus: "available" }));
    const { admin } = selected[0]!;
    const inserted = await admin.from("creative_batches").insert({ workspace_id: workspaceId, title: clones.length === 1 ? `From idea: ${clones[0]!.title}`.slice(0, 120) : `${clones.length} selected narratives`, goal: "", days: 3, starts_on: starts,
      created_by: user.id, audience: "", offer: "", destination: "", stage: "narratives", narratives: clones as never }).select("id").single();
    if (inserted.error) throw new Error(inserted.error.message);
    return { batchId: inserted.data.id };
  });

type PlannedAsset = { argument?: string; day: number; angle: string; hook: string; format: string; duration_s: number; size: string; beats: string[]; voiceover: string; script: string; caption: string; cta: string; file_ids?: string[] };
type WizardPlan = { title: string; audience: string; offer: string; voice: string; voice_reason: string; variants: PlannedAsset[] };

/** Show only model metadata; connection secrets and provider calls stay on the server. */
export const getVideoModelOptions = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    await assertMember(user.id, data.workspace_id);
    const { getCreativeProviderAvailability } = await import("./creative-providers/adapters.server");
    const available = new Set(getCreativeProviderAvailability().filter((capability) => capability.available).map((capability) => capability.capabilityId));
    return listVideoStyles(available);
  });

/** Plan the exact selected briefs with evidence, available capabilities and independent critique. Previous plans remain in the library. */
export const planFromNarratives = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({
    batch_id: z.string().uuid(), count: z.number().int().min(1).max(MAX_ASSETS_PER_BATCH).default(MAX_ASSETS_PER_BATCH),
    assets: z.array(z.object({ narrative: z.string().max(200), duration: z.union([z.literal(15), z.literal(30), z.literal(60)]), size: z.enum(NEW_BATCH_SIZES), style_id: z.enum(VIDEO_STYLE_IDS).optional(), note: z.string().max(300).optional(), captions: z.enum(["clean", "off"]).optional() })).max(MAX_ASSETS_PER_BATCH).optional(),
    voice: z.string().max(40).nullable().optional(), retry: z.boolean().optional(), reconsider_styles: z.string().uuid().optional(),
    style_overrides: z.array(z.enum(VIDEO_STYLE_IDS).nullable()).max(MAX_ASSETS_PER_BATCH).optional(),
    user_choice_index: z.number().int().min(0).max(MAX_ASSETS_PER_BATCH - 1).optional(),
  }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { admin, b, narratives } = await loadBatch(user.id, data.batch_id);
    const picked = selectedNarratives(narratives);
    if (!picked.length) throw new Error("Pick at least one narrative first.");
    const savedCreation = picked.map((n) => (n as unknown as Record<string, unknown>)["asset_creation"]).filter(Boolean);
    if (savedCreation.some((value) => { const state = value as Record<string, unknown>; return state["status"] !== "ready_to_create" || state["deferred"] === true; })) throw new Error("Resolve the saved asset requests before preparing this video.");
    let input: Record<string, unknown> = { ...data, picked,
      style_overrides: data.assets?.map((asset) => asset.style_id ?? null),
      user_model_choices: data.assets?.map((asset) => Boolean(asset.style_id)) };
    if (data.reconsider_styles) {
      if (!b.active_plan_id || b.stage !== "briefs") throw new Error("Open your saved video briefs before comparing styles again.");
      const previous = await (admin.from("creative_planning_jobs" as never) as any).select("input").eq("id", b.active_plan_id).eq("batch_id", b.id).eq("status", "completed").maybeSingle();
      const priorInput = previous.data?.input as Record<string, unknown> | undefined;
      if (previous.error || !priorInput || !Array.isArray(priorInput.assets) || priorInput.assets.length !== data.count) throw new Error("Could not restore the original video options. Your saved briefs are unchanged.");
      if (data.style_overrides && data.style_overrides.length !== priorInput.assets.length) throw new Error("Choose a model for the current video plan.");
      const previousOverrides = Array.isArray(priorInput.style_overrides) ? priorInput.style_overrides : [];
      const previousChoices = Array.isArray(priorInput.user_model_choices) ? priorInput.user_model_choices : [];
      const user_model_choices = priorInput.assets.map((_, index) => previousChoices[index] === true || data.user_choice_index === index);
      const style_overrides = priorInput.assets.map((_, index) => data.style_overrides ? data.style_overrides[index] : user_model_choices[index] ? previousOverrides[index] ?? null : null);
      if (data.user_choice_index !== undefined && !style_overrides[data.user_choice_index]) throw new Error("Choose a connected model for this video.");
      input = { ...priorInput, batch_id: b.id, picked, style_overrides, user_model_choices, reconsider_styles: data.reconsider_styles };
    } else if (data.style_overrides?.some(Boolean)) {
      throw new Error("Review Sam's plan before changing a video model.");
    }
    const { enqueueNarrativePlan } = await import("./narrative-planning.server");
    const result = await enqueueNarrativePlan(admin, { workspaceId: b.workspace_id, userId: user.id, batchId: b.id, input, retry: data.retry === true });
    if (result.status === "completed" && b.stage === "narratives") {
      const restored = await admin.from("creative_batches").update({ stage: "briefs", active_plan_id: result.plan_id }).eq("id", b.id).eq("workspace_id", b.workspace_id).eq("stage", "narratives");
      if (restored.error) throw new Error("Your saved video briefs are ready, but the wizard could not reopen them.");
    }
    await kickCreativeJobs(admin);
    return result;
  });

export const getNarrativePlanningJob = createServerFn({ method: "GET" })
  .inputValidator((i: unknown) => z.object({ batch_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { admin, b } = await loadBatch(user.id, data.batch_id);
    return (await import("./narrative-planning.server")).latestNarrativePlan(admin, b.id);
  });

/** Only the authenticated durable worker calls this; it never queues paid generation. */
export const executeNarrativePlanningJob = createServerOnlyFn(async function executeNarrativePlanningJob(job: import("./narrative-planning.server").NarrativePlanningJob) {
    const data = job.input as { batch_id: string; count: number; assets?: Array<{ narrative: string; duration: 15 | 30 | 60; size: (typeof NEW_BATCH_SIZES)[number]; style_id?: (typeof VIDEO_STYLE_IDS)[number]; note?: string; captions?: "clean" | "off" }>; voice?: string | null; picked: Narrative[]; style_overrides?: Array<(typeof VIDEO_STYLE_IDS)[number] | null>; user_model_choices?: boolean[] };
    const user = { id: job.created_by };


    const { admin, b } = await loadBatch(user.id, data.batch_id);
    const picked = data.picked;
    if (!picked.length) throw new Error("Pick at least one narrative first.");
    const standalone = picked.every((idea) => idea.context_mode === "standalone");
    const sources = picked.filter((n) => n.origin && n.origin !== `${b.id}:${n.id}`).map((n) => n.origin!);
    if (sources.length) {
      const sourceIds = [...new Set(sources.map((key) => key.split(":")[0]!))];
      const { data: sourceBatches, error: sourceError } = await admin.from("creative_batches").select("id,narratives").eq("workspace_id", b.workspace_id).in("id", sourceIds);
      if (sourceError) throw new Error("Could not verify selected narratives.");
      const sourceIdeas = new Map<string, Narrative>((sourceBatches ?? []).flatMap((batch) => (Array.isArray(batch.narratives) ? batch.narratives : []).map((idea) => [`${batch.id}:${(idea as Narrative).id}`, idea as Narrative] as [string, Narrative])));
      if (sources.some((key) => !sourceIdeas.has(key) || sourceIdeas.get(key)?.libraryStatus === "rejected" || sourceIdeas.get(key)?.libraryStatus === "binned")) {
        throw new Error("A selected idea was rejected or binned. Restore it before planning.");
      }
    }
    const count = clampAssets(data.count);
    const pickedTitles = new Set(picked.map((p) => p.title));
    if (data.assets && (data.assets.length !== count || data.assets.some((a) => !pickedTitles.has(a.narrative)))) throw new Error("Choose a selected narrative for each video.");
    const specs = data.assets ?? suggestBreakdown(picked, count).map((a) => ({ narrative: a.narrative, duration: a.duration, size: "1080x1920" as const }));
    const userVoice = data.voice && BUILTIN_VOICES.some((v) => v.name === data.voice) ? data.voice : null;
    if (data.voice && !userVoice) throw new Error("Choose an available narrator.");
    const { planProductionAssets } = await import("./creative-planning.server");
    const recipeSchema = z.object({ recipe_id: z.enum(["branded-motion", "illustrated-explainer", "cinematic-ad", "reaction-demo"]), style_id: z.enum(VIDEO_STYLE_IDS), file_ids: z.array(z.string().uuid()).max(20), music_file_id: z.string().uuid().optional(), music_rights_confirmed: z.literal(true).optional(), status: z.literal("ready_to_create"), deferred: z.literal(false) });
    const recipes = specs.map((spec) => {
      const selected = picked.find((n) => n.title === spec.narrative);
      const raw = selected && (selected as unknown as Record<string, unknown>)["asset_creation"];
      return raw ? recipeSchema.parse(raw) : null;
    });
    const recipeFiles = recipes.some(Boolean) ? [...new Set(recipes.flatMap((recipe) => recipe?.file_ids ?? []))] : undefined;
    const plan = job.checkpoint?.plan ?? await planProductionAssets({ admin, userId: user.id, workspaceId: b.workspace_id, picked, specs: specs.map((s, index) => {
      const recipe = recipes[index];
      const golpoNativeSize = s.size === "1080x1920" || s.size === "1920x1080";
      const delivery = recipe && (recipe.recipe_id !== "illustrated-explainer" || recipe.music_file_id || !golpoNativeSize || userVoice) ? { mode: "assembled_ad" as const, ...(recipe.music_file_id ? { music_file_id: recipe.music_file_id, music_rights_confirmed: recipe.music_rights_confirmed } : {}) } : undefined;
      return { narrative: s.narrative, duration: s.duration, size: s.size, ...("note" in s && s.note ? { note: s.note } : {}), ...(recipe ? { style_id: recipe.style_id, recipe_id: recipe.recipe_id, selected_file_ids: recipe.file_ids, delivery } : data.style_overrides?.[index] ? { style_id: data.style_overrides[index]! } : {}), model_choice: recipe || data.user_model_choices?.[index] ? "user" as const : "sam" as const };
    }), voice: userVoice, allowedFileIds: recipeFiles, userDirected: recipes.some(Boolean) });
    const checkpoint = job.checkpoint ?? { plan, variant_ids: plan.variants.map(() => crypto.randomUUID()) };
    if (checkpoint.variant_ids.length !== plan.variants.length) throw new Error("The saved video plan is incomplete. No video generation has started.");
    await (await import("./narrative-planning.server")).savePlanningCheckpoint(admin, job.id, checkpoint);
    // The expensive initial inference gets its own invocation. Brief writing starts with a fresh runtime budget.
    if (!job.checkpoint) return { count: plan.variants.length, plan_id: job.id, deferred: true };
    const [library, voiceSettings, workspace, previousPosition] = await Promise.all([
      admin.from("brand_files").select("id,name,kind,mime,ai_label,ai_summary,media_role,bg_tone,subject").eq("workspace_id", b.workspace_id).order("updated_at", { ascending: false }).limit(120),
      standalone ? { data: null, error: null } : admin.from("workspace_voice_settings").select("brand_voice_id").eq("workspace_id", b.workspace_id).maybeSingle(),
      standalone ? { data: null, error: null } : admin.from("workspaces").select("name").eq("id", b.workspace_id).single(),
      admin.from("creative_variants").select("position").eq("batch_id", b.id).eq("workspace_id", b.workspace_id).order("position", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (library.error || voiceSettings.error || workspace.error || previousPosition.error) throw new Error("Could not prepare this business's approved assets.");
    const lib = library.data ?? [];
    const own = new Set(lib.map((f) => f.id));
    if (plan.variants.some((v) => v.file_ids.some((id) => !own.has(id)))) throw new Error("The media library changed during planning. Please plan again.");
    const { creativeDirectionText } = await import("./creative-direction");
    const planId = job.id;
    const offset = (previousPosition.data?.position ?? -1) + 1;
    const rows = plan.variants.map((v, i) => ({
      id: checkpoint.variant_ids[i]!, workspace_id: b.workspace_id, batch_id: b.id, position: offset + i, planned_for: null,
      duration_s: v.duration_s, size: v.size, beats: v.beats, voiceover: v.voiceover, narrative: v.angle,
      angle: v.angle, hook: v.hook, format: v.format,
      script: `${v.script}\n\nSTRUCTURED CREATIVE DIRECTION:\n${creativeDirectionText(v.production_plan.direction!)}`,
      caption: v.caption, cta: v.cta, file_ids: v.file_ids, argument: v.argument,
      production_plan: { ...v.production_plan, plan_id: planId,
        source_narrative_key: (() => { const source = picked.find((n) => n.title === specs[i]?.narrative); return source ? narrativeKey(b.id, source) : null; })() } as never,
      captions: data.assets?.[i]?.captions === "off" ? "off" : "clean",
      build_prompt_issues: ["Build prompt preparation and review are pending."],
    }));
    // Recovery never overwrites a saved prompt, its review, or an already edited brief.
    const existing = await admin.from("creative_variants").select("id").eq("workspace_id", b.workspace_id).in("id", checkpoint.variant_ids);
    if (existing.error) throw new Error("Could not inspect the saved video briefs.");
    const existingIds = new Set((existing.data ?? []).map((row) => row.id));
    const missing = rows.filter((row) => !existingIds.has(row.id));
    if (missing.length) {
      const ins = await admin.from("creative_variants").insert(missing);
      if (ins.error) throw new Error(ins.error.message);
    }
    const savedBriefs = await admin.from("creative_variants").select("id,position,build_prompt,build_prompt_issues,opening_visual").eq("workspace_id", b.workspace_id).in("id", checkpoint.variant_ids);
    if (savedBriefs.error) throw new Error("Could not load the saved video briefs.");
    const inserted = savedBriefs.data ?? [];
    if (inserted.length !== count) throw new Error("The complete set of briefs was not returned. Production remains pending.");
    const unavailable = "Build prompt could not be prepared. Review this brief before production.";
      const pb = await import("./playbook.server");
      const { loadMotionKit } = await import("./composition.server");
      const { batchOpeningProblems } = await import("./build-prompt");
      const [kit, facts] = await Promise.all([standalone ? { text: "" } : loadMotionKit(admin, b.workspace_id), standalone ? null : pb.getFacts(admin, b.workspace_id)]);
      const byId = new Map(lib.map((f) => [f.id, f]));
      await (await import("./narrative-planning.server")).continuePlanningBriefs(inserted, async (row) => {
        const localIndex = checkpoint.variant_ids.indexOf(row.id);
        const brief = rows[localIndex]!;
        const files = brief.file_ids.map((id) => byId.get(id)).filter((f): f is NonNullable<typeof f> => !!f)
          .map((f) => ({ path: `assets/${f.id}.${f.kind === "video" ? "mp4" : extOf(f.name, f.mime ?? null)}`, name: f.name, note: [f.media_role, f.subject ?? f.ai_label].filter(Boolean).join(", ") }));
        const out = await pb.writeBuildPrompt({ id: row.id, hook: brief.hook, narrative: brief.narrative, argument: brief.argument, beats: brief.beats, voiceover: brief.voiceover, cta: brief.cta, script: brief.script, duration_s: brief.duration_s, size: brief.size, production_plan: brief.production_plan, files }, { brand: workspace.data?.name ?? "", kit: kit.text, facts, otherOpenings: rows.filter((_, index) => index !== localIndex).map((other) => other.hook) }).catch(() => null);
        const issues = out?.issues ?? [unavailable];
        const result = await admin.from("creative_variants").update(out ? {
          build_prompt: out.markdown, build_prompt_issues: issues, opening_visual: out.data.opening_visual.slice(0, 300),
          ...(issues.length ? {} : { voiceover: out.data.vo.map((line) => line.line).join(" ").slice(0, 4000) }),
        } : { build_prompt_issues: issues }).eq("id", row.id).eq("workspace_id", b.workspace_id);
        if (result.error) throw new Error("Could not save build prompt review.");
      });
      const reviewed = await admin.from("creative_variants").select("id,hook,build_prompt,build_prompt_issues,opening_visual").eq("workspace_id", b.workspace_id).in("id", checkpoint.variant_ids);
      if (reviewed.error) throw new Error("Could not load build prompt review.");
      const setIssues = batchOpeningProblems((reviewed.data ?? []).filter((row) => row.build_prompt && row.opening_visual).map((row) => ({ hook: row.hook, opening_visual: row.opening_visual! })));
      for (const row of reviewed.data ?? []) {
        if (!row.build_prompt || !setIssues.length) continue;
        const issues = [...new Set([...(Array.isArray(row.build_prompt_issues) ? row.build_prompt_issues : []), ...setIssues])];
        const marked = await admin.from("creative_variants").update({ build_prompt_issues: issues }).eq("id", row.id).eq("workspace_id", b.workspace_id);
        if (marked.error) throw new Error("Could not save the set's opening review.");
      }
    const chosen = voiceSettings.data?.brand_voice_id ?? null;
    const updated = await admin.from("creative_batches").update({
      title: plan.title.slice(0, 120), goal: picked.map((p) => p.title).join(" · ").slice(0, 1000), audience: plan.audience, offer: plan.offer,
      voice_id: userVoice ? toBuiltinId(userVoice) : chosen ?? toBuiltinId(plan.voice),
      voice_reason: userVoice ? "You picked this narrator." : chosen ? "Your chosen brand voice." : plan.voice_reason.slice(0, 300), stage: "briefs", active_plan_id: planId,
    }).eq("id", b.id);
    if (updated.error) throw new Error("Briefs were saved, but the batch could not advance.");
    return { count: rows.length, plan_id: planId };
});

/** Explicit "Create N assets": queue every brief that has no finished or active render. */
export const produceBatch = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ batch_id: z.string().uuid(), approvals: z.array(z.object({ variant_id: z.string().uuid(), version: z.number().int(), credits: z.number().int().positive(), lines: creditLinesSchema })).optional() }).parse(i))
  .handler(async ({ data }) => {
    const request = productionRequest();
    const user = await requireUser();
    const { admin, b } = await loadBatch(user.id, data.batch_id);
    const { data: vs } = await admin.from("creative_variants").select("id,position,production_plan").eq("batch_id", b.id).order("position");
    const ids = activePlanningVariants(vs ?? [], b.active_plan_id).map((v) => v.id);
    if (!ids.length) throw new Error("There are no briefs to make.");
    const { data: jobs } = await admin.from("render_jobs").select("variant_id,status").in("variant_id", ids);
    const skip = new Set((jobs ?? []).filter((j) => j.status !== "failed").map((j) => j.variant_id));
    const pendingIds = ids.filter((id) => !skip.has(id));
    if (pendingIds.length > MAX_ASSETS_PER_BATCH) throw new Error("Create up to four videos at a time. Keep the remaining narratives for a subsequent batch.");
    request.expected_count = Math.max(1, pendingIds.length);
    let queued = 0; const errors: string[] = [];
    for (const id of pendingIds) {
      try { const approved = data.approvals?.find((item) => item.variant_id === id); await queueRender(admin, user.id, id, undefined, "user", undefined, request, approved && { version: approved.version, credits: approved.credits, lines: approved.lines }); queued++; } catch (e) { errors.push(e instanceof Error ? e.message : "Couldn't queue"); }
    }
    if (queued) await admin.from("creative_batches").update({ stage: "producing" }).eq("id", b.id);
    await kickCreativeJobs(admin);
    if (errors.length) await (await import("./creative-render-alerts.server")).notifyFailedRenderJobs(admin, b.workspace_id);
    if (!queued && errors.length) throw new Error(errors[0]);
    return { queued, failed: errors.length, first_error: errors[0] ?? null, production_run_id: request.run_id };
  });

const REVISE_SCHEMA = {
  type: "object", additionalProperties: false, required: ["hook", "beats", "voiceover", "caption", "cta"],
  properties: { hook: STR, beats: { type: "array", items: STR }, voiceover: STR, caption: STR, cta: STR },
};

/** Edit with a note: Sam rewrites the brief, bumps the version and rebuilds it. */
export const reviseVariant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), source_render_id: z.string().uuid().optional(), note: z.string().min(2).max(1000), rebuild: z.boolean().default(true), expected_version: z.number().int().optional(), expected_credits: z.number().int().positive().optional(), expected_rate_id: z.string().uuid().optional(), expected_lines: creditLinesSchema.optional() }).parse(i))
  .handler(async ({ data }) => {
    const request = productionRequest();
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: v } = await admin.from("creative_variants").select("*").eq("id", data.id).single();
    if (!v) throw new Error("Not found");
    await assertMember(user.id, v.workspace_id);
    const active = async () => {
      const result = await admin.from("render_jobs").select("id").eq("variant_id", v.id).in("status", ["queued", "preparing", "rendering"]).limit(1);
      if (result.error) throw new Error(result.error.message);
      if (result.data?.length) throw new Error("Sam is already editing this asset. Wait for that version to finish before starting another edit.");
    };
    await active();
    await preserveAssetBrief(admin, v);
    const sourceId = data.source_render_id ?? v.primary_render_id;
    let source = v;
    if (sourceId) {
      const result = await admin.from("render_jobs").select("*").eq("id", sourceId).eq("variant_id", v.id).eq("workspace_id", v.workspace_id).eq("status", "done").maybeSingle();
      if (result.error) throw new Error(result.error.message);
      if (!result.data) throw new Error("Choose a finished version to edit.");
      const snapshot = snapshotForRender(v, result.data);
      if (!hasBriefSnapshot(snapshot)) throw new Error("This older version can be viewed or made primary, but its original editing brief was not saved. Choose a newer version to edit.");
      source = assetWithSnapshot(v, snapshot);
    }
    if (data.rebuild) await preflightRender(admin, user.id, source);
    const dossier = snapshotRecord(source.production_plan)?.["standalone"] === true ? "" : await loadDossierContext(v.workspace_id);
    const json = await aiChat({
      model: "openai/gpt-6-astra", reasoning_effort: "low",
      messages: [
        { role: "system", content: `You are Sam revising one ${source.duration_s}s motion-graphic video brief. Apply the user's change request exactly and keep everything else that works. 'beats' are 3-5 on-screen text frames (max 8 words). Voiceover about ${source.duration_s >= 60 ? 135 : source.duration_s >= 30 ? 70 : 35} words. Use only verified facts.\n${dossier}` },
        { role: "user", content: `Current brief:\n${JSON.stringify({ hook: source.hook, beats: source.beats, voiceover: source.voiceover, caption: source.caption, cta: source.cta })}\n\nChange request: ${data.note}` },
      ],
      response_format: { type: "json_schema", json_schema: { name: "revision", strict: true, schema: REVISE_SCHEMA } },
    });
    const raw = json.choices?.[0]?.message?.content;
    if (!raw) throw new Error("Sam couldn't apply that change. Try rewording the note.");
    const r = JSON.parse(raw) as { hook: string; beats: string[]; voiceover: string; caption: string; cta: string };
    await active();
    const revised = {
      ...source, hook: r.hook.slice(0, 500), beats: r.beats.slice(0, 5), voiceover: r.voiceover.slice(0, 2000),
      caption: r.caption.slice(0, 2200), cta: r.cta.slice(0, 300), review_note: data.rebuild ? data.note : null,
    };
    if (data.rebuild) {
      // Check external voice configuration before committing any new brief/version.
      // The RPC repeats database guards and updates the brief + queue in one transaction.
      await preflightRender(admin, user.id, revised);
      const creditDb = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
      const { quoteProductionCredits, assertApprovedProductionQuote } = await import("./content-credits.server");
      const rate = await quoteProductionCredits(creditDb, revised.production_plan, revised.duration_s);
      const credits = rate.credits;
      assertApprovedProductionQuote({ version: data.expected_version, credits: data.expected_credits, lines: data.expected_lines }, v.version, rate);
      const period = await creditDb.rpc("ensure_free_content_credit_period", { _workspace_id: v.workspace_id, _user_id: user.id });
      if (period.error) throw new Error("Credit allowance is unavailable. No video was started.");
      const queued = await creditDb.rpc("enqueue_composite_credit_asset_revision", { _variant_id: v.id, _expected_version: v.version, _brief: { ...snapshotRecord(assetBriefSnapshot(revised)), production_request: request }, _revision_note: data.note, _user_id: user.id, _lines: rate.lines });
      if (queued.error?.code === "P0001" && queued.error.message.includes("Insufficient credits")) {
        const { attemptCreditAutoUpgrade } = await import("./content-credits.server");
        if (await attemptCreditAutoUpgrade(v.workspace_id, `revision:${v.id}:${v.version}`, credits)) throw new Error("Your upgrade payment is pending. Try again after payment is confirmed.");
        throw new Error("Not enough credits for this video. Upgrade or wait for your next monthly allowance.");
      }
      if (queued.error) throw new Error(queued.error.message);
      const result = z.object({ render_id: z.string().uuid(), version: z.number().int() }).parse(queued.data);
      await kickCreativeJobs(admin);
      return { ok: true, render_id: result.render_id, version: result.version };
    }
    const { data: newest, error: versionError } = await admin.from("render_jobs").select("version").eq("variant_id", v.id).order("version", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (versionError) throw new Error(versionError.message);
    const version = Math.max(v.version, newest?.version ?? 0) + 1;
    const updated = await admin.from("creative_variants").update({
      ...assetBriefPatch(revised), version, review_state: reviewStateAfterEdit(false), review_note: null,
    }).eq("id", v.id).eq("version", v.version).select("id");
    if (updated.error) throw new Error(updated.error.message);
    if (!updated.data?.length) throw new Error("This asset changed while Sam was editing it. Refresh and try again.");
    return { ok: true, version };
  });

/** Duplicate a brief (before production). */
export const duplicateVariant = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: v } = await admin.from("creative_variants").select("*").eq("id", data.id).single();
    if (!v) throw new Error("Not found");
    await assertMember(user.id, v.workspace_id);
    const { count } = await admin.from("creative_variants").select("id", { count: "exact", head: true }).eq("batch_id", v.batch_id);
    if ((count ?? 0) >= MAX_ASSETS_PER_BATCH) throw new Error(`A batch can have up to ${MAX_ASSETS_PER_BATCH} assets for now.`);
    const { id: _id, created_at: _c, updated_at: _u, lineage_id: _l, primary_render_id: _primary, ...rest } = v;
    const ins = await admin.from("creative_variants").insert({ ...rest, position: v.position + 1, version: 1, review_state: "draft", review_note: null });
    if (ins.error) throw new Error(ins.error.message);
    return { ok: true };
  });

/** Which motion-kit guides Sam will design from for this workspace. */
export const motionKitStatus = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    const { loadMotionKit } = await import("./composition.server");
    const kit = await loadMotionKit(admin, data.workspace_id);
    return { guides: kit.used };
  });

/** The brand's facts sheet (what Sam may claim). Built on first request. */
export const getBrandFacts = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), rebuild: z.boolean().default(false) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    const pb = await import("./playbook.server");
    if (data.rebuild) {
      const { loadMotionKit } = await import("./composition.server");
      return pb.buildFactsSheet(admin, data.workspace_id, (await loadMotionKit(admin, data.workspace_id)).text, user.id);
    }
    return pb.getFacts(admin, data.workspace_id);
  });

const lines = z.array(z.string().trim().min(1).max(300)).max(40);
export const saveBrandFacts = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ workspace_id: z.string().uuid(), does: lines, does_not: lines, banned_claims: lines, banned_colours: lines }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = await assertMember(user.id, data.workspace_id);
    const { workspace_id, ...f } = data;
    const r = await admin.from("brand_facts").upsert({ workspace_id, ...f, updated_by: user.id, updated_at: new Date().toISOString() });
    if (r.error) throw new Error(r.error.message);
    return { ok: true };
  });

/** Edit an asset's full build prompt before it's made. */
export const saveBuildPrompt = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ id: z.string().uuid(), build_prompt: z.string().min(50).max(40000) }).parse(i))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const { data: v } = await admin.from("creative_variants").select("workspace_id,review_state").eq("id", data.id).single();
    if (!v) throw new Error("Not found");
    await assertMember(user.id, v.workspace_id);
    if (v.review_state === "approved") throw new Error("Approved assets can't be edited.");
    await admin.from("creative_variants").update({ build_prompt: data.build_prompt }).eq("id", data.id);
    return { ok: true };
  });
