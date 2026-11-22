import { z } from "zod";
export const researchLookupInput = z
  .object({
    query: z.string().trim().min(2).max(160),
    allowMeteredLookup: z.boolean().optional().default(false),
  })
  .strict();
export const researchListInput = z
  .object({ limit: z.number().int().min(1).max(30).optional().default(10) })
  .strict();
export const researchStartInput = z
  .object({
    query: z.string().trim().min(2).max(500),
    question: z.string().max(8000).default(""),
    targets: z.array(z.string().url().max(500)).min(1).max(3),
    allowMeteredRun: z.literal(true),
  })
  .strict();
export const researchStartOutput = z.object({
  id: z.string().uuid(),
  status: z.enum([
    "queued",
    "fetching",
    "analyzing",
    "complete",
    "partial",
    "failed",
  ]),
  reused: z.boolean(),
});
export const researchGetInput = z.object({ id: z.string().uuid() }).strict();
const platform = z.enum(["instagram", "facebook", "tiktok"]);
export const researchLookupOutput = z.object({
  candidates: z
    .array(
      z.object({
        id: z.string().max(160),
        platform,
        handle: z.string().max(100),
        url: z.string().url(),
        verified: z.literal(false),
      }),
    )
    .max(12),
  warnings: z.array(z.string().max(300)).max(8),
});
const status = z.enum([
  "queued",
  "fetching",
  "analyzing",
  "complete",
  "partial",
  "failed",
]);
const summary = z.object({
  id: z.string().uuid(),
  query: z.string().max(500),
  status,
  createdAt: z.string(),
  postCount: z.number().int().nonnegative(),
});
export const researchListOutput = z.object({
  reports: z.array(summary).max(30),
});
const metric = z.number().finite().nonnegative().nullable();
export const researchGetOutput = z.object({
  report: summary.extend({
    updatedAt: z.string(),
    question: z.string().max(2000),
    summary: z.string().max(2000).nullable(),
    targets: z
      .array(
        z.object({
          platform,
          handle: z.string().max(100),
          url: z.string().url(),
        }),
      )
      .max(3),
    evidence: z
      .array(
        z.object({
          reference: z.string(),
          platform,
          url: z.string().url(),
          caption: z.string().max(1000),
          publishedAt: z.string().nullable(),
          mediaType: z.enum(["image", "video", "carousel", "unknown"]),
          reviewBasis: z.enum(["frames", "thumbnail", "metadata"]),
          metrics: z.object({
            likes: metric,
            comments: metric,
            views: metric,
            shares: metric,
          }),
        }),
      )
      .max(20),
  }),
});
export type ResearchAction = "lookup" | "list" | "get" | "start";
export type ResearchRequest = {
  action: ResearchAction;
  workspaceId: string;
  userId: string;
  input: unknown;
  connectionId?: string;
  idempotencyKey?: string;
};
