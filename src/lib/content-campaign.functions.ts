import { createServerFn, createServerOnlyFn } from "@tanstack/react-start";
import { z } from "zod";
import { campaignPostSchema } from "./content-campaign";
const identity = z.object({ workspace_id: z.string().uuid(), campaign_id: z.string().uuid() });
const read = createServerOnlyFn(async (input: z.infer<typeof identity>) => {
  const { requireUser } = await import("./supabase-admin.server");
  const { readContentCampaign } = await import("./content-campaign.server");
  return readContentCampaign((await requireUser()).id, input.workspace_id, input.campaign_id);
});
const updateInput = identity.extend({ revision: z.string().uuid(), posts: z.array(campaignPostSchema).min(1).max(90) });
const update = createServerOnlyFn(async (input: z.infer<typeof updateInput>) => {
  const { requireUser } = await import("./supabase-admin.server");
  const { updateContentCampaign } = await import("./content-campaign.server");
  return updateContentCampaign((await requireUser()).id, input.workspace_id, input.campaign_id, input.revision, input.posts);
});
export const getContentCampaign = createServerFn({method:"POST"}).inputValidator((v: unknown) => identity.parse(v)).handler(({data}) => read(data));
export const saveContentCampaign = createServerFn({method:"POST"}).inputValidator((v: unknown) => updateInput.parse(v)).handler(({data}) => update(data));
