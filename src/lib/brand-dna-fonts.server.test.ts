import { afterEach, describe, expect, it, vi } from "vitest";
import type { BrandDna } from "./brand-dna";
const mocks = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn() }));
vi.mock("./composition.server", () => ({ loadBrandFont: mocks.load }));
vi.mock("fontkit", () => ({ create: mocks.create }));
import { enrichDnaFonts } from "./brand-dna-fonts.server";
const evidence = {
  source: "website",
  status: "observed" as const,
  confidence: "high" as const,
};
const dna: BrandDna = {
  schemaVersion: 1,
  name: "Bakery",
  website: "https://example.com",
  sourceKind: "website",
  description: "",
  personality: [],
  colours: [],
  fonts: [
    {
      role: "heading",
      family: "DM Sans",
      surface: "website",
      weights: "700",
      evidence,
    },
    {
      role: "body",
      family: "DM Sans",
      surface: "website",
      weights: "400",
      evidence,
    },
  ],
  assets: [],
  voice: [],
  messages: [],
  examples: [],
  offerings: [],
  visualLanguage: [],
  gaps: [],
};
describe("website font specimens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  it("saves one matching font and official licence, links both roles and is idempotent", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("SIL OPEN FONT LICENSE Version 1.1")),
    );
    mocks.load.mockResolvedValue({
      files: {
        "fonts/brand-700.woff2": {
          base64: Buffer.from("font").toString("base64"),
        },
        "fonts/brand-400.woff2": {
          base64: Buffer.from("font").toString("base64"),
        },
      },
    });
    mocks.create.mockReturnValue({ familyName: "DM Sans" });
    const save = vi.fn(async (_b, _mime, name) => `ws/dna/${name}`);
    const out = await enrichDnaFonts(dna, save);
    expect(out.fonts.map((f) => f.assetId)).toEqual([
      "google-font:dmsans:700",
      "google-font:dmsans:400",
    ]);
    expect(out.assets).toHaveLength(3);
    expect(save).toHaveBeenCalledTimes(3);
    expect(out.assets[0]?.usage).toMatch(
      /original website font file was not verified/i,
    );
    await enrichDnaFonts(out, save);
    expect(save).toHaveBeenCalledTimes(3);
  });
  it("leaves evidence untouched when a licence is unavailable or the family is generic", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("not found", { status: 404 })),
    );
    const save = vi.fn();
    const out = await enrichDnaFonts(dna, save);
    expect(out.fonts[0]?.assetId).toBeUndefined();
    expect(save).not.toHaveBeenCalled();
    const generic = { ...dna, fonts: [{ ...dna.fonts[0]!, family: "Arial" }] };
    await enrichDnaFonts(generic, save);
    expect(save).not.toHaveBeenCalled();
  });
  it("rejects a different font returned for the requested name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("SIL OPEN FONT LICENSE")),
    );
    mocks.load.mockResolvedValue({
      files: {
        "fonts/brand-700.woff2": {
          base64: Buffer.from("font").toString("base64"),
        },
        "fonts/brand-400.woff2": {
          base64: Buffer.from("font").toString("base64"),
        },
      },
    });
    mocks.create.mockReturnValue({ familyName: "Other" });
    const save = vi.fn();
    expect((await enrichDnaFonts(dna, save)).assets).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
  });
});
