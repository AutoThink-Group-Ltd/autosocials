import { describe, expect, it } from "vitest";
import { showcaseCopy } from "./brand-dna-copy";
import { DNA_TILE_KINDS, type BrandDna } from "./brand-dna";

const statement = (text: string) => ({
  text,
  evidence: {
    source: "https://example.org/services",
    status: "observed",
    confidence: "high",
  } as const,
});
const identity: BrandDna = {
  schemaVersion: 1,
  sourceKind: "website",
  name: "Example Removals",
  website: "https://example.org",
  description: "Moving &amp; storage in St. Austell.",
  colours: [],
  fonts: [],
  assets: [],
  personality: [],
  voice: [],
  messages: [
    "We handle packing and removals.",
    "Which removal service do you need?",
    "Our customers say",
    "The UK's largest supplier.",
  ].map(statement),
  offerings: [],
  examples: [
    "Sorry, this product is unavailable. Please choose a different combination.",
    "Before packing, label each box with its destination room.",
    "We transport furniture and household goods.",
  ].map(statement),
  visualLanguage: [],
  gaps: [],
};

describe("website-only showcase copy", () => {
  it("keeps entities, abbreviations, boilerplate and unsupported claims out of tile copy", () => {
    const set = DNA_TILE_KINDS.map((kind) => showcaseCopy(identity, kind));
    expect(new Set(set.map((x) => x.headline)).size).toBe(3);
    for (const t of set)
      expect(t.headline + " " + t.supporting).not.toMatch(
        /&amp|largest|different combination|unavailable|customers say/i,
      );
    const address = showcaseCopy(
      {
        ...identity,
        messages: [],
        examples: [],
        description: "Removals &amp; storage in St. Austell.",
      },
      "product",
    );
    expect(address.headline).toBe("Removals & storage in St. Austell.");
  });
  it("uses a visible evidence limitation for an unfamiliar site that supplies a name alone", () => {
    const sparse = { ...identity, messages: [], examples: [], description: "" };
    expect(showcaseCopy(sparse, "educational")).toMatchObject({
      supporting: "",
      limitation: expect.stringContaining("limited"),
    });
  });
  it("keeps repeated slogans and long website sentences off the artwork", () => {
    const result = showcaseCopy(
      {
        ...identity,
        description: "",
        messages: [statement("Storage made simple. Storage made simple.")],
        examples: [
          statement(
            "We provide storage for furniture and household goods when you need a place to keep them while you plan your move.",
          ),
        ],
      },
      "product",
    );
    expect(result).toMatchObject({
      headline: "Storage made simple.",
      supporting: "",
    });
  });
  it("does not count the company name as a shared topic for supporting copy", () => {
    const results = DNA_TILE_KINDS.map((kind) =>
      showcaseCopy(
        {
          ...identity,
          name: "Example Dental Practice",
          description: "",
          messages: [
            statement("Dental emergencies"),
            statement("We offer Invisalign treatment."),
          ],
          examples: [
            statement(
              "At Example Dental Practice we offer Invisalign treatment.",
            ),
          ],
        },
        kind,
      ),
    );
    const emergencies = results.find(
      ({ headline }) => headline === "Dental emergencies",
    );
    expect(emergencies?.supporting).toBe("");
  });
});
