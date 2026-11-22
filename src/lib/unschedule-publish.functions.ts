import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

/** Return a scheduled, unclaimed post to draft without removing its media. */
export const unschedulePublishPost = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ post_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    // The RPC performs the membership check and delivery-state check inside the
    // same transaction that excludes a concurrent worker claim.
    const admin = getAdminClient();
    const { error } = await (admin.rpc as any)("unschedule_publish_post", {
      _post_id: data.post_id,
      _user_id: user.id,
    });
    if (error) throw new Error(error.message || "Could not unschedule this post");
    return { ok: true, post_id: data.post_id };
  });
