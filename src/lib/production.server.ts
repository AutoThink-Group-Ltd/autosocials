import { countWords, wordBudget } from "./film-length";
import type { AssetRow, RenderRow } from "./asset-versions.server";
import type { getAdminClient } from "./supabase-admin.server";
import { readProductionPlan, parseProductionProposal, productionProposal, type ProductionStep } from "./production-plan";
import { creativeSettingsDuration, getCreativeCapability, safeCreativeSettings, validateCreativeSettings, type CreativeCapability } from "./creative-providers/registry";
import { CreativeProviderError, getCreativeProviderAvailability, submitCreativeProviderJob, pollCreativeProviderJob, estimateCreativeProviderJob, type CreativeProviderJob } from "./creative-providers/adapters.server";
import { beginStep, updateStep, completeStep, failStep, previousGenerationStep } from "./generation-tracker.server";
import { downloadCreativeMedia } from "./creative-media.server";
import { MAX_PROVIDER_FILM_BYTES } from "./content-rules";
import type { ProjectFile } from "./render.server";

type Admin = ReturnType<typeof getAdminClient>;
const ownedProductionPath = (path: string | null | undefined, workspaceId: string): path is string => !!path?.startsWith(`${workspaceId}/`) && !path.includes("\\") && !path.split("/").some((part) => !part || part === "." || part === "..");
type StoredOutput = { path: string; kind: "image" | "video"; mime: string; bytes: number; stepId: string; durationSeconds?: number };
type PollBackoff = { attempt: number; nextAttemptAt: string };
export type ProductionState = { outputs: Record<string, StoredOutput>; rootStepId?: string; engine_version?: 1; polling?: Record<string, PollBackoff>; active_steps?: string[]; failed_steps?: Record<string, string> };
export class RecoverableProductionError extends Error { override readonly name = "RecoverableProductionError"; constructor() { super("Generated output ingestion is pending. The existing provider job will be resumed without regeneration."); } }

/** Resolve only a selected, owned video and require a verified duration before paid work. */
export async function reactionDemo(admin: Admin, workspaceId: string, fileIds: readonly string[]) {
  if (!fileIds.length) throw new Error("Select a demonstration video first.");
  const result = await admin.from("brand_files").select("id,name,kind,source,ai_label,duration_s,media_id,storage_path").eq("workspace_id", workspaceId).in("id", [...fileIds]);
  if (result.error || !result.data) throw new Error("The selected demonstration could not be checked.");
  const file = fileIds.map((id) => result.data.find((item) => item.id === id)).find((item) => item?.kind === "video" && item.source !== "shutterstock" && !/logo|illustrative stock|shutterstock/i.test(`${item.ai_label ?? ""} ${item.name}`));
  if (!file) throw new Error("Select an owned demonstration video first.");
  let seconds = file.duration_s;
  if ((!seconds || seconds < 1) && file.media_id && file.storage_path === `autotoast:${file.media_id}`) seconds = (await (await import("./render.server")).getMedia(file.media_id)).duration_s;
  if (!seconds || !Number.isFinite(seconds) || seconds < 1) throw new Error("The demonstration video is still processing or its duration is unavailable. Please wait or upload another video.");
  return { id: file.id, seconds };
}

export function providerEstimateLimit(capabilityId: string) {
  const value = Number(process.env["CREATIVE_MAX_STEP_USD"] ?? (capabilityId === "higgsfield-seedance-reference-video" ? "20" : "5"));
  return Number.isFinite(value) && value > 0 ? Math.min(value, 20) : 5;
}

/** Read-only quotes resolve owned references but never reserve, submit or advance a job. */
export async function quoteAssetProduction(admin: Admin, asset: AssetRow) {
  const plan = readProductionPlan(asset.production_plan), steps: Array<{ label: string; usd: string }> = [];
  try {
    assertAssembledDelivery(asset.production_plan);
    if (typeof asset.voiceover === "string" && countWords(asset.voiceover) > wordBudget(asset.duration_s).max) {
      throw new Error("The approved script is too long for this duration. Shorten the voiceover or choose a longer video before approving production.");
    }
    if (plan.steps.some((step) => step.capability_id === "heygen-avatar")) await reactionDemo(admin, asset.workspace_id, asset.file_ids ?? []);
    await (await import("./production-audio.server")).loadApprovedSoundtrack(admin, asset.workspace_id, asset.production_plan);
    const connected = new Set(getCreativeProviderAvailability().filter((item) => item.available).map((item) => item.capabilityId));
    if (!connected.has("autotoast-hyperframes") && !plan.steps.some((step) => step.role === "finished_video")) throw new Error("HyperFrames is not connected for final video assembly.");
    for (const step of plan.steps) {
      const cap = getCreativeCapability(step.capability_id);
      if (!connected.has(cap.id)) throw new Error(`${cap.label} is not connected. Choose another style or reconnect it before creating a video.`);
      if (step.reference_step_ids.length) throw new Error("This dependent production cannot be completely priced before generation. Choose a plan with independently priced footage.");
      const settings = await resolvedStepSettings(admin, asset.workspace_id, step, { outputs: {} }, asset.duration_s, asset.voiceover, asset.size);
      const cost = cap.operations.estimate ? Number((await estimateCreativeProviderJob({ capabilityId: cap.id, settings })).usd) : cap.provider === "golpo" ? asset.duration_s / 60 * 2 : null;
      if (cost === null || !Number.isFinite(cost) || cost < 0) throw new Error("This production route has no verifiable cost estimate.");
      if (cost > providerEstimateLimit(cap.id)) throw new Error("This production exceeds the configured provider estimate limit. Shorten the generated scene or choose a lower supported resolution.");
      steps.push({ label: cap.label, usd: cost.toFixed(4) });
    }
    return { ready: true, providerUsd: steps.reduce((sum, step) => sum + Number(step.usd), 0).toFixed(4), steps, includesAppUsage: false as const, message: "External generation estimate only. Existing application allowance, narration/render usage and any separately approved stock licensing also apply. Actual provider billing may differ." };
  } catch (error) {
    return { ready: false, providerUsd: null, steps, includesAppUsage: false as const, message: error instanceof Error ? error.message : "The production cost could not be checked." };
  }
}

