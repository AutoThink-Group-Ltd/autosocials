import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { ResearchTargetSchema } from "./research";
import { previewVisualCompetitor, refreshVisualShare } from "./research-visual.server";

export const previewResearchCompetitor = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), target: ResearchTargetSchema }).parse(input))
  .handler(({ data }) => previewVisualCompetitor(data.workspace_id, data.target));

export const refreshVisualResearchShare = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({
    workspace_id: z.string().uuid(), run_id: z.string().uuid(), token: z.string().regex(/^[a-f0-9]{64}$/),
    manual_competitor_urls: z.array(z.string().trim().min(3).max(500)).max(3).nullable().default(null),
  }).parse(input))
  .handler(async ({ data }) => { await refreshVisualShare(data.workspace_id, data.run_id, data.token, data.manual_competitor_urls); return { ok: true }; });

export type { VisualReport } from "./research-visual.server";
