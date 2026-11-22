import { describe, expect, it } from "vitest";
import { fitScheduleSlots } from "./free-slots";
const options = { timezone: "Europe/London", daily: true, excludeWeekends: true, startNow: false };
describe("fitScheduleSlots", () => {
  it("fits a second daily batch on the same dates as eleven existing 09:00 posts", () => {
    const dates = Array.from({ length: 11 }, (_, i) => `2026-11-${String(9 + i).padStart(2, "0")}`);
    const slots = dates.map(day => `${day}T09:00:00Z`);
    const result = fitScheduleSlots(slots, slots.map(() => ["a"]), slots.map(scheduled_at => ({ scheduled_at, account_ids: ["a"] })), { ...options, excludeWeekends: false });
    expect(result).toEqual(dates.map(day => `${day}T11:00:00.000Z`));
  });
  it("skips weekends and preserves the local clock across DST", () => {
    expect(fitScheduleSlots(["2026-10-23T08:00:00Z", "2026-10-24T08:00:00Z"], [["a"], ["a"]], [], options)).toEqual(["2026-10-23T08:00:00.000Z", "2026-10-26T09:00:00.000Z"]);
  });
  it("allows unrelated destinations to coincide in AI mode, while reserving all destinations of a multi-channel item", () => {
    expect(fitScheduleSlots(Array(3).fill("2026-11-19T09:00:00Z"), [["a", "b"], ["c"], ["b"]], [], { ...options, daily: false })).toEqual(["2026-11-19T09:00:00.000Z", "2026-11-19T09:00:00.000Z", "2026-11-19T11:00:00.000Z"]);
  });
  it("fits AI times two hours away from matching existing and new bookings", () => {
    expect(fitScheduleSlots(Array(2).fill("2026-11-19T09:00:00Z"), [["a"], ["a"]], [{ scheduled_at: "2026-11-19T10:00:00Z", account_ids: ["a"] }], { ...options, daily: false })).toEqual(["2026-11-19T12:00:00.000Z", "2026-11-19T14:00:00.000Z"]);
  });
  it("keeps immediate first time and rejects same-minute conflicts", () => {
    const immediate = "2026-11-19T08:30:15Z";
    expect(() => fitScheduleSlots([immediate], [["a"]], [{ scheduled_at: "2026-11-19T08:30:59Z", account_ids: ["a"] }], { ...options, startNow: true })).toThrow(/minute/);
    expect(fitScheduleSlots([immediate], [["a"]], [], { ...options, startNow: true })).toEqual(["2026-11-19T08:30:15.000Z"]);
  });
  it("does not reserve destination-less proposals", () => {
    expect(fitScheduleSlots(Array(2).fill("2026-11-19T09:00:00Z"), [[], []], [], { ...options, daily: false })).toEqual(Array(2).fill("2026-11-19T09:00:00.000Z"));
  });
});
