// Pulls readable text out of PDFs, Word (.docx) and slides (.pptx). Worker-safe.
import { extOf } from "./brand-files";

export const READABLE_DOCS = ["pdf", "docx", "pptx"];
export const isReadableDoc = (name: string) => READABLE_DOCS.includes(extOf(name));

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** Text runs from Office XML: paragraphs become new lines. */
export function officeXmlText(xml: string) {
  return decode(xml.replace(/<\/(w|a):p>/g, "\n").replace(/<(w:tab|w:br)\/>/g, " ").replace(/<[^>]+>/g, ""))
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

export async function extractDocText(name: string, buf: ArrayBuffer, max = 50000): Promise<string> {
  const ext = extOf(name);
  if (ext === "pdf") {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await extractText(pdf, { mergePages: true });
    return (Array.isArray(text) ? text.join("\n") : text).replace(/[ \t]+/g, " ").trim().slice(0, max);
  }
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(buf);
  if (ext === "docx") {
    const f = zip.file("word/document.xml");
    return f ? officeXmlText(await f.async("string")).slice(0, max) : "";
  }
  if (ext === "pptx") {
    const slides = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    const out: string[] = [];
    for (const [i, p] of slides.entries()) out.push(`Slide ${i + 1}:\n${officeXmlText(await zip.file(p)!.async("string"))}`);
    return out.join("\n\n").slice(0, max);
  }
  return "";
}
