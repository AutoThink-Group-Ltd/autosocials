import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { xCaptionLength } from "./schedule-caption-length";

const uuid = z.string().uuid();
const edit = z.object({
  id: uuid,
  expected_updated_at: z.string().datetime({ offset: true }),
  expected_account_ids: z.array(uuid).max(100),
  // PostgREST returns stored instants with an offset. Keep the value intact,
  // including fractional seconds, when only destinations change.
  scheduled_at: z.string().datetime({ offset: true }),
  account_ids: z.array(uuid).max(100),
}).strict();
const input = z.object({ workspaceId: uuid, edits: z.array(edit).min(1).max(1000) }).strict();
export type UpcomingScheduleEdit = z.infer<typeof edit>;

export const saveUpcomingSchedule = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => {
    const parsed = input.safeParse(value);
    if (parsed.success) return parsed.data;
    if (parsed.error.issues.some((issue) => issue.path[2] === "scheduled_at")) {
      throw new Error("One or more post times are invalid. Reopen the editor and check the scheduled times.");
    }
    throw new Error("The schedule could not be read. Reopen the editor and review your changes.");
  })
  .handler(async ({ data }) => {
    const { getAdminClient, requireUser } = await import("./supabase-admin.server");
    const user = await requireUser();
    const admin = getAdminClient();
    const scope = await admin.rpc("can_confirm_creation_schedule", { _user_id: user.id, _workspace_id: data.workspaceId });
    if (scope.error || !scope.data) throw new Error("You don’t have permission to edit this schedule.");

    const additions = data.edits.filter((post) => post.account_ids.some((id) => !post.expected_account_ids.includes(id)));
    if (additions.length) {
      const { validateMetaDelivery, validateYouTubeDelivery } = await import("../../supabase/functions/publish-scheduled-posts/delivery");
      const fetchPosts = (ids: string[]) => admin.from("posts")
        .select("id,updated_at,caption,first_comment,post_type,youtube_title,youtube_description,youtube_visibility,post_media(kind,mime,width,height,duration_ms)")
        .eq("workspace_id", data.workspaceId).in("id", ids);
      const reads = [];
      for (let offset = 0; offset < additions.length; offset += 100) {
        reads.push(fetchPosts(additions.slice(offset, offset + 100).map((post) => post.id)));
      }
      const [posts, accounts] = await Promise.all([
        Promise.all(reads),
        admin.from("social_accounts").select("id,platform").eq("workspace_id", data.workspaceId),
      ]);
      if (posts.some((result) => result.error) || accounts.error) throw new Error("Could not verify the post and its new destinations.");
      const postById = new Map(posts.flatMap((result) => result.data ?? []).map((post) => [post.id, post]));
      const accountById = new Map(accounts.data.map((account) => [account.id, account.platform]));
      for (const change of additions) {
        const post = postById.get(change.id);
        if (!post || Date.parse(post.updated_at) !== Date.parse(change.expected_updated_at)) throw new Error("An upcoming post changed. Reopen the editor.");
        const media = post.post_media;
        const caption = post.caption || "";
        for (const id of change.account_ids.filter((id) => !change.expected_account_ids.includes(id))) {
          const platform = accountById.get(id);
          if (media.some(item => item.kind === "document") && platform !== "linkedin") throw new Error("Carousel PDFs can only be scheduled to LinkedIn.");
          if (post.post_type === "story") throw new Error("Use the post composer to change a story’s destinations.");
          if (platform === "facebook" || platform === "instagram") {
            validateMetaDelivery(platform, caption, media);
          } else if (platform === "youtube") {
            validateYouTubeDelivery(post.youtube_title ?? "", post.youtube_description ?? "", post.youtube_visibility ?? "public", media);
          } else if (platform === "x") {
            if (caption.length > 280 || xCaptionLength(caption) > 280 || (!caption.trim() && !media.length)) {
              throw new Error("X needs a post within its 280-character limit, or compatible media.");
            }
            if (media.length > 4 || (media.some((item) => item.kind === "video") && (media.length !== 1 || media[0]?.mime !== "video/mp4")) ||
                media.some((item) => item.kind === "image" && item.mime && !["image/jpeg", "image/png", "image/webp"].includes(item.mime))) {
              throw new Error("X supports up to four JPEG, PNG or WebP images, or one MP4 video.");
            }
          } else if (platform === "linkedin") {
            if (post.first_comment?.trim()) throw new Error("Remove the first comment in the composer before adding LinkedIn.");
            if (caption.length > 3000 || (!caption.trim() && !media.length) || media.length > 1 ||
                media.some((item) => item.kind === "document" ? item.mime !== "application/pdf" : item.kind === "video" ? item.mime !== "video/mp4" : !["image/jpeg", "image/png", "image/gif"].includes(item.mime ?? ""))) {
              throw new Error("LinkedIn needs compatible text or one JPEG, PNG, GIF, MP4 or PDF.");
            }
          } else {
            throw new Error("That account needs its publishing settings confirmed in the post composer.");
          }
        }
      }
    }

    const db = admin as unknown as import("@supabase/supabase-js").SupabaseClient;
    const result = await db.rpc("edit_upcoming_schedule", {
      _user_id: user.id, _workspace_id: data.workspaceId, _edits: data.edits,
    });
    if (result.error) {
      if (result.error.code === "23P01") throw new Error("A destination already has a post at that time. Choose a different time or move both posts together.");
      if (result.error.code === "P0001") throw new Error(result.error.message);
      throw new Error("Could not save the schedule. Reopen the editor before trying again.");
    }
    return { saved: z.number().int().min(1).max(1000).parse(result.data) };
  });
