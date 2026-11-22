import { createFileRoute } from "@tanstack/react-router";

type Dependencies = { readSecret: () => Promise<string | null>; drain: () => Promise<void> };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** Scheduler only. The caller cannot supply a post or a recipient. */
export async function handlePublishNotifications(request: Request, dependencies?: Dependencies): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const given = request.headers.get("x-publish-notification-secret");
  if (!given || !/^[a-f0-9]{64}$/.test(given)) return json({ error: "Unauthorized" }, 401);
  try {
    const deps = dependencies ?? {
      readSecret: async () => {
        const { getAdminClient } = await import("@/lib/supabase-admin.server");
        const result = await getAdminClient().from("internal_job_secrets").select("secret").eq("name", "publish_notifications").maybeSingle();
        if (result.error) throw new Error("Job credentials unavailable");
        return result.data?.secret ?? null;
      },
      drain: async () => (await import("@/lib/publish-notifications-dispatch.server")).drainPublishNotifications(),
    };
    const expected = await deps.readSecret();
    const { timingSafeEqual } = await import("node:crypto");
    if (!expected || !/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return json({ error: "Unauthorized" }, 401);
    await deps.drain();
    return json({ ok: true });
  } catch {
    return json({ error: "Publishing notifications could not be processed." }, 503);
  }
}

export const Route = createFileRoute("/api/public/publish-notifications")({
  server: { handlers: { POST: async ({ request }) => handlePublishNotifications(request) } },
});
