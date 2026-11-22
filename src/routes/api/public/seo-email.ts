import { createFileRoute } from "@tanstack/react-router";

// Weekly cron target (Mon 08:00 UK). Requires x-digest-secret matching the service-role-only internal_job_secrets row "seo_email".
export const Route = createFileRoute("/api/public/seo-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const given = request.headers.get("x-digest-secret");
        const no = () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
        if (!given || given.length < 32) return no();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data } = await (supabaseAdmin as any).from("internal_job_secrets").select("secret").eq("name", "seo_email").maybeSingle();
        if (!data?.secret || data.secret !== given) return no();
        const { sendSeoEmail } = await import("@/lib/seo-audit.server");
        return Response.json(await sendSeoEmail(null, true));
      },
    },
  },
});
