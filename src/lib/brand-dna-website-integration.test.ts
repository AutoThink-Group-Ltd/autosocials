import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
const aiChatMock = vi.hoisted(() =>
  vi.fn(async (_input: unknown) => ({
    choices: [
      {
        message: {
          content: JSON.stringify({
            description: "",
            personality: [],
            voice: [],
            offerings: [],
            visualLanguage: [
              {
                text: "A pale canvas.",
                source: "https://meadow-repairs.example.com/",
              },
            ],
          }),
        },
      },
    ],
  })),
);
vi.mock("./dossier.server", () => ({ aiChat: aiChatMock }));
import { extractWebsiteDna } from "./brand-dna-website.server";
describe("URL-only small-business regression", () => {
  it("extracts a useful grounded first identity from a sparse site without credentials or uploads", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    const saved: { name: string; mime: string }[] = [];
    try {
      const dna = await extractWebsiteDna(
        "https://meadow-repairs.example.com",
        async (_bytes, mime, name) => {
          saved.push({ name, mime });
          return `private/${name}`;
        },
        async () => {},
        async (url: string) => ({
          url,
          type: "text/html",
          bytes: Buffer.from(
            '<!doctype html><html><head><title>Meadow Repairs</title><meta name="description" content="Local bicycle repair and servicing."><style>main { max-width: 60rem }</style></head><body><main><h1>Get your bicycle ready to ride.</h1><p>We repair and service bicycles for local riders. Tell us what you need and we will help you choose a practical next step.</p><h2>How can we help you?</h2></main></body></html>',
          ),
        }),
      );
      expect(dna.name).toBe("Meadow Repairs");
      expect(dna.description).toBe("Local bicycle repair and servicing.");
      expect(dna.messages.map((x) => x.text)).toContain(
        "Get your bicycle ready to ride.",
      );
      expect(
        dna.voice.some(
          (x) =>
            x.text.includes("reader directly") &&
            x.evidence.note?.includes("your bicycle"),
        ),
      ).toBe(true);
      expect(
        dna.voice.some(
          (x) =>
            x.text.includes("questions") &&
            x.evidence.note?.includes("How can we help you?"),
        ),
      ).toBe(true);
      expect(dna.colours).toEqual([]);
      expect(dna.fonts).toEqual([]);
      expect(dna.assets).toEqual([]);
      expect(dna.gaps.some((x) => x.includes("logo"))).toBe(true);
      expect(saved.some((x) => x.mime === "text/html")).toBe(true);
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("runs the actual handler against a stubbed Firecrawl response and captures the rendered mark", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fixture-key");
    vi.stubEnv("OPENAI_API_KEY", "fixture-key");
    aiChatMock.mockClear();
    let actionRequested = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: unknown, init: { body?: string }) => {
        const request = JSON.parse(init.body ?? "{}");
        actionRequested =
          request.actions?.some(
            (x: { type: string }) => x.type === "executeJavascript",
          ) === true;
        return new Response(
          JSON.stringify({
            data: {
              actions: {
                javascriptReturns: [
                  {
                    type: "executeJavascript",
                    value: {
                      colours: [{ role: "background", hex: "#F8F6F2" }],
                      fonts: [{ family: "Inter", role: "body" }],
                      headings: ["Useful rendered heading"],
                      mark: { x: 10, y: 10, width: 100, height: 30 },
                      viewport: { width: 1440, height: 900 },
                    },
                  },
                ],
              },
              screenshot: "https://capture.example.com/image.png",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    const image = await sharp({
      create: { width: 1440, height: 900, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    try {
      const dna = await extractWebsiteDna(
        "https://meadow-repairs.example.com",
        async (_b, _m, n) => `private/${n}`,
        async () => {},
        async (url) =>
          url.includes("capture.example.com")
            ? { url, type: "image/png", bytes: image }
            : {
                url,
                type: "text/html",
                bytes: Buffer.from(
                  "<html><head><title>Meadow Repairs</title></head><body><main><h1>Useful rendered heading</h1></main></body></html>",
                ),
              },
      );
      expect(actionRequested).toBe(true);
      expect(
        dna.fonts.some((f) => f.family === "Inter" && f.role === "body"),
      ).toBe(true);
      expect(dna.colours.some((c) => c.hex === "#F8F6F2")).toBe(true);
      expect(dna.logoId).toBe("rendered-logo");
      expect(dna.assets.some((a) => a.id === "rendered-screenshot")).toBe(true);
      const call = aiChatMock.mock.calls[0]?.[0] as {
        messages: { content: unknown }[];
      };
      const content = call.messages[1]?.content as {
        type: string;
        image_url?: { url: string };
      }[];
      expect(
        content.find((x) => x.type === "image_url")?.image_url?.url,
      ).toMatch(/^data:image\/jpeg;base64,/);
      expect(dna.visualLanguage[0]?.evidence.note).toContain("screenshot");
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
