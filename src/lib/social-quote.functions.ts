import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { quoteEvidenceSchema } from "./social-design";

export const checkDesignQuotation = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        candidate: quoteEvidenceSchema,
      })
      .strict()
      .parse(value),
  )
  .handler(async ({ data }) => {
    const { requireUser, getAdminClient } =
      await import("./supabase-admin.server");
    const user = await requireUser();
    const allowed = await getAdminClient().rpc("can_access_workspace", {
      _workspace_id: data.workspace_id,
      _user_id: user.id,
    });
    if (allowed.error || !allowed.data)
      throw new Error("Workspace access denied.");
    const { lookupQuote } = await import("./social-design-planning.server");
    return (await lookupQuote(data.candidate)) ?? null;
  });
