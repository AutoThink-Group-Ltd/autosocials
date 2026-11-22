import { createFileRoute } from "@tanstack/react-router";

type Dependencies = {
  enabled: () => boolean;
  readSecret: () => Promise<string | null>;
  drain: () => Promise<{ processed: boolean }>;
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
/** Trusted scheduler only; scheduler cannot supply endpoint, event, or batch size. */
export async function handleAgentWebhookDrain(
  request: Request,
  dependencies?: Dependencies,
): Promise<Response> {
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);
  const given = request.headers.get("x-agent-webhook-job-secret");
  if (!given || !/^[a-f0-9]{64}$/.test(given))
    return json({ error: "Unauthorized" }, 401);
  try {
    const deps = dependencies ?? {
      enabled: () => process.env["AGENT_WEBHOOK_DELIVERY_ENABLED"] === "true",
      readSecret: async () => {
        const { getAdminClient } = await import("@/lib/supabase-admin.server");
        const r = await getAdminClient()
          .from("internal_job_secrets")
          .select("secret")
          .eq("name", "agent_webhooks")
          .maybeSingle();
        if (r.error) throw new Error("Job credentials unavailable");
        return r.data?.secret ?? null;
      },
      drain: async () => {
        const [{ getAdminClient }, { processOneWebhookDelivery }] =
          await Promise.all([
            import("@/lib/supabase-admin.server"),
            import("@/lib/agent-webhooks.server"),
          ]);
        return processOneWebhookDelivery(getAdminClient());
      },
    };
    if (!deps.enabled()) return json({ error: "Unavailable" }, 503);
    const expected = await deps.readSecret();
    const { timingSafeEqual } = await import("node:crypto");
    if (
      !expected ||
      !/^[a-f0-9]{64}$/.test(expected) ||
      !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
    )
      return json({ error: "Unauthorized" }, 401);
    let processed = 0;
    for (let i = 0; i < 2; i++) {
      const result = await deps.drain();
      if (!result.processed) break;
      processed++;
    }
    return json({ ok: true, processed });
  } catch {
    return json({ error: "Webhook delivery unavailable" }, 503);
  }
}
export const Route = createFileRoute("/api/public/agent-webhook-drain")({
  server: {
    handlers: { POST: async ({ request }) => handleAgentWebhookDrain(request) },
  },
});
