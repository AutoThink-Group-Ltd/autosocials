import { describe, expect, it } from "vitest";
import { availableContentCredits, canReserveContentCredits } from "./content-credit-rules";

describe("content credit rules", () => {
  it("accounts for both spent and reserved credits", () => {
    const period = { granted: 400, spent: 100, reserved: 150 };
    expect(availableContentCredits(period)).toBe(150);
    expect(canReserveContentCredits(period, 150)).toBe(true);
    expect(canReserveContentCredits(period, 151)).toBe(false);
  });
  it("rejects invalid or overdrawn balances and charges", () => {
    expect(() => availableContentCredits({ granted: 1, spent: 2, reserved: 0 })).toThrow();
    expect(() => canReserveContentCredits({ granted: 400, spent: 0, reserved: 0 }, -1)).toThrow();
    expect(() => canReserveContentCredits({ granted: 400, spent: 0, reserved: 0 }, 0.5)).toThrow();
  });
});
