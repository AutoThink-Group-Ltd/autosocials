import { describe, expect, it } from "vitest";
import { allowedWinnerThumbnail } from "./winner-thumbnail.server";

describe("winner thumbnail source boundary", () => {
  it("allows only HTTPS URLs on known provider CDNs", () => {
    expect(allowedWinnerThumbnail("https://i.ytimg.com/vi/abc/hqdefault.jpg")).toBe(true);
    expect(allowedWinnerThumbnail("https://scontent.cdninstagram.com/photo.jpg")).toBe(true);
    expect(allowedWinnerThumbnail("https://ytimg.com.attacker.example/image.jpg")).toBe(false);
    expect(allowedWinnerThumbnail("https://user:password@i.ytimg.com/image.jpg")).toBe(false);
    expect(allowedWinnerThumbnail("http://i.ytimg.com/image.jpg")).toBe(false);
    expect(allowedWinnerThumbnail("https://127.0.0.1/image.jpg")).toBe(false);
  });
});
