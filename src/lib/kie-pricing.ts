/** Public reference rates, checked 18 Nov 2026. Not customer credit prices or live quotes. */
export const KIE_PRICING_CHECKED_AT = "2026-11-18";
export const KIE_USD_PER_CREDIT = 0.005;
export const KIE_IMAGE_USD = { "1K": 0.04, "2K": 0.06, "4K": 0.09 } as const;
export const KIE_VIDEO_USD = {
  veo3_lite: { "720p": 0.15, "1080p": 0.175, "4k": 0.75 },
  veo3_fast: { "720p": 0.30, "1080p": 0.325, "4k": 0.90 },
} as const;
export function kieReferenceEstimate(capabilityId: string, settings: Record<string, unknown>): number {
  if (capabilityId === "kie-nano-image" || capabilityId === "kie-nano-image-edit") {
    const cost = KIE_IMAGE_USD[settings["resolution"] as keyof typeof KIE_IMAGE_USD];
    if (cost !== undefined) return cost;
  }
  if (["kie-veo-text-video", "kie-veo-image-video", "kie-veo-reference-video"].includes(capabilityId) && settings["duration"] === 8) {
    const rates = KIE_VIDEO_USD[settings["model"] as keyof typeof KIE_VIDEO_USD];
    const cost = rates?.[settings["resolution"] as keyof typeof rates];
    if (cost !== undefined) return cost;
  }
  throw new Error("No verified Kie reference rate for these settings.");
}
