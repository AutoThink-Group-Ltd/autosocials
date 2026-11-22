import { expect, test } from "vitest";
import { MAX_ASSETS_PER_BATCH, clampAssets, MAX_BATCH_DAYS, VIDEO_DURATIONS, VIDEO_SIZES, clampDays, maxVideos, canShare, normaliseDuration, parseSize } from "@/lib/content-rules";

test("a week can be planned while each generation batch stays bounded", () => {
  expect(MAX_BATCH_DAYS).toBe(7);
  expect(clampDays(7)).toBe(7);
  expect(maxVideos(7)).toBe(14);
});
test("finished videos support short and one-minute formats", () => {
  expect([...VIDEO_DURATIONS]).toEqual([15, 30, 60]);
  expect(normaliseDuration(60)).toBe(60);
});
test("AutoToast sizes", () => {
  expect([...VIDEO_SIZES]).toEqual(["1080x1920", "1920x1080", "1080x1080", "1080x1350", "1000x1000"]);
  expect(parseSize("1080x1350")).toEqual({ width: 1080, height: 1350 });
});
test("only approved videos can be shared", () => {
  expect(canShare("approved")).toBe(true);
  expect(canShare("draft")).toBe(false);
});
test("a generation batch makes at most 4 assets", () => {
  expect(MAX_ASSETS_PER_BATCH).toBe(4);
  expect(clampAssets(6)).toBe(4);
  expect(clampAssets(0)).toBe(1);
});
