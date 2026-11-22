import { decryptMetaToken } from '../_shared/meta-tokens.ts';
// Deletes a post on the connected platform (Facebook / Instagram) AND from our DB.
// TikTok has no public delete endpoint — we surface that limitation to the user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const META_GRAPH = "https://graph.facebook.com/v21.0";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return j({ error: "Unauthorized" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: auth } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return j({ error: "Unauthorized" }, 401);

    const { post_id, also_delete_on_platform } = await req.json();
    if (!post_id) return j({ error: "post_id required" }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: post } = await admin
      .from("posts").select("id, workspace_id").eq("id", post_id).maybeSingle();
    if (!post) return j({ error: "Post not found" }, 404);

    // Authorize: must be workspace member
    const { data: member } = await admin.from("workspace_members")
      .select("user_id").eq("user_id", user.id).eq("workspace_id", post.workspace_id).maybeSingle();
    if (!member) return j({ error: "Forbidden" }, 403);

    const results: Array<{ platform: string; deleted: boolean; reason?: string }> = [];

    if (also_delete_on_platform) {
      const { data: targets } = await admin.from("post_targets")
        .select("id, platform, platform_post_id, social_account_id")
        .eq("post_id", post_id).eq("status", "published");

      for (const t of targets ?? []) {
        if (!t.platform_post_id) {
          results.push({ platform: t.platform, deleted: false, reason: "No platform post id stored" });
          continue;
        }
        const { data: acc } = await admin.from("social_accounts")
          .select("access_token,workspace_id,platform,external_id").eq("id", t.social_account_id).maybeSingle();
        if (!acc?.access_token) {
          results.push({ platform: t.platform, deleted: false, reason: "Account disconnected" });
          continue;
        }
        if (t.platform === "facebook" || t.platform === "instagram") {
          try {
            const token = await decryptMetaToken(acc.access_token, `account:${acc.workspace_id}:${acc.platform}:${acc.external_id}`);
            const r = await fetch(`${META_GRAPH}/${t.platform_post_id}?access_token=${encodeURIComponent(token)}`, {
              method: "DELETE",
            });
            const jr = await r.json().catch(() => ({}));
            if (!r.ok && !jr.success) throw new Error(jr.error?.message ?? `${r.status}`);
            results.push({ platform: t.platform, deleted: true });
          } catch (e: any) {
            results.push({ platform: t.platform, deleted: false, reason: e.message });
          }
        } else if (t.platform === "tiktok") {
          results.push({
            platform: "tiktok",
            deleted: false,
            reason: "TikTok does not support remote deletion — please remove it from the TikTok app.",
          });
        }
      }
    }

    // Delete media from storage
    const { data: mediaRows } = await admin.from("post_media")
      .select("storage_path").eq("post_id", post_id);
    if (mediaRows?.length) {
      await admin.storage.from("post-media").remove(mediaRows.map((m) => m.storage_path));
    }
    // Delete post (cascades to post_media + post_targets via FK)
    await admin.from("posts").delete().eq("id", post_id);

    return j({ ok: true, results });
  } catch (e: any) {
    console.error("delete-platform-post error:", e);
    return j({ error: e.message }, 500);
  }
});
function j(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
