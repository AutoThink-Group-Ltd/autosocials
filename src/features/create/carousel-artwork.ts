import { createCarouselPdf } from "@/lib/carousel-pdf";
export { createCarouselPdf } from "@/lib/carousel-pdf";
import { renderSocialDesign } from "@/features/create/render-social-design";
import { carouselMentionsProduct, type CarouselSlide } from "@/lib/linkedin-carousel";
import { socialDesignLines } from "@/lib/social-design-layout";
export type { CarouselSlide } from "@/lib/linkedin-carousel";
export type CarouselBrand = { dna?: import("./canvas-brand-dna").CanvasDna | undefined; name: string; primaryColor?: string; accentColor?: string };

const SIZE = 1000;
const DARK = "#161719";
const PAPER = "#f5f2eb";

function color(value: string | undefined, fallback: string): string {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function luminance(hex: string): number {
  const components = [1, 3, 5].map((offset) => {
    const channel = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * components[0]! + 0.7152 * components[1]! + 0.0722 * components[2]!;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, weight: number, maxWidth: number, maxHeight: number, startSize: number, family="Arial, sans-serif") {
  let size = startSize;
  let lines: string[] = [];
  const measure = (value: string) => ctx.measureText(value).width;
  while (true) {
    ctx.font = `${weight} ${size}px ${family}`;
    lines = socialDesignLines(text.trim(), maxWidth, measure);
    if (size === 12 || (lines.length * size * 1.16 <= maxHeight && lines.every((line) => measure(line) <= maxWidth))) break;
    size = Math.max(12, size - 2);
  }
  return { lines, size, lineHeight: size * 1.16 };
}

function drawLines(ctx: CanvasRenderingContext2D, lines: string[], x: number, y: number, lineHeight: number, maxWidth: number) {
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight, maxWidth));
}

function loadLogo(image: string, name: string): Promise<HTMLImageElement> {
  if (!/^\/carousel-products\/[a-z0-9][a-z0-9._/-]*\.(?:png|jpe?g|webp)$/i.test(image) &&
      !/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(image)) {
    return Promise.reject(new Error(`The ${name} logo has an unsupported image source.`));
  }
  return new Promise((resolve, reject) => {
    const logo = new Image();
    logo.onload = () => logo.naturalWidth && logo.naturalHeight ? resolve(logo) : reject(new Error(`The ${name} logo could not be decoded.`));
    logo.onerror = () => reject(new Error(`The ${name} logo could not be loaded.`));
    logo.src = image;
  });
}

/** Draw the exact square artwork used for both the preview and PDF. */
export async function renderCarouselSlide(canvas: HTMLCanvasElement, slide: CarouselSlide, index: number, total: number, brand: CarouselBrand, artworkUrl?: string, logoUrl?: string): Promise<void> {
  const logos = (slide.logos ?? []).filter((logo) => carouselMentionsProduct(slide, logo.name));
  const images = await Promise.all(logos.map((logo) => loadLogo(logo.image, logo.name)));
  if (slide.design) {
    await renderSocialDesign(canvas, { headline: slide.headline, supporting: slide.supporting, design: slide.design, ...(slide.quote ? { quote: slide.quote } : {}), ...(artworkUrl ? { artworkUrl } : {}), ...(logoUrl ? { logoUrl } : {}), brand: brand.name, dna:brand.dna, ...(images.length ? { footerHeight: 180 } : {}) });
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Carousel artwork is unavailable in this browser.");
    const width = canvas.width / Math.max(images.length, 1);
    images.forEach((image, i) => {
      const scale = Math.min((width - 24) / image.naturalWidth, 54 / image.naturalHeight);
      const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
      const x = i * width + (width - w) / 2, y = canvas.height - 170;
      context.fillStyle = "#ffffff";
      context.fillRect(i * width + 8, y - 8, width - 16, 70);
      context.drawImage(image, x, y + (54 - h) / 2, w, h);
    });
    return;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Carousel artwork is unavailable in this browser.");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const primary = color(brand.primaryColor, DARK);
  const accent = color(brand.accentColor, "#d0f36a");
  const darkBackground = index === 0 || index === total - 1;
  const background = darkBackground && luminance(primary) < 0.18 ? primary : darkBackground ? brand.dna?.ink??DARK : brand.dna?.paper??PAPER;
  const foreground = darkBackground ? "#ffffff" : DARK;
  const accentText = luminance(accent) > 0.42 ? DARK : "#ffffff";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.textBaseline = "top";

  ctx.fillStyle = foreground;
  ctx.font = "700 25px Arial, sans-serif";
  ctx.fillText((brand.name || "").toUpperCase(), 72, 70, 700);
  ctx.textAlign = "right";
  ctx.font = "700 23px Arial, sans-serif";
  ctx.fillText(`${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`, 928, 70);
  ctx.textAlign = "left";

  const direction = slide.direction.toLowerCase();
  const example = /example|case|illustrat|before|after|comparison|contrast/.test(direction);
  const steps = /step|process|sequence|number|list|framework/.test(direction);
  const layout = index === 0 ? "cover" : index === total - 1 ? "takeaway" : example ? "example" : steps ? "steps" : index % 2 ? "steps" : "example";
  ctx.fillStyle = accent;
  if (layout === "cover") ctx.fillRect(72, 165, 105, 10);
  if (layout === "takeaway") ctx.fillRect(0, 0, SIZE, 15);
  if (layout === "steps") {
    ctx.fillRect(72, 185, 12, 535);
    ctx.font = "700 100px Arial, sans-serif";
    ctx.fillText(String(index).padStart(2, "0"), 112, 175);
  }
  if (layout === "example") {
    ctx.fillRect(72, 180, 856, 8);
    ctx.fillRect(72, 532, 856, 265);
  }

  const x = layout === "steps" ? 112 : 72;
  const width = 928 - x;
  const headlineTop = layout === "steps" ? 310 : 225;
  const title = fitText(ctx, slide.headline, 700, width, layout === "steps" ? 260 : 270, index === 0 ? 92 : 78, brand.dna?.headingFamily);
  ctx.fillStyle = foreground;
  ctx.font = `700 ${title.size}px ${brand.dna?.headingFamily??"Arial, sans-serif"}`;
  drawLines(ctx, title.lines, x, headlineTop, title.lineHeight, width);

  const bodyX = layout === "example" ? 112 : x;
  const bodyWidth = layout === "example" ? 776 : width;
  const bodyTop = layout === "example" ? 575 : Math.max(600, headlineTop + title.lines.length * title.lineHeight + 40);
  const body = fitText(ctx, slide.supporting, 400, bodyWidth, 775 - bodyTop, 38, brand.dna?.bodyFamily);
  ctx.fillStyle = layout === "example" ? accentText : foreground;
  ctx.font = `400 ${body.size}px ${brand.dna?.bodyFamily??"Arial, sans-serif"}`;
  drawLines(ctx, body.lines, bodyX, bodyTop, body.lineHeight, bodyWidth);
  if (images.length) {
    const gap = 12;
    const tileWidth = (856 - gap * (images.length - 1)) / images.length;
    images.forEach((image, i) => {
      const left = 72 + i * (tileWidth + gap);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(left, 810, tileWidth, 70);
      // Icon-only marks need a product name alongside them on comparison slides.
      const label = image.naturalWidth / image.naturalHeight < 1.8 ? logos[i]?.name : undefined;
      ctx.font = "600 25px Arial, sans-serif";
      const labelWidth = label ? Math.min(tileWidth - 88, ctx.measureText(label).width) : 0;
      const gapAfterIcon = label ? 10 : 0;
      const scale = Math.min((tileWidth - 16 - labelWidth - gapAfterIcon) / image.naturalWidth, 54 / image.naturalHeight);
      const width = image.naturalWidth * scale;
      const height = image.naturalHeight * scale;
      const imageX = left + (tileWidth - width - gapAfterIcon - labelWidth) / 2;
      ctx.drawImage(image, imageX, 810 + (70 - height) / 2, width, height);
      if (label) {
        ctx.fillStyle = DARK;
        ctx.fillText(label, imageX + width + gapAfterIcon, 832, labelWidth);
      }
    });
  }
  ctx.fillStyle = accent;
  ctx.fillRect(72, 900, 856 * ((index + 1) / total), 5);
}

export async function exportCarouselPdf(slideImages: string[], filename = "linkedin-carousel.pdf", aspect: "square" | "portrait" = "square"): Promise<void> {
  const bytes = await createCarouselPdf(slideImages, aspect);
  const blob = new Blob([new Uint8Array(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
