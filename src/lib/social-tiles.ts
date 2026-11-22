import { z } from "zod";
import { designSchema, quoteEvidenceSchema } from "./social-design";
import { MAX_SOCIAL_TILES_PER_PLAN } from "./content-rules";

export const MAX_SOCIAL_TILE_SUPPORT = 200;

export const tilePlanSchema = z.object({
  standalone: z.literal(true).optional(),
  brand: z.string().trim().min(1).max(60),
  tiles: z
    .array(
      z.object({
        headline: z.string().trim().min(1).max(80),
        supporting: z.string().trim().max(MAX_SOCIAL_TILE_SUPPORT),
        direction: z.string().trim().max(220).optional(),
        design: designSchema.optional(),
        quote: quoteEvidenceSchema.optional(),
        quoteNotice: z.string().trim().max(500).optional(),
        artwork: z
          .object({
            requestId: z.string().uuid(),
            fileId: z.string().uuid().optional(),
          })
          .strict()
          .optional(),
      }),
    )
    .min(1)
    .max(MAX_SOCIAL_TILES_PER_PLAN),
});
export type TilePlan = z.infer<typeof tilePlanSchema>;
