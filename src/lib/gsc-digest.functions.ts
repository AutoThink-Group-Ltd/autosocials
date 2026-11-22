import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Super-admin "Send digest now". */
export const sendGscDigestNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ force: z.boolean().default(false) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const ctx = context as { supabase: any; userId: string };
    const { data: ok } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
    if (!ok) throw new Error("Forbidden");
    const { runGscDigest } = await import("./gsc-digest.server");
    return runGscDigest({ force: data.force });
  });
