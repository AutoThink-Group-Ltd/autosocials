import { expect, it } from "vitest";
import type { BrandDna, DnaColour } from "./brand-dna";
import {
  applyDnaEdits,
  mergeDnaOverrides,
  productionDirection,
} from "./brand-dna-revision";
const evidence = {
  source: "homepage",
  status: "observed",
  confidence: "high",
} as const;
const swatch = (role: string, hex: string): DnaColour => ({
  role,
  hex,
  surface: "Marketing",
  evidence,
});
const dna: BrandDna = {
  schemaVersion: 1,
  sourceKind: "website",
  name: "Example",
  website: "https://example.org",
  description: "Book repair appointments.",
  personality: [],
  colours: [swatch("accent", "#123456"), swatch("paper", "#ffffff")],
  fonts: [],
  assets: [],
  messages: [],
  voice: [{ text: "Give clear instructions.", evidence }],
  offerings: [],
  examples: [],
  gaps: [],
  visualLanguage: [],
};
it("preserves customer corrections while allowing other findings to improve on the next scan", () => {
  const overrides = mergeDnaOverrides(
    dna,
    {},
    { colours: [swatch("accent", "#654321"), dna.colours[1]!] },
  );
  const next = applyDnaEdits(
    {
      ...dna,
      colours: [
        swatch("accent", "#555555"),
        swatch("paper", "#eeeeee"),
        swatch("ink", "#222222"),
      ],
    },
    overrides,
    dna,
  );
  expect(next.colours.map((x) => x.hex)).toEqual([
    "#654321",
    "#eeeeee",
    "#222222",
  ]);
  expect(next.colours[0]?.evidence.status).toBe("corrected");
  expect(next.colours[1]?.evidence).toEqual(evidence);
});
it("does not reintroduce removed imagery after another edit", () => {
  const assets = ["a", "b"].map((id) => ({
    id,
    label: id,
    kind: "photo" as const,
    source: "website",
    reusable: true,
    evidence,
  }));
  const v1 = { ...dna, assets };
  const a = mergeDnaOverrides(v1, {}, { hiddenAssetIds: ["a"] });
  const v2 = applyDnaEdits(v1, a);
  const b = mergeDnaOverrides(v2, a, {
    description: "Updated wording.",
    hiddenAssetIds: ["b"],
  });
  expect(applyDnaEdits(v1, b).assets).toEqual([]);
});
it("includes voice alongside design direction even when a source has hundreds of tokens", () => {
  expect(
    productionDirection({
      ...dna,
      colours: [
        ...dna.colours,
        ...Array.from({ length: 200 }, (_, i) =>
          swatch("theme-" + i, "#654321"),
        ),
      ],
    }),
  ).toContain("[observed] Give clear instructions.");
});
