import type { getAdminClient } from "./supabase-admin.server";
import { getCreativeProviderAvailability } from "./creative-providers/adapters.server";
import { directVideoOptions, parseDirectVideoBrief, type DirectVideoBrief, type DirectVideoPreparation } from "./direct-video";
import { resolvedStepSettings } from "./production.server";
import type { CreativeDirection } from "./creative-direction";
import type { ProductionPlan } from "./production-plan";

type Admin = ReturnType<typeof getAdminClient>;
export type DirectVideoOverrides = { duration?: number; aspectRatio?: string; resolution?: string };

async function checkAccess(admin: Admin, userId: string, workspaceId: string) {
  const access = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (access.error || !access.data) throw new Error("You don't have access to this workspace.");
}

export async function prepareDirectVideo(admin: Admin, userId: string, workspaceId: string, threadId: string, message: string, attachmentIds: string[], overrides: DirectVideoOverrides = {}): Promise<DirectVideoPreparation> {
  await checkAccess(admin, userId, workspaceId);
  const thread = await admin.from("agent_threads").select("id").eq("id", threadId).eq("workspace_id", workspaceId).eq("module", "create").maybeSingle();
  if (thread.error || !thread.data) throw new Error("This Create chat is not available in this workspace.");
  const referenceIds = [...new Set(attachmentIds)];
  if (!referenceIds.length || referenceIds.length > 20) throw new Error("Attach between 1 and 20 reference images.");
  const files = await admin.from("brand_files").select("id,kind").eq("workspace_id", workspaceId).in("id", referenceIds);
  if (files.error || files.data?.length !== referenceIds.length || files.data.some((file) => !["image", "logo"].includes(file.kind))) throw new Error("Every reference must be an image saved in this business's Brand Assets.");
  const brief: DirectVideoBrief = { ...parseDirectVideoBrief(message), ...overrides };
  const available = new Set(getCreativeProviderAvailability().filter((capability) => capability.available).map((capability) => capability.capabilityId));
  return { brief, referenceIds, ...directVideoOptions(brief, referenceIds.length, available) };
}

/** Persists only an explicitly chosen route; the caller owns atomic admission to the existing render queue. */
export async function createDirectVideoDraft(admin: Admin, userId: string, workspaceId: string, prepared: DirectVideoPreparation, capabilityId: string, requestId: string): Promise<{ batchId: string; variantId: string }> {
  await checkAccess(admin, userId, workspaceId);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("The generation request is invalid.");
  const available = new Set(getCreativeProviderAvailability().filter((capability) => capability.available).map((capability) => capability.capabilityId));
  const checked = directVideoOptions(prepared.brief, prepared.referenceIds.length, available);
  const option = checked.options.find((candidate) => candidate.capabilityId === capabilityId);
  if (!option || checked.missing.length) throw new Error("Choose complete, supported video settings before generation.");
  const brief = prepared.brief;
  const direction: CreativeDirection = {
    audience: "The audience identified in the user's production brief.", objective: "Produce the user's supplied reference-image film.", insight: "The user supplied the creative direction and reference photographs.", argument: brief.prompt, hook: "Use the opening described in the supplied brief.", story_mechanism: "Follow the supplied scene sequence.", composition: "Preserve the uploaded locations and subjects.", motion: "Use only the camera motion requested in the production prompt.", imagery: "The explicitly attached photographs are strict visual references; generated motion is illustrative.", pacing: `Deliver exactly ${brief.duration} seconds.`, ending: "Follow the supplied closing frame direction.", typography: "Do not add generated text or logos unless explicitly requested.", sound: "Silent source film; the supplied voiceover and logo instructions are retained for editing.", evidence: "User-supplied photographs and production prompt.", asset_strategy: "Use every attached reference image in its supplied order.",
  };
  const plan: ProductionPlan & { direct_video: { request_id: string; original_message: string; editing_instructions: string; voiceover: string; audio_mode: "silent" }; plan_id: string } = {
    version: 1, direction, steps: [{ id: "reference_film", capability_id: option.capabilityId, purpose: "Generate the exact user-supplied reference film.", role: "finished_video", settings: option.settings, reference_file_ids: prepared.referenceIds, reference_step_ids: [], illustrative: true }], assumptions: ["Reference animation is generated; buildings, signage and motion require playback review.", "Logo and voiceover are editing instructions and are not included in the silent source film."], diversity_issues: [], plan_id: requestId,
    direct_video: { request_id: requestId, original_message: brief.originalMessage, editing_instructions: brief.editingInstructions, voiceover: brief.voiceover, audio_mode: "silent" },
  };
  const [w, h] = brief.aspectRatio!.split(":").map(Number);
  const height = brief.resolution === "4k" ? 2160 : Number(brief.resolution!.replace("p", ""));
  const size = w! >= h! ? `${Math.round(height * w! / h!)}x${height}` : `${height}x${Math.round(height * h! / w!)}`;
  // Resolve real owned inputs and validate the complete provider request before persisting a draft.
  await resolvedStepSettings(admin, workspaceId, plan.steps[0]!, { outputs: {} }, brief.duration!, undefined, size);
  const prior = await admin.from("creative_batches").select("id,workspace_id").eq("id", requestId).maybeSingle();
  if (prior.error || (prior.data && prior.data.workspace_id !== workspaceId)) throw new Error("This generation request cannot be reused.");
  if (prior.data) {
    const existing = await admin.from("creative_variants").select("id,production_plan").eq("batch_id", requestId).eq("workspace_id", workspaceId).limit(1).maybeSingle();
    if (existing.error) throw new Error("The saved request could not be loaded.");
    if (existing.data) {
      const saved = existing.data.production_plan as unknown as typeof plan;
      if (saved?.direct_video?.original_message !== brief.originalMessage || saved.steps?.[0]?.capability_id !== capabilityId || JSON.stringify(saved.steps?.[0]?.settings) !== JSON.stringify(option.settings) || JSON.stringify(saved.steps?.[0]?.reference_file_ids) !== JSON.stringify(prepared.referenceIds)) throw new Error("The saved generation request has different settings. Start a new request.");
      return { batchId: requestId, variantId: existing.data.id };
    }
  } else {
    const batch = await admin.from("creative_batches").insert({ id: requestId, workspace_id: workspaceId, created_by: userId, title: "Reference image film", goal: "Direct user-supplied production brief", audience: "", offer: "", destination: "", days: 1, stage: "producing", narratives: [] }).select("id").single();
    if (batch.error) throw new Error("The direct video folder could not be saved.");
  }
  const variant = await admin.from("creative_variants").insert({ workspace_id: workspaceId, batch_id: requestId, position: 0, duration_s: brief.duration!, size, beats: [], voiceover: brief.voiceover, angle: "Direct reference film", narrative: "Direct reference film", hook: "Reference image film", format: "Reference-to-video", script: brief.prompt, caption: "", cta: "", file_ids: prepared.referenceIds, argument: "The user's supplied film direction.", production_plan: plan as never, captions: "off", build_prompt: null, build_prompt_issues: [] }).select("id").single();
  if (variant.error) throw new Error("The direct video brief could not be saved.");
  return { batchId: requestId, variantId: variant.data.id };
}
