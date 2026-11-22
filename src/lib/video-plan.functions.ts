import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Read-only, workspace-authorised presentation of one frozen production attempt. */
export const getVideoPlan = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ variant_id: z.string().uuid(), render_id: z.string().uuid().optional() }).strict().parse(input))
  .handler(async ({ data }) => {
    const { requireUser, getAdminClient } = await import("./supabase-admin.server");
    const user = await requireUser();
    return (await import("./video-plan.server")).readVideoPlan(getAdminClient(), user.id, data);
  });
