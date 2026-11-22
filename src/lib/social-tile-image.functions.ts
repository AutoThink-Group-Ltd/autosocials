import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { designSchema } from "./social-design";

const readImage = createServerOnlyFn(
  async (workspaceId: string, fileId: string) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { readSocialTileImage } = await import("./social-tile-image.server");
    const user = await requireUser();
    return readSocialTileImage(user.id, workspaceId, fileId);
  },
);
const generateImage = createServerOnlyFn(
  async (workspaceId: string, prompt: string, requestId: string, expectedCredits: number, expectedRateId: string, design?: z.infer<typeof designSchema>, identity?: {format:"tile"|"carousel"; job_id:string; version_id?:string|undefined}, standalone?: boolean) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { createSocialTileImage } =
      await import("./social-tile-image.server");
    const user = await requireUser();
    return createSocialTileImage(user.id, workspaceId, prompt, requestId, expectedCredits, expectedRateId, design, identity, standalone);
  },
);
const checkImage = createServerOnlyFn(
  async (workspaceId: string, requestId: string) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { checkSocialTileImageStatus } =
      await import("./social-tile-image.server");
    const user = await requireUser();
    return checkSocialTileImageStatus(user.id, workspaceId, requestId);
  },
);
export const getSocialTileImage = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({ workspace_id: z.string().uuid(), file_id: z.string().uuid() })
      .strict()
      .parse(v),
  )
  .handler(({ data }) => readImage(data.workspace_id, data.file_id));
export const generateSocialTileImage = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        prompt: z.string().trim().min(1).max(1500),
        request_id: z.string().uuid(),
        expected_credits: z.number().int().positive(),
        expected_rate_id: z.string().uuid(),
        design: designSchema.optional(),
        standalone: z.literal(true).optional(),
        identity: z.object({ format:z.enum(["tile","carousel"]), job_id:z.string().uuid(), version_id:z.string().uuid().optional() }).strict().optional(),
      })
      .strict()
      .parse(v),
  )
  .handler(({ data }) =>
    generateImage(data.workspace_id, data.prompt, data.request_id, data.expected_credits, data.expected_rate_id, data.design, data.identity, data.standalone),
  );
export const quoteSocialTileImage = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ workspace_id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data }) => {
    const { requireUser, getAdminClient } = await import("./supabase-admin.server");
    const user = await requireUser();
    const access = await getAdminClient().rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("You don't have access to this workspace.");
    if (!process.env["OPENAI_API_KEY"]?.trim()) throw new Error("AI imagery is not connected.");
    const { getContentCreditRate } = await import("./content-credits.server");
    const rate = await getContentCreditRate(getAdminClient() as unknown as import("@supabase/supabase-js").SupabaseClient, "openai-image", 0);
    return { provider: "openai" as const, credits: rate.credits, rateId: rate.version };
  });
export const checkSocialTileImage = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        request_id: z.string().uuid(),
      })
      .strict()
      .parse(v),
  )
  .handler(({ data }) => checkImage(data.workspace_id, data.request_id));
