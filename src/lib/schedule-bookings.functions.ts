import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { fetchAll } from "./fetch-all";
import { getAdminClient, requireUser } from "./supabase-admin.server";

const windowInput = z.object({
  workspace_id: z.string().uuid(),
  from: z.string().datetime(),
  until: z.string().datetime(),
}).strict().refine(({ from, until }) => {
  const duration = Date.parse(until) - Date.parse(from);
  return duration > 0 && duration <= 400 * 86_400_000;
}, "Choose a scheduling window of up to 400 days.");

export const getScheduleBookings = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => windowInput.parse(value))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", {
      _user_id: user.id, _workspace_id: data.workspace_id,
    });
    if (access.error || !access.data) throw new Error("Workspace access denied.");

    const posts = await fetchAll<{
      id: string;
      status: string;
      scheduled_at: string | null;
      post_targets: { social_account_id: string; status: string }[];
    }>((from, to) => admin.from("posts")
      .select("id,status,scheduled_at,post_targets(social_account_id,status)")
      .eq("workspace_id", data.workspace_id)
      .in("status", ["scheduled", "publishing", "partially_published", "published"])
      .gte("scheduled_at", data.from)
      .lt("scheduled_at", data.until)
      .order("id")
      .range(from, to));
    return posts.flatMap(post => {
      const accounts = post.post_targets
        .filter(target => post.status !== "published" || target.status === "published")
        .map(target => target.social_account_id);
      return post.scheduled_at && accounts.length
        ? [{ post_id: post.id, scheduled_at: post.scheduled_at, account_ids: accounts }]
        : [];
    });
  });
