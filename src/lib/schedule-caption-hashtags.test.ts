import { expect, it } from "vitest";
import { scheduleCaptionWithHashtags } from "./schedule-caption-hashtags";

it.each([["linkedin", 2], ["facebook", 1], ["x", 1], ["instagram", 3]] as const)(
  "prepares topic tags for %s and preserves the resulting draft on reuse", (channel, count) => {
    const body = "Customer retention experiments reveal buying patterns.";
    const result = scheduleCaptionWithHashtags(body, channel);
    expect(result.startsWith(body)).toBe(true);
    expect(result.match(/#\w+/g)).toEqual(["#Customer", "#Retention", "#Experiments"].slice(0, count));
    expect(scheduleCaptionWithHashtags(result, channel)).toBe(result);
  },
);
it("keeps approved copy intact when there is no room for tags", () => {
  const body = "Marketing ".repeat(28).trim();
  expect(scheduleCaptionWithHashtags(body, "x")).toBe(body);
});
