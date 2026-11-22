import { PDFDocument } from "pdf-lib";

/** Create a PDF with one page per preview image in the supplied order. */
export async function createCarouselPdf(slideImages: Array<string | Uint8Array>, aspect: "square" | "portrait" = "square"): Promise<Uint8Array> {
  if (slideImages.length < 2 || slideImages.length > 6) throw new Error("A carousel needs between 2 and 6 finished slides.");
  const pdf = await PDFDocument.create({ updateMetadata: false });
  for (const image of slideImages) {
    const embedded = typeof image === "string" && image.startsWith("data:image/png;") ? await pdf.embedPng(image) : await pdf.embedJpg(image);
    const height = aspect === "portrait" ? 1250 : 1000;
    const page = pdf.addPage([1000, height]);
    page.drawImage(embedded, { x: 0, y: 0, width: 1000, height });
  }
  return pdf.save();
}
