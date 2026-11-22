import { describe, expect, it } from "vitest";
import {
  validatePublishingGrant,
  type PublishingGrant,
} from "./publishingGrant";
const now = Date.parse("2026-11-22T12:00:00Z");
const valid: PublishingGrant = {
  connectionId: "client",
  accountIds: ["a", "b"],
  expiresAt: "2026-11-23T12:00:00Z",
  maxCount: 10,
  publishNowAccountIds: [],
  publishNowMaxCount: 0,
};
describe("standing publishing grant", () => {
  it("accepts bounded grants with immediate publishing off by default", () =>
    expect(validatePublishingGrant(valid, now)).toBeNull());
  it("requires future expiry within 90 days and bounded total", () => {
    expect(
      validatePublishingGrant(
        { ...valid, expiresAt: "2027-12-01T00:00:00Z" },
        now,
      ),
    ).toBeTruthy();
    expect(
      validatePublishingGrant({ ...valid, maxCount: 0 }, now),
    ).toBeTruthy();
  });
  it("requires immediate accounts to be a subset and capped within the total", () => {
    expect(
      validatePublishingGrant(
        { ...valid, publishNowAccountIds: ["c"], publishNowMaxCount: 1 },
        now,
      ),
    ).toBeTruthy();
    expect(
      validatePublishingGrant(
        { ...valid, publishNowAccountIds: ["a"], publishNowMaxCount: 11 },
        now,
      ),
    ).toBeTruthy();
    expect(
      validatePublishingGrant(
        { ...valid, publishNowAccountIds: ["a"], publishNowMaxCount: 2 },
        now,
      ),
    ).toBeNull();
  });
});
