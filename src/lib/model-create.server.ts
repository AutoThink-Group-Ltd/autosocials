import { getAdminClient } from "./supabase-admin.server";
import { getCreativeProviderAvailability } from "./creative-providers/adapters.server";
import { getCreativeCapability } from "./creative-providers/registry";
import { getVideoStyle, productionEngineIds } from "./video-styles";
import { BUILTIN_NAMES, toBuiltinId } from "./integrations";
import { planProductionAssets } from "./creative-planning.server";
import { queueRender, kickCreativeJobs } from "./creative.functions";
import { creativeDirectionText } from "./creative-direction";
import { narrativeKey } from "./narrative-library";
import { aiChat } from "./dossier.server";
import draftSystem from "../../prompts/models/draft-prompt.md?raw";
import type { ModelCreateRequest, ModelPromptRequest, ModelVideoRequestLookup, ModelVideoRequestState } from "./model-create.functions";
import type { Narrative } from "./wizard";

type Admin = ReturnType<typeof getAdminClient>;
class ModelCreateError extends Error {}

export async function requireModelWorkspace(admin: Admin, userId: string, workspaceId: string) {
  const access = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("You do not have access to this business.");
}

export async function quoteModelVideoForUser(userId: string, input: { workspace_id: string; style_id: string; duration: number }) {
  const admin = getAdminClient();
  await requireModelWorkspace(admin, userId, input.workspace_id);
  const style = requireAvailableStyle(input.style_id);
  const { getContentCreditRate } = await import("./content-credits.server");
  const rate = await getContentCreditRate(admin as unknown as import("@supabase/supabase-js").SupabaseClient, style.capability_id, input.duration);
  return { credits: rate.credits, rateId: rate.version, capabilityId: style.capability_id };
}

async function selectedFiles(admin: Admin, workspaceId: string, ids: string[]) {
  if (!ids.length) return [];
  const files = await admin.from("brand_files").select("id,name,kind,ai_label,ai_summary,extracted_text").eq("workspace_id", workspaceId).in("id", [...new Set(ids)]);
  if (files.error || new Set(files.data?.map((file) => file.id)).size !== new Set(ids).size) throw new Error("A selected file is unavailable in this business. Select your files again.");
  return files.data ?? [];
}

function requireAvailableStyle(styleId: string) {
  const style = getVideoStyle(styleId);
  if (!style || getCreativeCapability(style.capability_id).output !== "video" || !getCreativeProviderAvailability().some((entry) => entry.capabilityId === style.capability_id && entry.available)) throw new Error("The selected model is unavailable. Connect it or choose another model.");
  return style;
}

const FAILURE_MARKER = "Create could not finish. Review this saved request and production history before retrying.";

async function inspectRequest(admin: Admin, userId: string, input: ModelVideoRequestLookup): Promise<ModelVideoRequestState> {
  const batch = await admin.from("creative_batches").select("id,workspace_id,created_by,title,narratives").eq("id", input.request_id).maybeSingle();
  if (batch.error) throw new Error("The saved request could not be checked. Refresh before retrying.");
  if (!batch.data) return { state: "not_found" };
  if (batch.data.workspace_id !== input.workspace_id || batch.data.created_by !== userId) throw new Error("This request cannot be resumed. Refresh the Models page.");
  const variants = await admin.from("creative_variants").select("id").eq("batch_id", input.request_id).eq("workspace_id", input.workspace_id).limit(2);
  if (variants.error || !variants.data || variants.data.length > 1) throw new Error("The saved request's briefs could not be checked. Open Create before retrying.");
  const failedClaim = batch.data.title?.startsWith("Needs review: ") && Array.isArray(batch.data.narratives) && batch.data.narratives.some((item) => item && typeof item === "object" && !Array.isArray(item) && typeof item["why"] === "string" && item["why"].endsWith(FAILURE_MARKER));
  if (variants.data.length === 1) {
    const variantId = variants.data[0]!.id;
    const jobs = await admin.from("render_jobs").select("id,status,phase").eq("variant_id", variantId).eq("workspace_id", input.workspace_id);
    if (jobs.error || !jobs.data) throw new Error("The saved request's production history could not be checked. Refresh before retrying.");
    if (jobs.data.some((job) => ["queued", "preparing", "rendering", "done"].includes(job.status))) return { state: "queued", batch_id: input.request_id, variant_id: variantId };
    if (!failedClaim && !jobs.data.length && Array.isArray(batch.data.narratives) && batch.data.narratives.some((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const request = item["model_create_request"];
      return !!request && typeof request === "object" && !Array.isArray(request) && request["preview_only"] === true;
    })) return { state: "preview", batch_id: input.request_id, variant_id: variantId };
    // A failed render can still own paid work awaiting reconciliation. A new
    // request creates a new variant, so its admission guard cannot protect this one.
    const steps = await admin.from("generation_steps").select("provider,status,provider_job_id,error_code").eq("variant_id", variantId).eq("workspace_id", input.workspace_id);
    if (steps.error || !steps.data) throw new Error("The saved request's generation history could not be checked. Refresh before retrying.");
    // Match the existing paid-retry rules for a failed operation with no job identity.
    const definiteNoJobFailures = new Set(["provider_rejected", "authentication_failed", "rate_limited", "invalid_input", "not_configured", "production_preflight_failed", "provider_stream_failed", "http_400", "http_401", "http_403", "http_404", "http_413", "http_415", "http_422", "http_429", "user_confirmed_retry_after_unknown"]);
    const uncertain = jobs.data.some((job) => job.phase === "reconciliation_required") || steps.data.some((step) => step.provider !== "autosocials" &&
      (!["completed", "failed"].includes(step.status) || (step.status === "failed" && !step.provider_job_id && !definiteNoJobFailures.has(step.error_code ?? ""))));
    // Unknown states remain uncertain. Only a terminal failure or the completed catch permits revision.
    const knownFailures = jobs.data.length > 0 && jobs.data.every((job) => job.status === "failed");
    const state = !uncertain && (knownFailures || (failedClaim && jobs.data.length === 0)) ? "failed" : "preparing";
    return { state, batch_id: input.request_id, variant_id: variantId };
  }
  return { state: failedClaim ? "failed" : "preparing", batch_id: input.request_id };
}

