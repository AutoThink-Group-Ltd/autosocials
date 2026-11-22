import { describe, expect, it } from "vitest";
import { publicBrandWebsite } from "./brand-discovery.server";

describe("automatic brand discovery website boundary", () => {
  it("normalizes public HTTPS sites and rejects private or credential-bearing URLs", () => {
    expect(publicBrandWebsite("livinginlondon.co.uk")).toBe("https://livinginlondon.co.uk/");
    expect(publicBrandWebsite("https://example.com/brand#section")).toBe("https://example.com/brand");
    for (const value of ["http://example.com", "https://localhost/", "https://127.0.0.1/", "https://192.168.1.2/", "https://[::1]/", "https://user:secret@example.com/", "https://site.local/", "https://site.internal/"]) {
      expect(publicBrandWebsite(value)).toBeNull();
    }
  });
});
