/* eslint-disable @typescript-eslint/no-explicit-any -- Source package schemas are intentionally heterogeneous and retained verbatim. */
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  classifyPackageAsset,
  manifestIndex,
  normalisePackage,
} from "./brand-dna-package-records.server";
import sharp from "sharp";
import type {
  BrandDna,
  DnaAsset,
  DnaEvidence,
  DnaSaveAsset,
  DnaStatement,
} from "./brand-dna";

const mime = (name: string) =>
  (
    ({
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      svg: "image/svg+xml",
      gif: "image/gif",
      woff2: "font/woff2",
      woff: "font/woff",
      ttf: "font/ttf",
      otf: "font/otf",
      webm: "video/webm",
      mp4: "video/mp4",
      mp3: "audio/mpeg",
      json: "application/json",
      md: "text/markdown",
      txt: "text/plain",
    }) as Record<string, string>
  )[name.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
const obj = (x: unknown): Record<string, any> =>
  x && typeof x === "object" && !Array.isArray(x)
    ? (x as Record<string, any>)
    : {};
const string = (x: unknown) => (typeof x === "string" ? x : "");
const arr = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const ev = (source: string, note?: string): DnaEvidence => ({
  source,
  status: "observed",
  confidence: "high",
  ...(note ? { note } : {}),
});
const statements = (value: unknown, source: string): DnaStatement[] =>
  (Array.isArray(value) ? value : [value])
    .filter((v): v is string => typeof v === "string" && !!v.trim())
    .map((text) => ({ text, evidence: ev(source) }));
function kind(name: string): DnaAsset["kind"] {
  const n = name.toLowerCase();
  if (/logo|wordmark|lockup/.test(n)) return "logo";
  if (/icon|favicon/.test(n)) return "icon";
  if (/\.woff2?$|\.ttf$|\.otf$/.test(n)) return "font";
  if (/\.webm$|\.mp4$/.test(n)) return "video";
  if (/portrait|avatar|presenter/.test(n)) return "portrait";
  if (
    /screenshot|capture|visual.reference|homepage|planner.desktop|planner.mobile/.test(
      n,
    )
  )
    return "screenshot";
  if (/illustration|\.svg$/.test(n)) return "illustration";
  if (/product/.test(n)) return "product";
  if (/\.jpe?g$|\.png$|\.webp$/.test(n)) return "photo";
  return "other";
}
/** Import source packages without treating editorial suggestions as verified facts. */
export async function importDnaPackage(
  bytes: Buffer,
  save: DnaSaveAsset,
): Promise<BrandDna> {
  if (bytes.length > 100 * 1024 * 1024)
    throw new Error("Brand DNA package exceeds 100 MB.");
  const zip = await JSZip.loadAsync(bytes, { checkCRC32: false });
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > 1000)
    throw new Error("Brand DNA package has too many files.");
  let total = 0;
  for (const f of entries) {
    const original =
      (f as typeof f & { unsafeOriginalName?: string }).unsafeOriginalName ??
      f.name;
    if (
      original !== f.name ||
      original.startsWith("/") ||
      original.includes("\\") ||
      original.split("/").some((p) => p === "..")
    )
      throw new Error("Unsafe package path.");
    const size = (f as any)._data?.uncompressedSize;
    if (
      !Number.isSafeInteger(size) ||
      size < 0 ||
      size > 25 * 1024 * 1024 ||
      (total += size) > 200 * 1024 * 1024
    )
      throw new Error("Brand DNA package exceeds extraction limits.");
  }
  // Enforce limits while inflating as well as against archive metadata.
  let inflatedTotal = 0;
  const readEntry = async (file: JSZip.JSZipObject): Promise<Buffer> => {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      const stream = file.nodeStream("nodebuffer") as Readable;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.length;
        inflatedTotal += chunk.length;
        if (size > 25 * 1024 * 1024 || inflatedTotal > 200 * 1024 * 1024) {
          stream.destroy();
          reject(new Error("Brand DNA package exceeds extraction limits."));
          return;
        }
        chunks.push(chunk);
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(Buffer.concat(chunks)));
    });
  };
  const brandFile = zip.file("brand.json");
  if (!brandFile) throw new Error("This package does not contain brand.json.");
  let raw: Record<string, any>;
  let brandBytes: Buffer;
  try {
    brandBytes = await readEntry(brandFile);
    raw = obj(JSON.parse(brandBytes.toString("utf8")));
  } catch {
    throw new Error("The package brand.json is invalid.");
  }
  if (!Object.keys(raw).length)
    throw new Error("The package brand.json is empty.");
  const auto = obj(raw["autoSocials"]),
    p = obj(
      auto["profileReference"] ??
        auto["profileFields"] ??
        raw["autosocials_profile"] ??
        raw["profile"],
    );
  const documents = new Map<string, Buffer>([["brand.json", brandBytes]]);
  for (const name of [
    "brand-assets/manifest.json",
    "brand-evidence.json",
    "brand.md",
  ]) {
    const file = zip.file(name);
    if (!file)
      throw new Error("The reference package is missing " + name + ".");
    documents.set(name, await readEntry(file));
  }
  const manifest: unknown = JSON.parse(
    documents.get("brand-assets/manifest.json")!.toString("utf8"),
  );
  const ledger: unknown = JSON.parse(
    documents.get("brand-evidence.json")!.toString("utf8"),
  );
  const records = manifestIndex(manifest, new Set(entries.map((f) => f.name)));
  const licences = new Set<string>();
  for (const f of entries.filter((f) =>
    /\/fonts\/.*(?:license|ofl)(?:\.txt)?$/i.test(f.name),
  )) {
    const contents = await readEntry(f);
    documents.set(f.name, contents);
    if (/SIL OPEN FONT LICENSE/i.test(contents.toString("utf8")))
      licences.add(
        f.name.toLowerCase().replace(/(?:[-/]license|\/ofl)(?:\.txt)?$/i, ""),
      );
  }
  const rules = arr(raw["identity_rules"]).map(obj);
  const rule = (key: string) => rules.find((x) => x["key"] === key)?.["value"];
  const findings = arr(raw["marketing_findings"]).map(obj);
  const website = string(
    raw["website"] ||
      raw["sourceUrl"] ||
      obj(raw["snapshot"])["website"] ||
      obj(p["palette"])["source_url"],
  );
  const dna: BrandDna = {
    schemaVersion: 1,
    name: string(p["name"] || raw["name"] || rule("identity.name")),
    website,
    sourceKind: "package",
    description: string(
      p["what_it_is"] ||
        findings.find(
          (x) =>
            x["area"] === "positioning" &&
            String(x["status"]).toLowerCase() === "verified",
        )?.["finding"],
    ),
    personality: [],
    colours: [],
    fonts: [],
    assets: [],
    voice: [],
    messages: [],
    examples: [],
    offerings: [],
    visualLanguage: [],
    gaps: [],
    sourceFiles: [],
  };
  const palette = obj(p["palette"]);
  const swatches = arr(p["colours"]).length
    ? arr(p["colours"])
    : arr(palette["swatches"]);
  for (const colour of swatches)
    if (typeof colour === "string" && /^#[0-9a-f]{6}$/i.test(colour)) {
      const role =
        ["primary", "accent", "background", "text"].find(
          (k) => string(palette[k]).toLowerCase() === colour.toLowerCase(),
        ) ?? "swatch";
      dna.colours.push({
        role,
        hex: colour,
        surface: "profile projection",
        evidence: ev(
          "brand.json",
          "Source profile mapping; preserve source context.",
        ),
      });
    }
  if (!dna.colours.length)
    for (const c of arr(obj(obj(raw["design_system"])["themes"])["root"]).map(
      obj,
    ))
      if (/^#[0-9a-f]{6}$/i.test(string(c["hex_rounded"])))
        dna.colours.push({
          role: string(c["name"]),
          hex: c["hex_rounded"],
          surface: "root",
          original: string(c["hsl"]),
          evidence: ev(string(c["source"]) || "brand.json"),
        });
  for (const f of arr(p["fonts"]))
    if (typeof f === "string")
      dna.fonts.push({
        role: "unspecified",
        family: f,
        weights: "",
        surface: "profile projection",
        evidence: ev("brand.json"),
      });

  dna.personality = arr(
    obj(obj(raw["identity"])["personality_brief"])["value"],
  ).filter((x): x is string => typeof x === "string");
  dna.voice.push(
    ...statements(p["tone"], "brand.json"),
    ...statements(
      rule("voice.merchant"),
      "brand.json identity_rules.voice.merchant",
    ),
    ...statements(
      rule("voice.external"),
      "brand.json identity_rules.voice.external",
    ),
  );
  dna.messages.push(
    ...statements(
      p["approved_claims"],
      "brand.json: source copy; approval not established",
    ),
    ...statements(
      rule("identity.tagline"),
      "brand.json identity_rules.identity.tagline",
    ),
  );
  dna.visualLanguage.push(
    ...statements(
      rule("art_direction.frame"),
      "brand.json identity_rules.art_direction.frame",
    ),
  );
  dna.gaps = arr(p["gaps"] ?? raw["gaps"]).filter(
    (x): x is string => typeof x === "string",
  );
  if (!dna.description)
    dna.gaps.push(
      "A concise brand description was not supplied in the package profile.",
    );
  for (const f of entries) {
    const data = documents.get(f.name) ?? (await readEntry(f));
    const descriptor = records.get(f.name);
    if (
      descriptor &&
      createHash("sha256").update(data).digest("hex") !== descriptor["sha256"]
    )
      throw new Error("A brand asset does not match its source manifest.");
    const type = mime(f.name);
    const path = await save(data, type, f.name);
    if (
      !f.name.startsWith("brand-assets/") ||
      f.name.endsWith("manifest.json")
    ) {
      dna.sourceFiles!.push({ name: f.name, path });
      continue;
    }
    const k = kind(f.name);
    let previewPath: string | undefined;
    if (
      type === "image/svg+xml" &&
      !/<!(?:DOCTYPE|ENTITY)|<(?:script|foreignObject)\b|(?:href|src)\s*=\s*["'](?!#)|url\(\s*["']?(?:https?:|file:|\/\/)/i.test(
        data.toString("utf8"),
      )
    ) {
      try {
        const png = await sharp(data, { limitInputPixels: 40_000_000 })
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
        previewPath = await save(png, "image/png", `${f.name}.preview.png`);
      } catch {
        /* Keep the source even when it cannot be rendered safely. */
      }
    } else if (
      ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type)
    ) {
      try {
        const png = await sharp(data, {
          limitInputPixels: 40_000_000,
          animated: false,
        })
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .png()
          .toBuffer();
        previewPath = await save(png, "image/png", `${f.name}.preview.png`);
      } catch {
        /* keep original */
      }
    }
    const asset: DnaAsset = {
      id: f.name,
      label: f.name.split("/").pop() || f.name,
      kind: k,
      path,
      ...(previewPath ? { previewPath } : {}),
      mime: type,
      source: f.name,
      reusable: false,
      evidence: ev(
        "brand-assets/manifest.json",
        "Asset present in source package; reuse rights are not established.",
      ),
    };
    const fontLicensed = [...licences].some(
      (prefix) =>
        asset.id.toLowerCase().startsWith(prefix + "/") ||
        asset.id.toLowerCase().startsWith(prefix + "-"),
    );
    dna.assets.push(
      classifyPackageAsset(asset, descriptor ?? {}, fontLicensed),
    );
  }
  return normalisePackage(dna, raw, ledger);
}
