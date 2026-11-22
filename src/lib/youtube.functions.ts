import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, getAdminClient } from "./supabase-admin.server";
import { readYouTubeVideos, readYouTubeComments, browseYouTubePublic } from "./youtube.server";
import { YouTubeBrowseInputSchema } from "./youtube";

export const getYouTubeVideos = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), video_ids: z.array(z.string().regex(/^[A-Za-z0-9_-]{11}$/)).min(1).max(8) }).parse(input))
  .handler(async ({ data }) => {
    await requireYouTubeWorkspace(data.workspace_id);
    return readYouTubeVideos(data.video_ids);
  });

export const getYouTubeComments = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), video_id: z.string().regex(/^[A-Za-z0-9_-]{11}$/) }).parse(input))
  .handler(async ({ data }) => {
    await requireYouTubeWorkspace(data.workspace_id);
    return readYouTubeComments(data.video_id);
  });

export const YouTubeWorkspaceBrowseInputSchema = z.object({ workspace_id: z.string().uuid() }).and(YouTubeBrowseInputSchema);

export const browseYouTube = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => YouTubeWorkspaceBrowseInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireYouTubeBrowseQuota } = await import("./youtube-access.server");
    const { browseYouTubePublic } = await import("./youtube.server");
    await requireYouTubeBrowseQuota(data.workspace_id, Boolean(data.query || (data.channel_id && data.order === "viewCount")));
    return browseYouTubePublic(data);
  });
