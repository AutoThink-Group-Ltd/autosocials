import { timingSafeEqual } from "node:crypto";

type JobDependencies = { readSecret: () => Promise<string | null>; run: () => Promise<{ updated: number }> };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

/** This route advances explicit user production jobs only. It never plans, schedules or publishes. */
export async function handleCreativeJobRequest(request: Request, dependencies?: JobDependencies): Promise<Response> {
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const given = request.headers.get("x-creative-secret");
  if (!given || !/^[a-f0-9]{64}$/.test(given)) return json({ error: "Unauthorized" }, 401);
  try {
    const deps = dependencies ?? {
      readSecret: async () => {
        const { getAdminClient } = await import("./supabase-admin.server");
        const result = await getAdminClient().from("internal_job_secrets").select("secret").eq("name", "creative_engine").maybeSingle();
        if (result.error) throw new Error("Job credentials unavailable");
        return result.data?.secret ?? null;
      },
      run: async () => new URL(request.url).searchParams.get("lane") === "brand-dna"
        ? (await import("./brand-dna-worker.server")).advanceDnaJobs()
        : (await import("./creative.functions")).runCreativeJobs(),
    };
    const expected = await deps.readSecret();
    if (!expected || !/^[a-f0-9]{64}$/.test(expected) || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) return json({ error: "Unauthorized" }, 401);
    return json(await deps.run());
  } catch {
    return json({ error: "Production progress could not be refreshed. Existing provider reservations are retained." }, 503);
  }
}
