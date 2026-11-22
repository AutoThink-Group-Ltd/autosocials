import { getAdminClient } from "./supabase-admin.server";
import { campaignCalendarTitle, campaignSchema, type ContentCampaign } from "./content-campaign";
import type { SupabaseClient } from "@supabase/supabase-js";
const db = () => getAdminClient() as unknown as SupabaseClient;
async function access(userId: string, workspaceId: string) {
  const { data, error } = await db().rpc("can_access_workspace", { _user_id: userId, _workspace_id: workspaceId });
  if (error || !data) throw new Error("Workspace access denied.");
}
export async function readContentCampaign(userId: string, workspaceId: string, campaignId: string): Promise<ContentCampaign> {
  await access(userId, workspaceId);
  const { data, error } = await db().from("brand_work_operations").select("result").eq("workspace_id", workspaceId).eq("kind", "content-campaign").eq("signature", campaignId).eq("status", "complete").maybeSingle();
  if (error || !data) throw new Error("Campaign not found.");
  return campaignSchema.parse(data.result);
}
export async function insertContentCampaign(userId: string, workspaceId: string, campaign: ContentCampaign) {
  await access(userId, workspaceId);
  const validated = campaignSchema.parse(campaign);
  const { error } = await db().from("brand_work_operations").insert({ workspace_id: workspaceId, kind: "content-campaign", signature: validated.id, token: validated.revision, status: "complete", result: validated });
  if (error) throw new Error("Could not save this campaign.");
  return validated;
}
export async function updateContentCampaign(userId: string, workspaceId: string, campaignId: string, revision: string, posts: ContentCampaign["posts"]) {
  const current = await readContentCampaign(userId, workspaceId, campaignId);
  if (current.revision !== revision) throw new Error("This campaign changed. Reopen it before editing.");
  // Existing checked evidence may travel with ordinary copy edits. New or
  // changed attribution must pass the same source check as the planner.
  const { lookupQuote } = await import("./social-design-planning.server");
  for (const post of posts) {
    const previous = current.posts.find(item => item.id === post.id);
    if (post.quote && JSON.stringify(post.quote) !== JSON.stringify(previous?.quote)) {
      const verified = await lookupQuote(post.quote);
      if (!verified || JSON.stringify(verified) !== JSON.stringify(post.quote)) throw new Error("The quotation source could not be confirmed. Review the tile before saving.");
    }
  }
  const next = campaignSchema.parse({ ...current, title:campaignCalendarTitle(posts), revision: crypto.randomUUID(), posts });
  const { data, error } = await db().from("brand_work_operations").update({ result: next, token: next.revision, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId).eq("kind", "content-campaign").eq("signature", campaignId).eq("token", revision).select("token").maybeSingle();
  if (error || !data) throw new Error("This campaign changed or is locked for production. Reopen it or create a new plan before editing.");
  if (next.title !== current.title) {
    await db().from("canvases").update({title:next.title}).eq("workspace_id", workspaceId).eq("title",current.title)
      .contains("blocks", [{type:"content_campaign", campaignId}]);
  }
  return next;
}
