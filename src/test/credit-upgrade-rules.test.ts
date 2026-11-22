import { describe, expect, it } from "vitest";
import { initialUpgradePaymentSettings, mayReplaceSubscription, proratedCreditIncrease } from "../../supabase/functions/credit-auto-upgrade/rules";

describe("credit upgrade proration", () => {
  it("awards the difference proportionally and rounds down", () => {
    expect(proratedCreditIncrease(1000, 1800, 0, 100, 0)).toBe(800);
    expect(proratedCreditIncrease(1000, 1800, 0, 100, 50)).toBe(400);
    expect(proratedCreditIncrease(1000, 1800, 0, 101, 100)).toBe(7);
  });
  it("rejects downgrades, malformed dates and expired periods", () => {
    expect(() => proratedCreditIncrease(1800, 1000, 0, 100, 50)).toThrow();
    expect(() => proratedCreditIncrease(1000, 1800, 0, 100, 100)).toThrow();
    expect(() => proratedCreditIncrease(1000, 1800, 0, 100, 1.5)).toThrow();
  });
  it("replaces only terminal subscriptions owned by the same Stripe customer", () => {
    expect(mayReplaceSubscription("canceled", "cus_a", "cus_a")).toBe(true);
    expect(mayReplaceSubscription("incomplete_expired", "cus_a", "cus_a")).toBe(true);
    expect(mayReplaceSubscription("active", "cus_a", "cus_a")).toBe(false);
    expect(mayReplaceSubscription("canceled", "cus_a", "cus_b")).toBe(false);
    expect(mayReplaceSubscription("canceled", "cus_a", null)).toBe(false);
  });
  it("attempts saved-method payment off-session and permits customer action", () => {
    expect(initialUpgradePaymentSettings).toEqual({ payment_behavior: "allow_incomplete", off_session: true });
  });
});
