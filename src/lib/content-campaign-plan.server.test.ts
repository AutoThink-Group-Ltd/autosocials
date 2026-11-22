import { describe, expect, it } from "vitest";
import { campaignDates } from "./content-campaign-dates";

describe("campaign calendar dates", () => {
  it("plans all twelve remaining dates despite an inferred count", () => {
    const dates = campaignDates("LinkedIn posts for the rest of the month", "2026-11-18", 5, { start_date: "2026-11-18" });
    expect(dates).toHaveLength(12);
    expect(dates[0]).toBe("2026-11-19");
    expect(dates.at(-1)).toBe("2026-11-30");
  });
  it("respects weekdays, including a leap year and year boundary", () => {
    expect(campaignDates("weekdays for the rest of the month", "2028-02-25")).toEqual(["2028-02-28", "2028-02-29"]);
    expect(campaignDates("3 posts", "2026-12-30", 3)).toEqual(["2026-12-31", "2027-01-01", "2027-01-02"]);
  });
  it("does not silently schedule into next month when there are no days left", () => {
    expect(() => campaignDates("rest of the month", "2026-11-30")).toThrow("no days remaining");
  });
});