export async function getModelVideoRequestForUser(userId: string, input: ModelVideoRequestLookup): Promise<ModelVideoRequestState> {
  const admin = getAdminClient();
  await requireModelWorkspace(admin, userId, input.workspace_id);
  return inspectRequest(admin, userId, input);
}

function resumeExisting(state: ModelVideoRequestState, input: ModelVideoRequestLookup) {
  if (state.state === "queued" && state.batch_id && state.variant_id) return { batch_id: state.batch_id, variant_id: state.variant_id };
  if (state.state === "preview" && state.batch_id && state.variant_id) return { batch_id: state.batch_id, variant_id: state.variant_id, preview: true as const };
  throw new Error(`This Create request is already saved. Open batch ${input.request_id} in Create to review its progress or recover its brief before trying again. No duplicate generation was started.`);
}

export async function createModelVideoForUser(userId: string, input: ModelCreateRequest) {
  const admin = getAdminClient();
  await requireModelWorkspace(admin, userId, input.workspace_id);
  const existing = await inspectRequest(admin, userId, input);
  if (existing.state !== "not_found") return resumeExisting(existing, input);
  await selectedFiles(admin, input.workspace_id, input.file_ids);
  const style = requireAvailableStyle(input.style_id);
  const approved = await quoteModelVideoForUser(userId, input);
  if (input.expected_credits !== approved.credits || input.expected_rate_id !== approved.rateId) throw new Error("The credit price changed. Review the updated quote before creating.");
  const voiceId = input.voice ? toBuiltinId(input.voice) : null;
  if (input.voice && !voiceId) throw new Error(`Choose an available narrator: ${BUILTIN_NAMES.join(", ")}.`);
  const picked: Narrative[] = [{ id: input.request_id, title: input.prompt.slice(0, 160), message: input.prompt,
    why: `Manual Models request. Selected reference file IDs: ${input.file_ids.join(", ") || "none"}. Preserve these references and the complete user prompt.`, selected: true, custom: true,
    ...{ model_create_request: input } }];
  // The PK is the idempotency claim. Never upsert or resume expensive work on conflict.
  const claim = await admin.from("creative_batches").insert({ id: input.request_id, workspace_id: input.workspace_id, created_by: userId,
    title: input.prompt.slice(0, 120), goal: input.prompt, days: 1, starts_on: null, stage: "briefs", narratives: picked as never });
  if (claim.error?.code === "23505") return resumeExisting(await inspectRequest(admin, userId, input), input);
  if (claim.error) throw new Error("Your request could not be saved. Please try again.");
  let variantId: string | undefined;
  let admitted = false;
  let phase: "planning" | "saving" | "queueing" = "planning";
  try {
    const plan = await planProductionAssets({ admin, userId, workspaceId: input.workspace_id, picked,
      specs: [{ narrative: picked[0]!.title, duration: input.duration, size: input.size, style_id: input.style_id, model_choice: "user", note: input.note }],
      voice: voiceId?.replace(/^builtin:/, "") ?? null, allowedFileIds: input.file_ids, userDirected: true });
    const variant = plan.variants[0];
    if (plan.variants.length !== 1 || !variant?.production_plan.direction || variant.production_plan.video_style.id !== input.style_id
      || variant.duration_s !== input.duration || variant.size !== input.size
      || !productionEngineIds(variant.production_plan).includes(style.capability_id)) throw new ModelCreateError("The production plan did not preserve your selected model, length and format. Choose compatible settings and review the saved request.");
    requireAvailableStyle(input.style_id);
    const selected = new Set(input.file_ids);
    if (variant.file_ids.some((id) => !selected.has(id)) || variant.production_plan.steps.some((step) => step.reference_file_ids.some((id) => !selected.has(id)))) throw new ModelCreateError("The plan referenced files you did not select. Review the saved request and choose its references again.");
    const fileIds = [...new Set([...input.file_ids, ...variant.file_ids])];
    if (fileIds.length > 20) throw new ModelCreateError("The plan selected too many files. Review your references and try again.");
    const sources = await selectedFiles(admin, input.workspace_id, fileIds);
    phase = "saving";
    const saved = await admin.from("creative_batches").update({ title: plan.title.slice(0, 120), audience: plan.audience, offer: plan.offer,
      voice_id: voiceId ?? toBuiltinId(plan.voice), voice_reason: plan.voice_reason.slice(0, 300) }).eq("id", input.request_id).eq("workspace_id", input.workspace_id);
    if (saved.error) throw new ModelCreateError("Your production plan could not be saved.");
    variantId = crypto.randomUUID();
    const script = `${variant.script}\n\nUSER PROMPT:\n${input.prompt}\n\nSTRUCTURED CREATIVE DIRECTION:\n${creativeDirectionText(variant.production_plan.direction)}`;
    let storyboard: Awaited<ReturnType<typeof import("./playbook.server")["writeBuildPrompt"]>> = null;
    if (input.preview_only) {
      const { getFacts, writeBuildPrompt } = await import("./playbook.server");
      const { loadMotionKit } = await import("./composition.server");
      const { extOf } = await import("./brand-files");
      const [facts, kit] = await Promise.all([getFacts(admin, input.workspace_id), loadMotionKit(admin, input.workspace_id)]);
      storyboard = await writeBuildPrompt({
        ...variant, id: variantId, script, narrative: variant.angle, argument: variant.argument ?? null,
        files: sources.filter(source => ["image", "logo", "video"].includes(source.kind)).map(source => ({
          path: `assets/${source.id}.${source.kind === "video" ? "mp4" : extOf(source.name) || "png"}`,
          name: source.name,
          note: source.ai_label ?? "",
        })),
      }, { brand: "", kit: kit.text, facts, otherOpenings: [] });
      if (!storyboard) throw new ModelCreateError("Your storyboard could not be prepared. Retry before approving production.");
    }
    const brief = await admin.from("creative_variants").insert({ id: variantId, workspace_id: input.workspace_id, batch_id: input.request_id,
      position: 0, planned_for: null, duration_s: variant.duration_s, size: variant.size, beats: variant.beats,
      voiceover: storyboard && !storyboard.issues.length ? storyboard.data.vo.map((line) => line.line).join(" ").slice(0, 4000) : variant.voiceover, voice_id: voiceId ?? toBuiltinId(plan.voice), angle: variant.angle, narrative: variant.angle, hook: variant.hook, format: variant.format,
      script,
      caption: variant.caption, cta: variant.cta, argument: variant.argument, file_ids: fileIds, captions: input.captions,
      production_plan: { ...variant.production_plan, model_choice: "user", selected_files_only: true, plan_id: input.request_id, source_narrative_key: narrativeKey(input.request_id, picked[0]!) } as never,
      build_prompt: storyboard?.markdown ?? null, build_prompt_issues: storyboard?.issues ?? [] });
    if (brief.error) throw new ModelCreateError("Your video brief could not be saved. Open the saved batch to recover it.");
    if (input.preview_only) return { batch_id: input.request_id, variant_id: variantId, preview: true as const };
    const savedVariant = await admin.from("creative_variants").select("version,production_plan,duration_s").eq("id", variantId).single();
    if (savedVariant.error || !savedVariant.data) throw new ModelCreateError("The saved video quote could not be verified.");
    const { quoteProductionCredits } = await import("./content-credits.server");
    const savedQuote = await quoteProductionCredits(admin as unknown as import("@supabase/supabase-js").SupabaseClient, savedVariant.data.production_plan, savedVariant.data.duration_s);
    if (savedQuote.lines.length !== 1 || savedQuote.lines[0]?.capability_id !== approved.capabilityId || savedQuote.lines[0]?.rate_id !== approved.rateId || savedQuote.credits !== approved.credits) throw new ModelCreateError("The production plan requires a different price. Review it in Create before continuing.");
    phase = "queueing";
    const renderId = await queueRender(admin, userId, variantId, undefined, "user", undefined, undefined, { version: savedVariant.data.version, credits: approved.credits, lines: savedQuote.lines });
    if (!renderId) throw new ModelCreateError("Production was not queued. Review the saved brief before retrying.");
    admitted = true;
    const producing = await admin.from("creative_batches").update({ stage: "producing", active_plan_id: input.request_id }).eq("id", input.request_id).eq("workspace_id", input.workspace_id);
    if (producing.error) throw new ModelCreateError("Production was queued but its saved batch status could not be updated. Open Create to inspect the existing request.");
    await kickCreativeJobs(admin);
    return { batch_id: input.request_id, variant_id: variantId };
  } catch (error) {
    // Preserve all saved work. Never retry planning/admission after an uncertain or failed response.
    const safeToRevise = phase !== "queueing" || (error instanceof Error && "modelCreateSafeToRevise" in error && error.modelCreateSafeToRevise === true);
    const planningDetails = error instanceof Error && error.message.startsWith("Asset planning remains unresolved after one rework:")
      ? error.message.replace("Asset planning remains unresolved after one rework:", "Planning could not finish:").slice(0, 1200) : null;
    const safe = planningDetails ?? (error instanceof ModelCreateError ? error.message : error instanceof Error && /allowance|limit|credits|available narrator|selected model|selected file|voiceover|unresolved production checks/i.test(error.message) ? error.message.slice(0, 300)
      : phase === "planning" ? "Sam could not prepare a supported plan for the selected model, references and settings. Check the model's required inputs and try compatible settings."
        : phase === "queueing" ? "Production could not be admitted. Review this video's production checks and provider connections before retrying."
          : "Your production brief could not be saved completely.");
    // Persist the safe reason with this exact request, rather than discarding the planner's findings.
    if (!admitted && safeToRevise) await admin.from("creative_batches").update({ title: `Needs review: ${input.prompt.slice(0, 100)}`, narratives: picked.map((item) => ({ ...item, model_create_error: safe, why: `${item.why} ${FAILURE_MARKER}` })) as never }).eq("id", input.request_id).eq("workspace_id", input.workspace_id);
    if (!admitted && variantId) await admin.from("creative_variants").update({ build_prompt_issues: [safe] }).eq("id", variantId).eq("workspace_id", input.workspace_id);
    console.error("Models Create failed", { request_id: input.request_id, phase, admitted, reason: safe });
    throw new Error(`${safe} Your request is saved with its prompt and settings. Use Retry to try again, or Revise setup to make changes.`);
  }
}

