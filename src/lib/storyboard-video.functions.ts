import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, getAdminClient } from "./supabase-admin.server";
import { parseBlocks } from "./sam.blocks";
import { prepareDirectVideo } from "./direct-video.server";

/** Convert a saved storyboard into a direct-video choice without submitting a paid job. */
export const prepareStoryboardVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ canvas_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const row = await admin.from("canvases").select("id,workspace_id,module,blocks,version").eq("id", data.canvas_id).single();
    if (row.error || !row.data || row.data.module !== "create") throw new Error("This storyboard is unavailable.");
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: row.data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");
    const blocks = parseBlocks(row.data.blocks);
    if (blocks.some((block) => block.type === "direct_video")) return { ready: true };
    const assets = blocks.find((block) => block.type === "assets" && block.file_ids.length > 0);
    const storyboard = blocks.find((block) => block.type === "storyboard");
    const shotlist = blocks.find((block) => block.type === "shotlist");
    const doc = blocks.find((block) => block.type === "document" && !!block.markdown);
    if (!assets || (!storyboard && !shotlist)) throw new Error("Save photos and a shot plan before creating the video.");
    const orderedIds = storyboard?.frames.map((frame) => frame.file_id).filter((id): id is string => !!id)
      ?? shotlist?.items.map((item) => item.file_id) ?? [];
    const files = [...new Set(orderedIds.filter((id) => assets.file_ids.includes(id)))];
    if (!files.length) files.push(...assets.file_ids);
    const brief = blocks.find((block) => block.type === "brief");
    const durationField = brief?.fields.find((field) => /^(duration|length)$/i.test(field.label.trim()))?.value
      ?? doc?.markdown?.match(/(?:duration|length)\s*[:*|]\s*(?:\*\*)?(15|30)\s*(?:seconds?|secs?)/i)?.[0];
    const duration = /\b15\s*(?:seconds?|secs?)\b/i.test(durationField ?? "") ? 15 : 30;
    const link = await admin.from("agent_messages").select("thread_id").eq("canvas_id", row.data.id).eq("workspace_id", row.data.workspace_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (link.error || !link.data?.thread_id) throw new Error("The storyboard chat could not be found.");
    const source = !doc?.markdown ? await admin.from("agent_messages").select("content").eq("thread_id", link.data.thread_id).eq("role", "user").order("created_at", { ascending: true }).limit(20) : null;
    const original = source?.data?.map((item) => item.content).find((content) => /reference|photographs|boardwalk/i.test(content) && content.length > 300);
    const generated = [brief?.fields.map((field) => `${field.label}: ${field.value}`).join(". "), storyboard?.frames.map((frame) => frame.caption).join(". ") ?? shotlist?.items.map((item) => `${item.role}: ${item.why}`).join(". ")].filter(Boolean).join(". ");
    const rawPrompt = doc?.markdown?.match(/(?:^|\n)#{1,3}\s+Prompt\s*\n([\s\S]*?)(?=\n#{1,3}\s|$)/i)?.[1]?.trim() ?? doc?.markdown ?? original ?? generated;
    const prompt = rawPrompt.replace(/\b(?:15|30)\s*(?:[-–]\s*)?(?:seconds?|secs?)\b/gi, `${duration}-second`);
    const message = `Create a ${duration}-second 9:16 1080p reference video from these photos. ${prompt.slice(0, 4500)}`;
    const prepared = await prepareDirectVideo(admin, user.id, row.data.workspace_id, link.data.thread_id, message, files);
    if (prepared.missing.length) throw new Error(`Choose ${prepared.missing.join(", ")} before generation.`);
    const video = { type: "direct_video" as const, title: "Create your video", request_id: crypto.randomUUID(), status: "options" as const, reason: prepared.reason, reference_count: files.length, duration: prepared.brief.duration, aspect_ratio: prepared.brief.aspectRatio, resolution: prepared.brief.resolution, options: prepared.options.map((option) => ({ id: option.capabilityId, label: option.label })), missing: prepared.missing, message, thread_id: link.data.thread_id, file_ids: files };
    const saved = await admin.from("canvases").update({ blocks: [...blocks, video] as never, version: row.data.version + 1, updated_by: "user" }).eq("id", row.data.id).eq("version", row.data.version).select("id").maybeSingle();
    if (saved.error || !saved.data) throw new Error("The storyboard changed. Refresh and try again.");
    return { ready: true };
  });
