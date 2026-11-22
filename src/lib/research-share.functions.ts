import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { createResearchShareRecord, loadPublicResearchShare, revokeResearchShareRecords } from "./research-share.server";

const RunId = z.object({ workspace_id: z.string().uuid(), run_id: z.string().uuid() });

export const createResearchShare = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunId.parse(input))
  .handler(({ data }) => createResearchShareRecord(data.workspace_id, data.run_id));

export const getPublicResearchShare = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ token: z.string().catch("") }).parse(input))
  .handler(({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store, max-age=0");
    setResponseHeader("Referrer-Policy", "no-referrer");
    return loadPublicResearchShare(data.token);
  });

export const revokeResearchShares = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => RunId.parse(input))
  .handler(({ data }) => revokeResearchShareRecords(data.workspace_id, data.run_id));

export type { PublicResearchShare } from "./research-share.server";
