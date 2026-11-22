import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
const id = z.string().uuid();
async function context() {
  const [{ requireUser, getAdminClient }, core] = await Promise.all([
    import("./supabase-admin.server"),
    import("./agent-webhooks.server"),
  ]);
  return { user: await requireUser(), db: getAdminClient(), core };
}
export const createAgentWebhook = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      workspaceId: id,
      endpoint: z.string().url().max(2048),
      eventTypes: z.array(z.string().max(100)).min(1).max(20),
    }),
  )
  .handler(async ({ data }) => {
    const c = await context();
    return c.core.createWebhookSubscription(
      c.db,
      c.user.id,
      data.workspaceId,
      data.endpoint,
      data.eventTypes,
    );
  });
export const listAgentWebhooks = createServerFn({ method: "GET" })
  .inputValidator(z.object({ workspaceId: id, subscriptionId: id.optional() }))
  .handler(async ({ data }) => {
    const c = await context();
    return c.core.listWebhookStatus(
      c.db,
      c.user.id,
      data.workspaceId,
      data.subscriptionId,
    );
  });
export const disableAgentWebhook = createServerFn({ method: "POST" })
  .inputValidator(z.object({ workspaceId: id, subscriptionId: id }))
  .handler(async ({ data }) => {
    const c = await context();
    return c.core.disableWebhookSubscription(
      c.db,
      c.user.id,
      data.workspaceId,
      data.subscriptionId,
    );
  });
