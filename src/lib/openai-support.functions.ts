import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireUser } from "./supabase-admin.server";
import { submitOpenAIQuotaSupport } from "./openai-quota.server";

export const requestAiSupport = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({}).parse(input))
  .handler(async () => {
    const user = await requireUser();
    await submitOpenAIQuotaSupport(user.email, user.id);
    return { ok: true };
  });

