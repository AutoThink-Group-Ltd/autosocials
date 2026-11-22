import { describe, expect, it } from "vitest";
import { chooseTileProvider } from "./social-tile-routing";

describe("social tile routing", () => {
  it("prefers the original OpenAI design path for every creative treatment", () => {
    const all = ["recraft", "ideogram", "openai"] as const;
    expect(chooseTileProvider("An abstract illustration", [...all]).provider).toBe("openai");
    expect(chooseTileProvider("Typography-led poster", [...all]).provider).toBe("openai");
    expect(chooseTileProvider("A cinematic photograph", [...all]).provider).toBe("openai");
  });
  it("selects a configured provider before submitting and fails if none exist", () => {
    expect(chooseTileProvider("abstract artwork", ["openai"]).provider).toBe("openai");
    expect(() => chooseTileProvider("poster", [])).toThrow();
  });
});
