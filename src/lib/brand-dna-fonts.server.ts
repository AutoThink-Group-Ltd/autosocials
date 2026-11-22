import { dnaDirection } from "./brand-dna-direction";
import type { BrandDna, DnaSaveAsset } from "./brand-dna";

const generic =
  /^(?:serif|sans-serif|monospace|system-ui|ui-sans-serif|ui-serif|arial|helvetica|georgia|times new roman|verdana|tahoma|inherit|initial|unset)$/i;
const familyKey = (name: string) =>
  name
    .replace(/\s+variable$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

/** Save an official Google Fonts licence only when the family directory exposes one. */
async function licenceFor(slug: string) {
  for (const [folder, file] of [
    ["ofl", "OFL.txt"],
    ["apache", "LICENSE.txt"],
  ] as const) {
    const url = `https://raw.githubusercontent.com/google/fonts/main/${folder}/${slug}/${file}`;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        redirect: "error",
      });
      if (!response.ok || !response.body) continue;
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 60000) {
            await reader.cancel();
            throw new Error("Licence too large");
          }
          chunks.push(value);
        }
      } finally {
        reader.releaseLock();
      }
      const bytes = Buffer.concat(chunks),
        text = bytes.toString("utf8");
      if (
        folder === "ofl"
          ? !/SIL OPEN FONT LICENSE/i.test(text)
          : !/Apache License/i.test(text)
      )
        continue;
      return { bytes, url, file };
    } catch {
      /* Unavailable or unverified; try the other official licence. */
    }
  }
  return null;
}

/** Add a verifiable, licensed specimen for observed website type, without replacing package binaries. */
export async function enrichDnaFonts(
  dna: BrandDna,
  save: DnaSaveAsset,
): Promise<BrandDna> {
  if (dna.sourceKind !== "website") return dna;
  const direction = dnaDirection(dna),
    selected = [direction.heading, direction.body].filter(
      (x): x is NonNullable<typeof x> => !!x,
    );
  const result: BrandDna = {
    ...dna,
    fonts: dna.fonts.map((f) => ({ ...f, evidence: { ...f.evidence } })),
    assets: [...dna.assets],
  };
  const seen = new Set<string>();
  const licences = new Map<
    string,
    NonNullable<Awaited<ReturnType<typeof licenceFor>>>
  >();
  for (const face of selected) {
    const slug = familyKey(face.family),
      weight = face === direction.heading ? "700" : "400",
      key = `${slug}:${weight}`;
    if (
      face.evidence.status !== "observed" ||
      generic.test(face.family.trim()) ||
      !slug ||
      slug.length > 100 ||
      seen.has(key)
    )
      continue;
    seen.add(key);
    const same = result.fonts.filter(
      (f) =>
        familyKey(f.family) === slug &&
        f.evidence.status === "observed" &&
        f.role === face.role &&
        f.surface === face.surface,
    );
    const existing = same.find(
      (f) =>
        f.assetId &&
        result.assets.some(
          (a) => a.id === f.assetId && a.kind === "font" && !!a.path,
        ),
    );
    if (existing) {
      for (const f of same) if (!f.assetId) f.assetId = existing.assetId;
      continue;
    }
    try {
      const license = licences.get(slug) ?? (await licenceFor(slug));
      if (!license) continue;
      licences.set(slug, license);
      const { loadBrandFont } = await import("./composition.server");
      const loaded = await loadBrandFont(face.family);
      const entry =
        Object.entries(loaded?.files ?? {}).find(
          ([name]) => name === `fonts/brand-${weight}.woff2`,
        ) ?? Object.entries(loaded?.files ?? {})[0];
      if (!entry) continue;
      const [fontFile, item] = entry,
        actualWeight = /brand-(\d+)\.woff2$/.exec(fontFile)?.[1] ?? "regular";
      const existingWeight = result.assets.find(
        (a) =>
          a.id === `google-font:${slug}:${actualWeight}` &&
          a.kind === "font" &&
          a.path,
      );
      if (existingWeight) {
        for (const f of same) f.assetId = existingWeight.id;
        continue;
      }
      const bytes = Buffer.from(item.base64, "base64");
      if (!bytes.length || bytes.length > 5_000_000) continue;
      // fontkit checks the file and prevents a similarly named unrelated family being presented as a match.
      // @ts-expect-error fontkit has no bundled declarations
      const kit = await import("fontkit");
      const parsed = kit.create(bytes),
        actual = String(parsed.familyName ?? "");
      if (
        !actual ||
        familyKey(actual.replace(/\s+\d+(?:\.\d+)?pt$/i, "")) !== slug
      )
        continue;
      const path = await save(
        bytes,
        "font/woff2",
        `${slug}-${actualWeight}.woff2`,
      );
      const licenceId = `google-font-licence:${slug}`;
      const existingLicence = result.assets.find((a) => a.id === licenceId);
      const licencePath =
        existingLicence?.path ??
        (await save(license.bytes, "text/plain", license.file));
      const id = `google-font:${slug}:${actualWeight}`;
      result.assets.push({
        id,
        label: `${actual} font`,
        kind: "font",
        path,
        mime: "font/woff2",
        source: "Google Fonts",
        reusable: true,
        usage: `Open font licence: ${license.url}. The original website font file was not verified; this is a matching-family specimen.`,
        evidence: {
          source: license.url,
          status: "observed",
          confidence: "medium",
          note: "Matching Google Fonts family; original website binary not verified.",
        },
      });
      if (!existingLicence)
        result.assets.push({
          id: licenceId,
          label: `${actual} licence`,
          kind: "reference",
          path: licencePath,
          mime: "text/plain",
          source: license.url,
          reusable: false,
          evidence: {
            source: license.url,
            status: "observed",
            confidence: "high",
          },
        });
      for (const f of same) {
        f.assetId = id;
        f.evidence.note = [
          f.evidence.note,
          "Matching Google Fonts specimen; original website binary not verified.",
        ]
          .filter(Boolean)
          .join(" ");
      }
    } catch {
      /* A specimen is optional; the original observed finding remains visible. */
    }
  }
  return result;
}
