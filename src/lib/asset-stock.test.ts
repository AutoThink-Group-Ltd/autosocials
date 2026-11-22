import { describe, expect, it } from "vitest";
import { licensedStockUrl } from "./asset-stock.server";
describe("licensed stock originals", () => {
  it("accepts a clean provider HTTPS original", () => expect(licensedStockUrl("https://download.shutterstock.com/files/original.jpg")).toContain("original.jpg"));
  it.each(["http://download.shutterstock.com/original.jpg", "https://evil.example/original.jpg", "https://image.shutterstock.com/preview/photo.jpg", "https://image.shutterstock.com/z/photo.jpg"])("rejects unsafe or preview URL %s", url => expect(() => licensedStockUrl(url)).toThrow());
});
