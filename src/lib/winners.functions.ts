import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import { freshWinnerEvidence } from "./winner-evidence";

const workspace = z.string().uuid();
const postFields = "id,external_id,account_id,platform,title,caption,format,thumbnail_url,permalink,published_at,measured_at,views,reach,likes,comments_count,shares,comments_status,post_target_id";

async function authorised(workspaceId: string) {
  const user = await requireUser();
  const typed = getAdminClient();
  const { data, error } = await typed.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: workspaceId });
  if (error || !data) throw new Error("Workspace access required.");
  // The intelligence tables are created by the accompanying migration; generated
  // database types can be refreshed once the migration is applied.
  return { user, db: typed as unknown as SupabaseClient };
}

export const getWinners = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: workspace }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await authorised(data.workspace_id);
    const [posts, accounts, syncs, findings, shortlist] = await Promise.all([
      db.from("winner_posts").select(postFields).eq("workspace_id", data.workspace_id).order("published_at", { ascending: false }).order("id", { ascending: false }).limit(501),
      db.from("social_accounts").select("id,platform,handle,display_name,status,is_enabled").eq("workspace_id", data.workspace_id).in("platform", ["facebook", "instagram", "tiktok", "youtube"]).order("display_name"),
      db.from("winner_syncs").select("account_id,status,message,last_attempt_at,last_success_at,cursor").eq("workspace_id", data.workspace_id),
      db.from("winner_findings").select("id,title,explanation,evidence,source_post_ids,updated_at").eq("workspace_id", data.workspace_id).eq("active", true).is("dismissed_at", null).gte("updated_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).order("updated_at", { ascending: false }).limit(30),
      db.from("winner_shortlist").select(`winner_post_id,selected_at,evidence_snapshot,winner_posts(${postFields})`).eq("workspace_id", data.workspace_id),
    ]);
    if (posts.error || accounts.error || syncs.error || findings.error || shortlist.error) throw new Error("Could not load content intelligence. Please try again.");
    const visible = (posts.data ?? []).slice(0, 500);
    const last = visible.at(-1);
    return { posts: visible, next_cursor: (posts.data?.length ?? 0) > 500 && last ? { published_at: last.published_at, id: last.id } : null, accounts: accounts.data ?? [], syncs: syncs.data ?? [], findings: (findings.data ?? []).filter(f => freshWinnerEvidence(f.evidence)), shortlist: shortlist.data ?? [] };
  });

export const getOlderWinnerPosts = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: workspace, cursor: z.object({ published_at: z.string().datetime({ offset: true }), id: z.string().uuid() }) }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await authorised(data.workspace_id);
    const timestamp = new Date(data.cursor.published_at).toISOString();
    const { data: rows, error } = await db.from("winner_posts").select(postFields).eq("workspace_id", data.workspace_id)
      .or(`published_at.lt.${timestamp},and(published_at.eq.${timestamp},id.lt.${data.cursor.id})`)
      .order("published_at", { ascending: false }).order("id", { ascending: false }).limit(251);
    if (error) throw new Error("Could not load older posts.");
    const visible = (rows ?? []).slice(0, 250), last = visible.at(-1);
    return { posts: visible, next_cursor: (rows?.length ?? 0) > 250 && last ? { published_at: last.published_at, id: last.id } : null };
  });

export const getWinnerComments = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: workspace, post_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await authorised(data.workspace_id);
    const result = await db.from("winner_posts").select("comments,comments_status").eq("workspace_id", data.workspace_id).eq("id", data.post_id).maybeSingle();
    if (result.error || !result.data) throw new Error("Comments are unavailable.");
    return { comments: result.data.comments as { text: string }[], status: result.data.comments_status as string };
  });

export const refreshWinnerFindings = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: workspace }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await authorised(data.workspace_id);
    const { generateWinnerFindings } = await import("./winner-analysis.server");
    return generateWinnerFindings(db, data.workspace_id);
  });

export const updateWinnerShortlist = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: workspace, post_ids: z.array(z.string().uuid()).min(1).max(100), selected: z.boolean() }).parse(input))
  .handler(async ({ data }) => {
    const { db, user } = await authorised(data.workspace_id);
    const ids = [...new Set(data.post_ids)];
    const { data: posts, error } = await db.from("winner_posts").select("id,views,reach,likes,comments_count,shares,measured_at,post_target_id,permalink").eq("workspace_id", data.workspace_id).in("id", ids);
    if (error || posts?.length !== ids.length) throw new Error("Some selected posts are no longer available in this workspace.");
    const result = data.selected
      ? await db.from("winner_shortlist").upsert(posts!.map(post => ({ workspace_id: data.workspace_id, winner_post_id: post.id, selected_by: user.id, evidence_snapshot: { views: post.views, reach: post.reach, likes: post.likes, comments_count: post.comments_count, shares: post.shares, measured_at: post.measured_at, post_target_id: post.post_target_id, permalink: post.permalink } })), { onConflict: "workspace_id,winner_post_id", ignoreDuplicates: true })
      : await db.from("winner_shortlist").delete().eq("workspace_id", data.workspace_id).in("winner_post_id", ids);
    if (result.error) throw new Error("Could not update the paid-testing shortlist.");
    return { updated: ids.length };
  });

export const dismissWinnerFinding = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: workspace, finding_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { db } = await authorised(data.workspace_id);
    const { data: updated, error } = await db.from("winner_findings").update({ dismissed_at: new Date().toISOString() }).eq("workspace_id", data.workspace_id).eq("id", data.finding_id).is("dismissed_at", null).select("id").maybeSingle();
    if (error || !updated) throw new Error("This finding is no longer available.");
    return { dismissed: true };
  });
