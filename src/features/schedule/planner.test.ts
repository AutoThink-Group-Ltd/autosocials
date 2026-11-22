import { describe, expect, it } from "vitest";
import {
  refreshExpiredSlots,
  calendarDays,
  daytimeScheduleSlots,
  dailyScheduleSlots,
  dateKey,
  nextWorkspaceSlot,
  shiftCursor,
  workspaceInstant,
} from "./planner";
describe("Publish calendar timezone handling", () => {
  it("groups posts by workspace day rather than device day", () => {
    expect(dateKey("2026-10-28T23:30:00Z", "Asia/Dubai")).toBe("2026-10-29");
  });
  it("preserves wall clock slots across daylight saving", () => {
    expect(workspaceInstant("2026-10-24", "09:00", "Europe/London")).toBe(
      "2026-10-24T08:00:00.000Z",
    );
    expect(workspaceInstant("2026-10-26", "09:00", "Europe/London")).toBe(
      "2026-10-26T09:00:00.000Z",
    );
  });
  it("rejects a nonexistent spring-forward time", () => {
    expect(() =>
      workspaceInstant("2026-03-29", "01:30", "Europe/London"),
    ).toThrow("clocks change");
  });
  it("finds the next workspace slot after daylight saving ends", () => {
    expect(nextWorkspaceSlot("Europe/London", [{ day_of_week: 1, hour: 9 }], new Date("2026-10-24T12:00:00Z")))
      .toBe("2026-10-26T09:00:00.000Z");
  });
  it("starts weeks on Monday and keeps month movement inside the target month", () => {
    expect(calendarDays("2026-10-29", "week")[0]).toBe("2026-10-26");
    expect(calendarDays("2026-10-29", "month")).toHaveLength(42);
    expect(shiftCursor("2026-01-31", "month", 1)).toBe("2026-02-01");
  });
});

it("places the November campaign on twelve consecutive local dates, including weekends", () => {
  expect(dailyScheduleSlots("2026-11-19", "09:00", "Europe/London", 12)).toEqual(
    Array.from({ length: 12 }, (_, i) => `2026-11-${19 + i}T09:00:00.000Z`),
  );
  expect(dailyScheduleSlots("2026-10-24", "09:00", "Europe/London", 2)).toEqual([
    "2026-10-24T08:00:00.000Z", "2026-10-25T09:00:00.000Z",
  ]);
});

it("moves overnight suggestions into UK waking hours across the spring clock change", () => {
  expect(daytimeScheduleSlots(["2026-03-28T12:00:00.000Z", "2026-03-29T01:14:00.000Z", "2026-03-30T17:00:00.000Z"], "Europe/London")).toEqual([
    "2026-03-28T12:00:00.000Z", "2026-03-29T08:00:00.000Z", "2026-03-30T17:00:00.000Z",
  ]);
});

it("repairs the missed 09:00 draft while keeping the next eleven dates", () => {
  const items = dailyScheduleSlots("2026-11-19", "09:00", "Europe/London", 12).map(scheduled_at => ({ scheduled_at }));
  const now = Date.parse("2026-11-19T11:44:00Z");
  const repaired = refreshExpiredSlots(items, "Europe/London", true, false, false, now);
  expect(repaired[0]?.scheduled_at).toBe("2026-11-19T13:00:00.000Z");
  expect(repaired.slice(1)).toEqual(items.slice(1));
  expect(refreshExpiredSlots(items, "Europe/London", true, false, true, now)).toBe(items);
});
