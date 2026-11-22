import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";
import { queueAutomaticBrandDiscovery } from "./brand-discovery.server";

export const startAutomaticBrandDiscovery = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), refresh_social: z.boolean().optional() }).parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (!access.data) throw new Error("Forbidden");
    queueAutomaticBrandDiscovery(data.workspace_id, user.id, data.refresh_social === true);
    return { started: true };
  });
