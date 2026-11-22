import { describe, expect, it } from "vitest";
import { ProviderError, validateYouTubeDelivery } from "./delivery.ts";

describe("YouTube delivery validation", () => {
  it("requires explicit reviewed metadata, a supported visibility, and one video", () => {
    expect(() => validateYouTubeDelivery("Reviewed title", "Description", "unlisted", [{kind:"video"}])).not.toThrow();
    expect(() => validateYouTubeDelivery("", "Description", "public", [{kind:"video"}])).toThrow(ProviderError);
    expect(() => validateYouTubeDelivery("x".repeat(101), "", "public", [{kind:"video"}])).toThrow(ProviderError);
    expect(() => validateYouTubeDelivery("Title", "x".repeat(5001), "public", [{kind:"video"}])).toThrow(ProviderError);
    expect(() => validateYouTubeDelivery("Title", "", "friends", [{kind:"video"}])).toThrow(ProviderError);
    expect(() => validateYouTubeDelivery("Title", "", "public", [{kind:"image"}])).toThrow(ProviderError);
    expect(() => validateYouTubeDelivery("Title", "", "public", [{kind:"video"},{kind:"video"}])).toThrow(ProviderError);
  });
});
