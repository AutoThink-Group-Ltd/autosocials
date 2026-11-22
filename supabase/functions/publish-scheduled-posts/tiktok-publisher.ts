import { creatorPostingOptions } from "../_shared/tiktok-creator-info.ts";
import { tiktokPostProblem, type TikTokPostChoices } from "../_shared/tiktok-posting-policy.ts";
import { ProviderError } from "./delivery.ts";

type Video = { kind: string; duration_ms?: number | null; tiktokUrl?: string };
type Context = { checkpoint: (patch: Record<string, unknown>) => Promise<void> };

/** This function must only run behind a verified media-delivery integration gate. */
export async function initializeTikTokPublish(token: string, post: { caption?: string | null; ai_disclosure?: boolean }, options: unknown, media: Video[], context: Context, request: typeof fetch = fetch): Promise<string> {
  if (media.length !== 1 || media[0].kind !== "video" || !media[0].tiktokUrl || !Number.isFinite(media[0].duration_ms) || (media[0].duration_ms ?? 0) <= 0)
    throw new ProviderError("TikTok requires one reviewed video with a verified delivery URL and known duration.");
  let source: URL;
  try { source = new URL(media[0].tiktokUrl); } catch { throw new ProviderError("TikTok media delivery URL is invalid."); }
  if (source.protocol !== "https:" || source.username || source.password || source.hash) throw new ProviderError("TikTok media delivery URL is invalid.");
  if (!options || typeof options !== "object") throw new ProviderError("Review TikTok posting choices before publishing.");
  const raw = options as Record<string, unknown>;
  const booleans = ["allowComments", "allowDuet", "allowStitch", "commercialDisclosure", "promotesOwnBrand", "brandedContent", "consent"];
  if (typeof raw.privacy !== "string" || booleans.some(key => typeof raw[key] !== "boolean") || typeof raw.durationSeconds !== "number" || !Number.isFinite(raw.durationSeconds))
    throw new ProviderError("Review TikTok posting choices before publishing.");
  const durationSeconds = media[0].duration_ms! / 1000;
  if (Math.abs(raw.durationSeconds - durationSeconds) > 0.001) throw new ProviderError("The reviewed TikTok video duration no longer matches the selected media.");
  const choices = { ...raw, durationSeconds } as TikTokPostChoices;
  let infoResponse: Response;
  try {
    infoResponse = await request("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, signal: AbortSignal.timeout(12_000),
    });
  } catch { throw new ProviderError("TikTok could not provide current posting options."); }
  const infoBody = await infoResponse.json().catch(() => ({}));
  if (!infoResponse.ok || infoBody.error?.code !== "ok") throw new ProviderError("TikTok could not provide current posting options.");
  let creator;
  try { creator = creatorPostingOptions(infoBody.data); } catch { throw new ProviderError("TikTok returned incomplete posting options."); }
  const problem = tiktokPostProblem(creator, choices);
  if (problem) throw new ProviderError(problem);
  const title = post.caption ?? "";
  if (title.length > 2200) throw new ProviderError("TikTok captions must be 2,200 characters or fewer.");
  await context.checkpoint({ submission_started_at: new Date().toISOString() });
  // An interrupted initialization may have been accepted. Never retry it blindly.
  const response = await request("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ post_info: { title, privacy_level: choices.privacy, disable_comment: !choices.allowComments,
      disable_duet: !choices.allowDuet, disable_stitch: !choices.allowStitch, brand_content_toggle: choices.brandedContent,
      brand_organic_toggle: choices.promotesOwnBrand, is_aigc: post.ai_disclosure === true },
      source_info: { source: "PULL_FROM_URL", video_url: source.href } }), signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  const id = body.data?.publish_id;
  if (!response.ok || body.error?.code !== "ok" || typeof id !== "string" || !id || id.length > 256 || /[\s\x00-\x1f]/.test(id))
    throw new ProviderError("TikTok did not confirm the submission. Check the account before taking further action.", false, false);
  await context.checkpoint({ provider_container_id: id });
  return id;
}