export function assertAssembledDelivery(value: unknown) {
  const delivery = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>)["delivery"] : null;
  if (delivery && readProductionPlan(value).steps.some((step) => step.role === "finished_video")) throw new Error("This finished-ad recipe must use compositor assembly for its approved narration and branding.");
}
// The worker has a five-minute hard timeout. Give it one minute to settle before
// exposing an interrupted attempt for recovery instead of leaving it "working" for 35 minutes.
export const PRODUCTION_LEASE_MS = 6 * 60 * 1000;
export function isCreativeEngineState(value: unknown): boolean { return !!value && typeof value === "object" && !Array.isArray(value) && (value as Record<string, unknown>)["engine_version"] === 1; }
export function productionRecoveryAction(job: { status: string; phase: string | null; phase_claimed_at?: string | null; started_at: string | null; created_at: string; provider_job_id: string | null; production_state: unknown }, steps: Array<{ provider: string; provider_job_id: string | null; step_key: string; status: string }>, now = Date.now()): "none" | "compositor" | "provider_assets" | "queued" | "reconcile" {
  if (!isCreativeEngineState(job.production_state) || !["preparing", "rendering"].includes(job.status)) return "none";
  const claimed = Date.parse(job.phase_claimed_at ?? job.started_at ?? job.created_at);
  if (Number.isFinite(claimed) && now - claimed < PRODUCTION_LEASE_MS) return "none";
  if (job.provider_job_id || steps.some((s) => s.step_key === "compositor" && s.provider_job_id)) return "compositor";
  if (["provider_poll", "provider_finalizing", "provider_ingestion", "provider_canceling"].includes(job.phase ?? "")) return "provider_assets";
  if (job.status === "preparing") {
    const paid = steps.filter((s) => s.provider !== "autosocials");
    if (paid.some((s) => ["openai", "elevenlabs", "autotoast"].includes(s.provider) || (!s.provider_job_id && !["completed", "failed"].includes(s.status)))) return "reconcile";
    return paid.some((s) => s.step_key.startsWith("provider:") && s.provider_job_id && !["completed", "failed"].includes(s.status)) ? "provider_assets" : "queued";
  }
  return job.phase === "finalizing" ? "reconcile" : "none";
}
function stateOf(value: unknown): ProductionState {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { outputs: {} };
  const state = value as Partial<ProductionState>;
  const polling = Object.fromEntries(Object.entries(state.polling ?? {}).filter(([, retry]) => retry && Number.isInteger(retry.attempt) && retry.attempt >= 0 && Number.isFinite(Date.parse(retry.nextAttemptAt))));
  const failures = Object.fromEntries(Object.entries(state.failed_steps ?? {}).filter(([, message]) => typeof message === "string").map(([id, message]) => [id, message.slice(0, 500)]));
  return { outputs: state.outputs && typeof state.outputs === "object" ? { ...state.outputs } : {}, ...(state.rootStepId ? { rootStepId: state.rootStepId } : {}), ...(state.engine_version === 1 ? { engine_version: 1 as const } : {}), ...(Object.keys(polling).length ? { polling } : {}), ...(Array.isArray(state.active_steps) ? { active_steps: state.active_steps.filter((id): id is string => typeof id === "string") } : {}), ...(Object.keys(failures).length ? { failed_steps: failures } : {}) };
}

export function productionStepConcurrency(value = process.env["CREATIVE_VIDEO_STEP_CONCURRENCY"]): number {
  const configured = Number(value ?? 2);
  return Number.isInteger(configured) && configured > 0 ? Math.min(configured, 4) : 2;
}

