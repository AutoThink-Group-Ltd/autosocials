import { z } from "zod";
import { getAdminClient } from "./supabase-admin.server";
import { parseBlocks } from "./sam.blocks";
import { prepareDirectVideo, createDirectVideoDraft } from "./direct-video.server";
import { queueRender, kickCreativeJobs } from "./creative.functions";

const Choice = z.object({ canvas_id: z.string().uuid(), index: z.number().int().nonnegative(), expected_version: z.number().int(), capability_id: z.string().max(150), duration: z.union([z.literal(15), z.literal(30)]).optional(), aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).optional(), resolution: z.enum(["480p", "720p", "1080p", "4k"]).optional(), expected_credits: z.number().int().positive().optional(), expected_rate_id: z.string().uuid().optional() });

/** Preserve concurrent canvas edits while attaching an already admitted job. Never re-admit here. */
async function saveRequestState(admin: ReturnType<typeof getAdminClient>, canvasId: string, workspaceId: string, requestId: string, patch: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const current = await admin.from("canvases").select("id,workspace_id,module,blocks,version").eq("id", canvasId).eq("workspace_id", workspaceId).single();
    if (current.error || !current.data) throw new Error("The video status could not be saved. Check the existing request before retrying.");
    const next = parseBlocks(current.data.blocks);
    const at = next.findIndex((item) => item.type === "direct_video" && item.request_id === requestId);
    if (at < 0) throw new Error("The video request card has changed. Check the existing video before retrying.");
    next[at] = { ...next[at], ...patch } as typeof next[number];
    const saved = await admin.from("canvases").update({ blocks: next as never, version: current.data.version + 1 }).eq("id", canvasId).eq("workspace_id", workspaceId).eq("version", current.data.version).select("id,version").maybeSingle();
    if (saved.error) throw new Error("The video status could not be saved. Check the existing request before retrying.");
    if (saved.data) return current.data.version + 1;
  }
  throw new Error("The video status changed while saving. Refresh the existing request before retrying.");
}

/** A canvas version is consumed once before admission. An interrupted claim is never replayed blindly. */
export async function executeDirectVideoChoice(userId: string, input: z.infer<typeof Choice>) {
  const data = Choice.parse(input);
  const admin = getAdminClient();
  const row = await admin.from("canvases").select("id,workspace_id,module,blocks,version").eq("id", data.canvas_id).single();
  if (row.error || !row.data || row.data.module !== "create") throw new Error("This video request is unavailable.");
  const canvas = row.data;
  const access = await admin.rpc("can_access_workspace", { _user_id: userId, _workspace_id: canvas.workspace_id });
  if (access.error || !access.data) throw new Error("Forbidden");
  const blocks = parseBlocks(canvas.blocks);
  const block = blocks[data.index];
  if (!block || block.type !== "direct_video") throw new Error("This video request is unavailable.");
  if (block.status === "queued") return { batch_id: block.batch_id, variant_id: block.variant_id, version: canvas.version };
  if (block.status !== "options" || canvas.version !== data.expected_version) throw new Error("This request has changed or is already starting. Refresh its status before continuing.");
  const prepared = await prepareDirectVideo(admin, userId, canvas.workspace_id, block.thread_id, block.message, block.file_ids, {
    ...(data.duration ? { duration: data.duration } : {}), ...(data.aspect_ratio ? { aspectRatio: data.aspect_ratio } : {}), ...(data.resolution ? { resolution: data.resolution } : {}),
  });
  if (prepared.missing.length || !prepared.options.some((option) => option.capabilityId === data.capability_id)) throw new Error("That model does not support these settings and all selected images. Choose compatible settings.");
  const { getContentCreditRate } = await import("./content-credits.server");
  const rate = await getContentCreditRate(admin as unknown as import("@supabase/supabase-js").SupabaseClient, data.capability_id, prepared.brief.duration);
  if (data.expected_credits !== rate.credits || data.expected_rate_id !== rate.version) throw new Error("The credit price changed. Review the updated quote before creating.");
  blocks[data.index] = { ...block, status: "starting" };
  const claim = await admin.from("canvases").update({ blocks: blocks as never, version: canvas.version + 1, updated_by: "user" }).eq("id", canvas.id).eq("version", canvas.version).select("id").maybeSingle();
  if (claim.error || !claim.data) throw new Error("This request is already being handled. Refresh its status.");
  let queued = false;
  let draft: { batchId: string; variantId: string } | undefined;
  try {
    draft = await createDirectVideoDraft(admin, userId, canvas.workspace_id, prepared, data.capability_id, block.request_id);
    const savedVariant = await admin.from("creative_variants").select("version,production_plan,duration_s").eq("id", draft.variantId).eq("workspace_id", canvas.workspace_id).single();
    if (savedVariant.error || !savedVariant.data) throw new Error("The video price could not be verified.");
    const { videoCreditCapability } = await import("./content-credits.server");
    if (videoCreditCapability(savedVariant.data.production_plan, savedVariant.data.duration_s) !== data.capability_id) throw new Error("The prepared model changed. Review the updated quote before creating.");
    await queueRender(admin, userId, draft.variantId, undefined, "user", undefined, undefined, { version: savedVariant.data.version, credits: rate.credits, lines: [{ step_key: "provider:reference_film", capability_id: data.capability_id, duration_s: prepared.brief.duration, rate_id: rate.version, credits: rate.credits }] });
    queued = true;
    const version = await saveRequestState(admin, canvas.id, canvas.workspace_id, block.request_id, { status: "queued", reason: "Your generation request is saved. Live status below tracks provider acceptance and production.", duration: prepared.brief.duration, aspect_ratio: prepared.brief.aspectRatio, resolution: prepared.brief.resolution, batch_id: draft.batchId, variant_id: draft.variantId });
    await kickCreativeJobs(admin);
    await admin.from("agent_messages").insert({ workspace_id: canvas.workspace_id, thread_id: block.thread_id, role: "assistant", content: `Generation request created using ${prepared.options.find((o) => o.capabilityId === data.capability_id)!.label}, with ${block.file_ids.length} saved reference images. The source film is silent; logo and voiceover remain for editing.`, canvas_id: canvas.id });
    return { batch_id: draft.batchId, variant_id: draft.variantId, version };
  } catch (error) {
    if (!queued) {
      await saveRequestState(admin, canvas.id, canvas.workspace_id, block.request_id, { status: "failed", ...(draft ? { batch_id: draft.batchId, variant_id: draft.variantId } : {}), error: error instanceof Error ? error.message : "The video could not start." });
    }
    throw error;
  }
}
