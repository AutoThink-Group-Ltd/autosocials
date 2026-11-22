import { z } from "zod";

export const referenceIdsSchema = z.array(z.string().uuid()).max(5);
export const designSchema = z
  .object({
    aspect: z.enum(["square", "portrait"]),
    treatment: z.enum(["illustration", "typography"]),
    composition: z.enum(["top", "right", "full"]),
    typeface: z.enum(["sans", "serif", "condensed"]),
    medium: z.string().trim().min(1).max(300),
    paper: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    ink: z
      .string()
      .regex(/^#[0-9a-f]{6}$/i)
      .optional(),
    accent: z.string().regex(/^#[0-9a-f]{6}$/i),
    emphasis: z.string().max(100),
    referenceIds: referenceIdsSchema.optional(),
    showcaseKind: z.enum(["product", "promotional", "educational"]).optional(),
  })
  .strict();

export const quoteEvidenceSchema = z
  .object({
    text: z.string().trim().min(1).max(300),
    speaker: z.string().trim().min(1).max(100),
    sourceTitle: z.string().trim().min(1).max(200),
    sourceUrl: z
      .string()
      .url()
      .max(2048)
      .regex(/^https:\/\//i),
  })
  .strict();
export type SocialDesign = z.infer<typeof designSchema>;
export type QuoteEvidence = z.infer<typeof quoteEvidenceSchema>;

// Apply the actual user selection. Model-proposed file IDs are never authoritative.
export function withDesignReferences(
  design: SocialDesign,
  referenceIds: string[],
) {
  const { referenceIds: _suggested, ...rest } = design;
  return referenceIds.length ? { ...rest, referenceIds } : rest;
}

export function defaultSocialDesign(direction: string): SocialDesign {
  return {
    aspect: /portrait|4:5/i.test(direction) ? "portrait" : "square",
    treatment: /typography.only|type.only|typography.led|lettering alone/i.test(
      direction,
    )
      ? "typography"
      : "illustration",
    composition: "top",
    typeface: "sans",
    medium:
      direction.trim().slice(0, 300) ||
      "Editorial illustration with a clear focal point",
    accent: "#DDAA23",
    emphasis: "",
  };
}
