import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ admin: null as unknown, dossier: vi.fn(), snapshot: vi.fn(), brand: vi.fn(), availability: vi.fn() }));
vi.mock("@/lib/supabase-admin.server", () => ({ getAdminClient: () => mocked.admin }));
vi.mock("@/lib/dossier.server", () => ({ loadDossierContext: mocked.dossier }));
vi.mock("@/lib/modules.server", () => ({ loadModuleSnapshot: mocked.snapshot }));
vi.mock("@/lib/brand-context.server", () => ({ readBrandContext: mocked.brand }));
vi.mock("@/lib/playbook.server", () => ({ CREATIVE_PLAYBOOK: "Sourced principles: meaningful audience insight and composition." }));
vi.mock("@/lib/creative-providers/adapters.server", () => ({ getCreativeProviderAvailability: mocked.availability }));
import { buildSamContext } from "@/lib/sam.context.server";

function client() {
  const filters: { table: string; key: string; value: unknown }[] = [];
  const tables: string[] = [];
  const from = vi.fn((table: string) => {
    tables.push(table);
    const data: Record<string, unknown> = {
      brand_files: [{ id: "owned-file", name: "product.png", kind: "image", ai_label: "Product", ai_summary: "Prior summary" }],
      brand_facts: { does: ["An approved product claim"], banned_claims: ["Guaranteed"], updated_at: "today" },
      creative_variants: [{ id: "current-variant", position: 2, hook: "Current plan hook", duration_s: 15, size: "1080x1920", review_state: "draft", cta: "View", production_plan: { plan_id: "current" } }, { id: "old-variant", position: 1, hook: "Old plan hook", duration_s: 15, size: "1080x1920", review_state: "draft", cta: "View", production_plan: { plan_id: "old" } }],
      creative_batches: { id: "batch", title: "Current work", stage: "briefs", narratives: [] },
      canvases: { title: "Active work", blocks: [], version: 1 },
    };
    const result = { data: data[table] ?? null, error: null };
    const builder = {
      select: () => builder,
      eq: (key: string, value: unknown) => { filters.push({ table, key, value }); return builder; },
      order: () => builder, limit: () => builder, maybeSingle: () => Promise.resolve(result),
      then: (resolve: (value: typeof result) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
    };
    return builder;
  });
  return { sb: { from } as unknown as Parameters<typeof buildSamContext>[0], filters, tables };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocked.dossier.mockResolvedValue("Approved dossier.");
  mocked.snapshot.mockResolvedValue("Current stage snapshot.");
  mocked.brand.mockResolvedValue({ ready: false, files: 0, docs: 0, website: null });
  mocked.availability.mockReturnValue([{ capabilityId: "higgsfield-image-generate", available: true }, { capabilityId: "golpo-canvas", available: false }]);
});
describe("production-aware Sam create context", () => {
  it("includes connected production truth, approved facts, research and scoped recent work without new paid calls", async () => {
    const c = client(); mocked.admin = c.sb;
    const result = await buildSamContext(c.sb, "ours", "create");
    expect(result.sys).toContain("Sourced principles: meaningful audience insight");
    expect(result.sys).toContain("An approved product claim");
    expect(result.sys).toContain("Guaranteed");
    expect(result.sys).toContain("higgsfield-image-generate");
    expect(result.sys).not.toContain('"id":"golpo-canvas"');
    expect(result.sys).toContain("Capability IDs are NOT registered chat tools");
    expect(result.sys).toContain("A short user brief is a valid starting point");
    expect(result.ownFiles).toEqual(new Set(["owned-file"]));
    expect(mocked.dossier).toHaveBeenCalledOnce();
    for (const table of ["brand_files", "brand_facts", "creative_variants"]) expect(c.filters).toContainEqual({ table, key: "workspace_id", value: "ours" });
  });
  it("uses active-plan saved variant IDs for confirm blocks and scopes the canvas", async () => {
    const c = client(); mocked.admin = c.sb;
    const result = await buildSamContext(c.sb, "ours", "create", "canvas");
    const active = result.sys.split("Asset briefs (active plan only):")[1]!.split("## FILE LIBRARY")[0]!;
    expect(active).toContain("variant_id current-variant");
    expect(active).not.toContain("old-variant");
    expect(c.filters).toContainEqual({ table: "canvases", key: "workspace_id", value: "ours" });
    expect(result.sys).toContain("No images or playback were newly inspected");
  });
  it("keeps create-specific facts/capability work out of other module turns", async () => {
    const c = client(); mocked.admin = c.sb;
    const result = await buildSamContext(c.sb, "ours", "schedule");
    expect(c.tables).not.toContain("brand_facts");
    expect(c.tables).not.toContain("creative_variants");
    expect(mocked.availability).not.toHaveBeenCalled();
    expect(result.sys).not.toContain("CONNECTED PRODUCTION CAPABILITIES");
  });
});
