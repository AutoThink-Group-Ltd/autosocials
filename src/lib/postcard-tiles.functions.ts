import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { designSchema, quoteEvidenceSchema } from "./social-design";
import { MAX_SOCIAL_TILE_SUPPORT } from "./social-tiles";
const request = z
  .object({
    workspace_id: z.string().uuid(),
    request_id: z.string().uuid(),
    headline: z.string().trim().min(1).max(80),
    supporting: z.string().trim().max(MAX_SOCIAL_TILE_SUPPORT),
    direction: z.string().trim().min(1).max(220),
    design: designSchema.optional(),
    standalone: z.literal(true).optional(),
    quote: quoteEvidenceSchema.optional(),
    expected_provider: z.enum(["openai", "ideogram", "recraft"]),
    expected_credits: z.number().int().nonnegative(),
    expected_rate_id: z.string().uuid(),
  })
  .strict();
const status = z
  .object({ workspace_id: z.string().uuid(), request_id: z.string().uuid() })
  .strict();
const redesignRequest = request.omit({ request_id: true }).extend({
  original_request_id: z.string().uuid(),
  expected_file_id: z.string().uuid(),
}).strict();
const create = createServerOnlyFn(async (data: z.infer<typeof request>) => {
  const { requireUser } = await import("./supabase-admin.server");
  const { createSamTile } = await import("./sam-tile-design.server");
  const user = await requireUser();
  return createSamTile(user.id, { ...data, retry_safe: "before_generation" });
});
const check = createServerOnlyFn(async (data: z.infer<typeof status>) => {
  const { requireUser } = await import("./supabase-admin.server");
  const { checkPostcardTileStatus } = await import("./postcard-tiles.server");
  const user = await requireUser();
  return checkPostcardTileStatus(user.id, data.workspace_id, data.request_id);
});
export const generatePostcardTile = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => request.parse(v))
  .handler(({ data }) => create(data));
export const quotePostcardTile = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => request.omit({ request_id: true, expected_provider: true, expected_credits: true, expected_rate_id: true }).parse(v))
  .handler(async ({ data }) => {
    const { requireUser, getAdminClient } = await import("./supabase-admin.server");
    const user = await requireUser();
    const access = await getAdminClient().rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("You don't have access to this workspace.");
    return (await import("./sam-tile-design.server")).quoteSamTile(data);
  });
export const checkPostcardTile = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => status.parse(v))
  .handler(({ data }) => check(data));
export const redesignPostcardTile = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => redesignRequest.parse(v))
  .handler(async ({ data }) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { redesignTile } = await import("./social-tile-redesign.server");
    return redesignTile((await requireUser()).id, data);
  });
export const listSupersededPostcardTiles = createServerFn({ method: "POST" })
  .inputValidator((v: unknown) => z.object({ workspace_id: z.string().uuid() }).strict().parse(v))
  .handler(async ({ data }) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { listSupersededTiles } = await import("./social-tile-redesign.server");
    return listSupersededTiles((await requireUser()).id, data.workspace_id);
  });