type ProviderSlot = { acquired: boolean; slot_id: string | null; lease_token: string | null; reason: string };
function capacityLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, 64) : fallback;
}
async function acquireProviderSlot(admin: Admin, job: RenderRow, step: ProductionStep, provider: string, model: string): Promise<ProviderSlot> {
  const result = await admin.rpc("acquire_creative_provider_slot", {
    _render_job_id: job.id, _step_key: `provider:${step.id}`, _provider: provider, _model: model,
    _provider_limit: capacityLimit(process.env[`CREATIVE_${provider.toUpperCase()}_CONCURRENCY`], 4),
    _model_limit: capacityLimit(process.env["CREATIVE_PROVIDER_MODEL_CONCURRENCY"], 2),
    _lease_seconds: 120, _account_key: "default",
  });
  if (result.error || !result.data || typeof result.data !== "object") throw new RecoverableProductionError();
  return result.data as ProviderSlot;
}
async function touchProviderSlot(admin: Admin, slot: ProviderSlot, submitted: boolean) {
  if (!slot.slot_id || !slot.lease_token) throw new RecoverableProductionError();
  const result = await admin.rpc("touch_creative_provider_slot", { _slot_id: slot.slot_id, _lease_token: slot.lease_token, _submitted: submitted, _lease_seconds: 120 });
  if (result.error || result.data !== true) throw new RecoverableProductionError();
}
async function releaseProviderSlot(admin: Admin, slot: ProviderSlot) {
  if (!slot.slot_id || !slot.lease_token) return;
  const result = await admin.rpc("release_creative_provider_slot", { _slot_id: slot.slot_id, _lease_token: slot.lease_token });
  if (result.error) throw new RecoverableProductionError();
}

/** Backoff is persisted, so another worker or a refresh honours the same provider limit. */
function pollBackoff(previous: PollBackoff | undefined, error: CreativeProviderError): PollBackoff {
  const attempt = Math.min((previous?.attempt ?? 0) + 1, 8);
  const exponential = Math.min(60_000, 2_000 * 2 ** (attempt - 1));
  const delay = Math.max(error.retryAfterMs ?? 0, Math.ceil(exponential * (0.75 + Math.random() * 0.5)));
  return { attempt, nextAttemptAt: new Date(Date.now() + Math.min(delay, 8_640_000_000_000_000 - Date.now())).toISOString() };
}

async function saveState(admin: Admin, job: RenderRow, state: ProductionState) {
  const result = await admin.from("render_jobs").update({ production_state: state as never }).eq("id", job.id).eq("workspace_id", job.workspace_id);
  if (result.error) throw new RecoverableProductionError();
}

export type ResolvedProductionReference = { id: string; source: "file" | "step"; role: string; url: string; kind: string; description: string; durationSeconds?: number };

/** Bind documented media fields without guessing between different owned sources. */
export function bindHiggsfieldReferences(capability: Pick<CreativeCapability, "provider" | "controls" | "assetRoles">, settings: Record<string, unknown>, refs: ResolvedProductionReference[]): Record<string, unknown> {
  if (capability.provider !== "higgsfield") return { ...settings };
  const result = { ...settings };
  const fields: Record<string, { kind: string; role: string; plural?: boolean; explicit?: boolean }> = {
    image_url: { kind: "image", role: "first_frame" },
    first_frame_url: { kind: "image", role: "first_frame" },
    start_image_url: { kind: "image", role: "first_frame" },
    end_image_url: { kind: "image", role: "last_frame", explicit: true },
    last_image_url: { kind: "image", role: "last_frame", explicit: true },
    last_frame_url: { kind: "image", role: "last_frame", explicit: true },
    image_reference_url: { kind: "image", role: "style" },
    video_url: { kind: "video", role: "source_footage" },
    audio_url: { kind: "audio", role: "audio" },
    file_url: { kind: "document", role: "document" },
    image_urls: { kind: "image", role: "reference", plural: true },
    video_urls: { kind: "video", role: "reference", plural: true },
    audio_urls: { kind: "audio", role: "audio", plural: true },
  };
  const controls = capability.controls ?? [];
  const used = new Set<string>();
  const unique = (items: ResolvedProductionReference[]) => [...new Map(items.map((ref) => [ref.url, ref])).values()];
  // Resolve singular source/frame inputs before arrays, independent of schema order.
  const mediaControls = controls.filter((control) => fields[control.key]).sort((a, b) => Number(Boolean(fields[a.key]?.plural)) - Number(Boolean(fields[b.key]?.plural)));
  for (const control of mediaControls) {
    const field = fields[control.key]!;
    if (result[control.key] !== undefined) throw new Error("Production media must use authorised reference IDs, not direct URLs.");
    const declaredRole = capability.assetRoles?.[control.key] ?? field.role;
    const expectedRole = ["image_reference", "video_reference", "audio_reference"].includes(declaredRole) ? "reference" : declaredRole;
    const matchingKind = refs.filter((ref) => ref.kind === field.kind);
    let candidates = matchingKind.filter((ref) => ref.role === expectedRole);
    if (field.plural) {
      // Generic reference arrays accept deliberately selected media. Sources already
      // bound to a singular input are not duplicated unless explicitly also a reference.
      if (expectedRole === "reference" || expectedRole === "audio") candidates = matchingKind;
      candidates = unique(candidates.filter((ref) => !used.has(ref.url) || ref.role === "reference"));
      if (candidates.length) result[control.key] = candidates.map((ref) => ref.url);
    } else {
      const unlabelledFallback = !candidates.length && !field.explicit;
      if (unlabelledFallback) candidates = matchingKind.filter((ref) => ref.role === "reference" && !used.has(ref.url));
      candidates = unique(candidates);
      // A workflow can expose both an optional first frame and plural references.
      // Several generic references do not constitute a chosen first frame.
      if (candidates.length > 1 && unlabelledFallback && !control.required) continue;
      if (candidates.length > 1) throw new Error(`Choose one authorised ${expectedRole.replaceAll("_", " ")} for ${control.key}.`);
      if (candidates[0]) { result[control.key] = candidates[0].url; used.add(candidates[0].url); }
    }
    if (control.required && result[control.key] === undefined) throw new Error(`This production needs an authorised ${expectedRole.replaceAll("_", " ")} ${field.kind} reference for ${control.key}.`);
  }
  for (const control of controls) {
    if (control.required && control.type === "url" && !fields[control.key]) throw new Error(`The ${control.key} media input needs a dedicated authorised reference binding.`);
  }
  return result;
}

