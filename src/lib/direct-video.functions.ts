import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./supabase-admin.server";
export const getDirectVideoOptions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ canvas_id: z.string().uuid(), index: z.number().int().nonnegative(), duration: z.number().int().min(2).max(120), aspect_ratio: z.string().max(10), resolution: z.string().max(10) }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { getAdminClient } = await import("./supabase-admin.server");
    const { parseBlocks } = await import("./sam.blocks");
    const { prepareDirectVideo } = await import("./direct-video.server");
    const admin = getAdminClient();
    const row = await admin.from("canvases").select("workspace_id,module,blocks").eq("id", data.canvas_id).single();
    if (row.error || row.data.module !== "create") throw new Error("This video request is unavailable.");
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: row.data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");
    const block = parseBlocks(row.data.blocks)[data.index];
    if (!block || block.type !== "direct_video") throw new Error("This video request is unavailable.");
    const prepared = await prepareDirectVideo(admin, user.id, row.data.workspace_id, block.thread_id, block.message, block.file_ids, { duration: data.duration, aspectRatio: data.aspect_ratio, resolution: data.resolution });
    const { estimateCreativeProviderJob } = await import("./creative-providers/adapters.server");
    const options = await Promise.all(prepared.options.map(async (option) => {
      let estimatedUsd: number | null = null;
      try {
        const quote = await estimateCreativeProviderJob({ capabilityId: option.capabilityId, settings: { ...option.settings, image_urls: block.file_ids.map((_, index) => `https://example.com/reference-${index}.jpg`) } });
        estimatedUsd = quote.usd;
      } catch { /* An unavailable estimate does not establish a credit price. */ }
      try {
        const { getContentCreditRate } = await import("./content-credits.server");
        const rate = await getContentCreditRate(admin as unknown as import("@supabase/supabase-js").SupabaseClient, option.capabilityId, data.duration);
        return { id: option.capabilityId, label: option.label, estimatedUsd, creditCost: rate.credits, creditRateId: rate.version };
      } catch { return { id: option.capabilityId, label: option.label, estimatedUsd, creditCost: null, creditRateId: null }; }
    }));
    return { options, reason: prepared.reason };
  });
export const chooseDirectVideo = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ canvas_id: z.string().uuid(), index: z.number().int().nonnegative(), expected_version: z.number().int(), capability_id: z.string().max(150), duration: z.union([z.literal(15), z.literal(30)]).optional(), aspect_ratio: z.enum(["9:16", "16:9", "1:1"]).optional(), resolution: z.enum(["480p", "720p", "1080p", "4k"]).optional(), expected_credits: z.number().int().positive().optional(), expected_rate_id: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    return (await import("./direct-video-actions.server")).executeDirectVideoChoice(user.id, data);
  });
