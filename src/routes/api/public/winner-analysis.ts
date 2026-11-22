import { createFileRoute } from "@tanstack/react-router";

/** The scheduler can request analysis only for an existing connected account. */
export async function handleWinnerAnalysis(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const given = request.headers.get("x-winner-job-secret");
  if (!given || !/^[a-f0-9]{64}$/.test(given)) return new Response("Unauthorized", { status: 401 });
  try {
    const { getAdminClient } = await import("@/lib/supabase-admin.server");
    const admin = getAdminClient();
    const secret = await admin.from("internal_job_secrets").select("secret").eq("name", "winner_sync").maybeSingle();
    const expected = secret.data?.secret;
    const { timingSafeEqual } = await import("node:crypto");
    if (secret.error || !expected || !/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return new Response("Unauthorized", { status: 401 });
    const body = await request.json() as { account_id?: unknown };
    if (typeof body.account_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.account_id)) return new Response("Invalid account", { status: 400 });
    const account = await admin.from("social_accounts").select("workspace_id,status,is_enabled").eq("id", body.account_id).maybeSingle();
    if (account.error || !account.data || account.data.status !== "connected" || !account.data.is_enabled) return new Response("Account unavailable", { status: 404 });
    const { generateWinnerFindings } = await import("@/lib/winner-analysis.server");
    const result = await generateWinnerFindings(admin, account.data.workspace_id);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const known = new Set(["Sam returned a finding without valid supporting posts.", "Sam returned a visual finding without inspected thumbnails.", "Sam mentioned an uncited post.", "Could not review the performance findings.", "Performance review returned invalid data.", "Performance review did not cover every finding.", "Could not save the analysis.", "Could not start content analysis.", "Sam could not analyse the current evidence."]);
    const message = error instanceof Error && (known.has(error.message) || /^AI gateway: \d{3}$/.test(error.message)) ? error.message : error instanceof Error && error.name === "ZodError" ? "Invalid structured model output" : "Unexpected analysis failure";
    console.error("Winner analysis failed:", message);
    return new Response("Analysis unavailable", { status: 503 });
  }
}

export const Route = createFileRoute("/api/public/winner-analysis")({
  server: { handlers: { POST: async ({ request }) => handleWinnerAnalysis(request) } },
});
