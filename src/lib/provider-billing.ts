import { z } from "zod";

export const providerBillingFilter = z.object({ account_key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default("primary"), days: z.union([z.literal(7), z.literal(30)]).default(30) }).strict();
export const providerBillingInput = z.object({
  account_key: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/).default("primary"),
  transaction_id: z.string().trim().regex(/^[a-zA-Z0-9_.:-]{1,200}$/),
  amount_usd: z.number().finite().positive().max(1000000).refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.000001, "Enter a USD amount with at most two decimal places."),
  occurred_on: z.string().date(),
  evidence_source: z.enum(["user_supplied_provider_billing_screenshot", "provider_invoice", "provider_receipt"]),
  generation_step_id: z.string().uuid().nullable().default(null),
  attribution_basis: z.enum(["unlinked", "single_request_reconciliation", "manual_receipt_reconciliation"]).default("unlinked"),
}).strict().refine((v) => v.generation_step_id ? v.attribution_basis !== "unlinked" : v.attribution_basis === "unlinked", "Choose a reconciliation basis when linking a generation step.");
export type ProviderBillingInput = z.infer<typeof providerBillingInput>;
export type ProviderBillingRecord = ProviderBillingInput & { id: string; provider: "higgsfield"; currency: "USD"; transaction_type: "usage_charge"; recorded_by: string | null; created_at: string; originalEstimate?: { amount: number; currency: string } | null };
export type ProviderBillingResult = { rows: ProviderBillingRecord[]; totalBilledUsd: number; start: string; end: string };
