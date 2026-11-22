import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./supabase-admin.server";
import { NEW_BATCH_SIZES } from "./content-rules";
import { VIDEO_STYLE_IDS } from "./video-styles";

export const ModelPromptInput = z.object({
  workspace_id: z.string().uuid(), prompt: z.string().trim().max(5000),
  file_ids: z.array(z.string().uuid()).max(20), style_id: z.enum(VIDEO_STYLE_IDS),
});
export const ModelCreateInput = ModelPromptInput.extend({
  request_id: z.string().uuid(), prompt: z.string().trim().min(3).max(5000),
  duration: z.union([z.literal(15), z.literal(30), z.literal(60)]), size: z.enum(NEW_BATCH_SIZES),
  voice: z.string().trim().min(1).max(80).optional(), captions: z.enum(["clean", "off"]), note: z.string().max(300).optional(),
  preview_only: z.boolean().optional(),
  expected_credits: z.number().int().positive().optional(), expected_rate_id: z.string().uuid().optional(),
});
export type ModelCreateRequest = z.infer<typeof ModelCreateInput>;
export type ModelPromptRequest = z.infer<typeof ModelPromptInput>;
export const ModelVideoRequestInput = z.object({ workspace_id: z.string().uuid(), request_id: z.string().uuid() });
export type ModelVideoRequestLookup = z.infer<typeof ModelVideoRequestInput>;
export type ModelVideoRequestState = { state: "not_found" | "preparing" | "failed" | "preview" | "queued"; batch_id?: string; variant_id?: string };

/** Read-only recovery check. A saved request is never admitted again. */
export const getModelVideoRequest = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ModelVideoRequestInput.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { getModelVideoRequestForUser } = await import("./model-create.server");
    return getModelVideoRequestForUser(user.id, data);
  });

/** Explicit Create is the only action that admits production. */
export const createModelVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ModelCreateInput.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { createModelVideoForUser } = await import("./model-create.server");
    return createModelVideoForUser(user.id, data);
  });

export const quoteModelVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), style_id: z.enum(VIDEO_STYLE_IDS), duration: z.union([z.literal(15), z.literal(30), z.literal(60)]) }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { quoteModelVideoForUser } = await import("./model-create.server");
    return quoteModelVideoForUser(user.id, data);
  });

/** Read-only prompt assistance; never queues a render or invokes tools. */
export const draftModelPrompt = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => ModelPromptInput.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { draftModelPromptForUser } = await import("./model-create.server");
    return draftModelPromptForUser(user.id, data);
  });
