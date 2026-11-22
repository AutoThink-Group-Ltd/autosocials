import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), user: vi.fn(), plan: vi.fn(), brand: vi.fn(), chat: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerOnlyFn: (fn: any) => fn, createServerFn: () => {
  let validate: (value: unknown) => unknown = (value) => value;
  const chain = { inputValidator: (fn: typeof validate) => { validate = fn; return chain; }, handler: (fn: (context: { data: unknown }) => unknown) => (input: { data: unknown }) => Promise.resolve().then(() => fn({ data: validate(input.data) })) };
  return chain;
} }));
vi.mock("../lib/supabase-admin.server", () => ({ requireUser: mocks.user, getAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("../lib/brand-context.server", () => ({ requireBrandContext: mocks.brand }));
vi.mock("../lib/dossier.server", () => ({ aiChat: mocks.chat, loadDossierContext: vi.fn() }));
vi.mock("../lib/creative-planning.server", () => ({ planProductionAssets: mocks.plan }));
import { planBatch } from "../lib/creative.functions";

const call = planBatch as unknown as (input: { data: unknown }) => Promise<{ batchId: string }>;
const workspace = "b5fa5eaf-dfab-4350-ab34-8bb8cf8e49a8";
const input = { workspace_id: workspace, goal: "Explain our new offer", days: 7, starts_on: "2026-11-01" };
const direction = Object.fromEntries(["audience", "objective", "insight", "argument", "hook", "story_mechanism", "composition", "motion", "imagery", "pacing", "ending", "typography", "sound", "evidence", "asset_strategy"].map((key) => [key, `Concrete ${key}`]));
let batch: Record<string, unknown>;
let variants: Array<Record<string, unknown>>;
beforeEach(() => {
  vi.clearAllMocks(); batch = {}; variants = [];
  mocks.user.mockResolvedValue({ id: "user-1" }); mocks.rpc.mockResolvedValue({ data: true });
  mocks.from.mockImplementation((table: string) => ({ insert: (rows: unknown) => {
    if (table === "creative_batches") { batch = rows as Record<string, unknown>; return { select: () => ({ single: async () => ({ data: { id: "batch-1" }, error: null }) }) }; }
    if (table === "creative_variants") { variants = rows as Array<Record<string, unknown>>; return Promise.resolve({ error: null }); }
    throw new Error("Unexpected table");
  } }));
  mocks.plan.mockImplementation(async ({ specs }: { specs: Array<{ narrative: string; duration: number; size: string }> }) => ({ title: "Planned campaign", audience: "Relevant audience", offer: "", voice: "Puck", voice_reason: "Friendly delivery", variants: specs.map((spec) => ({ day: 1, angle: spec.narrative, argument: "Evidence-led argument", hook: "Specific opening", format: "Mixed-media film", duration_s: spec.duration, size: spec.size, beats: ["Meaningful story beat"], voiceover: "Spoken narration", script: "Deliberate visual direction", caption: "Caption", cta: "Learn more", file_ids: [], production_plan: { version: 1, direction, steps: [], assumptions: ["Sparse brief"], diversity_issues: [] } })) }));
});

describe("legacy batch production planning", () => {
  it("uses production-aware planning for a sparse goal and persists direction, voice and bounded scheduled rows", async () => {
    await expect(call({ data: input })).resolves.toEqual({ batchId: "batch-1" });
    expect(mocks.brand).not.toHaveBeenCalled(); expect(mocks.chat).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("can_access_workspace", { _user_id: "user-1", _workspace_id: workspace });
    expect(mocks.plan).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: workspace, voice: null, picked: [expect.objectContaining({ title: input.goal, message: input.goal, selected: true, custom: true })] }));
    expect(batch).toMatchObject({ workspace_id: workspace, created_by: "user-1", voice_id: "builtin:Puck", days: 7, starts_on: input.starts_on, stage: "briefs" });
    expect(variants).toHaveLength(4);
    expect(variants.map((v) => v["planned_for"])).toEqual(["2026-11-01", "2026-11-01", "2026-11-02", "2026-11-02"]);
    expect(variants.map((v) => v["duration_s"])).toEqual([15, 30, 15, 30]);
    for (const row of variants) {
      expect(row).toMatchObject({ workspace_id: workspace, batch_id: "batch-1", build_prompt: null, build_prompt_issues: [] });
      expect(row["script"]).toContain("STRUCTURED CREATIVE DIRECTION:");
      expect(row["production_plan"]).toMatchObject({ direction, plan_id: expect.any(String), steps: [] });
    }
    expect(new Set(variants.map((v) => (v["production_plan"] as Record<string, unknown>)["plan_id"])).size).toBe(1);
  });
  it("retains the full goal while bounding the custom narrative title and two assets per day", async () => {
    const goal = "A longer commercial objective ".repeat(20);
    await call({ data: { ...input, goal, days: 1 } });
    expect(variants).toHaveLength(2);
    const options = mocks.plan.mock.calls[0]?.[0] as { picked: Array<{ title: string; message: string }>; specs: Array<{ note: string }> };
    expect(options.picked[0]?.title).toHaveLength(160); expect(options.picked[0]?.message).toBe(goal.trim()); expect(options.specs[0]?.note).toBe(goal.trim());
  });
  it("rejects invalid calendar dates and day bounds before planning or persistence", async () => {
    for (const data of [{ ...input, starts_on: "2026-02-30" }, { ...input, days: 0 }, { ...input, days: 8 }]) await expect(call({ data })).rejects.toThrow();
    expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("checks membership before planner access and refuses an incomplete production plan", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: false });
    await expect(call({ data: input })).rejects.toThrow("Forbidden");
    expect(mocks.plan).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
    mocks.plan.mockResolvedValueOnce({ variants: [] });
    await expect(call({ data: input })).rejects.toThrow("complete production plan");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
