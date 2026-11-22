/** Create Content batch rules — the one source of truth (UI, server and Sam). */
export const MAX_BATCH_DAYS = 7;
export const MAX_POSTS_PER_DAY = 2;
export const VIDEO_DURATIONS = [15, 30, 60] as const;
export type VideoDuration = (typeof VIDEO_DURATIONS)[number];
/** Sizes the AutoToast render server accepts. 1000x1000 is legacy only. */
export const VIDEO_SIZES = ["1080x1920", "1920x1080", "1080x1080", "1080x1350", "1000x1000"] as const;
export const NEW_BATCH_SIZES = ["1080x1920", "1920x1080", "1080x1080", "1080x1350"] as const;
export const RENDER_CONCURRENCY = 4;
/** Finished provider films may exceed the smaller scene download allowance. */
export const MAX_PROVIDER_FILM_BYTES = 100 * 1024 * 1024;
/** Generate at most four videos at a time; ideas for the rest of the week remain saved. */
export const MAX_ASSETS_PER_BATCH = 4;
export const MAX_SOCIAL_TILES_PER_PLAN = 10;
/** Sam plans one asset at a time unless the user asks for more. */
export const DEFAULT_ASSETS = 1;
export function clampAssets(n: number): number {
  return Math.min(MAX_ASSETS_PER_BATCH, Math.max(1, Math.round(n) || 1));
}
export type VideoSize = (typeof VIDEO_SIZES)[number];
export type ReviewState = "draft" | "needs_revision" | "rejected" | "approved";

export function clampDays(n: number): number {
  return Math.min(MAX_BATCH_DAYS, Math.max(1, Math.round(n)));
}
export function maxVideos(days: number): number {
  return clampDays(days) * MAX_POSTS_PER_DAY;
}
export function normaliseDuration(n: number): VideoDuration {
  return n >= 45 ? 60 : n >= 23 ? 30 : 15;
}
export function parseSize(s: string): { width: number; height: number } {
  const size = (VIDEO_SIZES as readonly string[]).includes(s) ? s : "1080x1920";
  const [w, h] = size.split("x").map(Number);
  return { width: w!, height: h! };
}
/** Only approved videos may be downloaded or sent to Publish. */
export function canShare(state: string): boolean {
  return state === "approved";
}
