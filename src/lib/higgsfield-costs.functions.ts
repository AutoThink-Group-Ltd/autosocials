import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertGenerationAdmin } from "./generation-tracker.functions";

type UsageRow = { bucket: string; model: string; quantity: number; cost: number };
type UsageResult = { rows: UsageRow[]; totalCost: number; generations: number; fetchedAt: string; start: string; end: string };

/** Higgsfield reports estimated completed-generation usage, not a bill or account balance. */
export const getHiggsfieldCosts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ days: z.union([z.literal(7), z.literal(30)]) }).parse(input))
  .handler(async ({ data, context }): Promise<UsageResult> => {
    await assertGenerationAdmin(context as { supabase: any; userId: string });
    const id = process.env.HF_API_KEY_ID?.trim();
    const secret = process.env.HF_API_KEY_SECRET?.trim();
    if (!id || !secret) throw new Error("Higgsfield API credentials are not configured for this deployment.");
    const end = new Date();
    const start = new Date(end.getTime() - data.days * 86_400_000);
    const url = new URL("https://api.higgsfield.ai/models/usage");
    url.searchParams.set("start", start.toISOString());
    url.searchParams.set("end", end.toISOString());
    url.searchParams.set("timeframe", "day");
    url.searchParams.set("expand", "time_series");
    url.searchParams.set("limit", "100");
    let response: Response;
    try {
      response = await fetch(url, { headers: { Authorization: `Key ${id}:${secret}` }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    } catch {
      throw new Error("Higgsfield usage could not be reached. Try refreshing this page.");
    }
    if (!response.ok) throw new Error(response.status === 401 || response.status === 403
      ? "Higgsfield rejected access to usage analytics. Check the API connection and account permissions."
      : `Higgsfield usage is temporarily unavailable (${response.status}).`);
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !Array.isArray((body as { time_series?: unknown }).time_series))
      throw new Error("Higgsfield returned an unexpected usage response.");
    const rows: UsageRow[] = [];
    for (const series of (body as { time_series: unknown[] }).time_series) {
      if (!series || typeof series !== "object") continue;
      const bucket = (series as { bucket?: unknown }).bucket;
      const results = (series as { results?: unknown }).results;
      if (typeof bucket !== "string" || !Array.isArray(results)) continue;
      for (const item of results) {
        if (!item || typeof item !== "object") continue;
        const entry = item as Record<string, unknown>;
        if (entry.currency !== "USD" || typeof entry.model !== "string") continue;
        const quantity = Number(entry.quantity);
        const cost = Number(entry.cost);
        if (!Number.isFinite(quantity) || !Number.isFinite(cost) || quantity < 0 || cost < 0) continue;
        rows.push({ bucket, model: entry.model, quantity, cost });
      }
    }
    return { rows, totalCost: rows.reduce((sum, row) => sum + row.cost, 0), generations: rows.reduce((sum, row) => sum + row.quantity, 0), fetchedAt: new Date().toISOString(), start: start.toISOString(), end: end.toISOString() };
  });
