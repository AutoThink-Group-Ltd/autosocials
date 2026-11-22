import { describe, expect, it } from "vitest";
import { creationEntry, creationQuantity, narrativesFromBrief } from "./creation-entry";
import { seedSpecs } from "./wizard";
describe("creation entry", () => {
  it("preserves a supplied brief across requested videos and retains earlier ideas", () => {
    let serial = 0;
    const brief = "A complete storyboard with product details. ".repeat(8);
    const existing = narrativesFromBrief([], "Earlier story", 4, () => String(++serial));
    const ideas = narrativesFromBrief(existing, brief, 3, () => String(++serial));
    expect(ideas).toHaveLength(7);
    expect(ideas.filter((idea) => idea.selected)).toHaveLength(3);
    expect(ideas.slice(4).every((idea) => idea.message === brief.trim())).toBe(true);
    expect(new Set(ideas.map((idea) => idea.id)).size).toBe(7);
    expect(new Set(ideas.slice(4).map((idea) => idea.title)).size).toBe(3);
  });
  it("restores only supported entry routes", () => {
    expect(creationEntry("style")).toBe("style");
    expect(creationEntry("media")).toBe("media");
    expect(creationEntry("invalid")).toBe("ideas");
  });
  it("bounds requested quantities for the chosen format", () => {
    expect(creationQuantity(99, "video")).toBe(4);
    expect(creationQuantity(5, "tiles")).toBe(5);
    expect(creationQuantity(10, "tiles")).toBe(10);
    for (const value of [null, -2, "bad", Infinity]) expect(creationQuantity(value, "video")).toBe(1);
  });
  it("plans the requested number of videos from one idea", () => {
    const specs = seedSpecs([{ title: "Our product story" }], 3);
    expect(specs).toHaveLength(3);
    expect(specs.every((spec) => spec.narrative === "Our product story")).toBe(true);
  });
});
