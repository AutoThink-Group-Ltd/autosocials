import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Establish the eligible free allowance on first billing-page visit. */
export const ensureContentCreditPeriod = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ workspaceId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data }) => {
    const { getAdminClient, requireUser } = await import("./supabase-admin.server");
    const user = await requireUser();
    const db = getAdminClient() as unknown as SupabaseClient;
    const result = await db.rpc("ensure_free_content_credit_period", { _workspace_id: data.workspaceId, _user_id: user.id });
    if (result.error) throw new Error("Credit information is temporarily unavailable.");
    return { ready: true, unlimited: result.data?.unlimited === true };
  });
