import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: null as any, user: vi.fn(), propose: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ createServerOnlyFn: (fn: any) => fn, createServerFn: () => { let validate = (value: unknown) => value; const chain = { inputValidator: (fn: typeof validate) => { validate = fn; return chain; }, handler: (fn: any) => (input: any) => fn({ data: validate(input.data) }) }; return chain; } }));
vi.mock("../lib/supabase-admin.server", () => ({ requireUser: mocks.user, getAdminClient: () => mocks.admin }));
vi.mock("../lib/sam.context.server", () => ({ ensureThread: vi.fn().mockResolvedValue("thread") }));
vi.mock("../lib/creative-planning.server", () => ({ proposeNarratives: mocks.propose }));
import { moreNarratives, stopSamIdeation } from "../lib/creative.functions";
import { assertIdeationActive, discardStoppedIdeas, IDEATION_STOPPED_MESSAGE, IdeationStopped, stopWorkspaceIdeation, updateIdeationActivity } from "../lib/ideation-control.server";
import { IDEATION_PROGRESS_PREFIX } from "../lib/ideation-status";
const ws = "11111111-1111-4111-8111-111111111111", batch = "22222222-2222-4222-8222-222222222222";
let tables: Record<string, any[]>; let serial: number; let failActivity: boolean; let raceSave: boolean; let failProgress: boolean;
const idea = (id: string) => ({ id, title: `Original ${id}`, message: "A saved story", why: "Evidence", selected: false });
function fixture() {
  serial = 0; failActivity = false; raceSave = false; failProgress = false;
  tables = { creative_batches: [{ id: batch, workspace_id: ws, stage: "narratives", narratives: [idea("existing")], updated_at: "v1" }], agent_messages: [] };
  const admin: any = { rpc: vi.fn().mockResolvedValue({ data: true, error: null }), from: (table: string) => {
    let action = "read"; let payload: any; const filters: Array<(row: any) => boolean> = []; let cap = Infinity;
    const execute = () => {
      const source = tables[table] ?? [];
      if (action === "insert") {
        if (table === "agent_messages" && payload.role === "assistant" && failActivity) return { data: null, error: { message: "offline" } };
        const row = { id: `id-${++serial}`, created_at: new Date().toISOString(), ...structuredClone(payload) }; source.push(row); return { data: [row], error: null };
      }
      const rows = source.filter((row) => filters.every((filter) => filter(row))).slice(0, cap);
      if (action === "update") {
        if (table === "agent_messages" && failProgress && !raceSave) return { data: null, error: { message: "progress offline" } };
        rows.forEach((row) => Object.assign(row, structuredClone(payload)));
        if (table === "creative_batches" && raceSave) {
          raceSave = false;
          tables.agent_messages.filter((row) => row.content.startsWith(IDEATION_PROGRESS_PREFIX)).forEach((row) => row.content = IDEATION_STOPPED_MESSAGE);
          rows.forEach((row) => { row.narratives.push(idea("concurrent-user")); row.updated_at = "raced-user-version"; });
        }
      }
      return { data: structuredClone(rows), error: null };
    };
    const q: any = { select: () => q, eq: (key: string, value: any) => { filters.push((row) => row[key] === value); return q; }, like: (key: string, value: string) => { filters.push((row) => String(row[key]).startsWith(value.slice(0, -1))); return q; }, gte: () => q, order: () => q, limit: (value: number) => { cap = value; return q; }, update: (value: any) => { action = "update"; payload = value; return q; }, insert: (value: any) => { action = "insert"; payload = value; return q; }, single: async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; }, maybeSingle: async () => { const result = execute(); return { ...result, data: result.data?.[0] ?? null }; }, then: (resolve: any, reject: any) => Promise.resolve(execute()).then(resolve, reject) };
    return q;
  } };
  return admin;
}
beforeEach(() => { vi.clearAllMocks(); mocks.admin = fixture(); mocks.user.mockResolvedValue({ id: "user" }); mocks.propose.mockResolvedValue([{ title: "A fresh brand story", message: "A supported new audience story", why: "Brand evidence", type: "Explainer" }]); });
const run = () => (moreNarratives as any)({ data: { batch_id: batch } });

