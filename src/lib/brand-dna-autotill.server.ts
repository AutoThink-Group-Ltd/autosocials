import sharp from "sharp";
import type { BrandDna, DnaAsset, DnaTileKind } from "./brand-dna";
import type { TileEditorialLayout } from "./social-tile-compose.server";
import { autoTillPaper } from "./brand-dna-direction";
const wordmark = { left: 72, top: 61, width: 184, height: 45 };
const copy = {
  product: {
    headline: "Meet Tyson.",
    supporting: "Your AI website agent.",
    layout: {
      text: { x: 72, y: 324, w: 470, h: 370 },
      titleSize: 112,
      wordmark,
    },
  },
  promotional: {
    headline: "Turn clicks into\nconversations.",
    supporting: "",
    layout: {
      text: { x: 72, y: 178, w: 850, h: 315 },
      titleSize: 105,
      wordmark,
    },
  },
  educational: {
    headline: "Set the rules.",
    supporting: "Give Tyson clear boundaries.",
    layout: {
      labels: ["Catalogue", "Policies", "Permissions"].map((text, i) => ({
        text,
        centerX: 202 + 298 * i,
        y: 773,
        size: 29,
      })),
      text: { x: 72, y: 174, w: 850, h: 325 },
      titleSize: 112,
      wordmark,
    },
  },
} satisfies Record<
  DnaTileKind,
  { headline: string; supporting: string; layout: TileEditorialLayout }
>;

function svg(body: string) {
  return Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000">' +
      body +
      "</svg>",
  );
}

const bubbles = `<g fill="none" stroke="#e6e6e6" stroke-width="4">
  <path d="M420 732c-60 0-105-38-105-90s45-90 105-90h234c60 0 105 38 105 90s-45 90-105 90H481l-61 49z" />
  <path d="M560 855c-45 0-80-29-80-68m301-129c47 9 83 40 83 85s-36 79-83 79h-39v49l-56-49h-78" opacity=".45"/>
  <path d="M0 825h132l98-105h70M864 742h45l91-96" opacity=".24"/>
</g><g fill="#f5f5f5"><circle cx="478" cy="642" r="9"/><circle cx="537" cy="642" r="9"/><circle cx="596" cy="642" r="9"/></g>`;

const rules = `<g fill="#171717" stroke="#464646" stroke-width="2">
  <rect x="72" y="585" width="260" height="244" rx="30"/>
  <rect x="370" y="585" width="260" height="244" rx="30"/>
  <rect x="668" y="585" width="260" height="244" rx="30"/>
</g>
<g fill="none" stroke="#ededed" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M177 662l26-14 26 14v32l-26 15-26-15zM177 662l26 15 26-15m-26 15v32"/>
  <path d="M479 649h34l14 14v45h-48zM513 649v14h14m-38 13h27m-27 13h27"/>
  <path d="M779 667v-10a20 20 0 0 1 40 0v10m-48 0h56v41h-56z"/>
</g>`;

async function portraitLayer(bytes: Buffer) {
  const portrait = await sharp(bytes, { limitInputPixels: 20_000_000 })
    .rotate()
    .resize(610, 785, { fit: "cover", position: "attention" })
    .greyscale()
    .png()
    .toBuffer();
  const fade =
    Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="610" height="785">
    <defs><linearGradient id="side"><stop stop-color="#0d0d0d"/><stop offset=".45" stop-color="#0d0d0d" stop-opacity="0"/></linearGradient>
    <linearGradient id="edge" x2="0" y2="1"><stop stop-color="#0d0d0d"/><stop offset=".16" stop-color="#0d0d0d" stop-opacity="0"/><stop offset=".74" stop-color="#0d0d0d" stop-opacity="0"/><stop offset="1" stop-color="#0d0d0d"/></linearGradient></defs>
    <rect width="610" height="785" fill="url(#side)"/><rect width="610" height="785" fill="url(#edge)"/>
  </svg>`);
  return sharp(portrait)
    .composite([{ input: fade }])
    .png()
    .toBuffer();
}

/** The supplied source pack and public site identify this asset as the AutoTill product character. */
function isTysonPortrait(asset: DnaAsset) {
  if (!["portrait", "photo"].includes(asset.kind)) return false;
  const source = asset.source;
  if (
    /^public\/(?:avatars|media)\//.test(source) &&
    /\b(?:avatar-tyson|autotill-tyson-front-smile)/i.test(source)
  )
    return true;
  return /^https:\/\/(?:www\.)?autotill\.com\/avatars\/avatar-tyson\.png(?:\?|$)/i.test(
    source,
  );
}

export async function autoTillShowcase(
  dna: BrandDna,
  kind: DnaTileKind,
  read: (path: string) => Promise<Buffer>,
  owns: (path: string) => boolean,
) {
  const layers: sharp.OverlayOptions[] = [];
  const portrait =
    kind === "product"
      ? dna.assets.find(
          (asset) => asset.path && owns(asset.path) && isTysonPortrait(asset),
        )
      : undefined;
  if (portrait?.path) {
    const path = portrait.previewPath ?? portrait.path;
    if (owns(path))
      layers.push({
        input: await portraitLayer(await read(path)),
        left: 390,
        top: 173,
      });
  }
  const scene =
    kind === "educational"
      ? rules
      : kind === "promotional" || !layers.length
        ? bubbles
        : "";
  layers.push({
    input: svg(
      scene + '<path d="M72 914h856" stroke="#424242" stroke-width="2"/>',
    ),
  });
  const artwork = await sharp({
    create: {
      width: 1000,
      height: 1000,
      channels: 4,
      background: autoTillPaper,
    },
  })
    .composite(layers)
    .png()
    .toBuffer();
  return { ...copy[kind], artwork };
}
