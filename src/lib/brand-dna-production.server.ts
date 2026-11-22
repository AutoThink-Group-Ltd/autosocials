import sharp from "sharp";
import { showcaseCopy } from "./brand-dna-copy";
import {
  autoTillInk,
  autoTillPaper,
  dnaDirection,
} from "./brand-dna-direction";
import { composeDesignedSocialTile } from "./social-tile-compose.server";
import {
  usesAutoTillShowcase,
  type BrandDna,
  type DnaAsset,
  type DnaTileKind,
} from "./brand-dna";
import { autoTillShowcase } from "./brand-dna-autotill.server";
import type { SocialDesign } from "./social-design";

const owned = (path: string, workspaceId: string) =>
  path.startsWith(`${workspaceId}/`) &&
  !path.includes("\\") &&
  !path.split("/").some((p) => !p || p === "." || p === "..");
const verified = (asset: DnaAsset, workspaceId: string) =>
  asset.reusable && !!asset.path && owned(asset.path, workspaceId);

export async function resolveDnaRenderFont(
  dna: BrandDna,
  read: (path: string) => Promise<Buffer>,
  workspaceId: string,
  role: "heading" | "body" = "heading",
  note?: (message: string) => void,
  requiredFamily?: string,
) {
  const preferred = dnaDirection(dna)[role];
  const font = requiredFamily
    ? [preferred, ...dna.fonts].find(
        (f) => f?.family.toLowerCase() === requiredFamily.toLowerCase(),
      )
    : preferred;
  const family = requiredFamily ?? font?.family;
  const weights = (font?.weights.match(/\b\d{2,4}\b/g) ?? []).map(Number);
  const target = role === "heading" ? 650 : 400;
  const weight =
    weights.length === 0
      ? target
      : weights.length === 2 && /^\d+ \d+$/.test(font?.weights ?? "")
        ? Math.max(weights[0]!, Math.min(target, weights[1]!))
        : weights.reduce((a, b) =>
            Math.abs(a - target) <= Math.abs(b - target) ? a : b,
          );
  const fontAsset = dna.assets.find(
    (a) =>
      a.id === font?.assetId && a.kind === "font" && verified(a, workspaceId),
  );
  let brandFont:
    | { bytes: Buffer; family: string; extension: string; weight: number }
    | undefined;
  if (fontAsset?.path && font) {
    const extension = fontAsset.path.split(".").pop()?.toLowerCase() ?? "";
    if (!/^(ttf|otf|woff|woff2)$/.test(extension))
      throw new Error("The saved Brand DNA font format is not supported.");
    brandFont = {
      bytes: await read(fontAsset.path),
      family: font.family,
      weight,
      extension,
    };
  } else if (family) {
    const hosted = await (
      await import("./composition.server")
    ).loadBrandFont(family.replace(/\s+Variable$/i, ""));
    const file =
      hosted?.files[
        role === "body" ? "fonts/brand-400.woff2" : "fonts/brand-700.woff2"
      ] ?? hosted?.files["fonts/brand-400.woff2"];
    if (!file && note) {
      note(
        "The source names " +
          family +
          ". A fallback typeface was used because its font file was unavailable.",
      );
      return undefined;
    }
    if (!file)
      throw new Error(
        "The identified Brand DNA font is unavailable for this tile.",
      );
    brandFont = {
      bytes: Buffer.from(file.base64, "base64"),
      family,
      weight,
      extension: "woff2",
    };
  }
  return brandFont;
}