/** Resolve only owned, explicitly selected references. Access-bearing URLs never enter the ledger. */
async function referenceUrls(admin: Admin, workspaceId: string, step: ProductionStep, state: ProductionState) {
  const refs: ResolvedProductionReference[] = [];
  if (step.reference_file_ids.length) {
    const { data, error } = await admin.from("brand_files").select("id,kind,mime,storage_path,media_id,ai_summary,name,duration_s,size_bytes,width,height").eq("workspace_id", workspaceId).in("id", step.reference_file_ids);
    if (error || data?.length !== new Set(step.reference_file_ids).size) throw new Error("A production reference is no longer available to this business.");
    for (const id of step.reference_file_ids) {
      const file = data.find((f) => f.id === id)!;
      // Seedance 2.5 normalizes aggregate reference duration, and Golpo's
      // custom-video contract has no documented 30-second input limit.
      if (file.kind === "video" && !["higgsfield-seedance-reference-video", "golpo-canvas", "golpo-sketch"].includes(step.capability_id) && (file.duration_s == null || !Number.isFinite(file.duration_s) || file.duration_s <= 0 || file.duration_s > 30)) throw new Error("Reference clips need a verified duration of at most 30 seconds.");
      if (step.capability_id.startsWith("higgsfield-genjutsu") && file.kind === "video" && step.reference_roles?.some((ref) => ref.id === id && ["source_footage", "motion"].includes(ref.role))) {
        if (file.duration_s == null || file.duration_s < 4 || file.duration_s > 30 || file.size_bytes > 200 * 1024 * 1024) throw new Error("Genjutsu source footage must be 4–30 seconds and at most 200 MiB.");
        if (step.capability_id === "higgsfield-genjutsu-object-swap" && (!file.width || !file.height || file.width * file.height < 409600)) throw new Error("Object replacement needs verified footage of at least 409,600 pixels per frame.");
      }
      if (step.capability_id.startsWith("higgsfield-genjutsu") && file.kind !== "video" && file.size_bytes > 64 * 1024 * 1024) throw new Error("Genjutsu reference images must be at most 64 MiB.");
      if (step.capability_id.startsWith("kie-") && ["image", "logo"].includes(file.kind) && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mime ?? '') || file.size_bytes == null || file.size_bytes > 30 * 1024 * 1024)) throw new Error("Kie references need verified JPEG, PNG or WebP images of at most 30 MB.");
      let url: string | null = null;
      if (file.media_id && file.storage_path === `autotoast:${file.media_id}`) {
        const media = await (await import("./render.server")).getMedia(file.media_id);
        url = media.download_url ?? media.playback_url;
      } else if (ownedProductionPath(file.storage_path, workspaceId)) {
        const signed = await admin.storage.from("brand-assets-private").createSignedUrl(file.storage_path, 7200);
        url = signed.data?.signedUrl ?? null;
      }
      if (!url) throw new Error("A selected reference could not be shared with the creative provider.");
      const roles = step.reference_roles?.filter((ref) => ref.source === "file" && ref.id === id).map((ref) => ref.role) ?? [];
      for (const role of roles.length ? roles : ["reference"]) refs.push({ id, source: "file", role, url, kind: file.kind === "logo" ? "image" : file.kind === "doc" ? "document" : file.kind, description: (file.ai_summary?.trim() || file.name?.trim() || "Selected brand asset").slice(0, 500), ...(file.kind === "video" && file.duration_s != null ? { durationSeconds: file.duration_s } : {}) });
    }
  }
  for (const id of step.reference_step_ids) {
    const output = state.outputs[id];
    if (!output || !ownedProductionPath(output.path, workspaceId)) throw new Error("An earlier production asset is not ready.");
    if (step.capability_id.startsWith("kie-") && (output.kind !== "image" || !["image/jpeg", "image/png", "image/webp"].includes(output.mime) || output.bytes > 30 * 1024 * 1024)) throw new Error("Kie needs a compatible image reference from the earlier step.");
    const signed = await admin.storage.from("brand-assets-private").createSignedUrl(output.path, 7200);
    if (!signed.data?.signedUrl) throw new Error("An earlier production asset could not be shared.");
    const roles = step.reference_roles?.filter((ref) => ref.source === "step" && ref.id === id).map((ref) => ref.role) ?? [];
    for (const role of roles.length ? roles : ["reference"]) refs.push({ id, source: "step", role, url: signed.data.signedUrl, kind: output.kind, description: "Illustrative generated asset from the preceding production step." });
  }
  return refs;
}

