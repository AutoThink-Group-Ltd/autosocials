import { describe, expect, it } from "vitest";
import { socialDesignPalette } from "./social-design-layout";
const design = {
  aspect: "square",
  treatment: "typography",
  composition: "full",
  medium: "pencil",
  accent: "#222222",
  emphasis: "",
  typeface: "serif",
} as const;
describe("social design palette", () => {
  it("preserves a readable white paper palette", () =>
    expect(
      socialDesignPalette({ ...design, paper: "#ffffff", ink: "#222222" }),
    ).toEqual({ paper: "#ffffff", ink: "#222222" }));
  it("replaces low contrast ink", () =>
    expect(
      socialDesignPalette({ ...design, paper: "#ffffff", ink: "#eeeeee" }).ink,
    ).toBe("#000000"));
});

it("keeps deliberate line breaks and highlights fragments of wrapped phrases", async () => {
  const { socialDesignLines, socialDesignEmphasis } =
    await import("./social-design-layout");
  expect(socialDesignLines("First line\nSecond line", 1000, (text) => text.length * 50)).toEqual([
    "First line",
    "Second line",
  ]);
  expect(
    socialDesignEmphasis(
      ["A thoughtful", "headline here", "another headline"],
      "thoughtful headline",
    ),
  ).toEqual([{ start: 2, length: 10 }, { start: 0, length: 8 }, null]);
});
