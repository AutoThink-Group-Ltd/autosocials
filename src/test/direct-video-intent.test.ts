import { describe, expect, it } from "vitest";
import { explicitDirectVideoIntent } from "../lib/direct-video-intent";
describe("direct generation authority", () => {
  it("accepts negative visual constraints without losing an explicit create instruction", () => {
    expect(explicitDirectVideoIntent('Create a 30-second film. Do not invent interiors. Do not generate logos or people.')).toBe(true);
  });
  it.each(["Do not generate this video. Create a film later.", "Create a film, but don't start yet.", "Review this prompt: Create a video.", "I'm planning to create a video."])("does not treat review or deferred work as authority: %s", (message) => {
    expect(explicitDirectVideoIntent(message)).toBe(false);
  });
});
