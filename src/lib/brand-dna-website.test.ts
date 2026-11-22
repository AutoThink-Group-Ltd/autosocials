import { describe, expect, it } from "vitest";
import sharp from "sharp";
import {
  applyRenderedWebsiteEvidence,
  pageHeadings,
  firecrawlWebsiteRequest,
  applyFirecrawlWebsiteEvidence,
  inferPublicVoice,
} from "./brand-dna-website.server";
import type { BrandDna } from "./brand-dna";
describe("website evidence normalization", () => {
  it("uses accessible heading text without hidden animation frames", () => {
    expect(
      pageHeadings(
        '<h1><span class="sr-only">Turns conversations into outcomes.</span><span aria-hidden="true">Frame one <span>Frame two</span></span></h1><h2>Find &amp; connect</h2>',
      ),
    ).toEqual(["Turns conversations into outcomes.", "Find & connect"]);
  });
  it("requests the documented Firecrawl action and normalizes its response and crop", async () => {
    const request = firecrawlWebsiteRequest("https://example.com");
    expect(request.actions[1]).toMatchObject({ type: "executeJavascript" });
    const dna: BrandDna = {
      schemaVersion: 1,
      name: "Example",
      website: "https://example.com",
      sourceKind: "website",
      description: "",
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
    };
    const screenshot = await sharp({
      create: { width: 1440, height: 900, channels: 3, background: "#fefefe" },
    })
      .png()
      .toBuffer();
    const stub = [
      {
        type: "executeJavascript",
        value: {
          colours: [
            { role: "background", hex: "#F8F6F2" },
            { role: "text", hex: "#10252B" },
          ],
          fonts: [
            { family: "Inter", role: "body" },
            { family: "Display", role: "display" },
          ],
          headings: ["A visible public heading"],
          gradients: [
            {
              surface: "hero",
              value: "linear-gradient(rgb(0, 0, 0), rgb(255, 255, 255))",
            },
          ],
          mark: { x: 20, y: 20, width: 200, height: 50 },
          viewport: { width: 1440, height: 900 },
        },
      },
    ];
    const saved: Record<string, Buffer> = {};
    await applyFirecrawlWebsiteEvidence(
      dna,
      stub,
      screenshot,
      async (bytes, _mime, name) => {
        saved[name] = bytes;
        return `private/${name}`;
      },
    );
    expect(dna.fonts.map((f) => f.role)).toEqual(["body", "display"]);
    expect(dna.colours).toHaveLength(2);
    expect(dna.messages[0]?.text).toBe("A visible public heading");
    expect(dna.colourUsage?.[0]?.text).toContain("linear-gradient");
    expect(dna.logoId).toBe("rendered-logo");
    expect((await sharp(saved["rendered-logo.png"]!).metadata()).width).toBe(
      200,
    );
  });
  it("does not crop a provider rectangle outside the screenshot", async () => {
    const dna: BrandDna = {
      schemaVersion: 1,
      name: "Example",
      website: "https://example.com",
      sourceKind: "website",
      description: "",
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
    };
    const screenshot = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await applyFirecrawlWebsiteEvidence(
      dna,
      [
        {
          type: "executeJavascript",
          value: {
            mark: { x: 99, y: 1, width: 60, height: 20 },
            viewport: { width: 100, height: 100 },
          },
        },
      ],
      screenshot,
      async (_b, _m, n) => n,
    );
    expect(dna.logoId).toBeUndefined();
  });
  it("keeps voice observations tied to an actual line of copy", () => {
    const samples = [
      {
        text: "What would you like to send?",
        evidence: {
          source: "https://example.com",
          status: "observed" as const,
          confidence: "medium" as const,
        },
      },
    ];
    const voice = inferPublicVoice(samples);
    expect(voice).toHaveLength(2);
    expect(voice[0]?.evidence.note).toContain(samples[0]!.text);
    expect(voice[0]?.evidence.status).toBe("inferred");
  });
  it("adds scoped rendered font roles and safe screenshot previews", async () => {
    const dna: BrandDna = {
      schemaVersion: 1,
      name: "Example",
      website: "https://example.com",
      sourceKind: "website",
      description: "",
      personality: [],
      colours: [],
      fonts: [
        {
          family: "Inter",
          role: "unspecified",
          surface: "CSS",
          weights: "",
          evidence: {
            source: "https://example.com",
            status: "observed",
            confidence: "medium",
          },
        },
      ],
      assets: [],
      voice: [],
      messages: [],
      examples: [],
      offerings: [],
      visualLanguage: [],
      gaps: ["A rendered screenshot was not available for this scan."],
    };
    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#ffffff" },
    })
      .png()
      .toBuffer();
    await applyRenderedWebsiteEvidence(
      dna,
      {
        source: dna.website,
        screenshot: image,
        colours: [{ role: "text", hex: "#10252B" }],
        fonts: [{ family: "Inter", role: "body" }],
      },
      async (_bytes, _mime, name) => `private/${name}`,
    );
    expect(dna.fonts[0]?.role).toBe("body");
    expect(dna.colours[0]?.surface).toBe("rendered homepage");
    expect(dna.assets[0]).toMatchObject({
      kind: "screenshot",
      reusable: false,
      previewPath: "private/rendered-screenshot-preview.png",
    });
    expect(dna.gaps).toEqual([]);
  });
});
