import type { TilePlan } from "@/lib/social-tiles";

export function loadTileImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("An image could not be loaded."));
    img.src = src;
  });
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function cover(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  height: number,
) {
  const scale = Math.max(
    1000 / image.naturalWidth,
    height / image.naturalHeight,
  );
  const width = image.naturalWidth * scale,
    scaledHeight = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    (1000 - width) / 2,
    (height - scaledHeight) / 2,
    width,
    scaledHeight,
  );
}

/** Both the onscreen preview and exported PNG use this exact canvas. */
export function drawSocialTile(
  canvas: HTMLCanvasElement,
  plan: TilePlan,
  index: number,
  background: string,
  accent: string,
  image?: HTMLImageElement | null,
  logo?: HTMLImageElement | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image export is unavailable in this browser.");
  canvas.width = 1000;
  canvas.height = 1000;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, 1000, 1000);
  if (image) cover(ctx, image, 600);
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, 560);
  ctx.lineTo(1000, 495 + index * 12);
  ctx.lineTo(1000, 610 + index * 12);
  ctx.lineTo(0, 675);
  ctx.closePath();
  ctx.fill();
  // A dark panel keeps white copy readable even when a brand's selected colour is light.
  ctx.fillStyle = "#171717";
  ctx.beginPath();
  ctx.moveTo(0, 625);
  ctx.lineTo(1000, 560 + index * 12);
  ctx.lineTo(1000, 1000);
  ctx.lineTo(0, 1000);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  const tile = plan.tiles[index];
  if (!tile) throw new Error("Tile not found.");
  // Fit all text into the panel, leaving the logo area clear even for long copy.
  let titleSize = 56;
  let title: string[] = [];
  let supporting: string[] = [];
  let supportingSize = 30;
  do {
    ctx.font = `700 ${titleSize}px Arial`;
    title = wrap(ctx, tile.headline, 840);
    supportingSize = Math.max(20, Math.round(titleSize * 0.54));
    ctx.font = `${supportingSize}px Arial`;
    supporting = wrap(ctx, tile.supporting, 840);
    if (
      title.length * titleSize * 1.15 +
        supporting.length * supportingSize * 1.2 <=
      220
    )
      break;
    titleSize -= 2;
  } while (titleSize >= 24);
  ctx.font = `700 ${titleSize}px Arial`;
  title.forEach((line, i) =>
    ctx.fillText(line, 80, 675 + i * titleSize * 1.15, 840),
  );
  ctx.font = `${supportingSize}px Arial`;
  supporting.forEach((line, i) =>
    ctx.fillText(
      line,
      80,
      685 + title.length * titleSize * 1.15 + i * supportingSize * 1.2,
      840,
    ),
  );
  if (logo) {
    const scale = Math.min(180 / logo.naturalWidth, 50 / logo.naturalHeight);
    ctx.drawImage(
      logo,
      80,
      920,
      logo.naturalWidth * scale,
      logo.naturalHeight * scale,
    );
  } else {
    ctx.font = "700 26px Arial";
    ctx.fillText(plan.brand, 80, 930, 700);
  }
}
