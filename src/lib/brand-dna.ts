/** Portable workspace identity. Source-file references are private paths, never signed URLs. */
export type DnaStatus =
  "observed" | "inferred" | "recommended" | "corrected" | "confirmed";
export type DnaEvidence = {
  source: string;
  status: DnaStatus;
  confidence: "high" | "medium" | "low";
  note?: string | undefined;
};
export type DnaColour = {
  role: string;
  hex: string;
  surface: string;
  original?: string;
  evidence: DnaEvidence;
};
export type DnaFont = {
  role: string;
  family: string;
  weights: string;
  surface: string;
  assetId?: string | undefined;
  evidence: DnaEvidence;
};
export type DnaAsset = {
  id: string;
  label: string;
  kind:
    | "logo"
    | "icon"
    | "portrait"
    | "illustration"
    | "product"
    | "photo"
    | "screenshot"
    | "font"
    | "video"
    | "reference"
    | "other";
  path?: string;
  previewPath?: string | undefined;
  mime?: string;
  source: string;
  surface?: string;
  usage?: string;
  reusable: boolean;
  evidence: DnaEvidence;
};
export type DnaStatement = { text: string; evidence: DnaEvidence };
export type BrandDna = {
  schemaVersion: 1;
  name: string;
  website: string;
  sourceKind: "website" | "package";
  description: string;
  personality: string[];
  colourUsage?: DnaStatement[];
  colours: DnaColour[];
  fonts: DnaFont[];
  assets: DnaAsset[];
  voice: DnaStatement[];
  messages: DnaStatement[];
  examples: DnaStatement[];
  offerings: DnaStatement[];
  visualLanguage: DnaStatement[];
  gaps: string[];
  logoId?: string | undefined;
  /** Original package documents or capture records, retained privately for reproducibility. */
  sourceFiles?: { name: string; path: string }[];
};
export type DnaSaveAsset = (
  bytes: Buffer,
  mime: string,
  name: string,
) => Promise<string>;
export type DnaEdits = {
  name?: string;
  description?: string;
  personality?: string[];
  logoId?: string | undefined;
  colours?: DnaColour[];
  fonts?: DnaFont[];
  voice?: DnaStatement[];
  hiddenAssetIds?: string[];
};
export const DNA_TILE_KINDS = [
  "product",
  "promotional",
  "educational",
] as const;
export type DnaTileKind = (typeof DNA_TILE_KINDS)[number];
export type BrandDnaView = {
  website: string | null;
  canEdit: boolean;
  run: {
    id: string;
    status: "queued" | "running" | "failed" | "complete";
    phase: string;
    error: string | null;
  } | null;
  version: {
    id: string;
    dna: BrandDna;
    confirmed: boolean;
    createdAt: string;
  } | null;
  candidate: { id: string; differences: string[] } | null;
  downloads: { json: string; markdown: string } | null;
  urls: Record<string, string>; // keyed by private path; only display-safe derivatives and fonts
  tiles: {
    kind: DnaTileKind;
    status: "queued" | "running" | "ready" | "failed";
    url: string | null;
    error: string | null;
    notes?: string[];
  }[];
};

/** The owner supplied an explicit campaign direction for this brand. */
export function usesAutoTillShowcase(dna: Pick<BrandDna, "name" | "website">) {
  if (dna.name.trim().toLowerCase() !== "autotill") return false;
  try {
    return /^(?:www\.)?autotill\.com$/i.test(new URL(dna.website).hostname);
  } catch {
    return false;
  }
}

/** Public source omits the private client-specific examples. */
export function usesCallBulletShowcase(_dna: Pick<BrandDna, "name" | "website">): boolean { return false; }
export function websiteShowcase(_dna: Pick<BrandDna, "name" | "website">): string | undefined { return undefined; }
export function hasCustomShowcase(dna: Pick<BrandDna, "name" | "website">) { return usesAutoTillShowcase(dna); }

export function showcaseNeedsReview(notes: string[] = []) {
  return notes.some((note) =>
    /review (?:before|it against)|no verified wordmark|no suitable source artwork|original illustration|fallback typeface/i.test(
      note,
    ),
  );
}
