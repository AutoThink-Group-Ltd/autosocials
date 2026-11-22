// Cron-triggered publisher with retries, stale guard, and resilient IG polling.
import { publishX } from "./x-publisher.ts";
import { LinkedInVideoProcessingError, publishLinkedIn } from "./linkedin-publisher.ts";
import { decryptLinkedInToken, linkedInTokenContext } from "../_shared/linkedin-tokens.ts";
import { canPollTikTokAgain, reconcileTikTokPublish } from "./tiktok-reconcile.ts";
import { initializeTikTokPublish } from "./tiktok-publisher.ts";
import { makeTikTokMediaCapability } from "../_shared/tiktok-media-capability.ts";
import { tiktokAccessToken } from "../_shared/tiktok-tokens.ts";
import { decryptXToken, encryptXToken, xTokenContext, refreshXToken } from "../_shared/x-tokens.ts";
import { decryptMetaToken } from "../_shared/meta-tokens.ts";
import { decryptYouTubeToken, encryptYouTubeToken, youtubeTokenContext } from "../_shared/youtube-tokens.ts";
import { aggregateDeliveryStatus, ProviderError, providerError, safeDeliveryError, validateMetaDelivery, validateYouTubeDelivery } from "./delivery.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
const FROM_EMAIL = "info@autosocials.com";
const FROM_NAME = "AutoSocials";
const APP_URL = "https://autosocials.com";
const META_GRAPH = "https://graph.facebook.com/v26.0";

// Enable only after the verified-domain media source and per-target consent are integrated.
const TIKTOK_DISPATCH_ENABLED = false;
class AgentDispatchHeld extends Error {}
const MAX_ATTEMPTS = 3;
const BACKOFF_MIN = [5, 20, 60]; // minutes per attempt
type DeliveryContext = { containerId: string | null; checkpoint: (patch: Record<string, unknown>) => Promise<void> };


