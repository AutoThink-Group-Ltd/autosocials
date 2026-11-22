import { PDFDocument } from "pdf-lib";
import { describe, expect, it, vi } from "vitest";
import { createCarouselPdf, renderCarouselSlide } from "./carousel-artwork";

const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/aN8AAAAASUVORK5CYII=";

describe("carousel PDF", () => {
  it("makes one square page for each of five preview images", async () => {
    const bytes = await createCarouselPdf(Array(5).fill(pixel));
    const document = await PDFDocument.load(bytes);
    expect(document.getPageCount()).toBe(5);
    expect(document.getPages().map((page) => page.getSize())).toEqual(
      Array(5).fill({ width: 1000, height: 1000 }),
    );
  });

  it("exports portrait slides on portrait pages", async () => {
    const document = await PDFDocument.load(await createCarouselPdf([pixel, pixel], "portrait"));
    expect(document.getPages().map((page) => page.getSize())).toEqual(Array(2).fill({ width: 1000, height: 1250 }));
  });

  it("rejects incomplete or oversized decks", async () => {
    await expect(createCarouselPdf([pixel])).rejects.toThrow("between 2 and 6");
    await expect(createCarouselPdf(Array(7).fill(pixel))).rejects.toThrow("between 2 and 6");
  });
});


describe("product logos", () => {
  it("rejects a logo that cannot be loaded instead of silently exporting it", async () => {
    const previous = globalThis.Image;
    class BrokenImage {
      onerror?: () => void;
      set src(_value: string) { this.onerror?.(); }
    }
    vi.stubGlobal("Image", BrokenImage);
    try {
      await expect(renderCarouselSlide({} as HTMLCanvasElement, {
        id: "one", headline: "Try Canva", supporting: "A tool", direction: "Cover",
        logos: [{ name: "Canva", sourceUrl: "https://www.canva.com/", image: "/carousel-products/canva.png" }],
      }, 0, 2, { name: "Brand" })).rejects.toThrow("Canva logo could not be loaded");
    } finally { vi.stubGlobal("Image", previous); }
  });
});

it("reduces headline type to fit “something” intact beside the illustration", async () => {
  class ArtworkImage {
    naturalWidth = 1000;
    naturalHeight = 1000;
    onload?: () => void;
    set src(_value: string) { this.onload?.(); }
  }
  vi.stubGlobal("Image", ArtworkImage);
  const headline = "Give the answer something solid to stand on.";
  const drawn: { text: string; font: string; width: number }[] = [];
  const context = {
    font: "",
    fillRect: vi.fn(), drawImage: vi.fn(), save: vi.fn(), beginPath: vi.fn(),
    rect: vi.fn(), clip: vi.fn(), restore: vi.fn(),
    measureText(text: string) {
      return { width: (text === "something" ? 5 : text.length * 0.46) * Number(/(\d+)px/.exec(this.font)?.[1]) };
    },
    fillText(text: string) { drawn.push({ text, font: this.font, width: this.measureText(text).width }); },
  };
  try {
    await renderCarouselSlide({ getContext: () => context } as unknown as HTMLCanvasElement, {
      id: "third", headline, supporting: "Check the catalogue description and availability.", direction: "Illustrate the example.",
      design: { aspect: "portrait", treatment: "illustration", composition: "right", typeface: "sans", medium: "Pencil sketch", emphasis: "", accent: "#ef3434" },
    }, 2, 6, { name: "Brand" }, pixel);
    const title = drawn.filter(({ font }) => font.startsWith("700 ") && font !== "700 24px Arial");
    expect(title.map(({ text }) => text).join(" ")).toBe(headline);
    expect(title.find(({ text }) => text === "something")).toMatchObject({ width: 430, font: "700 86px Arial, sans-serif" });
    expect(title.every(({ width }) => width <= 430)).toBe(true);
  } finally {
    vi.unstubAllGlobals();
  }
});
