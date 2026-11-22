import { describe, expect, it } from "vitest";
import { getHiggsfieldKnowledgeContext, HIGGSFIELD_MODEL_KNOWLEDGE } from "./higgsfield-knowledge";

function summaries(query: string) {
  const context = getHiggsfieldKnowledgeContext({ query, maxModels: 8, maxChars: 16000 });
  const families = context.split("\n").filter((line) => line.startsWith('{"family":')).map((line) => JSON.parse(line).family as string);
  return { context, families };
}

describe("Higgsfield research retrieval", () => {
  it("retrieves cinematic property video options without needing a model name", () => {
    for (const query of ["cinematic property", "compare Higgsfield models for cinematic property video"]) {
      const { context, families } = summaries(query);
      expect(families.slice(0, 4)).toEqual(expect.arrayContaining(["Cinema Studio 4.0", "LTX-2.5", "Kling 3.0", "Seedance 2.5"]));
      expect(families).not.toContain("Soul ID");
      expect(context).toContain("recommendationInferences");
      expect(context).toContain("not account entitlement");
    }
  });

  it("gives both named current families before spending space on schemas", () => {
    const { context, families } = summaries("compare Kling and Seedance for cinematic property");
    expect(families.slice(0, 2)).toEqual(expect.arrayContaining(["Kling 3.0", "Seedance 2.5"]));
    const lastSummary = context.lastIndexOf('{"family":');
    expect(lastSummary).toBeLessThan(context.indexOf('"inputSchema":'));
    expect(context).toContain("kling-video/v3.0/pro/image-to-video");
    expect(context).toContain("bytedance/seedance-2.5/reference-to-video");
  });

  it("keeps still-image and motion research aligned with requested inputs", () => {
    expect(summaries("SOUL portrait photography").families[0]).toBe("SOUL V2");
    expect(summaries("motion transfer existing footage Genjutsu").families[0]).toBe("Genjutsu");
  });

  it("keeps hard budgets and an exact selected workflow schema", () => {
    expect(HIGGSFIELD_MODEL_KNOWLEDGE).toHaveLength(36);
    expect(HIGGSFIELD_MODEL_KNOWLEDGE.flatMap((item) => item.workflows)).toHaveLength(84);
    for (const maxChars of [1200, 9000, 16000, NaN, Infinity]) {
      expect(getHiggsfieldKnowledgeContext({ query: "cinematic property", maxChars }).length).toBeLessThanOrEqual(Number.isFinite(maxChars) ? maxChars : 9000);
    }
    const exact = getHiggsfieldKnowledgeContext({ family: "ltx-2-5", endpoint: "lightricks/ltx-2.5/image-to-video/fast", maxChars: 16000 });
    expect(exact).toContain('"inputSchema":');
    expect(exact).toContain('"camera_movement":');
    expect(exact).not.toContain('"endpoint":"lightricks/ltx-2.5/text-to-video/fast"');
  });
});