export async function resolvedStepSettings(admin: Admin, workspaceId: string, step: ProductionStep, state: ProductionState, targetSeconds: number, approvedVoiceover?: string, targetSize?: string, reactionAudioPath?: string | null) {
  const golpoDrawn = step.capability_id === "golpo-canvas" || step.capability_id === "golpo-sketch";
  const refs = golpoDrawn ? [] : await referenceUrls(admin, workspaceId, step, state);
  // A selected file can have several semantic roles. It must still occur only
  // once in provider media arrays and in any duration budget.
  const uniqueRefs = (kind: string) => [...new Map(refs.filter((r) => r.kind === kind).map((r) => [r.url, r])).values()];
  const images = uniqueRefs("image"), videos = uniqueRefs("video"), audio = uniqueRefs("audio");
  const role = (name: string, kind?: string) => refs.find((ref) => ref.role === name && (!kind || ref.kind === kind));
  const requiredRole = (name: string, kind: string) => { const ref = role(name, kind); if (!ref) throw new Error(`This production needs an authorised ${name.replaceAll("_", " ")} reference.`); return ref; };
  const sourceVideo = videos[0];
  const settings = { ...step.settings };
  const capability = getCreativeCapability(step.capability_id);
  let finalRatio: "9:16" | "16:9" | "1:1" | undefined;
  if (step.role === "finished_video" && targetSize) {
    const [width, height] = targetSize.split("x").map(Number);
    if (!width || !height) throw new Error("The approved film size is invalid.");
    if (width === height) finalRatio = "1:1";
    else if (Math.abs(width / height - 9 / 16) < 0.001) finalRatio = "9:16";
    else if (Math.abs(width / height - 16 / 9) < 0.001) finalRatio = "16:9";
    else throw new Error("This finished-video provider cannot deliver the approved aspect ratio. Use the compositor instead.");
  }
  switch (step.capability_id) {
    case "kie-nano-image-edit": settings["image_input"] = images.map((image) => image.url); break;
    case "kie-veo-reference-video": settings["image_urls"] = images.map((image) => image.url); break;
    case "kie-veo-image-video": {
      const first = role("first_frame", "image") ?? (images.length === 1 ? images[0] : undefined);
      if (!first) throw new Error("Choose an authorised first frame for Kie Veo.");
      const last = role("last_frame", "image");
      if (images.some((image) => image.url !== first.url && image.url !== last?.url)) throw new Error("Label the selected Kie keyframes as first and last frame.");
      settings["image_urls"] = [first.url, ...(last ? [last.url] : [])];
      break;
    }
    case "heygen-avatar": {
      settings["duration"] = targetSeconds;
      const [width, height] = (targetSize ?? "1080x1920").split("x").map(Number);
      settings["aspect_ratio"] = width === height ? "1:1" : width! > height! ? "16:9" : "9:16";
      if (reactionAudioPath) {
        if (!ownedProductionPath(reactionAudioPath, workspaceId)) throw new Error("Reaction narration scope mismatch.");
        const signed = await admin.storage.from("brand-assets-private").createSignedUrl(reactionAudioPath, 7200);
        if (!signed.data?.signedUrl) throw new Error("Could not share reaction narration with HeyGen.");
        settings["audio_url"] = signed.data.signedUrl;
      }
      break;
    }
    case "higgsfield-seedance-image-video": settings["image_url"] = role("first_frame", "image")?.url ?? images[0]?.url; if (role("last_frame", "image") ?? images[1]) settings["end_image_url"] = (role("last_frame", "image") ?? images[1])!.url; break;
    case "higgsfield-ltx-fast-image-video":
    case "higgsfield-kling3-image-video":
      settings["image_url"] = requiredRole("first_frame", "image").url;
      if (role("last_frame", "image")) settings[step.capability_id === "higgsfield-kling3-image-video" ? "last_image_url" : "end_image_url"] = role("last_frame", "image")!.url;
      break;
    case "higgsfield-kling-o3-keyframes":
      settings["first_frame_url"] = requiredRole("first_frame", "image").url;
      if (role("last_frame", "image")) settings["last_frame_url"] = role("last_frame", "image")!.url;
      break;
    case "higgsfield-wan-reference-video":
      if (images.length) settings["image_urls"] = [...new Set(images.map((r) => r.url))];
      if (videos.length) settings["video_urls"] = [...new Set(videos.map((r) => r.url))];
      if (audio.length) settings["audio_urls"] = [...new Set(audio.map((r) => r.url))];
      if (role("document")) settings["file_url"] = requiredRole("document", "document").url;
      break;
    case "higgsfield-genjutsu-restyle":
    case "higgsfield-genjutsu-object-swap":
    case "higgsfield-genjutsu-motion-transfer": {
      const sourceRole = step.capability_id === "higgsfield-genjutsu-motion-transfer" ? "motion" : "source_footage";
      settings["video_url"] = requiredRole(sourceRole, "video").url;
      if (images.length) settings["image_urls"] = [...new Set(images.map((image) => image.url))];
      break;
    }
    case "higgsfield-image-preset":
      settings["image_urls"] = [requiredRole("product", "image"), role("identity", "image")].filter((ref): ref is NonNullable<typeof ref> => !!ref).map((ref) => ref.url);
      break;
    case "higgsfield-seedance-video-extend":
      settings["video_url"] = requiredRole("source_footage", "video").url;
      if (images.length) settings["image_urls"] = [...new Set(images.map((r) => r.url))];
      if (videos.some((r) => r.role !== "source_footage")) settings["video_urls"] = [...new Set(videos.filter((r) => r.role !== "source_footage").map((r) => r.url))];
      if (audio.length) settings["audio_urls"] = [...new Set(audio.map((r) => r.url))];
      break;
    case "higgsfield-image-edit": settings["image_urls"] = images.map((r) => r.url); break;
    case "higgsfield-seedance-reference-video":
    case "higgsfield-seedance-video-edit":
      if (step.capability_id === "higgsfield-seedance-video-edit") settings["video_url"] = videos.shift()?.url;
      if (images.length) settings["image_urls"] = images.map((r) => r.url);
      if (videos.length) settings["video_urls"] = videos.map((r) => r.url);
      if (audio.length) settings["audio_urls"] = audio.map((r) => r.url);
      break;
    case "golpo-canvas": case "golpo-sketch":
      if (finalRatio === "1:1") throw new Error("Golpo cannot deliver a square finished film. Use the compositor instead.");
      // The create flow's soundtrack choice is authoritative. A model-suggested
      // native track must not add music when the user selected none.
      delete settings["background_track"];
      // Golpo illustrations should be drawn from the approved script. Owned
      // product photos can inform planning, but must not appear in the film.
      for (const key of ["custom_images", "custom_images_description", "keep_original_images", "disable_image_animation", "custom_logo", "logo_position", "reference_source"]) delete settings[key];
      if (finalRatio) settings["video_orientation"] = finalRatio === "9:16" ? "vertical" : "horizontal";
      delete settings["custom_videos"];
      delete settings["custom_videos_description"];
      settings["timing"] = String(targetSeconds / 60); settings["visibility"] = "private";
      if (approvedVoiceover?.trim()) { settings["custom_script"] = approvedVoiceover.trim(); delete settings["own_narration_source"]; }
      break;
    default:
      if (capability.provider === "higgsfield") {
        Object.assign(settings, bindHiggsfieldReferences(capability, settings, refs));
        if (finalRatio && capability.controls?.some((control) => control.key === "aspect_ratio")) settings["aspect_ratio"] = finalRatio;
        if (step.role === "scene") {
          if (capability.controls?.some((control) => control.key === "generate_audio")) settings["generate_audio"] = false;
          if (capability.controls?.some((control) => control.key === "sound")) settings["sound"] = "off";
          if (capability.controls?.some((control) => control.key === "keep_original_sound")) settings["keep_original_sound"] = "no";
        }
      }
      break;
  }
  if (finalRatio && ["higgsfield-seedance-text-video", "higgsfield-seedance-reference-video", "higgsfield-ltx-fast-text-video", "higgsfield-ltx-fast-image-video", "higgsfield-kling-o3-keyframes", "higgsfield-wan-reference-video"].includes(step.capability_id)) settings["aspect_ratio"] = finalRatio;
  if (step.capability_id.startsWith("higgsfield-genjutsu")) {
    const sourceRole = step.capability_id === "higgsfield-genjutsu-motion-transfer" ? "motion" : "source_footage";
    if (!role(sourceRole, "video")?.durationSeconds) throw new Error("Genjutsu needs owned footage with verified duration.");
    if (step.role === "finished_video") throw new Error("Genjutsu output duration is not verified for direct final delivery. Use it as a scene and assemble the finished film.");
  }
  if (step.capability_id === "higgsfield-genjutsu-restyle" || step.capability_id === "higgsfield-image-preset") {
    const { listCreativeProviderPresets } = await import("./creative-providers/adapters.server");
    const catalogue = await listCreativeProviderPresets({ capabilityId: step.capability_id });
    if (!catalogue.items.some((item) => item.id === settings["preset_id"])) throw new Error("The selected provider preset is no longer available.");
  }
  // Scene audio is not silently promised: composited clips are muted; the compositor owns narration.
  if (step.role === "scene" && capability.controls?.some((control) => control.key === "generate_audio")) settings["generate_audio"] = false;
  if (step.role === "scene" && "sound" in settings) settings["sound"] = "off";
  const parsed = validateCreativeSettings(step.capability_id, settings);
  const effectiveDuration = creativeSettingsDuration(parsed);
  if (effectiveDuration !== null && effectiveDuration > targetSeconds) throw new Error("Provider scene duration exceeds this film's approved length.");
  if (step.role === "finished_video" && ["higgsfield", "kie"].includes(getCreativeCapability(step.capability_id).provider)) {
    // Video editing preserves the source length; generation schemas resolve their duration defaults.
    // An unmeasured generated source cannot prove the approved finished length before a paid edit.
    const duration = step.capability_id === "higgsfield-seedance-video-edit"
      ? sourceVideo?.durationSeconds == null ? undefined : Math.max(4, sourceVideo.durationSeconds)
      : effectiveDuration;
    if (typeof duration !== "number" || Math.abs(duration - targetSeconds) > 0.05) {
      throw new Error("This provider route cannot deliver the approved finished duration. Use supported clips as scenes and assemble the film with the compositor.");
    }
  }
  return parsed;
}

