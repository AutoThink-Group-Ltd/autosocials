import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { extractDocText, isReadableDoc } from "@/lib/doc-text";

describe("document text extraction", () => {
  it("reads Word paragraphs", async () => {
    const z = new JSZip();
    z.file("word/document.xml", '<w:document><w:body><w:p><w:r><w:t>Brand &amp; tone</w:t></w:r></w:p><w:p><w:r><w:t>Use navy</w:t></w:r></w:p></w:body></w:document>');
    const buf = await z.generateAsync({ type: "arraybuffer" });
    expect(await extractDocText("guide.docx", buf)).toBe("Brand & tone\nUse navy");
  });
  it("reads slides in order", async () => {
    const z = new JSZip();
    z.file("ppt/slides/slide2.xml", "<p:sld><a:p><a:r><a:t>Second</a:t></a:r></a:p></p:sld>");
    z.file("ppt/slides/slide1.xml", "<p:sld><a:p><a:r><a:t>First</a:t></a:r></a:p></p:sld>");
    const buf = await z.generateAsync({ type: "arraybuffer" });
    expect(await extractDocText("deck.pptx", buf)).toBe("Slide 1:\nFirst\n\nSlide 2:\nSecond");
  });
  it("knows which documents it can read", () => {
    expect(isReadableDoc("a.PDF")).toBe(true);
    expect(isReadableDoc("a.doc")).toBe(false);
  });
});
