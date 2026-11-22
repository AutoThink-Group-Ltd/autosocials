import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AdminContentVideo = {
  id: string; title: string; workspaceId: string; workspace: string; model: string | null;
  version: number | null; duration: number | null; size: string | null; createdAt: string;
  completedAt: string; status: string; snapshot: boolean;
};
export type AdminContentResult = { videos: AdminContentVideo[]; total: number; pageSize: number };

export const listAdminContent = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ page: z.number().int().min(0).max(100000).default(0), search: z.string().trim().max(100).default(""), model: z.string().trim().max(200).default("") }).strict().parse(input))
  .handler(async ({ data }): Promise<AdminContentResult> => {
    const { requireUser, getAdminClient } = await import("./supabase-admin.server");
    const user = await requireUser();
    return (await import("./admin-content.server")).readAdminContent(getAdminClient(), user.id, data);
  });

export const getAdminContentLinks = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ renderId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data }) => {
    const { requireUser, getAdminClient } = await import("./supabase-admin.server");
    const user = await requireUser();
    return (await import("./admin-content.server")).readAdminContentLinks(getAdminClient(), user.id, data.renderId);
  });
