import { describe, expect, it } from "vitest";
import { parseKieBalance, summarizeKieUsage } from "@/lib/kie-costs.functions";

describe("Kie reporting", () => {
  it("accepts only valid successful balance responses, including zero", () => {
    expect(parseKieBalance({ code: 200, data: 0 })).toBe(0);
    expect(parseKieBalance({ code: 200, data: 100.5 })).toBe(100.5);
    for (const response of [{ code: 401, data: 0 }, { code: 200, data: "2" }, { code: 200, data: -1 }, null]) expect(parseKieBalance(response)).toBeNull();
  });
  it("keeps estimates, currencies and unknown costs separate", () => {
    const result = summarizeKieUsage([
      { model: "x", cost_kind: "known", cost_currency: "USD", cost_amount: 1, usage: { credits: 5 } },
      { model: "x", cost_kind: "estimate", cost_currency: "USD", cost_amount: "2" },
      { model: "x", cost_kind: "known", cost_currency: "GBP", cost_amount: 3 },
      { model: "x", cost_kind: "unknown", cost_currency: null, cost_amount: null },
    ]);
    expect(result.steps).toBe(4); expect(result.unknown).toBe(1); expect(result.credits).toBe(5); expect(result.creditRecords).toBe(1);
    expect(result.costs.map(x => [x.kind, x.currency, x.amount])).toEqual([["known", "USD", 1], ["estimate", "USD", 2], ["known", "GBP", 3]]);
  });
});
