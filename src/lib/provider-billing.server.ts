import { getAdminClient } from "./supabase-admin.server";
import { providerBillingFilter, providerBillingInput, type ProviderBillingRecord, type ProviderBillingResult } from "./provider-billing";

type Context = { supabase: { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error?: unknown }> }; userId: string };
async function billingAdmin(ctx: Context) {
  if (!ctx.userId) throw new Error("Unauthorized");
  const check = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  if (check.error || check.data !== true) throw new Error("Forbidden");
  return getAdminClient();
}

export async function readProviderBilling(ctx: Context, input: unknown): Promise<ProviderBillingResult> {
  const admin = await billingAdmin(ctx);
  const filter = providerBillingFilter.parse(input);
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - (filter.days - 1) * 86400000).toISOString().slice(0, 10);
  const rows: ProviderBillingRecord[] = [];
  for (let offset = 0; ; offset += 200) {
    const result = await admin.from("provider_billing_transactions" as never).select("*").eq("provider", "higgsfield").eq("account_key", filter.account_key).gte("occurred_on", start).lte("occurred_on", end).order("occurred_on", { ascending: false }).order("id").range(offset, offset + 199);
    if (result.error) throw new Error("Recorded provider billing could not be loaded.");
    const page = (result.data ?? []) as unknown as ProviderBillingRecord[];
    rows.push(...page);
    if (page.length < 200) break;
  }
  const linkedIds = [...new Set(rows.map((row) => row.generation_step_id).filter((id): id is string => !!id))];
  if (linkedIds.length) {
    const quotes = await admin.from("generation_steps" as never).select("id,cost_amount,cost_currency,cost_kind").in("id", linkedIds);
    if (quotes.error) throw new Error("Original generation estimates could not be loaded.");
    const byId = new Map((quotes.data as unknown as { id: string; cost_amount: number | null; cost_currency: string | null; cost_kind: string }[]).map((quote) => [quote.id, quote]));
    for (const row of rows) {
      const quote = row.generation_step_id ? byId.get(row.generation_step_id) : null;
      row.originalEstimate = quote?.cost_kind === "estimate" && quote.cost_amount != null && quote.cost_currency ? { amount: Number(quote.cost_amount), currency: quote.cost_currency } : null;
    }
  }
  return { rows, totalBilledUsd: rows.reduce((sum, row) => sum + Math.round(Number(row.amount_usd) * 100), 0) / 100, start, end };
}

export async function recordProviderBilling(ctx: Context, input: unknown): Promise<{ record: ProviderBillingRecord; reused: boolean }> {
  const admin = await billingAdmin(ctx);
  const value = providerBillingInput.parse(input);
  if (value.occurred_on > new Date().toISOString().slice(0, 10)) throw new Error("A provider charge cannot be dated in the future.");
  if (value.generation_step_id) {
    const step = await admin.from("generation_steps" as never).select("id,provider,status,provider_job_id").eq("id", value.generation_step_id).single();
    const row = step.data as { provider?: string; status?: string; provider_job_id?: string } | null;
    if (step.error || !row || row.provider !== "higgsfield" || row.status !== "completed" || !row.provider_job_id) throw new Error("Choose a completed, accepted Higgsfield generation for this reconciliation.");
  }
  const saved = await admin.from("provider_billing_transactions" as never).upsert({ ...value, provider: "higgsfield", currency: "USD", transaction_type: "usage_charge", recorded_by: ctx.userId } as never, { onConflict: "provider,account_key,transaction_id", ignoreDuplicates: true }).select("id");
  if (saved.error) throw new Error("The provider charge could not be recorded.");
  const existing = await admin.from("provider_billing_transactions" as never).select("*").eq("provider", "higgsfield").eq("account_key", value.account_key).eq("transaction_id", value.transaction_id).single();
  if (existing.error || !existing.data) throw new Error("The recorded provider charge could not be confirmed.");
  const record = existing.data as unknown as ProviderBillingRecord;
  if (Number(record.amount_usd) !== value.amount_usd || record.occurred_on !== value.occurred_on || record.evidence_source !== value.evidence_source || record.generation_step_id !== value.generation_step_id || record.attribution_basis !== value.attribution_basis) throw new Error("This transaction is already recorded with different details. Its original billing evidence was preserved.");
  return { record, reused: !saved.data?.length };
}