const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = req.headers.get("Authorization") ?? "";
  const bearer = auth.replace(/^Bearer /i, "");
  const cronSecret = Deno.env.get("PUBLISH_CRON_SECRET");
  const isWorker = bearer === SERVICE_ROLE || !!(cronSecret && req.headers.get("x-cron-secret") === cronSecret);
  let scopedPostId: string | null = null;
  if (!isWorker) {
    const body = await req.json().catch(() => ({}));
    if (typeof body.post_id !== "string" || !/^[0-9a-f-]{36}$/i.test(body.post_id))
      return json({ error: "An authenticated post_id is required" }, 400);
    const { data: { user }, error } = await admin.auth.getUser(bearer);
    if (error || !user) return json({ error: "Unauthorized" }, 401);
    const caller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } });
    const { data: post } = await caller.from("posts").select("id").eq("id", body.post_id).maybeSingle();
    if (!post) return json({ error: "Post not found or access denied" }, 403);
    scopedPostId = post.id;
  }
  const startedAt = Date.now();
  let pickedUp = 0, succeeded = 0, failed = 0, retrying = 0, staled = 0;

  try {
    if (isWorker) {
      const { error } = await admin.rpc("fill_publish_autopilot_queue");
      if (error) throw new Error("Autopilot scheduler is unavailable");
    }
    // Claims are per-destination, including retries; an overlapping worker skips locked jobs.
    const { data: claimed, error: claimError } = await admin.rpc("claim_publish_targets", {
      _post_id: scopedPostId, _limit: 10,
    });
    if (claimError) throw new Error("Publishing worker schema is unavailable");
    const allPostIds = Array.from(new Set((claimed ?? []).map((t: any) => t.post_id)));
    pickedUp = allPostIds.length;
    if (allPostIds.length === 0) {
      return json({ ok: true, pickedUp, succeeded, failed, retrying, staled, ms: Date.now() - startedAt });
    }

    const { data: posts } = await admin
      .from("posts")
      .select("id, workspace_id, created_by, caption, first_comment, scheduled_at, status, autopilot_plan_id, post_type, privacy_level, comments_disabled, duet_disabled, stitch_disabled, branded_content, ai_disclosure, location_id, user_tags, collaborators, youtube_title, youtube_description, youtube_visibility, youtube_made_for_kids")
      .in("id", allPostIds);

    await Promise.all((posts ?? []).map(async (post: any) => {
      const nowIso = new Date().toISOString();
      const targets = (claimed ?? []).filter((t: any) => t.post_id === post.id);
      await admin.from("posts").update({ status: "publishing" }).eq("id", post.id);

      const { data: media, error: mediaError } = await admin
        .from("post_media")
        .select("id, kind, storage_path, position, alt_text, thumb_offset_ms, mime, width, height, duration_ms")
        .eq("post_id", post.id)
        .order("position");

      const signedMedia = await Promise.all(
        (media ?? []).map(async (m) => {
          if (!isOwnedPostMediaPath(m.storage_path, post.workspace_id)) return { ...m, url: undefined };
          // Generated schedules get their own object, so editing a source does not change delivery bytes.
          if (post.autopilot_plan_id && !m.storage_path.startsWith(`${post.workspace_id}/autopilot/${post.id}/`)) {
            const ownedPath = `${post.workspace_id}/autopilot/${post.id}/${m.id}-${m.storage_path.split("/").pop()}`;
            const { error: copyError } = await admin.storage.from("post-media").copy(m.storage_path, ownedPath);
            if (copyError) {
              const { error: existsError } = await admin.storage.from("post-media").createSignedUrl(ownedPath, 60);
              if (existsError) throw new Error("Could not retain scheduled asset bytes");
            }
            const { error: pathError } = await admin.from("post_media").update({ storage_path: ownedPath }).eq("id", m.id);
            if (pathError) throw new Error("Could not persist retained asset path");
            m.storage_path = ownedPath;
          }
          const { data } = await admin.storage.from("post-media").createSignedUrl(m.storage_path, 6 * 3600);
          return { ...m, url: data?.signedUrl as string | undefined };
        }),
      );

      await Promise.all((targets ?? []).map(async (t: any) => {
        const attempts = t.attempts;
        let submitted = Boolean(t.submission_started_at);
        const { data: account } = await admin
          .from("social_accounts")
          .select("id, workspace_id, platform, external_id, access_token, refresh_token, expires_at, metadata, status, is_enabled")
          .eq("id", t.social_account_id).eq("workspace_id", post.workspace_id).maybeSingle();

        if (!account?.access_token || account.platform !== t.platform || account.status === "disconnected" || account.is_enabled === false) {
          const { data: failedTarget } = await admin.from("post_targets").update({
            lease_token: null, lease_expires_at: null, status: "failed",
            error: "Missing access token — reconnect this account",
            attempts,
            last_attempt_at: nowIso,
          }).eq("id", t.id).eq("lease_token", t.lease_token).select("id").maybeSingle();
          if (failedTarget) await recordScheduleDeliveryFailure(post, "account");
          failed++;
          return;
        }

        try {
          if (mediaError) throw new ProviderError("Could not load private post media.", true);
          if (account.platform !== "linkedin" && signedMedia.some(item => item.kind === "document")) {
            throw new ProviderError("Carousel PDFs can only be published to LinkedIn.");
          }
          if (account.platform === "youtube") {
            account.access_token = await decryptYouTubeToken(account.access_token, youtubeTokenContext(account.workspace_id, account.external_id, "access"));
            if (!account.expires_at || new Date(account.expires_at).getTime() < Date.now() + 60_000) {
              if (!account.refresh_token) throw new ProviderError("Reconnect this YouTube channel to refresh its permission.");
              const refresh = await decryptYouTubeToken(account.refresh_token, youtubeTokenContext(account.workspace_id, account.external_id, "refresh"));
              const refreshResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID") ?? "", client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") ?? "", refresh_token: refresh, grant_type: "refresh_token" }) });
              const refreshed = await refreshResponse.json();
              if (!refreshResponse.ok || !refreshed.access_token) throw new ProviderError("YouTube connection expired. Reconnect this channel.");
              account.access_token = refreshed.access_token;
              await admin.from("social_accounts").update({ access_token: await encryptYouTubeToken(refreshed.access_token, youtubeTokenContext(account.workspace_id, account.external_id, "access")), expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 3600) * 1000).toISOString() }).eq("id", account.id).eq("workspace_id", post.workspace_id);
            }
          } else if (account.platform === "x") {
            account.access_token = await xAccessToken(account);
          } else if (account.platform === "linkedin") {
            if (!account.expires_at || Date.parse(account.expires_at) <= Date.now() + 60_000) throw new ProviderError("LinkedIn connection expired. Reconnect this account.");
            account.access_token = await decryptLinkedInToken(account.access_token, linkedInTokenContext(account.workspace_id, account.external_id, "access"));
          } else if (account.platform === "tiktok") {
            account.access_token = await tiktokAccessToken(admin, account);
          } else {
            account.access_token = await decryptMetaToken(account.access_token, `account:${account.workspace_id}:${account.platform}:${account.external_id}`);
          }
          const effectivePost = {
            ...post,
            caption: t.caption_override ?? post.caption,
            first_comment: t.first_comment_override ?? post.first_comment,
          };

          let agentMarked = false;
          if (account.platform === "linkedin") {
            const { data: gate, error: gateError } = await admin.rpc("begin_agent_linkedin_dispatch", {
              _target: t.id, _lease: t.lease_token, _caption: effectivePost.caption,
              _first_comment: effectivePost.first_comment, _media_count: signedMedia.length,
              _external_id: account.external_id,
            });
            if (gateError || !["ordinary", "held", "started"].includes(gate)) throw new Error("Could not verify publishing authorization.");
            if (gate === "held") throw new AgentDispatchHeld();
            if (gate === "started") { agentMarked = true; submitted = true; }
          }
          const context: DeliveryContext = {
            containerId: account.platform === "youtube" && t.provider_container_id
              ? await decryptYouTubeToken(t.provider_container_id, `youtube-upload:${post.workspace_id}:${t.id}`)
              : t.provider_container_id,
            checkpoint: async (patch) => {
              if (agentMarked && patch.submission_started_at) return;
              const safePatch = account.platform === "youtube" && typeof patch.provider_container_id === "string"
                ? { ...patch, provider_container_id: await encryptYouTubeToken(patch.provider_container_id, `youtube-upload:${post.workspace_id}:${t.id}`) }
                : patch;
              const { data, error } = await admin.from("post_targets").update(safePatch)
                .eq("id", t.id).eq("lease_token", t.lease_token).select("id").single();
              if (error || !data) throw new Error("Could not persist delivery checkpoint");
              if (patch.submission_started_at) submitted = true;
            },
          };
          // A saved TikTok publish ID identifies a submission, not a published post.
          // Claims for submitted targets must only poll; never initialize them again.
          if (account.platform === "tiktok") {
            let publishId = t.provider_container_id;
            if (!t.submission_started_at && !publishId) {
              if (!TIKTOK_DISPATCH_ENABLED) throw new ProviderError("TikTok scheduled publishing is unavailable until its approved media delivery is configured.");
              if (signedMedia.some(m => !m.url || !isOwnedPostMediaPath(m.storage_path, post.workspace_id)))
                throw new ProviderError("Media unavailable or belongs to another workspace");
              const { data: mediaKey, error: mediaKeyError } = await admin.from("internal_job_secrets")
                .select("secret").eq("name", "tiktok_media").maybeSingle();
              if (mediaKeyError || typeof mediaKey?.secret !== "string")
                throw new ProviderError("TikTok media delivery is not configured.");
              const tiktokMedia = await Promise.all(signedMedia.map(async m => {
                const capability = await makeTikTokMediaCapability(m.url!, SUPABASE_URL, mediaKey.secret);
                return { ...m, tiktokUrl: `https://autosocials.com/api/public/tiktok-media?token=${encodeURIComponent(capability)}` };
              }));
              publishId = await initializeTikTokPublish(account.access_token, effectivePost, t.tiktok_options, tiktokMedia, context);
            }
            if (!publishId || (t.submission_started_at && !t.provider_container_id))
              throw new ProviderError("TikTok delivery status is unknown. Check the account before taking further action.", false, false);
            const remote = await reconcileTikTokPublish(account.access_token, publishId);
            const pollAgain = (remote.kind === "processing" || remote.kind === "unknown") && canPollTikTokAgain(t.submission_started_at ?? nowIso);
            const patch = remote.kind === "published"
              ? { status: "published", platform_post_id: remote.publicPostId, published_at: new Date().toISOString(), error: null, next_retry_at: null }
              : pollAgain
              ? { status: "retrying", error: remote.kind === "processing" ? "TikTok is processing this submission." : "TikTok delivery status is unknown; checking again.", next_retry_at: new Date(Date.now() + 60_000).toISOString() }
              : remote.kind === "failed"
              ? { status: "failed", error: `TikTok reported that publishing failed (${remote.reason}).`, next_retry_at: null }
              : { status: "failed", error: "TikTok delivery status is unknown. Check the account before taking further action.", next_retry_at: null };
            const { data: saved, error } = await admin.from("post_targets").update({
              ...patch, lease_token: null, lease_expires_at: null, last_attempt_at: nowIso,
            }).eq("id", t.id).eq("lease_token", t.lease_token).select("id").maybeSingle();
            if (error || !saved) throw new Error("Could not persist TikTok delivery status");
            if (remote.kind === "published") succeeded++;
            else if (pollAgain) retrying++;
            else { failed++; await recordScheduleDeliveryFailure(post, "provider"); }
            return;
          }
          if (signedMedia.some(m => !m.url || (["youtube", "linkedin"].includes(account.platform) && !isOwnedPostMediaPath(m.storage_path, post.workspace_id))))
            throw new ProviderError("Media unavailable or belongs to another workspace");
          if (account.platform === "facebook" || account.platform === "instagram") validateMetaDelivery(account.platform, effectivePost.caption ?? "", signedMedia);
          let result: { id: string; permalink?: string };
          if (account.platform === "facebook") {
            result = await publishFacebook(account, effectivePost, signedMedia, context);
          } else if (account.platform === "instagram") {
            result = await publishInstagram(account, effectivePost, signedMedia, context);
          } else if (account.platform === "youtube") {
            result = await publishYouTube(account, effectivePost, signedMedia, context);
          } else if (account.platform === "x") {
            result = await publishX(account, effectivePost, signedMedia, context, SUPABASE_URL);
          } else if (account.platform === "linkedin") {
            result = await publishLinkedIn(account, effectivePost, signedMedia, context, SUPABASE_URL);
          } else {
            throw new ProviderError(`Unsupported platform: ${account.platform}`);
          }

          const { error: persistError } = await admin.from("post_targets").update({
            lease_token: null, lease_expires_at: null, status: "published", platform_post_id: result.id, permalink: result.permalink ?? null,
            published_at: nowIso, error: null, attempts, last_attempt_at: nowIso, next_retry_at: null,
          }).eq("id", t.id).eq("lease_token", t.lease_token);
          if (persistError) throw new Error("Could not persist confirmed provider result; check the account feed");
          succeeded++;
        } catch (e: any) {
          if (e instanceof AgentDispatchHeld) return;
          const definitive = !submitted || (e instanceof ProviderError && e.definitive);
          const errMsg = e instanceof LinkedInVideoProcessingError && attempts >= 20
            ? "LinkedIn media processing took too long. Check the post before trying again."
            : definitive ? safeDeliveryError(e) : "Delivery outcome uncertain. Check the account feed before retrying.";
          const canRetry = definitive && e instanceof ProviderError && e.retryable;

          console.error(`Publish failed for target ${t.id} (attempt ${attempts}):`, errMsg);
          // Video processing is not a failed publish attempt. Give LinkedIn a
          // bounded window to finish without resubmitting the post or media.
          const retryLimit = e instanceof LinkedInVideoProcessingError ? 20 : MAX_ATTEMPTS;
          if (!canRetry || attempts >= retryLimit) {
            const { data: failedTarget } = await admin.from("post_targets").update({
              lease_token: null, lease_expires_at: null, status: "failed", error: errMsg, attempts, last_attempt_at: nowIso, next_retry_at: null,
            }).eq("id", t.id).eq("lease_token", t.lease_token).select("id").maybeSingle();
            if (failedTarget) await recordScheduleDeliveryFailure(post, "provider");
            failed++;
          } else {
            const delay = e instanceof LinkedInVideoProcessingError ? 1 : (t.provider_container_id ? 1 : BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)]);
            const retryAt = new Date(Date.now() + delay * 60 * 1000).toISOString();
            await admin.from("post_targets").update({
              lease_token: null, lease_expires_at: null, submission_started_at: null, status: "retrying", error: errMsg, attempts, last_attempt_at: nowIso, next_retry_at: retryAt,
            }).eq("id", t.id).eq("lease_token", t.lease_token);
            retrying++;
          }
        }
      }));

      // Finalize post status based on ALL its targets
      const { data: finalTargets } = await admin
        .from("post_targets")
        .select("status, published_at")
        .eq("post_id", post.id);
      const stats = (finalTargets ?? []).reduce((a, t) => {
        a[t.status] = (a[t.status] ?? 0) + 1; return a;
      }, {} as Record<string, number>);
      const anyPending = (stats.pending ?? 0) > 0 || (stats.retrying ?? 0) > 0;
      const anyPublished = (stats.published ?? 0) > 0;
      const anyFailed = (stats.failed ?? 0) > 0;
      const firstPublishedAt = (finalTargets ?? [])
        .map((t) => t.published_at).filter(Boolean).sort()[0] ?? null;

      const finalStatus = aggregateDeliveryStatus((finalTargets ?? []).map(t => t.status));

      await admin.from("posts").update({
        status: finalStatus,
        published_at: anyPublished ? firstPublishedAt : null,
      }).eq("id", post.id);

      // Notify on permanent failure (all targets failed)
      if (finalStatus === "needs_attention") {
        await notifyFailure(post.id, post.workspace_id, post.caption ?? "", finalTargets ?? []);
      }
    }));

    const { data: results } = scopedPostId ? await admin.from("post_targets")
      .select("id,status,error,platform_post_id,permalink").eq("post_id", scopedPostId) : { data: [] };
    return json({ ok: true, pickedUp, succeeded, failed, retrying, staled, targets: results ?? [],
      post_status: results?.length ? aggregateDeliveryStatus(results.map(t => t.status)) : null, ms: Date.now() - startedAt });
  } catch (e: any) {
    console.error("Scheduler error:", safeDeliveryError(e));
    return json({ ok: false, error: safeDeliveryError(e) }, 500);
  }
});

