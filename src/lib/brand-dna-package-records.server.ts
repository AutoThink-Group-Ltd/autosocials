import type {
  BrandDna,
  DnaAsset,
  DnaEvidence,
  DnaStatement,
} from "./brand-dna";
type Row = Record<string, unknown>;
const record = (v: unknown): Row =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Row) : {};
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.map(record) : []);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const strings = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(str).filter(Boolean) : str(v) ? [str(v)] : [];
const at = (v: unknown, ...keys: string[]): unknown =>
  keys.reduce((a: unknown, k) => record(a)[k], v);
const unwrap = (v: unknown): unknown => record(v)["value"] ?? v;
const compact = (v: unknown) =>
  str(v)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
function evidence(source: string, v: unknown): DnaEvidence {
  const r = record(v),
    status = str(r["status"]).toLowerCase(),
    confidence = str(r["confidence"]).toLowerCase();
  const ref = [
    ...strings(r["source"]),
    ...strings(r["ref"]),
    ...strings(r["evidence"]),
  ].join(", ");
  return {
    source: ref ? `${source} · ${ref.slice(0, 650)}` : source,
    status: /recommend|suggest/.test(status)
      ? "recommended"
      : /infer|interpret/.test(status)
        ? "inferred"
        : "observed",
    confidence:
      confidence === "medium" || confidence === "low" ? confidence : "high",
  };
}
export function manifestIndex(manifest: unknown, files: Set<string>) {
  const result = new Map<string, Row>();
  for (const group of Object.values(record(manifest)))
    for (const asset of rows(group)) {
      const proposed = str(
        asset["packaged_path"] ??
          asset["package_path"] ??
          asset["local_path"] ??
          asset["file"] ??
          asset["path"],
      );
      if (!proposed || asset["included"] === false) continue;
      if (!asset["sha256"]) {
        if (files.has(proposed) || files.has("brand-assets/" + proposed))
          throw new Error("A declared package asset has no checksum.");
        continue;
      }
      const name = files.has(proposed) ? proposed : "brand-assets/" + proposed;
      if (!files.has(name))
        throw new Error("A declared brand asset is missing from the package.");
      const digest = str(asset["sha256"]).toLowerCase();
      if (!/^[a-f\d]{64}$/.test(digest))
        throw new Error("Invalid source asset digest.");
      const prior = result.get(name);
      if (prior && prior["sha256"] !== digest)
        throw new Error("The manifest contains conflicting checksums.");
      result.set(name, { ...prior, ...asset, sha256: digest });
    }
  return result;
}
export function classifyPackageAsset(
  asset: DnaAsset,
  r: Row,
  hasFontLicense: boolean,
): DnaAsset {
  const description = [
    r["role"],
    r["description"],
    r["purpose"],
    r["classification"],
    r["usage"],
    r["scope"],
    r["variantNote"],
  ]
    .map(str)
    .filter(Boolean)
    .join(" · ");
  const name = asset.id.toLowerCase();
  const info = name + " " + description.toLowerCase();
  const verified = typeof r["sha256"] === "string";
  let kind = asset.kind;
  if (kind === "font" || kind === "video") {
    /* binary type is authoritative */
  } else if (/\.(txt|xml|mp3|json)$/.test(name)) kind = "other";
  else if (
    /reference-only|logo-reference|store-listings|play-store|wporg-assets|facebook-cover|poster-|film\/|feature.graphic/.test(
      name,
    )
  )
    kind = "reference";
  else if (
    /favicon|app-icon|launcher|android-brand|icon.only|icon-colour|icon-black|icon-white|icon-cream|icon-transparent|icon-ink/.test(
      name,
    )
  )
    kind = "icon";
  else if (
    /lockup|wordmark-desktop|full-colour|full-white|\/logos\/|generated-logo-downloads.*logo-|official.*lockup/.test(
      info,
    )
  )
    kind = "logo";
  else if (
    /portrait|avatar|character|tyson\/|assets\/agents\/|\bgigi\b|\blenny\b/.test(
      info,
    )
  )
    kind = "portrait";
  else if (
    /screenshot|capture|visual-reference|homepage-|studio-explore/.test(info)
  )
    kind = "screenshot";
  else if (/illustration|garment-art|whiteboard|line.drawn/.test(info))
    kind = "illustration";
  else if (/leaflet|product artwork|product image/.test(info)) kind = "product";
  const usage = [description, str(r["rights"] ?? r["reuse_restrictions"])]
    .filter(Boolean)
    .join(". ");
  const source =
    str(r["original_path"] ?? r["original"] ?? r["source"]) ||
    str(rows(r["original_aliases"])[0]?.["path"]) ||
    asset.source;
  return {
    ...asset,
    kind,
    source,
    usage,
    surface: str(r["scope"] ?? r["role"] ?? r["purpose"]) || "Package",
    reusable:
      verified &&
      ((kind === "logo" && !!asset.previewPath) ||
        (kind === "font" && hasFontLicense) ||
        (!!asset.previewPath &&
          ((kind === "illustration" &&
            /static snapshot generated from original inline svg/i.test(
              str(r["status"]),
            )) ||
            /original owned by|cleared for (marketing|commercial)|licensed for (marketing|commercial)/i.test(
              info + " " + usage,
            )))),
    evidence: evidence("brand-assets/manifest.json · " + asset.id, r),
  };
}
function packageColourUsage(root: Row): DnaStatement[] {
  const usage: DnaStatement[] = [];
  for (const key of ["surface_pairs", "gradients"]) {
    const r = at(root, "rules", key),
      text = str(unwrap(r));
    if (text)
      usage.push({ text, evidence: evidence("brand.json#/rules/" + key, r) });
  }
  const source = at(root, "design", "gradients");
  for (const r of rows(unwrap(source)).slice(0, 15)) {
    const css = str(r["value"]),
      selector = str(r["selector"]);
    if (css && selector)
      usage.push({
        text: selector + " · " + css,
        evidence: evidence("brand.json#/design/gradients", r),
      });
  }
  return usage;
}
export function normalisePackage(d: BrandDna, root: Row, ledger: unknown) {
  const p = record(
    root["autosocials_profile"] ??
      root["profile"] ??
      at(root, "autoSocials", "profileReference") ??
      at(root, "autoSocials", "profileFields"),
  );
  const ident = record(root["identity"]),
    rules = record(root["rules"]);
  function add(to: DnaStatement[], v: unknown, source: string) {
    for (const row of Array.isArray(v) ? v : [v]) {
      const val = unwrap(row),
        r = record(val);
      const texts =
        typeof val === "string" || Array.isArray(val)
          ? strings(val)
          : strings(
              r["finding"] ?? r["text"] ?? r["composition"] ?? r["description"],
            );
      for (const text of texts)
        if (text && !to.some((x) => x.text === text))
          to.push({ text, evidence: evidence(source, row) });
    }
  }
  d.personality = [
    ...new Set([
      ...d.personality,
      ...strings(unwrap(ident["personality"] ?? ident["personality_brief"])),
    ]),
  ];
  add(
    d.voice,
    ident["voice"] ?? ident["voice_findings"],
    "brand.json#/identity",
  );
  for (const [key, guidance] of Object.entries(
    record(
      root["productionDirections"] ??
        root["creative_production"] ??
        root["production"],
    ),
  )) {
    if (
      typeof guidance === "object" &&
      /social|design|direction|tile|graphic|carousel|video|written/i.test(key)
    )
      add(d.visualLanguage, guidance, "brand.json production/" + key);
  }
  add(d.voice, rules["voice"], "brand.json#/rules/voice");
  add(
    d.offerings,
    ident["positioning"] ?? rules["positioning"],
    "brand.json#/identity/positioning",
  );
  add(
    d.offerings,
    rows(root["marketing_findings"]).filter((x) => x["area"] === "positioning"),
    "brand.json#/marketing_findings",
  );
  if (!d.offerings.length && d.description)
    add(d.offerings, d.description, "brand.json#/profile");
  add(
    d.visualLanguage,
    ident["visualLanguage"] ??
      rules["personality"] ??
      at(root, "design", "description"),
    "brand.json visual language",
  );
  for (const r of rows(root["identity_rules"]))
    if (/frame|style|logo.selection|type.family|visual/.test(str(r["key"])))
      add(d.visualLanguage, r, str(r["source"]));
  for (const row of rows(root["identity_rules"])) {
    if (row["key"] === "positioning.pillars")
      add(d.examples, row, "brand.json#/identity_rules/positioning.pillars");
  }
  for (const key of ["social", "identity"]) {
    const r = record(rules[key]),
      v = str(unwrap(r));
    for (const match of v.matchAll(
      /(?:slogan|tagline) is [“"]([^”"]+)[”"]/gi,
    )) {
      if (match[1])
        d.messages.unshift({
          text: match[1],
          evidence: evidence("brand.json#/rules/" + key, r),
        });
    }
  }
  const samples =
    ident["attestedCopy"] ?? ident["copy_samples"] ?? ident["copySamples"];
  add(d.examples, samples, "brand.json#/identity/copy");
  for (const example of Object.values(record(unwrap(samples))))
    add(d.examples, example, "brand.json#/identity/copySamples");
  if (!d.examples.length)
    add(
      d.examples,
      rows(root["identity_rules"])
        .filter((x) => /tagline/.test(str(x["key"])))
        .concat(rules["identity"] ? [record(rules["identity"])] : []),
      "brand.json#/identity",
    );
  const combinations = packageColourUsage(root);
  if (combinations.length) d.colourUsage = combinations;
  for (const r of rows(p["themes"]))
    add(d.messages, r["title"], "brand.json#/themes");
  const evidenceMap = record(at(ledger, "records"));
  for (const key of ["brief", "geometry", "brand-type", "computed-type"]) {
    const r = evidenceMap[key];
    if (r) add(d.visualLanguage, r, "brand-evidence.json#/records/" + key);
  }
  const seen = new Set(
    d.colours.map((c) => c.surface + "|" + c.role + "|" + c.hex.toUpperCase()),
  );
  function palette(v: unknown, surface: string, pointer: string) {
    const entries = Array.isArray(v)
      ? rows(v).map((r) => [str(r["name"] ?? r["role"]), r] as const)
      : Object.entries(record(unwrap(v)));
    for (const [key, value] of entries) {
      const row = record(value),
        hex = str(
          typeof value === "string"
            ? value
            : (row["hex"] ??
                row["sRGBHex"] ??
                row["hex_srgb_approx"] ??
                row["hex_rounded"]),
        ).toUpperCase();
      if (!/^#[\dA-F]{6}$/.test(hex)) continue;
      const role = key.replace(/^--/, ""),
        id = surface + "|" + role + "|" + hex;
      if (seen.has(id)) continue;
      seen.add(id);
      d.colours.push({
        role,
        hex,
        surface,
        original: str(row["css"] ?? row["value"] ?? row["hsl"]) || hex,
        evidence: evidence(pointer + "/" + key, row),
      });
    }
  }
  palette(
    at(root, "designTokens", "publishedPalette"),
    "Published marketing",
    "brand.json#/designTokens/publishedPalette",
  );
  palette(
    at(root, "designTokens", "cssRoot"),
    "Website CSS",
    "brand.json#/designTokens/cssRoot",
  );
  palette(
    at(root, "tokens", "colors", "semantic"),
    "Marketing",
    "brand.json#/tokens/colors/semantic",
  );
  palette(
    at(root, "design", "externalPalette"),
    "External marketing",
    "brand.json#/design/externalPalette",
  );
  palette(
    at(root, "design", "rootTokens"),
    "Website CSS",
    "brand.json#/design/rootTokens",
  );
  for (const [surface, v] of Object.entries(
    record(at(root, "design", "palette")),
  ))
    palette(v, surface, "brand.json#/design/palette/" + surface);
  for (const [surface, v] of Object.entries(
    record(at(root, "design_system", "themes")),
  ))
    palette(v, surface, "brand.json#/design_system/themes/" + surface);
  const literals = record(at(root, "design", "exact_literal_colors"));
  for (const [surface, values] of Object.entries(literals))
    palette(
      values,
      surface,
      "brand.json#/design/exact_literal_colors/" + surface,
    );
  const fallback = d.fonts;
  d.fonts = [];
  function face(role: string, v: unknown, surface: string, weight?: unknown) {
    const r = record(v);
    const family = str(r["family"] ?? v)
      .split(",")[0]
      ?.replace(/["']/g, "")
      .trim();
    if (!family || family.length > 100 || /clamp\(|rem|px |;/.test(family))
      return;
    const weights = r["weights"] ?? r["weights_imported"] ?? weight;
    d.fonts.push({
      role,
      family,
      surface,
      weights: Array.isArray(weights)
        ? weights.join(", ")
        : String(weights ?? ""),
      evidence: evidence("brand.json typography", r),
    });
  }
  const typography = record(
    unwrap(
      at(root, "design", "typography") ??
        at(root, "design_system", "fonts") ??
        at(root, "tokens", "typography"),
    ),
  );
  for (const key of ["display", "body"]) {
    const faces = at(
      typography,
      "families",
      key === "display" ? "headings" : "body",
    );
    const value = typography[key] ?? faces;
    if (value) face(key, value, "Website");
  }
  const declared = record(at(root, "designTokens", "fontRoles", "values"));
  if (declared["display"])
    face(
      "display",
      declared["display"],
      "Marketing",
      declared["display-weight"],
    );
  if (declared["sans"]) face("body", declared["sans"], "Website");
  if (!d.fonts.length) d.fonts = fallback;
  for (const f of d.fonts) {
    const stem = compact(f.family.replace(/\s+variable$/i, ""));
    const eligible = d.assets.filter(
      (a) => a.kind === "font" && a.reusable && compact(a.id).includes(stem),
    );
    const sorted = eligible.sort(
      (a, b) =>
        Number(/latin-ext|vietnamese/.test(a.id)) -
          Number(/latin-ext|vietnamese/.test(b.id)) ||
        Number(!a.id.includes(f.role === "display" ? "600" : "400")) -
          Number(!b.id.includes(f.role === "display" ? "600" : "400")),
    );
    if (sorted[0]) {
      f.assetId = sorted[0].id;
      const key = f.family
        .toLowerCase()
        .replace(/\s+variable$/i, "")
        .replace(/\s+/g, "-");
      const binary = rows(at(typography, "families", key, "faces")).find(
        (row) => row["file"] === f.assetId,
      );
      if (!f.weights && binary) f.weights = str(binary["weights"]);
    }
  }
  const rank = (a: DnaAsset) => {
    const n = a.id.toLowerCase();
    if (
      /lockup-transparent|full-colour\.svg|logo-colour-2000|logo-horizontal|wordmark-desktop/.test(
        n,
      )
    )
      return 0;
    if (/full|lockup|wordmark/.test(n) && !/white|black|dark/.test(n)) return 1;
    return 2;
  };
  const logo = d.assets
    .filter((a) => a.kind === "logo" && a.previewPath)
    .sort((a, b) => rank(a) - rank(b))[0];
  if (logo) d.logoId = logo.id;
  if (!d.description)
    d.description =
      d.offerings.find((x) => x.evidence.status === "observed")?.text ?? "";
  if (d.description)
    d.gaps = d.gaps.filter((g) => !g.startsWith("A concise brand description"));
  if (!d.messages.length)
    d.messages = d.examples
      .filter((x) => x.evidence.status === "observed")
      .slice(0, 4);
  for (const v of [
    ...rows(root["gaps"]),
    ...rows(record(ledger)["unavailable"]),
  ]) {
    const t = str(v["description"] ?? v["reason"]);
    if (t && !d.gaps.includes(t)) d.gaps.push(t);
  }
  return d;
}
