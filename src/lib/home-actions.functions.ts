import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./supabase-admin.server";

export const HomeItemsInput = z.object({ workspace_id: z.string().uuid(), item_ids: z.array(z.string().uuid()).min(1).max(20).refine((ids) => new Set(ids).size === ids.length, "Select each item once.") }).strict();
export const HomePlanningRetryInput = z.object({ workspace_id: z.string().uuid(), job_id: z.string().uuid() }).strict();
export type HomeItemsResult = { updated_ids: string[]; errors?: Array<{ id: string; message: string }> };

export const trashHomeItems = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => HomeItemsInput.parse(input))
  .handler(async ({ data }): Promise<HomeItemsResult> => {
    const user = await requireUser();
    const { changeHomeTrashForUser } = await import("./home-actions.server");
    return changeHomeTrashForUser(user.id, data.workspace_id, data.item_ids, true);
  });
export const restoreHomeItems = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => HomeItemsInput.parse(input))
  .handler(async ({ data }): Promise<HomeItemsResult> => {
    const user = await requireUser();
    const { changeHomeTrashForUser } = await import("./home-actions.server");
    return changeHomeTrashForUser(user.id, data.workspace_id, data.item_ids, false);
  });
export const retryHomePlanning = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => HomePlanningRetryInput.parse(input))
  .handler(async ({ data }) => {
    const user = await requireUser();
    const { retryHomePlanningForUser } = await import("./home-actions.server");
    return retryHomePlanningForUser(user.id, data.workspace_id, data.job_id);
  });