/** Record only non-sensitive categories for creation-schedule deliveries. */
async function recordScheduleDeliveryFailure(post: { id: string; workspace_id: string; created_by: string | null }, category: "account" | "provider") {
  try {
    if (!post.created_by) return;
    const { data: receipt, error } = await admin.from("creation_schedule_receipts").select("request_id").eq("post_id", post.id).maybeSingle();
    if (error || !receipt) return;
    const result = await admin.from("creation_schedule_failure_events").insert({ workspace_id: post.workspace_id, request_id: receipt.request_id, actor_id: post.created_by, stage: "delivery", category });
    if (result.error) console.error("Could not record schedule delivery failure");
  } catch { console.error("Could not record schedule delivery failure"); }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function publishYouTube(account: any, post: any, media: any[], context: DeliveryContext): Promise<{id:string;permalink?:string}> {
  if (media.length !== 1 || media[0].kind !== "video") throw new ProviderError("YouTube needs exactly one video asset.");
  const title = String(post.youtube_title ?? "").trim(), description = String(post.youtube_description ?? "");
  const privacy = ["public","unlisted","private"].includes(post.youtube_visibility) ? post.youtube_visibility : "public";
  validateYouTubeDelivery(title,description,privacy,media);
  const identity=await fetch("https://youtube.googleapis.com/youtube/v3/channels?part=id&mine=true",{headers:{Authorization:`Bearer ${account.access_token}`},signal:AbortSignal.timeout(20_000)});
  const identityData=await identity.json().catch(()=>({}));
  if(!identity.ok || identityData.items?.length!==1 || identityData.items[0]?.id!==account.external_id) throw new ProviderError("Google did not verify the selected YouTube channel. Reconnect the intended channel before publishing.");
  const status: Record<string,unknown> = { privacyStatus: privacy, selfDeclaredMadeForKids: post.youtube_made_for_kids === true, containsSyntheticMedia: post.ai_disclosure === true };
  let sessionUrl = context.containerId;
  const resuming = Boolean(sessionUrl);
  if (!sessionUrl) {
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", { method:"POST", headers:{ Authorization:`Bearer ${account.access_token}`, "Content-Type":"application/json", "X-Upload-Content-Type":media[0].mime ?? "video/mp4" }, body:JSON.stringify({snippet:{title,description,categoryId:"22"},status}) });
    if(!init.ok) { const error=await init.json().catch(()=>({})); throw new ProviderError(error.error?.message ?? `YouTube upload setup failed (${init.status})`, init.status===429 || init.status>=500, init.status<500); }
    sessionUrl=init.headers.get("Location") ?? "";
    if(!isGoogleUploadSession(sessionUrl)) throw new ProviderError("YouTube did not return a valid resumable upload session.");
    await context.checkpoint({provider_container_id:sessionUrl});
  }
  const assetUrl=new URL(media[0].url);
  if(assetUrl.origin!==new URL(SUPABASE_URL).origin || !assetUrl.pathname.startsWith('/storage/v1/object/sign/post-media/')) throw new ProviderError("YouTube accepts only finished assets from this workspace's private media storage.");
  if(media[0].mime && !media[0].mime.startsWith('video/')) throw new ProviderError("YouTube requires a video asset.");
  const head = await fetch(assetUrl,{method:"HEAD",signal:AbortSignal.timeout(30_000)});
  const total = Number(head.headers.get("content-length"));
  if(!head.ok || !Number.isSafeInteger(total) || total <= 0 || total > 10 * 1024 * 1024 * 1024) throw new ProviderError("The finished video asset is missing or exceeds the 10 GB upload limit.");
  if(!isGoogleUploadSession(sessionUrl)) throw new ProviderError("The saved resumable upload session is invalid.");
  const CHUNK = 8 * 1024 * 1024; let offset = 0; let videoId = "";
  if(resuming){
    const probe=await fetch(sessionUrl,{method:"PUT",headers:{"Content-Length":"0","Content-Range":`bytes */${total}`},body:new Uint8Array(),signal:AbortSignal.timeout(60_000)});
    if(probe.status===200||probe.status===201){const result=await probe.json();if(result.id)return{id:result.id,permalink:`https://www.youtube.com/watch?v=${result.id}`};}
    if(probe.status!==308)throw new ProviderError("Saved YouTube upload session expired. Check the channel before retrying.",false,false);
    const range=probe.headers.get("Range");
    if(range){const accepted=Number(range.match(/-(\d+)$/)?.[1]??-1);if(accepted<0||accepted>=total)throw new ProviderError("YouTube returned an invalid resumable upload offset.",false,false);offset=accepted+1;}
  }
  await context.checkpoint({youtube_upload_bytes:offset,youtube_upload_total_bytes:total});
  while(offset < total) {
    const end=Math.min(offset+CHUNK,total)-1;
    const source=await fetch(media[0].url,{headers:{Range:`bytes=${offset}-${end}`},signal:AbortSignal.timeout(60_000)});
    if((source.status!==206 && !(offset===0 && total<=CHUNK && source.status===200)) || !source.body) { await source.body?.cancel(); throw new ProviderError("Private storage could not provide a bounded range for the finished video asset."); }
    const rangeLength=Number(source.headers.get("content-length"));
    if(Number.isFinite(rangeLength) && rangeLength !== end-offset+1) { await source.body.cancel(); throw new ProviderError("Private video storage returned an invalid chunk size."); }
    const bytes=new Uint8Array(await source.arrayBuffer());
    if(bytes.byteLength !== end-offset+1) throw new ProviderError("Private video storage returned an incomplete upload chunk.");
    await context.checkpoint({submission_started_at:new Date().toISOString()});
    const upload=await fetch(sessionUrl,{method:"PUT",headers:{"Content-Type":media[0].mime??"video/mp4","Content-Length":String(bytes.byteLength),"Content-Range":`bytes ${offset}-${end}/${total}`},body:bytes,signal:AbortSignal.timeout(60_000)});
    if(upload.status===308) { const range=upload.headers.get("Range"); if(!range)throw new ProviderError("YouTube did not confirm the uploaded byte range. Check the channel before retrying.",false,false); const accepted=Number(range.match(/-(\d+)$/)?.[1]??-1); if(accepted<end)throw new ProviderError("YouTube confirmed only part of an upload chunk. Check the channel before retrying.",false,false); offset=accepted+1; await context.checkpoint({youtube_upload_bytes:offset,youtube_upload_total_bytes:total}); continue; }
    if(!upload.ok) { const error=await upload.json().catch(()=>({})); throw new ProviderError(error.error?.message ?? `YouTube video upload failed (${upload.status})`,false,upload.status<500); }
    const result=await upload.json(); videoId=result.id;
    if(!videoId) throw new ProviderError("YouTube accepted the upload without returning a video ID.",false,false);
    offset=total; await context.checkpoint({youtube_upload_bytes:offset,youtube_upload_total_bytes:total});
  }
  if(!videoId) throw new ProviderError("YouTube upload is incomplete. Check the channel before retrying.",false,false);
  return {id:videoId,permalink:`https://www.youtube.com/watch?v=${videoId}`};
}
function isOwnedPostMediaPath(path: string, workspaceId: string) {
  return typeof path==='string' && path.startsWith(`${workspaceId}/`) && !path.includes('..') && !/[?#]|https?:/i.test(path);
}
function isGoogleUploadSession(value: string) {
  try { const url=new URL(value); return url.protocol==='https:' && url.hostname==='www.googleapis.com' && url.pathname==='/upload/youtube/v3/videos' && url.searchParams.has('upload_id'); } catch { return false; }
}

// ───────── Failure notification ─────────
async function notifyFailure(
  postId: string,
  workspaceId: string,
  caption: string,
  targets: Array<{ status: string; published_at: string | null }>,
) {
  if (!SENDGRID_API_KEY) return;
  try {
    // Pull error details for failed targets
    const { data: failedTargets } = await admin
      .from("post_targets")
      .select("error, social_account_id")
      .eq("post_id", postId)
      .eq("status", "failed");
    const accountIds = (failedTargets ?? []).map((t) => t.social_account_id).filter(Boolean);
    const { data: accs } = await admin
      .from("social_accounts")
      .select("id, platform, display_name, handle")
      .in("id", accountIds.length ? accountIds : ["00000000-0000-0000-0000-000000000000"]);
    const accMap = new Map((accs ?? []).map((a: any) => [a.id, a]));

    // Get workspace owners
    const { data: members } = await admin.rpc("get_workspace_members_with_email", {
      _workspace_id: workspaceId,
    });
    const owners = (members ?? []).filter((o: any) => o.role === "owner");
    if (owners.length === 0) return;

    const { data: workspace } = await admin
      .from("workspaces").select("name").eq("id", workspaceId).maybeSingle();

    const preview = caption.slice(0, 140) || "(no caption)";
    const errorList = (failedTargets ?? []).map((t: any) => {
      const a = accMap.get(t.social_account_id);
      const label = a ? `${a.platform} · ${a.display_name || a.handle || a.id}` : "Account";
      return `<li><strong>${escapeHtml(label)}</strong>: ${escapeHtml(t.error ?? "Unknown error")}</li>`;
    }).join("");
    const editorLink = `${APP_URL}/app/publishing/composer?id=${postId}`;
    const subject = `Post failed to publish — ${workspace?.name ?? ""}`;
    const body = `<p>One of your scheduled posts could not be published and needs attention.</p>
<p>&nbsp;</p>
<p style="color:#555;font-style:italic;">"${escapeHtml(preview)}"</p>
<p>&nbsp;</p>
<p><strong>What went wrong:</strong></p>
<ul style="margin:8px 0 16px 20px;color:#555;">${errorList}</ul>
<p>&nbsp;</p>
<p><a href="${editorLink}" style="display:inline-block;padding:10px 18px;background:#0F172A;color:#fff;border-radius:8px;text-decoration:none;">Open post</a></p>`;
    const html = wrap(body);
    await Promise.all(owners.map((o: any) =>
      sendgrid({ email: o.email, name: o.full_name ?? o.email }, subject, html)
    ));
  } catch (e) {
    console.error("notifyFailure error:", e);
  }
}

function escapeHtml(s: string) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function wrap(inner: string) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:24px auto;padding:24px;background:#fff;border-radius:12px;border:1px solid #E2E8F0;">
<h2 style="margin:0 0 16px 0;font-size:18px;color:#0F172A;">AutoSocials</h2>
<div style="font-size:14px;line-height:1.6;color:#333;">${inner}</div>
<p style="margin-top:32px;font-size:12px;color:#999;">Sent by Sam</p>
</div></body></html>`;
}

async function sendgrid(to: { email: string; name: string }, subject: string, html: string) {
  const r = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [to] }],
      from: { email: FROM_EMAIL, name: FROM_NAME },
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (!r.ok) console.error("SendGrid error", r.status, await r.text());
}

// ───────── Facebook ─────────
async function publishFacebook(account: any, post: any, media: any[], context: DeliveryContext) {
  const pageId = account.external_id, token = account.access_token;
  if (media.length === 0) {
    await context.checkpoint({ submission_started_at: new Date().toISOString() });
  const r = await fetch(`${META_GRAPH}/${pageId}/feed`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: post.caption, access_token: token }),
    });
    const j = await r.json();
    if (!r.ok) throw providerError(r, j, `FB ${r.status}`);
    return { id: j.id, permalink: `https://facebook.com/${j.id}` };
  }
  if (media.length === 1 && media[0].kind === "video") {
    await context.checkpoint({ submission_started_at: new Date().toISOString() });
    const r = await fetch(`${META_GRAPH}/${pageId}/videos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_url: media[0].url, description: post.caption, access_token: token }),
    });
    const j = await r.json();
    if (!r.ok) throw providerError(r, j, `FB video ${r.status}`);
    await context.checkpoint({ platform_post_id: j.id });
    for (let i = 0; i < 10; i++) {
      const check = await fetch(`${META_GRAPH}/${j.id}?fields=status,permalink_url&access_token=${token}`).then(r => r.json()).catch(() => ({}));
      if (check.status?.publishing_phase?.status === "complete" || check.status?.video_status === "ready")
        return { id: j.id, permalink: check.permalink_url };
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error("Facebook video is still processing; reconcile its remote identifier before retrying");
  }
  if (media.some(m => m.kind !== "image")) throw new ProviderError("Facebook multi-media posts require images; publish videos separately");
  const childIds: string[] = [];
  for (const m of media.filter((x) => x.kind === "image")) {
    const r = await fetch(`${META_GRAPH}/${pageId}/photos`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: m.url, published: false, access_token: token }),
    });
    const j = await r.json();
    if (!r.ok) throw providerError(r, j, `FB photo ${r.status}`);
    childIds.push(j.id);
  }
  await context.checkpoint({ submission_started_at: new Date().toISOString() });
  const r = await fetch(`${META_GRAPH}/${pageId}/feed`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: post.caption,
      attached_media: childIds.map((id) => ({ media_fbid: id })),
      access_token: token,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw providerError(r, j, `FB feed ${r.status}`);
  return { id: j.id, permalink: `https://facebook.com/${j.id}` };
}

// ───────── Instagram ─────────
async function publishInstagram(account: any, post: any, media: any[], context: DeliveryContext) {
  const igId = account.external_id, token = account.access_token;
  if (media.length === 0) throw new Error("Instagram requires at least one image or video");

  const createContainer = async (params: Record<string, any>) => {
    const r = await fetch(`${META_GRAPH}/${igId}/media`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, access_token: token }),
    });
    const j = await r.json();
    if (!r.ok) throw providerError(r, j, `IG container ${r.status}`);
    return j.id as string;
  };

  let containerId: string;
  const isStory = post.post_type === "story";
  const collaborators = Array.isArray(post.collaborators)
    ? post.collaborators.filter(Boolean).join(",") : undefined;
  const userTags = Array.isArray(post.user_tags) && post.user_tags.length
    ? JSON.stringify(post.user_tags) : undefined;

  if (context.containerId) { containerId = context.containerId;
  } else if (isStory) {
    const m = media[0];
    containerId = await createContainer(
      m.kind === "video"
        ? { media_type: "STORIES", video_url: m.url }
        : { media_type: "STORIES", image_url: m.url },
    );
  } else if (media.length === 1) {
    const m = media[0];
    const baseCaption: Record<string, any> = { caption: post.caption };
    if (post.location_id) baseCaption.location_id = post.location_id;
    if (m.alt_text) baseCaption.alt_text = m.alt_text;
    if (userTags) baseCaption.user_tags = userTags;
    containerId = await createContainer(
      m.kind === "video"
        ? {
            media_type: "REELS", video_url: m.url, ...baseCaption,
            ...(collaborators ? { collaborators } : {}),
            ...(typeof m.thumb_offset_ms === "number" ? { thumb_offset: m.thumb_offset_ms } : {}),
          }
        : { image_url: m.url, ...baseCaption },
    );
  } else {
    const childIds: string[] = [];
    for (const m of media) {
      const id = await createContainer(
        m.kind === "video"
          ? { media_type: "VIDEO", video_url: m.url, is_carousel_item: true,
              ...(m.alt_text ? { alt_text: m.alt_text } : {}) }
          : { image_url: m.url, is_carousel_item: true,
              ...(m.alt_text ? { alt_text: m.alt_text } : {}) },
      );
      childIds.push(id);
    }
    containerId = await createContainer({
      media_type: "CAROUSEL", children: childIds.join(","), caption: post.caption,
      ...(post.location_id ? { location_id: post.location_id } : {}),
      ...(collaborators ? { collaborators } : {}),
    });
  }

  await context.checkpoint({ provider_container_id: containerId });
  let ready = false;
  // Poll up to ~3 min for video processing
  for (let i = 0; i < 10; i++) {
    const r = await fetch(`${META_GRAPH}/${containerId}?fields=status_code&access_token=${token}`);
    const j = await r.json();
    if (!r.ok) throw providerError(r, j, "Instagram status");
    if (j.status_code === "FINISHED") { ready = true; break; }
    if (j.status_code === "PUBLISHED") throw new ProviderError("Already published; reconcile the account feed before retrying");
    if (j.status_code === "ERROR" || j.status_code === "EXPIRED") {
      throw new Error(`Instagram media processing ${j.status_code?.toLowerCase()}`);
    }
    await new Promise((res) => setTimeout(res, 3000));
  }

  if (!ready) throw new ProviderError("Instagram is still processing the asset", true);
  await context.checkpoint({ submission_started_at: new Date().toISOString() });
  const pubR = await fetch(`${META_GRAPH}/${igId}/media_publish`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ creation_id: containerId, access_token: token }),
  });
  const pubJ = await pubR.json();
  if (!pubR.ok) throw providerError(pubR, pubJ, "Instagram publish");

  if (post.first_comment && !isStory) {
    await fetch(`${META_GRAPH}/${pubJ.id}/comments`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: post.first_comment, access_token: token }),
    }).catch(() => {});
  }
  const details = await fetch(`${META_GRAPH}/${pubJ.id}?fields=permalink&access_token=${token}`).then(r => r.json()).catch(() => ({}));
  return { id: pubJ.id, permalink: details.permalink };
}

