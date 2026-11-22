import { z } from "zod";
export const agentVirloSearchInput = z
  .object({
    query: z.string().trim().min(2).max(200),
    platform: z.enum(["instagram", "tiktok", "youtube"]).optional(),
    page: z.number().int().min(1).max(5).default(1),
    allowMeteredSearch: z.literal(true),
  })
  .strict();
export const agentVirloSearchOutput = z.object({
  resultId: z.string().uuid(),
  results: z
    .array(
      z.object({
        url: z.string().url(),
        platform: z.enum(["instagram", "tiktok", "youtube"]),
        caption: z.string().max(800),
        views: z.number().nonnegative().nullable(),
        likes: z.number().nonnegative().nullable(),
        comments: z.number().nonnegative().nullable(),
        publishedAt: z.string().max(40).nullable(),
      }),
    )
    .max(20),
});
export type AgentVirloSearchRequest = {
  workspaceId: string;
  userId: string;
  requestId: string;
  input: unknown;
};
