import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn() }));
vi.mock("../lib/supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
import { readProviderBilling, recordProviderBilling } from "../lib/provider-billing.server";
import { providerBillingInput } from "../lib/provider-billing";

const stepId = "11111111-1111-4111-8111-111111111111";
const input = () => ({ account_key: "primary", transaction_id: "receipt-1", amount_usd: 14.5, occurred_on: "2026-11-04", evidence_source: "provider_receipt" as const, generation_step_id: null, attribution_basis: "unlinked" as const });
function setup(allowed: unknown = true) {
  let record: Record<string, unknown> | null = null;
  const step: Record<string, unknown> = { id: stepId, provider: "higgsfield", status: "completed", provider_job_id: "accepted-job", cost_amount: 17.0586, cost_currency: "USD", cost_kind: "estimate" };
  const upsert = vi.fn(async (value: Record<string, unknown>, _options: unknown) => { if (record) return { data: [], error: null }; record = { ...value, id: "billing-row", created_at: "2026-11-04T12:00:00Z" }; return { data: [{ id: "billing-row" }], error: null }; });
  const from = vi.fn((table: string) => {
    const chain = {
      select: () => chain, eq: () => chain, gte: () => chain, lte: () => chain, order: () => chain,
      in: async () => ({ data: [step], error: null }),
      range: async () => ({ data: record ? [record] : [], error: null }),
      single: async () => ({ data: table === "generation_steps" ? step : record, error: null }),
      upsert: (value: Record<string, unknown>, options: unknown) => ({ select: () => upsert(value, options) }),
    };
    return chain;
  });
  const db = { from };
  mocks.admin.mockReturnValue(db);
  const context = { userId: "admin-user", supabase: { rpc: vi.fn(async () => ({ data: allowed, error: null })) } };
  return { context, from, upsert, step, get record() { return record; } };
}
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-04T18:00:00Z")); });
afterEach(() => vi.useRealTimers());

describe("provider billing evidence", () => {
  it.each([false, null, "true"])("rejects non-admin role result %s before opening privileged data access", async (role) => {
    const f = setup(role);
    await expect(recordProviderBilling(f.context, input())).rejects.toThrow("Forbidden");
    await expect(readProviderBilling(f.context, { days: 30 })).rejects.toThrow("Forbidden");
    expect(mocks.admin).not.toHaveBeenCalled(); expect(f.from).not.toHaveBeenCalled();
    expect(f.context.supabase.rpc).toHaveBeenCalledWith("has_role", { _user_id: "admin-user", _role: "super_admin" });
  });
  it("records the charge once and preserves its original actor and evidence on repeat", async () => {
    const f = setup();
    const first = await recordProviderBilling(f.context, input());
    const second = await recordProviderBilling({ ...f.context, userId: "another-admin" }, input());
    expect(first.reused).toBe(false); expect(second.reused).toBe(true);
    expect(second.record).toMatchObject({ amount_usd: 14.5, recorded_by: "admin-user", currency: "USD", transaction_type: "usage_charge" });
    expect(f.upsert.mock.calls[0][1]).toEqual({ onConflict: "provider,account_key,transaction_id", ignoreDuplicates: true });
    expect(f.from.mock.calls.every(([table]) => table === "provider_billing_transactions")).toBe(true);
  });
  it("rejects conflicting details for an existing transaction without replacing evidence", async () => {
    const f = setup(); await recordProviderBilling(f.context, input());
    await expect(recordProviderBilling(f.context, { ...input(), amount_usd: 12 })).rejects.toThrow("already recorded with different details");
    expect(f.record?.amount_usd).toBe(14.5);
  });
  it("links only a completed accepted Higgsfield step with explicit reconciliation basis", async () => {
    const f = setup();
    const result = await recordProviderBilling(f.context, { ...input(), generation_step_id: stepId, attribution_basis: "single_request_reconciliation" });
    expect(result.record).toMatchObject({ generation_step_id: stepId, attribution_basis: "single_request_reconciliation" });
    expect(f.step.cost_amount).toBe(17.0586); expect(f.step.cost_kind).toBe("estimate");
  });
  it.each([{ provider: "openai" }, { status: "failed" }, { provider_job_id: null }])("rejects an invalid linked generation %j before inserting a charge", async (change) => {
    const f = setup(); Object.assign(f.step, change);
    await expect(recordProviderBilling(f.context, { ...input(), generation_step_id: stepId, attribution_basis: "manual_receipt_reconciliation" })).rejects.toThrow("completed, accepted Higgsfield");
    expect(f.upsert).not.toHaveBeenCalled();
  });
  it("totals billed amounts separately while returning the untouched original estimate", async () => {
    const f = setup();
    await recordProviderBilling(f.context, { ...input(), generation_step_id: stepId, attribution_basis: "single_request_reconciliation" });
    const result = await readProviderBilling(f.context, { days: 30, account_key: "primary" });
    expect(result.totalBilledUsd).toBe(14.5);
    expect(result.rows[0].originalEstimate).toEqual({ amount: 17.0586, currency: "USD" });
  });
  it("validates positive cent-denominated charges and prevents invented linkage or future dates", async () => {
    for (const patch of [{ amount_usd: -1 }, { amount_usd: 0 }, { amount_usd: 14.501 }, { amount_usd: Infinity }, { occurred_on: "2026-02-30" }, { generation_step_id: stepId }, { attribution_basis: "single_request_reconciliation" }]) expect(providerBillingInput.safeParse({ ...input(), ...patch }).success).toBe(false);
    const f = setup(); await expect(recordProviderBilling(f.context, { ...input(), occurred_on: "2026-11-05" })).rejects.toThrow("future");
    expect(f.upsert).not.toHaveBeenCalled();
  });
});
