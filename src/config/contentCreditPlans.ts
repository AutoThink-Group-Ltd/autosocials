/** Proposed credit allowances. These figures do not enable billing or generation. */
export const CONTENT_CREDIT_PLANS = [
  { key: "free", name: "Free", monthlyPricePence: 0, credits: 400 },
  { key: "starter", name: "Starter", monthlyPricePence: 4900, credits: 1000 },
  { key: "growth", name: "Growth", monthlyPricePence: 7900, credits: 1800 },
  { key: "scale", name: "Scale", monthlyPricePence: 19900, credits: 5000 },
  { key: "pro", name: "Pro", monthlyPricePence: 29900, credits: 8000 },
] as const;

/** Planning benchmarks only: actual engine rates require cost validation. */
export const CONTENT_CREDIT_BENCHMARKS = {
  hyperframes: { credits: 50, unit: "60-second video" },
  golpo: { credits: 150, unit: "60-second video" },
  higgsfield: { credits: 400, unit: "60-second video" },
  heygen: { credits: 200, unit: "60-second video" },
  openai: { credits: 45, unit: "image" },
  ideogram: { credits: 30, unit: "image" },
  recraft: { credits: 24, unit: "image" },
} as const;

export const AVERAGE_VIDEO_CREDITS = 200;
export const AVERAGE_IMAGE_CREDITS = 33;

export function estimatedContent(credits: number) {
  return {
    videos: Math.floor(credits / AVERAGE_VIDEO_CREDITS),
    images: Math.floor(credits / AVERAGE_IMAGE_CREDITS),
  };
}
