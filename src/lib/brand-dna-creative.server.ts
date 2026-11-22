import sharp from "sharp";
import type { BrandDna } from "./brand-dna";
import {
  autoTillPaper,
  dnaDirection,
  socialTileDirection,
} from "./brand-dna-direction";
import { usesAutoTillShowcase } from "./brand-dna";
import {
  DNA_BUCKET,
  isOwnedDnaPath,
  readDnaBytes,
  type readProductionDna,
} from "./brand-dna-store.server";
import type { getAdminClient } from "./supabase-admin.server";

type Admin = ReturnType<typeof getAdminClient>;
export type ProductionDna = Awaited<ReturnType<typeof readProductionDna>>;
export async function creativeDnaLogo(
  admin: Admin,
  ws: string,
  dna: BrandDna,
  paper?: string,
) {
  const lightMark =
    paper?.toUpperCase() === autoTillPaper && usesAutoTillShowcase(dna);
  const white =
    lightMark &&
    dna.assets.find(
      (a) =>
        a.kind === "logo" &&
        a.reusable &&
        /autotill-logo-white/i.test(a.label) &&
        !!a.path &&
        isOwnedDnaPath(a.path, ws),
    );
  const asset =
    white ||
    dna.assets.find(
      (a) =>
        a.id === dna.logoId && a.reusable && ["logo", "icon"].includes(a.kind),
    );
  const path = asset?.previewPath ?? asset?.path;
  if (!path) return undefined;
  if (!isOwnedDnaPath(path, ws) || !/\.(?:webp|png|jpe?g|avif)$/i.test(path))
    return undefined;
  let mark = sharp(await readDnaBytes(admin, ws, path), {
    limitInputPixels: 20000000,
  });
  if (lightMark && !white && (await mark.metadata()).hasAlpha)
    mark = mark.greyscale().negate({ alpha: false });
  const b = await mark
    .resize({
      width: 640,
      height: 320,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer();
  return "data:image/png;base64," + b.toString("base64");
}
export async function canvasDna(
  admin: Admin,
  ws: string,
  version: ProductionDna,
  format: "tile" | "carousel" = "carousel",
) {
  if (!version) return null;
  const { dna } = version;
  const { heading, body, ...palette } =
    format === "tile" ? socialTileDirection(dna) : dnaDirection(dna);
  const faces = await Promise.all(
    [heading, body].map(async (f) => {
      if (!f) return null;
      const a = dna.assets.find(
        (a) => a.id === f.assetId && a.kind === "font" && a.reusable,
      );
      if (
        !a?.path ||
        !isOwnedDnaPath(a.path, ws) ||
        !/\.(ttf|otf|woff2?)$/i.test(a.path)
      ) {
        const font = await (
          await import("./composition.server")
        ).loadBrandFont(f.family);
        const bytes =
          font?.files[
            f === heading ? "fonts/brand-700.woff2" : "fonts/brand-400.woff2"
          ] ?? font?.files["fonts/brand-400.woff2"];
        return {
          family: f.family,
          url: bytes ? "data:font/woff2;base64," + bytes.base64 : null,
        };
      }
      const signed = await admin.storage
        .from(DNA_BUCKET)
        .createSignedUrl(a.path, 3600);
      if (signed.error)
        throw new Error("Could not open the selected brand font.");
      return { family: f.family, url: signed.data.signedUrl };
    }),
  );
  return {
    id: version.id,
    name: dna.name,
    ...palette,
    accentMark: null,
    heading: faces[0] ?? null,
    body: faces[1] ?? null,
    logo:
      (await creativeDnaLogo(
        admin,
        ws,
        dna,
        format === "tile" ? palette.paper : undefined,
      )) ?? null,
  };
}
