import { z } from "zod";

export const YouTubeVideoIdSchema = z.string().regex(/^[A-Za-z0-9_-]{11}$/, "Invalid YouTube video ID");
export const YouTubeChannelIdSchema = z.string().regex(/^UC[A-Za-z0-9_-]{22}$/, "Invalid YouTube channel ID");
// Provider pagination is opaque: bound its size without interpreting its contents.
export const YouTubePageTokenSchema = z.string().min(1).max(512).refine((value) => !/[\u0000-\u001f\u007f]/.test(value), "Invalid page token");
export const YouTubeBrowseInputSchema = z.object({
  query: z.string().trim().min(2).max(180).optional(),
  channel_id: YouTubeChannelIdSchema.optional(),
  page_token: YouTubePageTokenSchema.optional(),
  order: z.enum(["relevance", "date", "viewCount"]).optional(),
}).refine((value) => !(value.query && value.channel_id), "Choose a search or a channel.")
  .refine((value) => !value.order || Boolean(value.query || value.channel_id), "Choose a search or a channel before sorting.")
  .refine((value) => !(value.channel_id && value.order === "relevance"), "Channel videos can be sorted by newest or most viewed.");
export type YouTubeBrowseInput = z.infer<typeof YouTubeBrowseInputSchema>;
export type YouTubeChannel = { id: string; title: string; avatarUrl?: string; description?: string };
export type YouTubeBrowseResult = { videos: YouTubeVideo[]; next_page_token?: string; fetched_at: string; channel?: YouTubeChannel };

/** Canvas stores references only; API metadata is refreshed when the gallery opens. */
export const YouTubeGalleryBlockSchema = z.object({
  type: z.literal("youtube_gallery"),
  title: z.string().max(300),
  query: z.string().max(500),
  video_ids: z.array(YouTubeVideoIdSchema).min(1).max(8),
  selected_video_id: YouTubeVideoIdSchema.optional(),
});
export type YouTubeGalleryBlock = z.infer<typeof YouTubeGalleryBlockSchema>;

export const YouTubeVideoSchema = z.object({
  id: YouTubeVideoIdSchema,
  title: z.string(),
  channelTitle: z.string(),
  channelId: YouTubeChannelIdSchema.optional(),
  channelAvatarUrl: z.string().url().optional(),
  description: z.string(),
  publishedAt: z.string().optional(),
  thumbnailUrl: z.string().url().optional(),
  viewCount: z.number().nonnegative().optional(),
  likeCount: z.number().nonnegative().optional(),
  commentCount: z.number().nonnegative().optional(),
  duration: z.string().optional(),
  embeddable: z.boolean(),
  available: z.boolean(),
});
export type YouTubeVideo = z.infer<typeof YouTubeVideoSchema>;

export const YouTubeCommentSchema = z.object({
  id: z.string(), author: z.string(), text: z.string(),
  likeCount: z.number().nonnegative().optional(), publishedAt: z.string().optional(),
});
export type YouTubeComment = z.infer<typeof YouTubeCommentSchema>;

export function youtubeWatchUrl(id: string) {
  return `https://www.youtube.com/watch?v=${YouTubeVideoIdSchema.parse(id)}`;
}

export function youtubePlayerError(code: number) {
  if (code === 100) return "This video was removed, made private, or is no longer available.";
  if (code === 101 || code === 150) return "The creator does not allow this video to play in an embedded player.";
  if (code === 153) return "YouTube could not identify this embedded player. Open the video on YouTube.";
  return "YouTube could not play this video here. Try opening it on YouTube.";
}
