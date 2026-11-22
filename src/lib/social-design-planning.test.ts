import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareDesignItems } from "./social-design-planning.server";
import { founderQuotes } from "./social-quote-sources";
import { defaultSocialDesign } from "./social-design";

vi.mock("./creative-context.server", () => ({
  officialCreativeSiteUrl: (url: string) =>
    url.startsWith("https://") ? url : null,
}));
const classify = vi.fn();
vi.mock("./dossier.server", () => ({
  aiChat: (...args: unknown[]) => classify(...args),
}));
const copy = {
  headline: "Start with a decision",
  supporting: "Pick one customer to talk to.",
  direction: "Graphite sketch",
};
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("Sam's quote and design handoff", () => {
  it("creates a five-page founder story with three distinct source records and original bookends", async () => {
    const result = await prepareDesignItems(
      Array(5).fill(copy),
      "Three quotes for business founders, 4:5",
      [],
      true,
    );
    expect(result.map((item) => item.quote?.speaker)).toEqual([
      undefined,
      "Steve Jobs",
      "Paul Graham",
      "37signals",
      undefined,
    ]);
    expect(result.every((item) => item.design.aspect === "portrait")).toBe(
      true,
    );
    expect(result[2]?.quote).toEqual(founderQuotes[1]);
  });

  it("uses only selected references and excludes model-provided artwork IDs", async () => {
    const proposed = {
      ...copy,
      design: { ...defaultSocialDesign("Ink"), referenceIds: ["invented"] },
      artwork: { fileId: "invented" },
    };
    const [result] = await prepareDesignItems([proposed], "launch poster", [
      "selected",
    ]);
    expect(result?.design.referenceIds).toEqual(["selected"]);
    expect(result).not.toHaveProperty("artwork");
  });

  it("drops unsupported attributions and offers original text when research is unavailable", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "");
    const candidate = {
      ...founderQuotes[0]!,
      speaker: "Unknown author",
      text: "An invented sentence.",
    };
    const [result] = await prepareDesignItems(
      [{ ...copy, headline: candidate.text, quote: candidate }],
      "Quote poster",
      [],
    );
    expect(result?.quote).toBeUndefined();
    expect(result?.headline).not.toContain(candidate.text);
    expect(result?.quoteNotice).toMatch(/primary source/i);
  });

  it("requires the actual passage and a primary-source speaker assessment", async () => {
    vi.stubEnv("FIRECRAWL_API_KEY", "fixture-key");
    const candidate = {
      speaker: "Test Writer",
      text: "Keep a record of the decision.",
      sourceTitle: "Draft title",
      sourceUrl: "https://author.test/work",
    };
    const page = {
      metadata: { title: "Original essay" },
      markdown: candidate.speaker + "\\n" + candidate.text,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ data: page })),
    );
    classify.mockResolvedValue({
      choices: [{ message: { content: '{"primary":true,"attributed":true}' } }],
    });
    const [result] = await prepareDesignItems(
      [{ ...copy, quote: candidate }],
      "Founder quote",
      [],
    );
    expect(result?.quote).toEqual({
      ...candidate,
      sourceTitle: "Original essay",
    });
    classify.mockResolvedValue({
      choices: [
        { message: { content: '{"primary":false,"attributed":false}' } },
      ],
    });
    const [unverified] = await prepareDesignItems(
      [{ ...copy, quote: candidate }],
      "Founder quote",
      [],
    );
    expect(unverified?.quote).toBeUndefined();
  });
});
