import { describe, expect, it } from "vitest";
import { immediateProrationAmount } from "../../supabase/functions/update-subscription/preview";
const line = (amount: number, proration: boolean) => ({ amount, parent: { type: "subscription_item_details", subscription_item_details: { proration } } });
describe("manual upgrade quote", () => {
  it("excludes renewal and totals both proration adjustments", () => expect(immediateProrationAmount({ currency: "gbp", starting_balance: 0, lines: { data: [line(7900, false), line(-2500, true), line(4000, true)] } })).toBe(1500));
  it("rejects unknown additional charges and account balances", () => {
    expect(() => immediateProrationAmount({ currency: "gbp", starting_balance: -100, lines: { data: [line(7900, false), line(100, true)] } })).toThrow();
    expect(() => immediateProrationAmount({ currency: "gbp", lines: { data: [line(7900, false), line(100, true), { amount: 500 }] } })).toThrow();
    expect(() => immediateProrationAmount({ currency: "gbp", lines: { has_more: true, data: [line(7900, false), line(100, true)] } })).toThrow();
  });
});
