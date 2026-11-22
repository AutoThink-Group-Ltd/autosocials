import { describe, expect, it, vi } from "vitest";
const notices = vi.hoisted(() => vi.fn(async (_input: unknown, _admin?: unknown) => {}));
vi.mock("../lib/creative-failure-alert.server", () => ({ notifyCreativeFailure: notices }));
import { continuePlanningBriefs, runNarrativePlanningJobs } from "../lib/narrative-planning.server";
const queued = () => ({ id: "job", batch_id: "batch", workspace_id: "workspace", created_by: "user", input: { count: 3, picked: [{ title: "Test narrative" }] }, status: "queued", progress: "Queued", error: null, checkpoint: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), started_at: null, completed_at: null });
function database(rows: Array<Record<string, any>>) { return { rpc: vi.fn(async () => ({ error: null })), from() {
  const filters: Array<(row: Record<string, any>) => boolean> = []; let patch: Record<string, unknown> | undefined; let returning = false; let single = false;
  const query: any = { select() { returning = true; return query; }, update(value: Record<string, unknown>) { patch = value; return query; }, eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query; }, lt(key: string, value: string) { filters.push(row => row[key] != null && row[key] < value); return query; }, order() { return query; }, limit() { return query; }, maybeSingle() { single = true; return query; }, then(resolve: (value: unknown) => unknown) { const found = rows.filter(row => filters.every(filter => filter(row))); if (patch) found.forEach(row => Object.assign(row, patch)); return Promise.resolve({ data: single ? found[0] ?? null : returning ? found : [], error: null }).then(resolve); } }; return query;
} } as any; }
describe("durable narrative preparation", () => {
  it("claims queued work once and never repeats completed planning", async () => { const rows = [queued()]; const execute = vi.fn(async () => ({ count: 3, plan_id: "job" })); await runNarrativePlanningJobs(database(rows), execute); await runNarrativePlanningJobs(database(rows), execute); expect(execute).toHaveBeenCalledTimes(1); expect(rows[0]!.status).toBe("completed"); });
  it("persists detailed failure and narrative metadata before notifying support", async () => { notices.mockClear(); const rows = [queued()]; await runNarrativePlanningJobs(database(rows), async () => { throw new Error("Detailed planner critique"); }); expect(rows[0]!.status).toBe("failed"); expect(rows[0]!.error).toBe("Detailed planner critique"); expect(notices).toHaveBeenCalledTimes(1); expect(notices.mock.calls[0]?.[0]).toMatchObject({ kind: "planning", jobId: "job", narratives: [{ title: "Test narrative" }] }); });
  it("yields checkpointed preparation to a fresh invocation before completing", async () => {
    const rows: Array<Record<string, any>> = [queued()]; const db = database(rows);
    const execute = vi.fn(async () => {
      if (!rows[0]!.checkpoint) { rows[0]!.checkpoint = { plan: { variants: [{}] }, variant_ids: ["brief"] }; return { count: 1, plan_id: "job", deferred: true }; }
      return { count: 1, plan_id: "job" };
    });
    await runNarrativePlanningJobs(db, execute);
    expect(rows[0]!.status).toBe("queued"); expect(rows[0]!.completed_at).toBeNull(); expect(db.rpc).toHaveBeenCalledWith("advance_creative_engine_jobs");
    await runNarrativePlanningJobs(db, execute);
    expect(rows[0]!.status).toBe("completed"); expect(execute).toHaveBeenCalledTimes(2);
  });
  it("recovers a terminated checkpointed worker without repeating initial inference", async () => {
    const rows = [{ ...queued(), status: "running", started_at: new Date(Date.now() - 7 * 60_000).toISOString(), checkpoint: { plan: { variants: [{}] }, variant_ids: ["saved-brief"] } }];
    const execute = vi.fn(async (job) => { expect(job.checkpoint.variant_ids).toEqual(["saved-brief"]); return { count: 1, plan_id: "job" }; });
    await runNarrativePlanningJobs(database(rows), execute);
    expect(execute).toHaveBeenCalledTimes(1); expect(rows[0]!.status).toBe("completed");
  });
  it("does not reclaim a fresh worker or automatically repeat an interrupted unsaved inference", async () => {
    const rows = [{ ...queued(), status: "running", started_at: new Date(Date.now() - 3 * 60_000).toISOString(), checkpoint: { plan: { variants: [{}] }, variant_ids: ["brief"] } }, { ...queued(), id: "unsaved", status: "running", started_at: new Date(Date.now() - 7 * 60_000).toISOString() }];
    const execute = vi.fn(async () => ({ count: 1, plan_id: "job" }));
    await runNarrativePlanningJobs(database(rows), execute);
    expect(execute).not.toHaveBeenCalled(); expect(rows.every((row) => row.status === "running")).toBe(true);
  });
  it("bounds automatic recovery instead of repeating a slow prompt forever", async () => {
    notices.mockClear();
    const rows = [{ ...queued(), status: "running", started_at: new Date(Date.now() - 7 * 60_000).toISOString(), checkpoint: { plan: { variants: [{}] }, variant_ids: ["brief"], automatic_recoveries: 1 } }];
    const execute = vi.fn(async () => ({ count: 1, plan_id: "job" }));
    await runNarrativePlanningJobs(database(rows), execute);
    expect(execute).not.toHaveBeenCalled(); expect(rows[0]!.status).toBe("failed"); expect(rows[0]!.error).toContain("Retry explicitly"); expect(notices).toHaveBeenCalledTimes(1);
  });
  it("keeps independently saved prompts when a sibling fails and skips them on recovery", async () => {
    const briefs = [{ id: "saved", build_prompt: "Already reviewed" as string | null }, { id: "first", build_prompt: null as string | null }, { id: "second", build_prompt: null as string | null }];
    const prepare = vi.fn(async (brief: typeof briefs[number]) => { if (brief.id === "second") throw new Error("Interrupted prompt"); brief.build_prompt = "Saved immediately"; });
    await expect(continuePlanningBriefs(briefs, prepare)).rejects.toThrow("Interrupted prompt");
    expect(briefs[1]!.build_prompt).toBe("Saved immediately"); expect(prepare.mock.calls.map(([brief]) => brief.id)).toEqual(["first", "second"]);
    const resume = vi.fn(async (brief: typeof briefs[number]) => { brief.build_prompt = "Recovered"; });
    await continuePlanningBriefs(briefs, resume);
    expect(resume).toHaveBeenCalledTimes(1); expect(resume.mock.calls[0]![0].id).toBe("second"); expect(briefs[0]!.build_prompt).toBe("Already reviewed");
  });
});
