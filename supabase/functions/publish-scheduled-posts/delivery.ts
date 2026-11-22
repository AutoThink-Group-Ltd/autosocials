export type DeliveryStatus = "pending" | "publishing" | "published" | "retrying" | "failed" | "skipped";
export function aggregateDeliveryStatus(statuses: string[]) {
  if (!statuses.length) return "failed";
  const published = statuses.filter(s => s === "published").length;
  if (statuses.includes("publishing")) return "publishing";
  if (statuses.some(s => s === "pending" || s === "retrying")) return "scheduled";
  if (published === statuses.length) return "published";
  return published ? "partially_published" : "needs_attention";
}
export class ProviderError extends Error {
  constructor(message: string, public retryable = false, public definitive = true) { super(message); }
}
export function providerError(response: Response, payload: any, fallback: string) {
  const code = Number(payload?.error?.code);
  return new ProviderError(payload?.error?.message ?? `${fallback} (${response.status})`,
    payload?.error?.is_transient === true || [4, 17, 32, 613].includes(code) || response.status === 429,
    response.status < 500);
}
export function safeDeliveryError(error: unknown) {
  return String(error instanceof Error ? error.message : error)
    .replace(/access_token=[^&\s]+/gi, "access_token=[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]").slice(0, 500);
}

/** Deterministic provider requirements; recommendations never rewrite approved media. */
export function validateMetaDelivery(platform: string, caption: string, media: Array<{kind: string; mime?: string | null; width?: number | null; height?: number | null; duration_ms?: number | null}>) {
  if (platform === "instagram") {
    if (caption.length > 2200) throw new ProviderError("Instagram captions must be 2,200 characters or fewer");
    if (!media.length) throw new ProviderError("Instagram requires an image or video");
    if (media.length > 20) throw new ProviderError("Instagram carousels support up to 20 assets");
    for (const asset of media) {
      if (asset.kind === "image") {
        if (asset.mime && asset.mime !== "image/jpeg") throw new ProviderError("Instagram images must be JPEG; choose a JPEG version");
        if (asset.width && asset.height && (asset.width / asset.height < 0.8 || asset.width / asset.height > 1.91))
          throw new ProviderError("Instagram image aspect ratio must be between 4:5 and 1.91:1; choose a compatible version");
        if (asset.width && asset.width < 320) throw new ProviderError("Instagram images must be at least 320 pixels wide");
      } else if (asset.kind === "video") {
        if (asset.mime && !["video/mp4", "video/quicktime"].includes(asset.mime))
          throw new ProviderError("Instagram videos must be MP4 or MOV");
        if (asset.duration_ms && (asset.duration_ms < 3000 || asset.duration_ms > 900000))
          throw new ProviderError("Instagram Reels must be between 3 seconds and 15 minutes");
      } else throw new ProviderError("Unsupported Instagram asset type");
    }
  } else if (platform === "facebook") {
    if (caption.length > 63206) throw new ProviderError("Facebook posts must be 63,206 characters or fewer");
    if (media.some(m => !["image", "video"].includes(m.kind))) throw new ProviderError("Facebook requires images or videos");
    if (media.length > 1 && media.some(m => m.kind === "video"))
      throw new ProviderError("Facebook multi-media posts require images; publish videos separately");
  } else throw new ProviderError("This publishing network is unavailable");
}

export function validateYouTubeDelivery(title: string, description: string, visibility: string, media: Array<{kind:string}>) {
  if (!title.trim() || title.trim().length > 100) throw new ProviderError("YouTube title is required and must be 100 characters or fewer.");
  if (description.length > 5000) throw new ProviderError("YouTube description must be 5,000 characters or fewer.");
  if (!['public','unlisted','private'].includes(visibility)) throw new ProviderError("Choose a valid YouTube visibility.");
  if (media.length !== 1 || media[0]?.kind !== 'video') throw new ProviderError("YouTube needs exactly one reviewed video asset.");
}
