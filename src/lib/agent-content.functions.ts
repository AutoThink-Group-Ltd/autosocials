import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getAgentTileHandoff = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        workspace_id: z.string().uuid(),
        handoff_id: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { readAgentTileHandoff } = await import("./agent-content.server");
    const user = await requireUser();
    return readAgentTileHandoff(user.id, data.workspace_id, data.handoff_id);
  });