/** A real, private-asset-backed example, using the same compositor as social tiles. */
export async function renderDnaTile(
  dna: BrandDna,
  kind: DnaTileKind,
  read: (path: string) => Promise<Buffer>,
  workspaceId: string,
  obtainArtwork?: (
    generate: () => Promise<Buffer>,
  ) => Promise<Buffer | undefined>,
  note: (message: string) => void = () => {},
  productionCopy?: { headline: string; supporting: string },
): Promise<Buffer> {
  const autoTill = usesAutoTillShowcase(dna);
  const artworks = dna.assets.filter(
    (a) =>
      verified(a, workspaceId) &&
      ["product", "portrait", "photo", "illustration"].includes(a.kind) &&
      !/app[\s_-]?store|google[\s_-]?play|play[\s_-]?badge|badge|favicon|\bicon\b|screen[\s_-]?(?:shot|cap)|website[\s_-]+preview/i.test(
        a.label + " " + a.source,
      ),
  );
  const artwork = artworks.length
    ? artworks[
        (["product", "promotional", "educational"] as const).indexOf(kind) %
          artworks.length
      ]
    : undefined;
  const selectedLogo = dna.assets.find(
    (a) => a.id === dna.logoId && a.kind === "logo" && verified(a, workspaceId),
  );
  const whiteLogo =
    autoTill &&
    dna.assets.find(
      (a) =>
        a.kind === "logo" &&
        /autotill-logo-white/i.test(a.label) &&
        verified(a, workspaceId),
    );
  const logo = whiteLogo || selectedLogo;
  let logoUrl: string | undefined;
  if (logo?.path && !logoUrl) {
    let mark = sharp(await read(logo.previewPath ?? logo.path), {
      limitInputPixels: 20_000_000,
    }).rotate();
    if (autoTill) {
      // Use the light official mark, or reverse the captured transparent monochrome mark.
      if (!whiteLogo && (await mark.metadata()).hasAlpha)
        mark = mark.greyscale().negate({ alpha: false });
      mark = mark.trim();
    }
    const png = await mark.png().toBuffer();
    logoUrl = `data:image/png;base64,${png.toString("base64")}`;
  }
  const campaign = autoTill
    ? await autoTillShowcase(dna, kind, read, (path) => owned(path, workspaceId))
    : undefined;
  const { headline, supporting, limitation } = campaign
    ? { ...campaign, limitation: undefined }
    : showcaseCopy(dna, kind);
  if (limitation) note(limitation);
  const palette = dnaDirection(dna);
  const brandedPalette =
    campaign && "background" in campaign ? campaign : undefined;
  const background =
      brandedPalette?.background ??
      (autoTill ? autoTillPaper : (palette.paper ?? "#ffffff")),
    ink =
      brandedPalette?.ink ??
      (autoTill ? autoTillInk : (palette.ink ?? "#171717"));
  const accent = brandedPalette?.accent ?? palette.accent ?? ink;
  const [brandFont, bodyFont] = await Promise.all([
    resolveDnaRenderFont(
      dna,
      read,
      workspaceId,
      "heading",
      note,
    ),
    resolveDnaRenderFont(
      dna,
      read,
      workspaceId,
      "body",
      note,
    ),
  ]);
  const referenceDirection = dna.visualLanguage
    .filter(
      ({ evidence }) =>
        evidence.confidence !== "low" &&
        ["observed", "confirmed", "corrected", "inferred"].includes(
          evidence.status,
        ) &&
        (evidence.status !== "inferred" ||
          /attached public homepage screenshot/i.test(evidence.note ?? "")),
    )
    .map(({ text }) => text.trim())
    .filter(Boolean)
    .join("; ")
    .slice(0, 800);
  const image = campaign
    ? campaign.artwork
    : artwork?.path
      ? await read(artwork.previewPath ?? artwork.path)
      : obtainArtwork && referenceDirection
        ? await obtainArtwork(async () => {
            const key = process.env["OPENAI_API_KEY"]?.trim();
            if (!key)
              throw new Error("Illustration generation is not configured.");
            const { requestSocialTileImage } =
              await import("./social-tile-image.server");
            const prompt = `Create one standalone, text-free visual asset for a ${kind} social graphic. Match the observed medium, contrast and use of colour. Do not draw a website, UI, mockup, lettering, logos, buttons, or a finished poster. Omit people and stock imagery. Leave a simple background. Reference palette: canvas ${background}, ink ${ink}, accent ${accent}. Visual direction: ${referenceDirection}. Do not depict an actual product, customer, location or claim.`;
            return Buffer.from(
              await requestSocialTileImage(prompt, workspaceId, key),
            );
          })
        : undefined;
  if (!image)
    note(
      "This type-led example uses the available brand wording and palette. No suitable source artwork was available. Review before using it as creative direction.",
    );
  else if (!artwork && !campaign)
    note(
      "This illustration was generated from the visual references. Review it against the brand before use.",
    );
  if (!logoUrl && !campaign)
    note("No verified wordmark was available for this example.");
  const copy = {
    headline: productionCopy?.headline ?? headline.slice(0, 150),
    supporting: productionCopy?.supporting ?? supporting.slice(0, 180),
    design: {
      aspect: "square",
      treatment: image ? "illustration" : "typography",
      composition: campaign ? "full" : kind === "product" ? "right" : "top",
      typeface: "sans",
      medium: "Brand artwork",
      paper: background,
      ink,
      accent,
      emphasis:
        kind === "promotional" && !campaign && !productionCopy
          ? (headline.split(/\s+/).slice(-1)[0] ?? "")
          : "",
    } satisfies SocialDesign,
  };
  const layout = campaign?.layout;
  // Keep campaign copy fully to the left of the verified portrait.
  const copyLayout = productionCopy && autoTill && kind === "product" && layout
    ? { ...layout, text: { ...layout.text, w: Math.min(layout.text.w, 390 - layout.text.x - 12) } }
    : layout;
  try {
    return await composeDesignedSocialTile(
      image,
      copy,
      logoUrl,
      brandFont,
      "contain",
      undefined,
      bodyFont,
      copyLayout,
    );
  } catch (error) {
    if (productionCopy || (!brandFont && !bodyFont)) throw error;
    const fallback = await composeDesignedSocialTile(
      image,
      copy,
      logoUrl,
      undefined,
      "contain",
      undefined,
      undefined,
      copyLayout,
    );
    note(
      "The selected typeface could not be rendered. This example uses a fallback typeface.",
    );
    return fallback;
  }
}