describe("durable narrative cancellation", () => {
  it("checks authenticated workspace membership before stopping", async () => {
    mocks.admin.rpc.mockResolvedValue({ data: false, error: null });
    await expect((stopSamIdeation as any)({ data: { workspace_id: ws } })).rejects.toThrow("Forbidden");
    expect(mocks.user).toHaveBeenCalledOnce();
  });
  it("stops only this workspace's active marker and CAS cannot revive it", async () => {
    tables.agent_messages.push({ id: "active", workspace_id: ws, role: "assistant", content: `${IDEATION_PROGRESS_PREFIX}\nDrafting` }, { id: "other", workspace_id: "other", role: "assistant", content: IDEATION_PROGRESS_PREFIX }, { id: "done", workspace_id: ws, role: "assistant", content: "I saved four narratives" });
    expect(await stopWorkspaceIdeation(mocks.admin, ws)).toEqual({ stopped: 1 });
    await expect(updateIdeationActivity(mocks.admin, ws, "active", `${IDEATION_PROGRESS_PREFIX}\nReviewing`)).rejects.toBeInstanceOf(IdeationStopped);
    await expect(assertIdeationActive(mocks.admin, ws, "active")).rejects.toBeInstanceOf(IdeationStopped);
    expect(tables.agent_messages[1].content).toBe(IDEATION_PROGRESS_PREFIX);
    expect(tables.agent_messages[2].content).toBe("I saved four narratives");
  });
  it("does not start inference when its durable activity cannot be created", async () => {
    failActivity = true;
    await expect(run()).rejects.toThrow("drafting has not started");
    expect(mocks.propose).not.toHaveBeenCalled();
    expect(tables.creative_batches[0].narratives.map((item: any) => item.id)).toEqual(["existing"]);
  });
  it("honours stop during authentication before an activity row exists", async () => {
    mocks.user.mockImplementationOnce(async () => {
      expect(await stopWorkspaceIdeation(mocks.admin, ws, "user")).toEqual({ stopped: 0 });
      return { id: "user" };
    });
    expect(await run()).toMatchObject({ added: 0, cancelled: true });
    expect(mocks.propose).not.toHaveBeenCalled();
    expect(tables.creative_batches[0].narratives.map((item: any) => item.id)).toEqual(["existing"]);
    expect(tables.agent_messages.some((row) => row.content.startsWith(IDEATION_PROGRESS_PREFIX))).toBe(false);
  });
  it("discards a provider result arriving after stop and returns cancellation instead of no-new-angle", async () => {
    mocks.propose.mockImplementation(async () => { await stopWorkspaceIdeation(mocks.admin, ws); return [{ title: "Late result", message: "Discard me", type: "Explainer" }]; });
    expect(await run()).toMatchObject({ added: 0, cancelled: true });
    expect(tables.creative_batches[0].narratives.map((item: any) => item.id)).toEqual(["existing"]);
    expect(tables.agent_messages.at(-1).content).toBe(IDEATION_STOPPED_MESSAGE);
  });
  it("removes only fresh IDs if stop races persistence, preserving concurrent user work", async () => {
    raceSave = true;
    expect(await run()).toMatchObject({ added: 0, cancelled: true });
    expect(tables.creative_batches[0].narratives.map((item: any) => item.id)).toEqual(["existing", "concurrent-user"]);
    expect(tables.agent_messages.at(-1).content).toBe(IDEATION_STOPPED_MESSAGE);
  });
  it("cleans saved results even if the stopped progress update fails", async () => {
    raceSave = true; failProgress = true;
    await expect(run()).rejects.toThrow("Could not save Sam's idea progress.");
    expect(tables.creative_batches[0].narratives.map((item: any) => item.id)).toEqual(["existing", "concurrent-user"]);
  });
  it("allows an active request to save normally", async () => {
    expect(await run()).toMatchObject({ added: 1, batchId: batch });
    expect(tables.creative_batches[0].narratives).toHaveLength(2);
    expect(tables.agent_messages.at(-1).content).toContain("I saved 1 new narratives");
  });
  it("cleanup never removes other runs or batches", async () => {
    tables.creative_batches[0].narratives.push(idea("fresh"), idea("other-run"));
    await discardStoppedIdeas(mocks.admin, ws, batch, ["fresh"]);
    expect(tables.creative_batches[0].narratives.map((item: any) => item.id)).toEqual(["existing", "other-run"]);
  });
});
