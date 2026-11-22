import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getAdminClient, requireUser } from "./supabase-admin.server";

export const findWebsiteImages = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid() }).parse(value))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", { _user_id: user.id, _workspace_id: data.workspace_id });
    if (access.error || !access.data) throw new Error("Forbidden");
    const { importWebsiteImages } = await import("./website-images.server");
    const result = await importWebsiteImages(admin, data.workspace_id, user.id);
    if (!result.busy && result.imported > 0) {
      const { buildBrandProfileForWorkspace } = await import("./brand-assets.functions");
      try { await buildBrandProfileForWorkspace(admin, data.workspace_id); }
      catch { return { ...result, profileUpdated: false }; }
    }
    return { ...result, profileUpdated: true };
  });
