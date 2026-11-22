import { describe, expect, it } from "bun:test";
import { websiteImageCandidates } from "./website-image-candidates";

describe("website image candidates", () => {
  it("keeps real same-site product and hero images, preferring the larger variant and excluding unrelated or sensitive URLs", () => {
    const text = `Source: https://www.example.co.uk/\n![Dog shampoo](https://www.example.co.uk/uploads/shampoo-300x300.jpg)\n![Dog shampoo](https://www.example.co.uk/uploads/shampoo-scaled.jpg)\n![Hero](https://www.example.co.uk/uploads/hero.png)\n![Cookie icon](https://www.example.co.uk/icon.png)\n![External image](https://other.example.com/product.jpg)\n![Private](https://www.example.co.uk/product.jpg?token=secret)\n![Unsafe](https://www.example.co.uk/image.svg)`;
    const items = websiteImageCandidates([{ extracted_text: text }], "https://www.example.co.uk/");
    expect(items).toHaveLength(2);
    expect(items[0]?.label).toBe("Hero");
    expect(items.find((item) => item.label === "Dog shampoo")?.url).toContain("shampoo-scaled.jpg");
    expect(items.every((item) => item.page === "https://www.example.co.uk/")).toBe(true);
  });
  it("ignores scans of a different website", () => {
    expect(websiteImageCandidates([{ extracted_text: "Source: https://elsewhere.test/\n![Product](https://example.co.uk/product.jpg)" }], "https://example.co.uk")).toEqual([]);
  });
  it("prioritises a linked homepage banner with no alt text", () => {
    const text = "Source: https://example.co.uk/\n![Shampoo](https://example.co.uk/shampoo.jpg)\n[![](https://example.co.uk/spring.jpg)](https://example.co.uk/shop)";
    expect(websiteImageCandidates([{ extracted_text: text }], "https://example.co.uk/")[0]?.url).toBe("https://example.co.uk/spring.jpg");
  });
});
