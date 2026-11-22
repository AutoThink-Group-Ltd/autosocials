import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertGenerationAdmin } from "./generation-tracker.functions";

export function parseKieBalance(body: unknown): number | null {
  if (!body || typeof body !== "object") return null;
  const result = body as { code?: unknown; data?: unknown };
  return result.code === 200 && typeof result.data === "number" && Number.isFinite(result.data) && result.data >= 0 ? result.data : null;
}

type CostRow = { model: string; cost_kind: string; cost_currency: string | null; cost_amount: number | string | null; usage?: unknown };
export function summarizeKieUsage(rows: CostRow[]) {
  const costs = new Map<string, { model: string; kind: string; currency: string; amount: number; count: number }>();
  let unknown = 0, credits = 0, creditRecords = 0;
  for (const row of rows) {
    const value = row.usage && typeof row.usage === "object" ? (row.usage as { credits?: unknown }).credits : undefined;
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) { credits += value; creditRecords++; }
    const amount = row.cost_amount === null ? NaN : Number(row.cost_amount);
    if (!row.cost_currency || !["known", "estimate"].includes(row.cost_kind) || !Number.isFinite(amount) || amount < 0) { unknown++; continue; }
    const key = JSON.stringify([row.model, row.cost_kind, row.cost_currency]);
    const current = costs.get(key) ?? { model: row.model, kind: row.cost_kind, currency: row.cost_currency, amount: 0, count: 0 };
    current.amount += amount; current.count++; costs.set(key, current);
  }
  return { steps: rows.length, unknown, credits: creditRecords ? credits : null, creditRecords, costs: [...costs.values()] };
}

export const getKieCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ days: z.union([z.literal(7), z.literal(30)]) }).strict().parse(input))
  .handler(async ({ data, context }) => {
    await assertGenerationAdmin(context as { supabase: any; userId: string });
    const { getAdminClient } = await import("./supabase-admin.server");
    const db = getAdminClient() as any;
    const start = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const rows: CostRow[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await db.from("generation_steps").select("model,cost_kind,cost_currency,cost_amount,usage").eq("provider", "kie").gte("created_at", start).order("created_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999);
      if (result.error) throw new Error("Kie recorded usage is unavailable.");
      rows.push(...(result.data ?? []));
      if ((result.data ?? []).length < 1000) break;
    }
    let balance: number | null = null;
    let balanceError: string | null = null;
    const key = process.env['KIE_API_KEY']?.trim();
    if (!key) balanceError = "Kie API key is not configured for this deployment.";
    else {
      try {
        const response = await fetch("https://api.kie.ai/api/v1/chat/credit", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000), cache: "no-store", redirect: "error" });
        if (!response.ok) balanceError = "Kie balance is unavailable. Check the API connection and account permissions.";
        else {
          balance = parseKieBalance(await response.json());
          if (balance === null) balanceError = "Kie returned an unexpected balance response.";
        }
      } catch { balanceError = "Kie balance could not be reached. Try refreshing."; }
    }
    return { ...summarizeKieUsage(rows), balance, balanceError, fetchedAt: new Date().toISOString() };
  });
