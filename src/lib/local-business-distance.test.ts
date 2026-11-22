import { describe, expect, it } from "vitest";
import { distanceMiles } from "./local-business-distance";

describe("distanceMiles", () => {
  it("calculates straight-line distance and handles identical points", () => {
    const bradford = { latitude: 53.796, longitude: -1.759 };
    expect(distanceMiles(bradford, bradford)).toBe(0);
    expect(distanceMiles(bradford, { latitude: 53.801, longitude: -1.549 })).toBeCloseTo(8.6, 0);
  });
  it("rejects invalid coordinates rather than reporting a misleading distance", () => {
    expect(() => distanceMiles({ latitude: 91, longitude: 0 }, { latitude: 0, longitude: 0 })).toThrow();
  });
});
