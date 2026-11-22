import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Support reads the same sanitized events under super-admin RLS. */
export const getSupportVideoFailureHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid().optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    const { getSupportVideoFailureHistoryForUser } = await import("./video-failure-history.server");
    return getSupportVideoFailureHistoryForUser(ctx, data.workspace_id);
  });
