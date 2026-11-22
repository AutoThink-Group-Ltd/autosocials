import { afterEach, describe, expect, it, vi } from "vitest";
import { decryptYouTubeToken, encryptYouTubeToken } from "./youtube-tokens.ts";

describe("YouTube token envelopes", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("encrypts for one channel context and rejects tampering or cross-channel use", async () => {
    vi.stubGlobal("Deno", { env: { get: () => "a".repeat(64) } });
    const context = "youtube:workspace:channel-1:access";
    const sealed = await encryptYouTubeToken("access-token", context);
    expect(sealed).not.toContain("access-token");
    await expect(decryptYouTubeToken(sealed, context)).resolves.toBe("access-token");
    await expect(decryptYouTubeToken(sealed, "youtube:workspace:channel-2:access")).rejects.toThrow();
    await expect(decryptYouTubeToken(`${sealed}tampered`, context)).rejects.toThrow();
  });
});
