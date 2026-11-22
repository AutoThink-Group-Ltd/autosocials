import { describe, expect, it } from "vitest";
import { validScheduleSelection } from "@/lib/creation-schedule-validation";

describe("creation schedule channel selection", () => {
  it("allows each later post to target a subset of the immediate first post's accounts", () => {
    expect(validScheduleSelection(["a", "b"], [{ immediate: true, account_ids: ["a", "b"] }, { account_ids: ["b"] }])).toBe(true);
  });
  it("rejects a later account missing from the immediate first post", () => {
    expect(validScheduleSelection(["a", "b"], [{ immediate: true, account_ids: ["a"] }, { account_ids: ["b"] }])).toBe(false);
  });
  it("rejects multiple or non-first immediate posts and unauthorized or duplicate accounts", () => {
    expect(validScheduleSelection(["a"], [{}, { immediate: true }])).toBe(false);
    expect(validScheduleSelection(["a"], [{ immediate: true }, { immediate: true }])).toBe(false);
    expect(validScheduleSelection(["a"], [{ account_ids: ["b"] }])).toBe(false);
    expect(validScheduleSelection(["a"], [{ account_ids: ["a", "a"] }])).toBe(false);
  });
  it("accepts older requests that apply the account list to each item", () => {
    expect(validScheduleSelection(["a", "b"], [{}, {}])).toBe(true);
  });
});
