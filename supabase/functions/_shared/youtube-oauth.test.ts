import { describe, expect, it } from "vitest";
import { hasRequiredYouTubeScopes, YOUTUBE_SCOPES } from "./youtube-oauth.ts";

describe("YouTube OAuth scope boundary", () => {
  it("requires channel read and upload, and no broader account scope", () => {
    expect(YOUTUBE_SCOPES).toEqual(["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"]);
    expect(hasRequiredYouTubeScopes(YOUTUBE_SCOPES.join(" "))).toBe(true);
    expect(hasRequiredYouTubeScopes(YOUTUBE_SCOPES[0])).toBe(false);
    expect(hasRequiredYouTubeScopes(`${YOUTUBE_SCOPES.join(" ")} https://www.googleapis.com/auth/youtube`)).toBe(true);
  });
});
