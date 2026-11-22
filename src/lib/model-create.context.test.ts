import { describe, expect, it, vi } from "vitest";
import { loadCreativeContext } from "./creative-context.server";

vi.mock("@/lib/winner-learning.server", () => ({ loadWinnerLearning: async () => "" }));

describe("manual Models selected context", () => {
  it("keeps all saved workspace context out of a standalone request", async () => {
    const from = vi.fn();
    const result = await loadCreativeContext({ from } as unknown as Parameters<typeof loadCreativeContext>[0], "workspace", "Make an unrelated film", [], undefined, "standalone");
    expect(from).not.toHaveBeenCalled();
    expect(result).toMatchObject({ dnaVersionId: null, profileDna: null, files: [], imageParts: [], brand: "" });
    expect(result.text).toContain("Make an unrelated film");
  });
  it.each([["selected"], []])("only inspects selected saved files: %j", async (...ids: string[]) => {
    const allowed = ids;
    const selected = { id: "selected", name: "brief.md", kind: "doc", extracted_text: "Approved product facts", source: "upload" };
    const excluded = { ...selected, id: "excluded", name: "other.md", extracted_text: "Unselected private reference" };
    const filters: unknown[] = [];
    const from = vi.fn((table: string) => {
      let files = [selected, excluded];
      const result = () => ({ data: table === "brand_files" ? files : table === "workspaces" ? { name: "Brand", website: null } : table === "creative_variants" || table === "dossier_documents" ? [] : null, error: null });
      const query = {
        or: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
        in: vi.fn((key: string, values: string[]) => { filters.push({ table, key, values }); files = files.filter((file) => values.includes(file.id)); return query; }),
        single: () => Promise.resolve(result()), maybeSingle: () => Promise.resolve(result()),
        then: (resolve: (value: unknown) => void) => Promise.resolve(result()).then(resolve),
      }; return query;
    });
    const result = await loadCreativeContext({ from } as unknown as Parameters<typeof loadCreativeContext>[0], "workspace", "Make a film", allowed);
    expect(filters).toEqual([{ table: "brand_files", key: "id", values: allowed }]);
    expect(result.files.map((file) => file.id)).toEqual(allowed);
    expect(result.text).not.toContain("Unselected private reference");
    if (allowed.length) expect(result.text).toContain("Approved product facts");
  });
});
