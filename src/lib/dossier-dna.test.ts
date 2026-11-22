import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), dna: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
vi.mock("./brand-dna-store.server", () => ({ readProductionDna: mocks.dna }));
import { loadDossierContext } from "./dossier.server";
describe("dossier evidence", () => {
  beforeEach(() => {
    mocks.dna.mockReset();
    mocks.admin.mockReset();
  });
  it("places pinned DNA ahead of older derived evidence and does not promote inference to fact", async () => {
    const docs = [
      { title: "Older document", content: "Old claim", updated_at: "" },
    ];
    const admin = {
      from: (table: string) => {
        const chain = {
          select: () => chain,
          eq: () => chain,
          not: () => chain,
          order: () => chain,
          limit: async () => ({ data: docs, error: null }),
          maybeSingle: async () => ({
            data:
              table === "brand_profiles"
                ? { profile: { description: "old" } }
                : null,
          }),
        };
        return chain;
      },
    };
    mocks.admin.mockReturnValue(admin);
    mocks.dna.mockResolvedValue({
      id: "version",
      guidelines: "Confirmed identity",
      dna: {},
    });
    const text = await loadDossierContext("workspace", "version");
    expect(mocks.dna).toHaveBeenCalledWith(admin, "workspace", "version");
    expect(text.indexOf("Confirmed identity")).toBeLessThan(
      text.indexOf("Old claim"),
    );
    expect(text).toContain("inferred or recommended");
    expect(text).not.toContain("Treat these as the highest");
  });
  it("does not silently discard a failed identity lookup", async () => {
    mocks.admin.mockReturnValue({});
    mocks.dna.mockRejectedValue(new Error("identity unavailable"));
    await expect(loadDossierContext("workspace")).rejects.toThrow(
      "identity unavailable",
    );
  });
});