export async function draftModelPromptForUser(userId: string, input: ModelPromptRequest) {
  const admin = getAdminClient();
  await requireModelWorkspace(admin, userId, input.workspace_id);
  const files = await selectedFiles(admin, input.workspace_id, input.file_ids);
  const style = requireAvailableStyle(input.style_id);
  const response = await aiChat({ model: "gpt-5.4-mini", store: false, max_completion_tokens: 1800, messages: [{ role: "system", content: draftSystem }, { role: "user", content: JSON.stringify({
    model: { name: style.name, description: style.description }, idea: input.prompt,
    files: files.map((file) => ({ id: file.id, name: file.name.slice(0, 160), kind: file.kind, label: file.ai_label?.slice(0, 300), summary: file.ai_summary?.slice(0, 600), document_excerpt: file.extracted_text?.slice(0, 1000) })),
  }) }], response_format: { type: "json_object" } });
  try {
    const draft = JSON.parse(response.choices?.[0]?.message?.content ?? "null") as { prompt?: unknown } | null;
    if (!draft || typeof draft.prompt !== "string" || draft.prompt.trim().length < 3 || draft.prompt.length > 5000) throw new Error();
    return { prompt: draft.prompt.trim() };
  } catch { throw new Error("Sam couldn't prepare a prompt. Try adding a little more detail."); }
}
