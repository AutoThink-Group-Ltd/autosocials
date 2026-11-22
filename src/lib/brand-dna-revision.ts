import { z } from "zod";
import { dnaDirection } from "./brand-dna-direction";
import type { BrandDna, DnaEdits, DnaEvidence } from "./brand-dna";

const short = z.string().trim().min(1).max(220);
const evidence = z.object({
  source: z.string().max(2000),
  status: z.enum([
    "observed",
    "inferred",
    "recommended",
    "corrected",
    "confirmed",
  ]),
  confidence: z.enum(["high", "medium", "low"]),
  note: z.string().max(2000).optional(),
});
const statement = z.object({
  text: z.string().trim().min(1).max(2400),
  evidence,
});
export const editsSchema = z
  .object({
    name: short.optional(),
    description: z.string().trim().min(1).max(3000).optional(),
    personality: z.array(short).max(25).optional(),
    logoId: short.optional(),
    colours: z
      .array(
        z.object({
          role: short,
          hex: z.string().regex(/^#[0-9a-f]{6}$/i),
          surface: short,
          original: z.string().max(250).optional(),
          evidence,
        }),
      )
      .max(160)
      .optional(),
    fonts: z
      .array(
        z.object({
          role: short,
          family: short,
          weights: z.string().max(150),
          surface: short,
          assetId: short.optional(),
          evidence,
        }),
      )
      .max(80)
      .optional(),
    voice: z.array(statement).max(50).optional(),
    hiddenAssetIds: z.array(short).max(400).optional(),
  })
  .strict();
const correction: DnaEvidence = {
  source: "Workspace correction",
  status: "corrected",
  confidence: "high",
};
export function validateDnaEdits(dna: BrandDna, edits: DnaEdits): DnaEdits {
  if (
    edits.logoId &&
    !dna.assets.some(
      (a) => a.id === edits.logoId && ["logo", "icon"].includes(a.kind),
    )
  )
    throw new Error("Choose a logo from this identity.");
  if (edits.hiddenAssetIds?.some((id) => !dna.assets.some((a) => a.id === id)))
    throw new Error("Choose an image from this identity.");
  // Keep unchanged findings attributable to their original evidence. The client cannot assign provenance.
  const result = { ...edits };
  if (edits.colours)
    result.colours = edits.colours.map((c) => {
      const old = dna.colours.find(
        (x) =>
          x.role === c.role &&
          x.surface === c.surface &&
          x.hex.toLowerCase() === c.hex.toLowerCase(),
      );
      return (
        old ?? {
          role: c.role,
          surface: c.surface,
          hex: c.hex.toUpperCase(),
          evidence: correction,
        }
      );
    });
  if (edits.fonts)
    result.fonts = edits.fonts.map((f) => {
      const old = dna.fonts.find(
        (x) =>
          x.role === f.role &&
          x.surface === f.surface &&
          x.family === f.family &&
          x.weights === f.weights,
      );
      return (
        old ?? {
          role: f.role,
          surface: f.surface,
          family: f.family,
          weights: f.weights,
          assetId: dna.fonts.find((x) => x.family === f.family)?.assetId,
          evidence: correction,
        }
      );
    });
  if (edits.voice)
    result.voice = edits.voice.map(
      (v) =>
        dna.voice.find((x) => x.text === v.text) ?? {
          text: v.text,
          evidence: correction,
        },
    );
  return result;
}
// Only persist fields the manager changed. A new scan can still discover other colours, fonts and copy.
export type DnaOverrides = DnaEdits & {
  removedColours?: string[];
  removedFonts?: string[];
  removedVoice?: string[];
};
const colourKey = (c: BrandDna["colours"][number]) =>
  JSON.stringify([c.surface, c.role, c.hex.toLowerCase()]);
const fontKey = (f: BrandDna["fonts"][number]) =>
  JSON.stringify([f.surface, f.role, f.family, f.weights]);
const voiceKey = (v: BrandDna["voice"][number]) => v.text;
function changedRows<T>(
  old: T[],
  submitted: T[],
  prior: T[],
  removed: string[],
  key: (row: T) => string,
) {
  const before = new Set(old.map(key)),
    after = new Set(submitted.map(key));
  const selected = new Map(
    prior.filter((x) => after.has(key(x))).map((x) => [key(x), x]),
  );
  for (const row of submitted)
    if (!before.has(key(row))) selected.set(key(row), row);
  const hidden = new Set(removed.filter((k) => !after.has(k)));
  for (const k of before) if (!after.has(k)) hidden.add(k);
  return { selected: [...selected.values()], removed: [...hidden] };
}
export function mergeDnaOverrides(
  dna: BrandDna,
  prior: DnaOverrides,
  submitted: DnaEdits,
): DnaOverrides {
  const changes = validateDnaEdits(dna, submitted),
    result = { ...prior };
  if (changes.name && changes.name !== dna.name) result.name = changes.name;
  if (changes.description && changes.description !== dna.description)
    result.description = changes.description;
  if (changes.logoId && changes.logoId !== dna.logoId)
    result.logoId = changes.logoId;
  if (
    changes.personality &&
    JSON.stringify(changes.personality) !== JSON.stringify(dna.personality)
  )
    result.personality = changes.personality;
  if (changes.hiddenAssetIds?.length)
    result.hiddenAssetIds = [
      ...new Set([...(prior.hiddenAssetIds ?? []), ...changes.hiddenAssetIds]),
    ];
  if (changes.colours) {
    const r = changedRows(
      dna.colours,
      changes.colours,
      prior.colours ?? [],
      prior.removedColours ?? [],
      colourKey,
    );
    result.colours = r.selected;
    result.removedColours = r.removed;
  }
  if (changes.fonts) {
    const r = changedRows(
      dna.fonts,
      changes.fonts,
      prior.fonts ?? [],
      prior.removedFonts ?? [],
      fontKey,
    );
    result.fonts = r.selected;
    result.removedFonts = r.removed;
  }
  if (changes.voice) {
    const r = changedRows(
      dna.voice,
      changes.voice,
      prior.voice ?? [],
      prior.removedVoice ?? [],
      voiceKey,
    );
    result.voice = r.selected;
    result.removedVoice = r.removed;
  }
  return result;
}
function reconcile<T>(
  source: T[],
  overrides: T[],
  removed: string[],
  key: (v: T) => string,
  role?: (v: T) => string,
) {
  const hidden = new Set(removed),
    replaced = new Set(role ? overrides.map(role) : []);
  return [
    ...overrides,
    ...source.filter(
      (v) =>
        !hidden.has(key(v)) &&
        !overrides.some((o) => key(o) === key(v)) &&
        !(role && replaced.has(role(v))),
    ),
  ];
}
export function applyDnaEdits(
  source: BrandDna,
  edits: DnaOverrides,
  previous?: BrandDna,
): BrandDna {
  const {
    hiddenAssetIds = [],
    colours = [],
    fonts = [],
    voice = [],
    removedColours = [],
    removedFonts = [],
    removedVoice = [],
    ...fields
  } = edits;
  const assets = source.assets.filter((a) => !hiddenAssetIds.includes(a.id));
  const needed = new Set([fields.logoId, ...fonts.map((f) => f.assetId)]);
  for (const a of previous?.assets ?? [])
    if (
      needed.has(a.id) &&
      !hiddenAssetIds.includes(a.id) &&
      !assets.some((x) => x.id === a.id)
    )
      assets.push(a);
  const dna = {
    ...source,
    ...fields,
    assets,
    colours: reconcile(
      source.colours,
      colours,
      removedColours,
      colourKey,
      (c) => c.surface + "|" + c.role,
    ),
    fonts: reconcile(
      source.fonts,
      fonts,
      removedFonts,
      fontKey,
      (f) => f.surface + "|" + f.role,
    ),
    voice: reconcile(source.voice, voice, removedVoice, voiceKey),
  };
  if (fields.logoId) {
    const selected = dna.assets.find((a) => a.id === fields.logoId);
    if (selected?.previewPath) {
      dna.assets = dna.assets.map((a) =>
        a.id === selected.id
          ? { ...a, reusable: true, evidence: correction }
          : a,
      );
    }
  }
  if (!assets.some((a) => a.id === dna.logoId)) delete dna.logoId;
  return dna;
}
export function describeDnaChanges(a: BrandDna, b: BrandDna) {
  const differences: string[] = [];
  const compare = (title: string, left: string[], right: string[]) => {
    const before = new Set(left),
      after = new Set(right);
    for (const v of right)
      if (!before.has(v)) differences.push(`${title} added · ${v}`);
    for (const v of left)
      if (!after.has(v)) differences.push(`${title} removed · ${v}`);
  };
  compare(
    "Overview",
    [a.name, a.description, ...a.personality],
    [b.name, b.description, ...b.personality],
  );
  const palette = (d: BrandDna) =>
    d.colours.map((c) => `${c.surface} · ${c.role} ${c.hex}`);
  const faces = (d: BrandDna) =>
    d.fonts.map((f) => `${f.surface} · ${f.role} · ${f.family} ${f.weights}`);
  compare("Colour", palette(a), palette(b));
  compare("Font", faces(a), faces(b));
  compare(
    "Voice",
    a.voice.map((v) => v.text),
    b.voice.map((v) => v.text),
  );
  compare(
    "Imagery",
    a.assets.map((v) => v.label),
    b.assets.map((v) => v.label),
  );
  if (a.logoId !== b.logoId)
    differences.unshift("The selected logo has changed.");
  compare(
    "Creative direction",
    [...a.visualLanguage, ...a.offerings, ...a.messages, ...a.examples].map(
      (x) => x.text,
    ),
    [...b.visualLanguage, ...b.offerings, ...b.messages, ...b.examples].map(
      (x) => x.text,
    ),
  );
  return differences;
}
/** Keep every creative discipline represented in bounded model context, even with a long CSS token inventory. */
export function productionDirection(d: BrandDna) {
  const { ink, paper, accent, heading, body } = dnaDirection(d);
  const brief = (label: string, values: BrandDna["voice"], n: number) =>
    label +
    " " +
    values
      .slice(0, n)
      .map((v) => "[" + v.evidence.status + "] " + v.text.slice(0, 270))
      .join(" | ");
  const logo = d.assets.find((a) => a.id === d.logoId);
  return [
    d.name + " · " + d.website,
    d.description.slice(0, 360),
    "Creative palette " +
      [
        paper && "background " + paper,
        ink && "text " + ink,
        accent && "accent " + accent,
      ]
        .filter(Boolean)
        .join(", "),
    "Typography " +
      [
        heading && "heading " + heading.family + " " + heading.weights,
        body && "body " + body.family + " " + body.weights,
      ]
        .filter(Boolean)
        .join(", "),
    logo ? "Selected brand mark " + logo.label : "",
    brief("Voice", d.voice, 3),
    brief("Offers", d.offerings, 3),
    brief("Design", d.visualLanguage, 4),
    brief("Source messaging", d.messages, 3),
    brief("Example wording", d.examples, 3),
    "Evidence gaps " + d.gaps.slice(0, 3).join(" ").slice(0, 320),
    "Use observed wording as source material. Recommendations and inferred traits are creative guidance. Keep claims within the evidence.",
  ]
    .filter(Boolean)
    .join("\n");
}
export function dnaGuidelines(d: BrandDna) {
  const statements = (title: string, values: BrandDna["voice"]) =>
    `## ${title}\n${values.map((v) => `- [${v.evidence.status}] ${v.text} (${v.evidence.source})`).join("\n")}`;
  return [
    `# ${d.name} — Brand DNA\n${d.website}\n\n${d.description}\n${d.personality.join(", ")}`,
    "## Colour by surface\n" +
      d.colours
        .map(
          (c) => `- ${c.surface} / ${c.role}: ${c.hex} [${c.evidence.status}]`,
        )
        .join("\n"),
    ...(d.colourUsage?.length
      ? [statements("Colour combinations and gradients", d.colourUsage)]
      : []),
    "## Typography by surface\n" +
      d.fonts
        .map(
          (f) =>
            `- ${f.surface} / ${f.role}: ${f.family} ${f.weights} [${f.evidence.status}]`,
        )
        .join("\n"),
    "## Official identity and imagery\n" +
      d.assets
        .filter((a) => a.id === d.logoId || a.reusable)
        .slice(0, 40)
        .map(
          (a) =>
            `- ${a.id === d.logoId ? "Selected logo" : a.kind}: ${a.label}. ${a.usage ?? ""}`,
        )
        .join("\n"),
    statements("Voice", d.voice),
    statements("Offers and services", d.offerings),
    statements("Messages", d.messages),
    statements("Headline examples", d.examples),
    statements("Design direction", d.visualLanguage),
    "## Evidence gaps\n" + d.gaps.map((g) => "- " + g).join("\n"),
  ].join("\n\n");
}
