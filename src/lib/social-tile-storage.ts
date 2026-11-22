import { z } from "zod";

const uuid = z.string().uuid();
export const saveTilesInput = z
  .object({
    workspace_id: uuid,
    tiles: z
      .array(
        z
          .object({
            id: uuid,
            headline: z.string().trim().min(1).max(80),
            mime: z.enum(["image/png", "image/jpeg"]),
            image_base64: z.string().min(1).max(4_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      v.tiles.reduce((sum, tile) => sum + tile.image_base64.length, 0) >
      4_000_000
    )
      ctx.addIssue({ code: "custom", message: "Save the tiles individually." });
    if (new Set(v.tiles.map((tile) => tile.id)).size !== v.tiles.length)
      ctx.addIssue({
        code: "custom",
        message: "Each tile needs a different ID.",
      });
  });
export const tileDraftsInput = z
  .object({
    workspace_id: uuid,
    tiles: z
      .array(
        z
          .object({
            file_id: uuid,
            post_id: uuid,
            caption: z.string().max(2200),
          })
          .strict(),
      )
      .min(1)
      .max(5),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      new Set(v.tiles.map((tile) => tile.file_id)).size !== v.tiles.length ||
      new Set(v.tiles.map((tile) => tile.post_id)).size !== v.tiles.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Each draft needs a different file and post ID.",
      });
  });
export type SaveTilesInput = z.infer<typeof saveTilesInput>;
export type TileDraftsInput = z.infer<typeof tileDraftsInput>;
