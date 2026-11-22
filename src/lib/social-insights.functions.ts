import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

export const getInsightsPermissions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("Workspace access required.");
    const result = await admin.from("social_accounts").select("id,platform,scopes").eq("workspace_id", data.workspace_id).in("platform", ["facebook", "instagram", "tiktok"]);
    if (result.error) throw new Error("Could not check insights permissions.");
    const required: Record<string, string> = { facebook: "read_insights", instagram: "instagram_manage_insights", tiktok: "video.list" };
    return (result.data ?? []).map(account => ({ id: account.id, hasInsights: (account.scopes ?? []).includes(required[account.platform]) }));
  });
