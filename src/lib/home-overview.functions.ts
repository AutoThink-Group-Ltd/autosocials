import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./supabase-admin.server";

export const HomeOverviewInput = z.object({ workspace_id: z.string().uuid(), view: z.enum(["home", "trash"]).default("home") });
export const getHomeOverview = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => HomeOverviewInput.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { getHomeOverviewForUser } = await import("./home-overview.server");
    return getHomeOverviewForUser(user.id, data.workspace_id, data.view);
  });
