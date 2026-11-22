import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser, getAdminClient } from "./supabase-admin.server";

async function requireSuperAdmin() {
  const user = await requireUser();
  const { data } = await getAdminClient().rpc("has_role", { _user_id: user.id, _role: "super_admin" });
  if (!data) throw new Error("Forbidden");
  return user;
}

export const runSeoAuditNow = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireSuperAdmin();
  const { runSeoAudit } = await import("./seo-audit.server");
  const a = await runSeoAudit(user.id);
  return { id: a.id, score: a.score };
});

export const sendSeoEmailNow = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ fresh: z.boolean().default(true) }).parse(i ?? {}))
  .handler(async ({ data }) => {
    const user = await requireSuperAdmin();
    const { sendSeoEmail } = await import("./seo-audit.server");
    return sendSeoEmail(user.id, data.fresh);
  });

export const pingSearchEngines = createServerFn({ method: "POST" }).handler(async () => {
  const user = await requireSuperAdmin();
  const { pingIndexNow } = await import("./seo-audit.server");
  return pingIndexNow(user.id);
});
