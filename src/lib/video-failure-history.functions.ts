import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./supabase-admin.server";

export const getVideoFailureHistory = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { getVideoFailureHistoryForUser } = await import("./video-failure-history.server");
    return getVideoFailureHistoryForUser(user.id, data.workspace_id);
  });
