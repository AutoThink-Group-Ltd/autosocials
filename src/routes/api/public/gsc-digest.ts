import { createFileRoute } from "@tanstack/react-router";

// Cron target (08:00 UTC daily). Requires the shared x-digest-secret header,
// compared against the service-role-only internal_job_secrets row.
export const Route = createFileRoute("/api/public/gsc-digest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const given = request.headers.get("x-digest-secret");
        const unauthorized = () =>
          new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        if (!given || given.length < 32) return unauthorized();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await (supabaseAdmin as any).from("internal_job_secrets").select("secret").eq("name", "gsc_digest").maybeSingle();
        if (!data?.secret || data.secret !== given) return unauthorized();
        const { runGscDigest } = await import("@/lib/gsc-digest.server");
        const body = (await request.json().catch(() => ({}))) as { force?: unknown };
        const result = await runGscDigest({ force: body.force === true });
        return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
