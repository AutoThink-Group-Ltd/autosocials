import sharp from "sharp";

/** Convert the verified generated square to the tile size and preserve the actual brand logo. */
export async function composeSocialTile(
  background: Buffer,
  logoDataUrl?: string,
): Promise<Buffer> {
  let image = sharp(background, { limitInputPixels: 20_000_000 })
    .rotate()
    .resize(1000, 1000, { fit: "cover" });
  if (logoDataUrl) {
    const match =
      /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        logoDataUrl,
      );
    if (!match) throw new Error("The brand logo could not be verified.");
    const logo = await sharp(Buffer.from(match[1]!, "base64"), {
      limitInputPixels: 20_000_000,
    })
      .rotate()
      .resize({
        width: 190,
        height: 75,
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    const size = await sharp(logo).metadata();
    if (!size.width || !size.height)
      throw new Error("The brand logo could not be verified.");
    image = image.composite([
      { input: logo, left: 955 - size.width, top: 955 - size.height },
    ]);
  }
  return image.png().toBuffer();
}
import {
  socialDesignPalette,
  socialDesignEmphasis,
} from "./social-design-layout";
import type { SocialDesign, QuoteEvidence } from "./social-design";

type RenderFont = {
  bytes: Buffer;
  family: string;
  extension: string;
  weight?: number;
};
type Face = {
  unitsPerEm: number;
  layout: (text: string) => {
    glyphs: { path: { toSVG: () => string } }[];
    positions: { xAdvance: number; xOffset: number; yOffset: number }[];
    advanceWidth: number;
  };
  variationAxes?: Record<string, { min: number; max: number }>;
  getVariation?: (coords: Record<string, number>) => Face;
};
async function openFace(
  input: RenderFont | undefined,
): Promise<Face | undefined> {
  if (!input) return;
  // @ts-expect-error fontkit does not publish type declarations
  const { create } = await import("fontkit");
  const face: Face = create(input.bytes);
  if (!face?.unitsPerEm || typeof face.layout !== "function")
    throw new Error("The Brand DNA font could not be opened.");
  const axis = face.variationAxes?.["wght"];
  return input.weight && axis && face.getVariation
    ? face.getVariation({
        wght: Math.min(axis.max, Math.max(axis.min, input.weight)),
      })
    : face;
}
function measureFace(face: Face | undefined) {
  const cache = new Map<string, number>();
  return (text: string, size: number) => {
    let width = cache.get(text);
    if (width === undefined) {
      width = face
        ? face.layout(text).advanceWidth / face.unitsPerEm
        : Array.from(text).reduce(
            (n, c) =>
              n + (/[MW@%]/.test(c) ? 1.0 : /[il .,']/i.test(c) ? 0.35 : 0.68),
            0,
          );
      cache.set(text, width);
    }
    return width * size;
  };
}
function wholeWordLines(
  text: string,
  width: number,
  size: number,
  measure: (line: string, size: number) => number,
) {
  return text.split("\n").flatMap((p) => {
    if (!p.trim()) return [""];
    const lines: string[] = [];
    let current = "";
    for (const word of p.trim().split(/\s+/)) {
      const candidate = current ? current + " " + word : word;
      if (current && measure(candidate, size) > width) {
        lines.push(current);
        current = word;
      } else current = candidate;
    }
    if (current) lines.push(current);
    return lines;
  });
}
export type TileEditorialLayout = {
  text: { x: number; y: number; w: number; h: number };
  titleSize: number;
  labels?: {
    text: string;
    centerX: number;
    y: number;
    size: number;
    color?: string;
  }[];
  wordmark?: { left: number; top: number; width: number; height: number };
};

type DesignCopy = {
  headline: string;
  supporting: string;
  design: SocialDesign;
  quote?: QuoteEvidence;
};
const escapeXml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
/** Deterministic server-side copy layer. Artwork and copy occupy separate zones unless full-bleed. */
export async function composeDesignedSocialTile(
  background: Buffer | undefined,
  copy: DesignCopy,
  logoDataUrl?: string,
  brandFont?: RenderFont,
  artFit: "contain" | "cover" = "cover",
  logoPaper?: string,
  bodyFont?: RenderFont,
  editorial?: TileEditorialLayout,
): Promise<Buffer> {
  const { design } = copy,
    { paper, ink } = socialDesignPalette(design),
    height = design.aspect === "portrait" ? 1250 : 1000;
  const art = !!background && design.treatment === "illustration";
  // A full-bleed image can contain details anywhere. Reserve a separate area for
  // approved copy so it cannot be obscured by the artwork.
  const separateFullArt = art && design.composition === "full" && !editorial;
  const artBox =
    design.composition === "top" || separateFullArt
      ? { left: 0, top: 0, width: 1000, height: Math.round(height * 0.46) }
      : design.composition === "right"
        ? { left: 560, top: 0, width: 440, height }
        : { left: 0, top: 0, width: 1000, height };
  const box =
    editorial?.text ??
    (art && (design.composition === "top" || separateFullArt)
      ? {
          x: 70,
          y: artBox.height + 55,
          w: 860,
          h: height - artBox.height - 185,
        }
      : art && design.composition === "right"
        ? { x: 65, y: 75, w: 430, h: height - 200 }
        : { x: 70, y: 90, w: 860, h: height - 200 });
  const layers: sharp.OverlayOptions[] = [];
  if (art)
    layers.push({
      input: await sharp(background!, { limitInputPixels: 20_000_000 })
        .rotate()
        .resize(artBox.width, artBox.height, {
          fit: artFit,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        })
        .png()
        .toBuffer(),
      left: artBox.left,
      top: artBox.top,
    });
  const title = copy.quote?.text || copy.headline;
  const support = copy.quote ? copy.quote.speaker : copy.supporting;
  const family =
    design.typeface === "serif"
      ? "serif"
      : design.typeface === "condensed"
        ? "sans-serif-condensed"
        : "sans-serif";

  let size = editorial?.titleSize ?? 92,
    titleLines: string[] = [],
    supportLines: string[] = [],
    sub = 30;
  const brandFace = await openFace(brandFont),
    bodyFace = bodyFont ? await openFace(bodyFont) : brandFace;
  const headingWidth = measureFace(brandFace),
    bodyWidth = measureFace(bodyFace);
  const usableWidth = box.w * 0.96;
  let fits = false;
  for (; size >= 18; size -= 2) {
    sub = Math.max(16, Math.round(size * 0.38));
    titleLines = wholeWordLines(title, usableWidth, size, headingWidth);
    supportLines = support.split(/\r?\n/).flatMap((line) =>
      wholeWordLines(line, usableWidth, sub, bodyWidth),
    );
    if (
      titleLines.length * size * 1.12 + supportLines.length * sub * 1.3 + 40 <=
        box.h &&
      titleLines.every((l) => headingWidth(l, size) <= usableWidth) &&
      supportLines.every((l) => bodyWidth(l, sub) <= usableWidth)
    ) {
      fits = true;
      break;
    }
  }
  if (!fits) throw new Error("The tile copy does not fit without breaking words or overlapping. Shorten the copy and try again.");
  const accent = /^#[0-9a-f]{6}$/i.test(design.accent)
    ? design.accent
    : "#ffffff";
  let y = box.y + size;
  const elements: string[] = [];
  // Draw glyph outlines from the supplied font bytes. This makes the exported image
  // independent of fonts installed on the render host and prevents silent substitution.
  const drawFont = (
    line: string,
    px: number,
    baseline: number,
    color: string,
    face = brandFace,
    left = box.x,
  ) => {
    if (!face || !line.trim()) return;
    const run = face.layout(line),
      baseScale = px / face.unitsPerEm;
    const scale = Math.min(baseScale, box.w / Math.max(1, run.advanceWidth));
    let x = left;
    for (const [i, glyph] of run.glyphs.entries()) {
      const pos = run.positions[i]!;
      elements.push(
        `<path d="${glyph.path.toSVG()}" fill="${color}" transform="translate(${x + pos.xOffset * scale} ${baseline - pos.yOffset * scale}) scale(${scale} ${-scale})"/>`,
      );
      x += pos.xAdvance * scale;
    }
  };
  const emphasis = socialDesignEmphasis(titleLines, design.emphasis);
  for (const [index, line] of titleLines.entries()) {
    const match = emphasis[index];
    if (match)
      elements.push(
        `<rect x="${box.x + headingWidth(line.slice(0, match.start), size)}" y="${y + size * 0.21}" width="${headingWidth(line.slice(match.start, match.start + match.length), size)}" height="${Math.max(3, size * 0.045)}" fill="${accent}"/>`,
      );
    if (brandFont)
      drawFont(
        line,
        size,
        y,
        ink,
      );
    else
      elements.push(
        `<text x="${box.x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="700" fill="${ink}">${escapeXml(line)}</text>`,
      );
    y += size * 1.12;
  }
  y -= size * 1.12;
  y += size * 0.25 + 16 + sub;
  for (const line of supportLines) {
    if (bodyFace)
      drawFont(
        line,
        sub,
        y,
        ink,
        bodyFace,
      );
    else
      elements.push(
        `<text x="${box.x}" y="${y}" font-family="${family}" font-size="${sub}" fill="${ink}">${escapeXml(line)}</text>`,
      );
    y += sub * 1.3;
  }
  // Verify the actual rasterized glyphs too. A fallback font can be wider
  // than its estimated advances even when all the planned lines fit.
  const copySvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}">${elements.join("")}</svg>`,
  );
  const copyLayer = await sharp(copySvg).png().toBuffer();
  const { info: bounds } = await sharp(copyLayer).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const left = -(bounds.trimOffsetLeft ?? 0);
  const top = -(bounds.trimOffsetTop ?? 0);
  // Allow ink overhang at the origin (italics and punctuation), inside the gutter.
  if (left < box.x - 8 || top < box.y - 8 ||
      left + bounds.width > box.x + box.w + 2 || top + bounds.height > box.y + box.h + 2) {
    throw new Error("Rendered text extends outside the tile copy area.");
  }
  layers.push({ input: copyLayer, left: 0, top: 0 });
  elements.length = 0;
  for (const { text, centerX, y, size, color = ink } of editorial?.labels ??
    []) {
    if (bodyFace) {
      drawFont(
        text,
        size,
        y,
        color,
        bodyFace,
        centerX - bodyWidth(text, size) / 2,
      );
    } else {
      elements.push(
        `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="${family}" font-size="${size}" fill="${color}">${escapeXml(text)}</text>`,
      );
    }
  }
  if (elements.length) layers.push({
    input: Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="${height}">${elements.join("")}</svg>`,
    ),
    left: 0,
    top: 0,
  });
  if (logoDataUrl) {
    const match =
      /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(
        logoDataUrl,
      );
    if (!match) throw new Error("The brand logo could not be verified.");
    const logo = await sharp(Buffer.from(match[1]!, "base64"), {
      limitInputPixels: 20_000_000,
    })
      .rotate()
      .resize({
        width: editorial?.wordmark?.width ?? 180,
        height: editorial?.wordmark?.height ?? 55,
        fit: "inside",
      })
      .png()
      .toBuffer();
    if (logoPaper && /^#[a-f0-9]{6}$/i.test(logoPaper)) {
      const { width, height: lh } = await sharp(logo).metadata();
      layers.push({
        input: await sharp({
          create: {
            width: (width ?? 180) + 24,
            height: (lh ?? 55) + 12,
            channels: 4,
            background: logoPaper,
          },
        })
          .png()
          .toBuffer(),
        left: 58,
        top: height - 86,
      });
    }
    layers.push({
      input: logo,
      left: editorial?.wordmark?.left ?? 70,
      top: editorial?.wordmark?.top ?? height - 80,
    });
  }
  return sharp({
    create: { width: 1000, height, channels: 4, background: paper },
  })
    .composite(layers)
    .png()
    .toBuffer();
}
