import { z } from "zod";
const iso = z.string().datetime({ offset: true });
export const rankOrganicInput = z
  .object({
    accountIds: z.array(z.string().uuid()).min(1).max(20).optional(),
    publishedAfter: iso.optional(),
    publishedBefore: iso.optional(),
    comparison: z.enum(["engagement", "views", "reach"]).default("engagement"),
    limit: z.number().int().min(1).max(50).default(10),
  })
  .strict()
  .refine(
    (input) =>
      !input.publishedAfter ||
      !input.publishedBefore ||
      Date.parse(input.publishedAfter) < Date.parse(input.publishedBefore),
    "The start must precede the end.",
  );
export const listWinnerFindingsInput = z
  .object({ limit: z.number().int().min(1).max(30).default(10) })
  .strict();
export const listWinnerShortlistInput = z
  .object({ limit: z.number().int().min(1).max(100).default(25) })
  .strict();
export const winnersAction = z.enum([
  "rank_organic",
  "list_findings",
  "list_shortlist",
]);

const count = z.number().int().nonnegative();
const metric = z.number().nullable();
const metricName = z.enum(["likes", "comments", "shares", "views", "reach"]);
export const rankOrganicOutput = z.object({
  comparison: z.enum(["engagement", "views", "reach"]),
  window: z.object({
    publishedAfter: z.string().nullable(),
    publishedBefore: z.string().nullable(),
    accountIds: z.array(z.string()).nullable(),
  }),
  scanned: count,
  fresh: count,
  staleOrUnavailable: count,
  scanLimit: z.literal(500),
  scanTruncated: z.boolean(),
  rankable: count,
  posts: z.array(
    z.object({
      postId: z.string(),
      accountId: z.string(),
      platform: z.string(),
      format: z.string(),
      title: z.string().nullable(),
      caption: z.string().nullable(),
      permalink: z.string().nullable(),
      publishedAt: z.string(),
      measuredAt: z.string(),
      metrics: z.object({
        likes: metric,
        comments: metric,
        shares: metric,
        views: metric,
        reach: metric,
      }),
      percentile: z.number().nullable(),
      cohortSize: count,
      metricsUsed: z.array(metricName),
      reason: z.string(),
      evidenceStatus: z.enum(["not_comparable", "fresh"]),
    }),
  ),
  limitations: z.string(),
});
export const listWinnerFindingsOutput = z.object({
  findings: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      explanation: z.string(),
      sourcePostIds: z.array(z.string()),
      updatedAt: z.string(),
      evidence: z.array(
        z.object({
          postId: z.string().nullable(),
          measuredAt: z.string(),
          percentile: z.number().nullable(),
          metrics: z.array(metricName),
          cohortSize: count.nullable(),
          thumbnailInspected: z.boolean(),
        }),
      ),
    }),
  ),
  excludedStaleOrUnverified: count,
  scanTruncated: z.boolean(),
  limitations: z.string(),
});
export const listWinnerShortlistOutput = z.object({
  shortlist: z.array(
    z.object({
      postId: z.string(),
      selectedAt: z.string(),
      evidence: z
        .object({
          views: metric,
          reach: metric,
          likes: metric,
          comments: metric,
          shares: metric,
          measuredAt: z.string().nullable(),
          permalink: z.string().nullable(),
        })
        .nullable(),
      evidenceStatus: z.enum([
        "fresh_at_last_measurement",
        "stale_or_unavailable",
      ]),
    }),
  ),
  truncated: z.boolean(),
  limitations: z.string(),
});
