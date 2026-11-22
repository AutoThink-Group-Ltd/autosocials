import type { SocialDesign, QuoteEvidence } from "@/lib/social-design";
import {
  socialDesignPalette,
  socialDesignLines,
  socialDesignEmphasis,
} from "@/lib/social-design-layout";
import { loadTileImage } from "./social-tile-canvas";

type RenderInput = {
  headline: string;
  supporting: string;
  design: SocialDesign;
  quote?: QuoteEvidence;
  artworkUrl?: string;
  logoUrl?: string;
  brand?: string;
  dna?: import("./canvas-brand-dna").CanvasDna | undefined;
  footerHeight?: number;
};

/** Draws the same composition for preview and export. Copy is always drawn locally, never generated into the artwork. */
export async function renderSocialDesign(
  canvas: HTMLCanvasElement,
  input: RenderInput,
): Promise<void> {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser.");
  const {dna}=input;
  const design = dna?{...input.design,...(dna.ink?{ink:dna.ink}:{}),...(dna.accent?{accent:dna.accent}:{}),...(dna.paper?{paper:dna.paper}:{})}:input.design;
  const h = design.aspect === "portrait" ? 1250 : 1000;
  canvas.width = 1000;
  canvas.height = h;
  const { paper, ink } = socialDesignPalette(design);
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, 1000, h);
  const art =
    design.treatment === "illustration" && input.artworkUrl
      ? await loadTileImage(input.artworkUrl)
      : null;
  const artBox =
    design.composition === "top"
      ? { x: 0, y: 0, w: 1000, h: Math.round(h * 0.46) }
      : design.composition === "right"
        ? { x: 560, y: 0, w: 440, h }
        : { x: 0, y: 0, w: 1000, h };
  if (art) {
    const s = Math.max(
      artBox.w / art.naturalWidth,
      artBox.h / art.naturalHeight,
    );
    ctx.save();
    ctx.beginPath();
    ctx.rect(artBox.x, artBox.y, artBox.w, artBox.h);
    ctx.clip();
    ctx.drawImage(
      art,
      artBox.x + (artBox.w - art.naturalWidth * s) / 2,
      artBox.y + (artBox.h - art.naturalHeight * s) / 2,
      art.naturalWidth * s,
      art.naturalHeight * s,
    );
    ctx.restore();
  }
  const box =
    design.composition === "top" && art
      ? { x: 70, y: artBox.h + 55, w: 860, h: h - artBox.h - 150 }
      : design.composition === "right" && art
        ? { x: 65, y: 75, w: 430, h: h - 175 }
        : { x: 70, y: 90, w: 860, h: h - 200 };
  box.h = Math.max(
    100,
    Math.min(box.h, h - box.y - Math.max(100, input.footerHeight ?? 100)),
  );
  if (design.composition === "full" && art) {
    ctx.fillStyle = "rgba(0,0,0,0.78)";
    ctx.fillRect(box.x - 25, box.y - 25, box.w + 50, box.h + 50);
  }
  const accent = /^#[0-9a-f]{6}$/i.test(design.accent)
    ? design.accent
    : "#ffffff";
  if (dna?.accentMark === "line-and-dot") {
    const markY = box.y - 24;
    ctx.fillStyle = accent;
    ctx.fillRect(box.x, markY - 2, 51, 4);
    ctx.beginPath();
    ctx.arc(box.x + 51, markY, 8, 0, Math.PI * 2);
    ctx.fill();
  }
  const family = dna?.headingFamily ?? (design.typeface === "serif"
      ? "Georgia, serif"
      : design.typeface === "condensed"
        ? "Impact, sans-serif"
        : "Arial, sans-serif");
  const title = input.quote?.text || input.headline;
  const support = input.quote ? input.quote.speaker : input.supporting;
  const measure = (value: string) => ctx.measureText(value).width;

  let size = 92,
    headline: string[] = [],
    supporting: string[] = [],
    subSize = 30;
  for (;; size -= 2) {
    ctx.font = `700 ${size}px ${family}`;
    headline = socialDesignLines(title, box.w, measure);
    const titleFits = headline.every((line) => measure(line) <= box.w);
    subSize = Math.max(16, Math.round(size * 0.38));
    ctx.font = `${subSize}px ${dna?.bodyFamily??family}`;
    supporting = socialDesignLines(support, box.w, measure);
    if (
      size === 18 || (titleFits && supporting.every((line) => measure(line) <= box.w) &&
        headline.length * size * 1.12 + supporting.length * subSize * 1.3 + 40 <= box.h)
    )
      break;
  }
  ctx.textBaseline = "top";
  let y = box.y;
  ctx.font = `700 ${size}px ${family}`;
  const emphasis = socialDesignEmphasis(headline, design.emphasis);
  for (const [index, line] of headline.entries()) {
    // Highlight exact matched phrase only, retaining the original copy.
    const match = emphasis[index];
    if (match) {
      const before = line.slice(0, match.start),
        marked = line.slice(match.start, match.start + match.length),
        after = line.slice(match.start + match.length);
      const scale = Math.min(1, box.w / measure(line));
      const x = box.x + measure(before) * scale;
      ctx.fillStyle = accent;
      ctx.fillRect(
        x - 3,
        y + size * 0.78,
        measure(marked) * scale + 6,
        Math.max(4, size * 0.1),
      );
      ctx.fillStyle = design.composition === "full" && art ? "#ffffff" : ink;
      ctx.fillText(before + marked + after, box.x, y, box.w);
    } else {
      ctx.fillStyle = design.composition === "full" && art ? "#ffffff" : ink;
      ctx.fillText(line, box.x, y, box.w);
    }
    y += size * 1.12;
  }
  y += 24;
  ctx.font = `${subSize}px ${dna?.bodyFamily??family}`;
  ctx.fillStyle = design.composition === "full" && art ? "#ffffff" : ink;
  for (const line of supporting) {
    ctx.fillText(line, box.x, y, box.w);
    y += subSize * 1.3;
  }
  if (art && design.composition === "full") {
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(
      0,
      h - Math.max(100, input.footerHeight ?? 100),
      1000,
      Math.max(100, input.footerHeight ?? 100),
    );
  }
  const brandLogo=dna ? dna.logo : input.logoUrl;
  if (brandLogo) {
    const logo = await loadTileImage(brandLogo);
    const s = Math.min(180 / logo.naturalWidth, 55 / logo.naturalHeight);
    ctx.drawImage(
      logo,
      70,
      h - 80,
      logo.naturalWidth * s,
      logo.naturalHeight * s,
    );
  } else if (input.brand) {
    ctx.fillStyle = design.composition === "full" && art ? "#ffffff" : ink;
    ctx.font = "700 24px Arial";
    ctx.fillText(input.brand, 70, h - 65, 400);
  }
}
