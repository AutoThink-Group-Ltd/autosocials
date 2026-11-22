import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { getAdminClient } from "./supabase-admin.server";
import { prepareDirectVideo } from "./direct-video.server";
import type { Block } from "./sam.blocks";
import { createHash } from "node:crypto";

/** A bounded direct workflow; no narrative generation or model-authored tool arguments. */
export function directVideoChat(input: { userId: string; workspaceId: string; threadId: string; message: string; attachmentIds: string[]; requestKey?: string | undefined }) {
  return createUIMessageStreamResponse({ stream: createUIMessageStream({
    execute: async ({ writer }) => {
      const toolCallId = crypto.randomUUID();
      writer.write({ type: "tool-input-available", toolCallId, toolName: "prepare_direct_video", input: {} });
      const admin = getAdminClient();
      const hash = createHash("sha256").update(`${input.workspaceId}:${input.threadId}:${input.requestKey ?? crypto.randomUUID()}`).digest("hex");
      const canvasId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
      const previous = await admin.from("canvases").select("id,version,title").eq("id", canvasId).eq("workspace_id", input.workspaceId).maybeSingle();
      if (previous.error) throw new Error("Could not check whether this request already exists.");
      if (previous.data) {
        writer.write({ type: "tool-output-available", toolCallId, output: { canvas_id: previous.data.id, version: previous.data.version, title: previous.data.title } });
        const id = crypto.randomUUID(); writer.write({ type: "text-start", id }); writer.write({ type: "text-delta", id, delta: "Your existing video request is open in Live View. Check its status there before starting another." }); writer.write({ type: "text-end", id });
        return;
      }
      const prepared = await prepareDirectVideo(admin, input.userId, input.workspaceId, input.threadId, input.message, input.attachmentIds);
      const requestId = crypto.randomUUID();
      const block: Extract<Block, { type: "direct_video" }> = {
        type: "direct_video", title: "Create from your photos", request_id: requestId, status: "options", reason: prepared.reason,
        reference_count: prepared.referenceIds.length, duration: prepared.brief.duration, aspect_ratio: prepared.brief.aspectRatio, resolution: prepared.brief.resolution,
        options: prepared.options.map((option) => ({ id: option.capabilityId, label: option.label })), missing: prepared.missing,
        message: input.message, thread_id: input.threadId, file_ids: prepared.referenceIds,
      };
      const blocks: Block[] = [{ type: "assets", title: `${prepared.referenceIds.length} photos saved in Brand Assets`, file_ids: prepared.referenceIds, layout: "grid" }, block,
        { type: "notice", tone: "info", text: "This creates a silent source film. Add the logo and voiceover in editing; the original instructions are saved with the video." }];
      const saved = await admin.from("canvases").insert({ id: canvasId, workspace_id: input.workspaceId, module: "create", title: block.title, blocks: blocks as never, updated_by: "sam" }).select("id,version,title").single();
      if (saved.error) throw new Error("Your photos are saved, but the video options could not be saved. Please try again.");
      const canvas = saved.data;
      const narration = "Review your video preview in Live View and choose a model to start production.";
      const historyMessage = await admin.from("agent_messages").insert({ thread_id: input.threadId, workspace_id: input.workspaceId, role: "assistant", content: narration, canvas_id: canvas.id });
      if (historyMessage.error) throw new Error("Your video request is saved, but chat history could not update. Check Live View before retrying.");
      writer.write({ type: "tool-output-available", toolCallId: toolCallId, output: { canvas_id: canvas.id, version: canvas.version, title: canvas.title } });
      const id = crypto.randomUUID();
      writer.write({ type: "text-start", id }); writer.write({ type: "text-delta", id, delta: narration }); writer.write({ type: "text-end", id });
      await admin.from("agent_threads").update({ updated_at: new Date().toISOString() }).eq("id", input.threadId);
    },
    onError: (error) => error instanceof Error ? error.message : "The direct video request could not finish. Check its status before retrying.",
  }) });
}
