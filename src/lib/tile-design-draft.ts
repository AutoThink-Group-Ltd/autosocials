import { z } from "zod";
import { tilePlanSchema } from "./social-tiles";
const uuid = z.string().uuid();
export const designEntrySchema = z
  .object({
    tile: tilePlanSchema.shape.tiles.element,
    requestId: uuid,
    dnaJobId: uuid.optional(),
    postId: uuid,
    fileId: uuid.optional(),
    status: z.string().min(1).max(80),
    savedFileId: uuid.optional(),
    savedSignature: z.string().max(1000).optional(),
  })
  .strict();
export type DesignEntry = z.infer<typeof designEntrySchema>;
export const tileDesignDraftPayload = z
  .object({
    plan: tilePlanSchema,
    entries: z.array(designEntrySchema).min(1).max(5),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.plan.tiles.length !== v.entries.length)
      ctx.addIssue({
        code: "custom",
        message: "Each tile needs a draft entry.",
      });
    if (
      new Set(v.entries.map((e) => e.requestId)).size !== v.entries.length ||
      new Set(v.entries.map((e) => e.postId)).size !== v.entries.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Each tile needs separate request and post IDs.",
      });
  });
export const tileDesignKey = z
  .object({ workspace_id: uuid, id: uuid })
  .strict();
export const saveTileDesignInput = tileDesignKey
  .extend({ version: uuid.optional(), payload: tileDesignDraftPayload })
  .strict();
export const tileDesignListInput = z.object({ workspace_id: uuid }).strict();
