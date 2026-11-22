import { describe, expect, it } from "vitest";
import {
  parseVirloUsageSummary,
  safeVirloOperationMeta,
} from "./admin-virlo.functions";

const aggregate = {
  total: "4",
  reported_gross_usd: "0.05",
  reported_cost_count: "2",
  no_response_recorded_usd: "0",
  no_response_recorded_count: "0",
  estimated_only_usd: "0.25",
  estimated_only_count: "1",
  no_receipt_or_estimate_count: "1",
  unresolved_count: "2",
  reported_credits: "5",
  reported_credit_count: "2",
};

describe("Virlo usage summary", () => {
  it("keeps gross charges, estimates and missing costs separate", () => {
    expect(parseVirloUsageSummary(aggregate)).toEqual({
      total: 4,
      reportedUsd: 0.05,
      reportedCount: 2,
      noResponseUsd: 0,
      noResponseCount: 0,
      estimatedUsd: 0.25,
      estimatedCount: 1,
      unknownCount: 1,
      unresolvedCount: 2,
      reportedCredits: 5,
      reportedCreditCount: 2,
    });
  });
  it("does not silently convert missing or malformed totals into zero", () => {
    expect(() =>
      parseVirloUsageSummary({ ...aggregate, reported_gross_usd: null }),
    ).toThrow();
    expect(() =>
      parseVirloUsageSummary({ ...aggregate, estimated_only_count: "broken" }),
    ).toThrow();
  });
});

describe("Virlo tracking reconciliation details", () => {
  it("keeps public identifiers while excluding credentials and URL query parameters", () => {
    expect(
      safeVirloOperationMeta({
        platform: "tiktok",
        handle: "@creator",
        cadence: "daily",
        url: "https://www.tiktok.com/@creator/video/123?secret=hidden#part",
        token: "secret",
      }),
    ).toEqual({
      platform: "tiktok",
      cadence: "daily",
      handle: "@creator",
      url: "https://www.tiktok.com/@creator/video/123",
    });
    expect(
      safeVirloOperationMeta({
        url: "https://evil.example/private",
        handle: "bad handle",
      }),
    ).toEqual({});
  });
});
