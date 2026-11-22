import { describe, expect, it } from "vitest";
import { validChannelCaption, xCaptionLength } from "./schedule-caption-length";

describe("channel caption limits", () => {
  it("counts URLs and non-Latin characters for X", () => {
    expect(xCaptionLength("Hello https://example.com/long-path")).toBe(29);
    expect(xCaptionLength("漢😀")).toBe(4);
    expect(validChannelCaption("漢".repeat(141), "x")).toBe(false);
    expect(validChannelCaption("漢".repeat(141), "linkedin")).toBe(true);
  });
});
