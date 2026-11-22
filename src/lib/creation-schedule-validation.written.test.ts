import { describe, expect, it } from "vitest";
import { writtenPostCaptions } from "./creation-schedule-validation";

describe("written post scheduling", () => {
  it("keeps the complete authored text and excludes Instagram for text-only posts", () => {
    const text = "Original written post\n\n" + "x".repeat(2700);
    expect(writtenPostCaptions(text, ["facebook", "instagram", "linkedin", "x"])).toEqual({ facebook: text, linkedin: text, x: text });
  });
  it("does not supply any caption for an Instagram-only selection", () => {
    expect(writtenPostCaptions("Words", ["instagram"])).toEqual({});
  });
});