/** One claimed video advances a bounded wave of dependency-ready provider steps. */
export async function advanceProduction(admin: Admin, job: RenderRow, asset: AssetRow): Promise<{ waiting: boolean; finalOutput?: StoredOutput; state: ProductionState }> {
  assertAssembledDelivery(asset.production_plan);
  const plan = readProductionPlan(asset.production_plan);
  const state = stateOf(job.production_state);
  if (!plan.steps.length) return { waiting: false, state };
  const { data: own, error } = await admin.from("brand_files").select("id").eq("workspace_id", job.workspace_id);
  if (error) throw new Error("Could not verify this production's references.");
  const available = new Set(getCreativeProviderAvailability().filter((c) => c.available).map((c) => c.capabilityId));
  parseProductionProposal(productionProposal(plan), new Set((own ?? []).map((f) => f.id)), available);
  const ready = plan.steps.filter((step) => !state.outputs[step.id]
    && (!state.failed_steps || state.active_steps?.includes(step.id))
    && step.reference_step_ids.every((id) => !!state.outputs[id])
    && (step.role !== "finished_video" || plan.steps.every((other) => other.id === step.id || !!state.outputs[other.id])))
    .slice(0, productionStepConcurrency());
  type StepResult = { output?: StoredOutput; retry?: PollBackoff; active?: boolean };
  const outcomes = await Promise.allSettled(ready.map(async (step): Promise<StepResult> => {
    const retry = state.polling?.[step.id];
    if (retry && Date.parse(retry.nextAttemptAt) > Date.now()) return { active: true };
    const cap = getCreativeCapability(step.capability_id);
    const model = cap.provider === "kie" ? `${cap.verification?.modelVersion}:${step.settings["model"] ?? step.capability_id}` : cap.endpoint ?? cap.id;
    const slot = await acquireProviderSlot(admin, job, step, cap.provider, model);
    if (!slot.acquired && slot.reason === "capacity") return { active: true };
    if (!slot.acquired && slot.reason !== "terminal") throw new Error("This provider operation requires reconciliation before another paid attempt.");
    try {
    const previous = await previousGenerationStep(asset.id, `provider:${step.id}`, job.id, admin);
    const reservation = await beginStep({ renderJobId: job.id, workspaceId: job.workspace_id, variantId: asset.id, userId: job.created_by,
      initiator: "sam", stepKey: `provider:${step.id}`, provider: cap.provider, model, operation: `POST /${cap.endpoint}`,
      settings: step.settings, ...(state.rootStepId ? { parentStepId: state.rootStepId } : {}), ...(previous ? { retryOfStepId: previous.id } : {}) }, admin);
    let result: CreativeProviderJob;
    if (!reservation.created) {
      if (reservation.step.status === "completed" && reservation.step.output_storage_path) {
        return { output: { path: reservation.step.output_storage_path, kind: cap.output, mime: cap.output === "video" ? "video/mp4" : "image/png", bytes: 0, stepId: reservation.step.id, ...(reservation.step.usage["seconds"] ? { durationSeconds: reservation.step.usage["seconds"] } : {}) } };
      }
      if (!reservation.step.provider_job_id || ["failed", "reconciliation_required"].includes(reservation.step.status)) throw new Error("This provider attempt needs reconciliation before another generation. No automatic paid retry was made.");
      try { result = await pollCreativeProviderJob({ capabilityId: step.capability_id, requestId: reservation.step.provider_job_id, ...(cap.provider === "kie" && typeof reservation.step.settings?.["resolution"] === "string" ? { expectedResolution: reservation.step.settings["resolution"] } : {}) }); }
      catch (e) {
        if (e instanceof CreativeProviderError && e.retryable) return { retry: pollBackoff(retry, e) };
        await failStep(reservation.step.id, "poll_response_unverified", true, admin); throw e;
      }
    } else {
      let attemptedSubmission = false;
      try {
        const settings = await resolvedStepSettings(admin, job.workspace_id, step, state, asset.duration_s, asset.voiceover, asset.size, job.audio_path);
        if (step.capability_id === "heygen-avatar" && !settings["audio_url"]) throw new Error("Saved reaction narration is required before creating the avatar.");
        // Quote where supported. Estimates remain estimates; no invoice is inferred from a receipt.
        let estimate: number | null = cap.provider === "golpo" ? asset.duration_s / 60 * 2 : null;
        if (cap.operations.estimate) estimate = Number((await estimateCreativeProviderJob({ capabilityId: cap.id, settings })).usd);
        // The explicitly clicked Seedance reference film can cost more than the generic $5 step default.
        const limit = providerEstimateLimit(cap.id);
        if (estimate !== null && (!Number.isFinite(estimate) || estimate > limit)) throw new Error("This production exceeds the configured provider estimate limit.");
        await updateStep(reservation.step.id, { status: "submitted", settings: { ...safeCreativeSettings(cap.id, settings), settings_source: "resolved_request" }, costKind: estimate === null ? "unknown" : "estimate", costAmount: estimate, costCurrency: estimate === null ? null : "USD" }, admin);
        await touchProviderSlot(admin, slot, true);
        attemptedSubmission = true;
        result = await submitCreativeProviderJob({ capabilityId: cap.id, settings, idempotencyKey: reservation.step.id });
        await updateStep(reservation.step.id, { providerJobId: result.requestId, status: "running" }, admin);
      } catch (e) {
        const definiteRejection = e instanceof CreativeProviderError && ["authentication_failed", "provider_rejected", "rate_limited", "invalid_input", "not_configured"].includes(e.code);
        const uncertain = attemptedSubmission && !definiteRejection;
        await failStep(reservation.step.id, e instanceof CreativeProviderError ? e.code : "production_preflight_failed", uncertain, admin);
        throw e;
      }
    }
    if (result.creditsConsumed !== undefined) await updateStep(reservation.step.id, { usage: { credits: result.creditsConsumed } }, admin);
    if (["failed", "moderated", "canceled"].includes(result.status)) {
      // Only this branch has an explicit, normalized terminal failure from the provider.
      await failStep(reservation.step.id, "provider_terminal_failed", false, admin);
      throw new Error("The creative provider did not complete this asset. The failed attempt is recorded.");
    }
    if (result.status !== "completed") return { active: true };
    const output = result.outputs.find((o) => o.type === cap.output);
    if (!output) throw new Error("The provider returned no usable output.");
    try {
      const media = await downloadCreativeMedia(output.url, { expected: cap.output, ...(step.role === "finished_video" ? { maxBytes: MAX_PROVIDER_FILM_BYTES } : {}) });
      const path = `${job.workspace_id}/renders/${job.id}/${step.id}.${media.extension}`;
      if (step.role === "finished_video") {
        const stamp = await admin.from("render_jobs").update({ storage_started_at: new Date().toISOString() } as never).eq("id", job.id).is("storage_started_at", null);
        if (stamp.error) throw new RecoverableProductionError();
      }
      const uploaded = await admin.storage.from("brand-assets-private").upload(path, media.bytes, { contentType: media.contentType, upsert: true });
      if (uploaded.error) throw new RecoverableProductionError();
      if (step.role === "finished_video") {
        const stamp = await admin.from("render_jobs").update({ storage_completed_at: new Date().toISOString() } as never).eq("id", job.id).is("storage_completed_at", null);
        if (stamp.error) throw new RecoverableProductionError();
      }
      const stored = { path, kind: cap.output, mime: media.contentType, bytes: media.bytes.byteLength, stepId: reservation.step.id, ...(result.durationSeconds ? { durationSeconds: result.durationSeconds } : {}) };
      await completeStep(reservation.step.id, { outputStoragePath: path, ...((result.durationSeconds || result.creditsConsumed !== undefined) ? { usage: { ...(result.durationSeconds ? { seconds: result.durationSeconds } : {}), ...(result.creditsConsumed !== undefined ? { credits: result.creditsConsumed } : {}) } } : {}), technicalStatus: "unverified", creativeStatus: "pending" }, admin);
      return { output: stored };
    } catch { throw new RecoverableProductionError(); }
    } finally {
      await releaseProviderSlot(admin, slot);
    }
  }));
  let recoverable = false;
  const active = new Set((state.active_steps ?? []).filter((id) => !state.outputs[id]));
  outcomes.forEach((outcome, index) => {
    const step = ready[index]!;
    active.delete(step.id);
    if (outcome.status === "rejected") {
      if (outcome.reason instanceof RecoverableProductionError) { recoverable = true; active.add(step.id); }
      else (state.failed_steps ??= {})[step.id] = outcome.reason instanceof Error ? outcome.reason.message.slice(0, 500) : "A production step failed. Review its recorded attempt before retrying.";
      return;
    }
    if (outcome.value.output) state.outputs[step.id] = outcome.value.output;
    if (outcome.value.active || outcome.value.retry) active.add(step.id);
    if (outcome.value.retry) (state.polling ??= {})[step.id] = outcome.value.retry;
    else if (state.polling && (!state.polling[step.id] || Date.parse(state.polling[step.id]!.nextAttemptAt) <= Date.now())) delete state.polling[step.id];
  });
  state.active_steps = [...active];
  // One write merges sibling completions. Save them even if another sibling failed.
  if (ready.length) await saveState(admin, job, state);
  if (state.failed_steps) {
    // Accepted siblings still belong to us: ingest them before exposing the fatal film failure.
    if (active.size) return { waiting: true, state };
    throw new Error(Object.values(state.failed_steps)[0] ?? "A production step failed.");
  }
  if (recoverable) throw new RecoverableProductionError();
  const final = plan.steps.find((s) => s.role === "finished_video");
  const waiting = plan.steps.some((step) => !state.outputs[step.id]);
  return { waiting, ...(!waiting && final && state.outputs[final.id] ? { finalOutput: state.outputs[final.id]! } : {}), state };
}

/** Persisted provider assets become offline compositor files; no expiring remote URL is embedded. */
export async function productionCompositionAssets(admin: Admin, workspaceId: string, value: unknown) {
  const state = stateOf(value), files: Record<string, ProjectFile> = {}, catalog: { path: string; name: string; kind: string; summary: string }[] = [];
  let total = 0;
  for (const [id, output] of Object.entries(state.outputs)) {
    if (!ownedProductionPath(output.path, workspaceId)) throw new Error("Production asset scope mismatch.");
    const result = await admin.storage.from("brand-assets-private").download(output.path);
    if (result.error || !result.data) throw new Error("A generated production asset could not be loaded.");
    const bytes = await result.data.arrayBuffer(); total += bytes.byteLength;
    if (total > 30 * 1024 * 1024) throw new Error("Generated scene assets exceed the compositor's payload limit. Choose shorter or lower-resolution scenes.");
    const path = `generated/${id}.${output.path.split(".").pop()}`;
    files[path] = { base64: Buffer.from(bytes).toString("base64") };
    catalog.push({ path, name: id, kind: output.kind, summary: "Illustrative generated scene, not documentary evidence. Use as a muted scene asset; precise brand copy and logos must be composited separately." });
  }
  return { files, catalog };
}
