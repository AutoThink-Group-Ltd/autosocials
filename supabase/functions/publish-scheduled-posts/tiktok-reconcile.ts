import { parseTikTokPublishStatus, type TikTokPublishStatus } from "../_shared/tiktok-publish-status.ts";

/** Status lookup is safe to repeat; it never initiates another upload. */
export async function reconcileTikTokPublish(token: string, publishId: string, request: typeof fetch = fetch): Promise<TikTokPublishStatus> {
  if (!publishId || publishId.length > 256 || /[\s\x00-\x1f]/.test(publishId)) return { kind: "unknown" };
  try {
    const response = await request("https://open.tiktokapis.com/v2/post/publish/status/fetch/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ publish_id: publishId }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return { kind: "unknown" };
    return parseTikTokPublishStatus(await response.json());
  } catch {
    return { kind: "unknown" };
  }
}

/** Unknown and processing outcomes may only trigger status polling, bounded to 24 hours. */
export function canPollTikTokAgain(submittedAt: string, now = Date.now()): boolean {
  const submitted = Date.parse(submittedAt);
  return Number.isFinite(submitted) && submitted <= now && now - submitted < 24 * 60 * 60 * 1000;
}