// X refresh tokens rotate. A persistent per-account lock prevents concurrent or
// ambiguous refresh attempts from consuming the same one-use credential twice.
async function xAccessToken(account: any): Promise<string> {
  const context = (kind: "access" | "refresh") => xTokenContext(account.workspace_id, account.external_id, kind);
  if (account.expires_at && new Date(account.expires_at).getTime() > Date.now() + 60_000)
    return await decryptXToken(account.access_token, context("access"));
  if (!account.refresh_token) throw new ProviderError("Reconnect this X account to renew its permission.");
  const lockId = crypto.randomUUID();
  const { data: claimed, error: lockError } = await admin.rpc("claim_x_refresh", { _account_id: account.id, _workspace_id: account.workspace_id, _refresh_token: account.refresh_token, _lock_id: lockId });
  if (lockError || !claimed) {
    // Another worker may have completed rotation since this account was read.
    const { data: current } = await admin.from("social_accounts").select("access_token, refresh_token, expires_at, status, is_enabled").eq("id", account.id).eq("workspace_id", account.workspace_id).maybeSingle();
    if (current?.status !== "disconnected" && current?.is_enabled !== false && current?.refresh_token !== account.refresh_token && current?.expires_at && new Date(current.expires_at).getTime() > Date.now() + 60_000)
      return await decryptXToken(current.access_token, context("access"));
    throw new ProviderError("X token renewal is in progress or needs reconnection. Try again shortly; reconnect if it persists.", true);
  }
  // Reload after claiming: another worker could have rotated between the first
  // read and the lock insert. The lock remains on uncertain failures or crashes.
  const { data: current, error: readError } = await admin.from("social_accounts").select("access_token, refresh_token, expires_at, status, is_enabled").eq("id", account.id).eq("workspace_id", account.workspace_id).maybeSingle();
  if (readError || !current || current.status === "disconnected" || current.is_enabled === false) throw new ProviderError("X account is unavailable. Reconnect this account.");
  if (current.refresh_token !== account.refresh_token) {
    await admin.from("x_refresh_locks").delete().eq("social_account_id", account.id).eq("lock_id", lockId);
    if (current.expires_at && new Date(current.expires_at).getTime() > Date.now() + 60_000)
      return await decryptXToken(current.access_token, context("access"));
    throw new ProviderError("X account credentials changed. Retry publishing.", true);
  }
  try {
    const refresh = await decryptXToken(current.refresh_token, context("refresh"));
    const rotated = await refreshXToken(refresh);
    const { data: saved, error } = await admin.rpc("complete_x_refresh", {
      _account_id: account.id, _workspace_id: account.workspace_id, _old_refresh: current.refresh_token, _lock_id: lockId,
      _access: await encryptXToken(rotated.access_token, context("access")),
      _refresh: await encryptXToken(rotated.refresh_token, context("refresh")),
      _expires_at: new Date(Date.now() + Number(rotated.expires_in) * 1000).toISOString(),
    });
    if (error || !saved) throw new Error("Cannot safely save rotated credentials");
    return rotated.access_token;
  } catch {
    throw new ProviderError("X permission could not be renewed safely. Reconnect this account before publishing.");
  }
}
