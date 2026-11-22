import { describe, expect, it } from "vitest";
import { evidenceIsFresh, relatedBrandPages } from "./brand-evidence";
describe("bounded brand evidence", () => {
  it("refreshes expired/unknown evidence and rejects future timestamps", () => {
    const now = Date.parse("2026-11-05T12:00:00Z");
    expect(evidenceIsFresh("2026-11-05T11:00:00Z", now)).toBe(true);
    for (const time of [null, "bad", "2026-11-04T11:00:00Z", "2026-11-06T12:00:00Z"]) expect(evidenceIsFresh(time, now)).toBe(false);
  });
  it("selects only bounded relevant same-origin clean links", () => {
    const md = "[Product](/product) [Prices](/pricing) [FAQ](/faq) [About](/about) [External](https://other.test/product) [Search](/product?q=x) [Asset](/product.pdf) [Login](/login)";
    expect(relatedBrandPages(md, "https://example.com/")).toEqual(["https://example.com/product", "https://example.com/pricing", "https://example.com/faq"]);
  });
});
