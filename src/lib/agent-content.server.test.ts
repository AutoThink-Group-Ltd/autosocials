/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase service adapters and test doubles use dynamic rows. */
import { describe, it, expect, vi } from "vitest";
import {
  agentContentAction,
  readAgentTileHandoff,
} from "./agent-content.server";
import { createSearch } from "./create-pipeline";
const userId = "11111111-1111-4111-8111-111111111111",
  workspaceId = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
const plan = {
  brand: "Brand",
  tiles: [
    { headline: "A clear idea", supporting: "", direction: "Editorial image" },
  ],
};
function deps() {
  let saved: any;
  return {
    db: { rpc: vi.fn(async () => ({ data: true, error: null })) },
    imageConnected: () => true,
    rate: vi.fn(async () => ({ credits: 42, version: id })),
    plan: vi.fn(async () => plan),
    run: vi.fn(
      async (_db: any, _ws: any, _kind: any, _key: any, task: any) => ({
        result: (saved ??= await task()),
        busy: false,
      }),
    ),
    list: vi.fn(async () => [
      {
        id,
        title: "Deck",
        updated_at: "today",
        complete: true,
        unreadable: false,
        coverUrl: "private",
      },
    ]),
    get: vi.fn(async () => ({
      id,
      plan: {
        title: "Deck",
        slides: [{ id, headline: "Hello", supporting: "World" }],
      },
      slides: [{ id, url: "private" }],
    })),
  };
}
const req = {
  action: "prepare_tile" as const,
  workspaceId,
  userId,
  input: { brief: "Make a branded tile" },
  idempotencyKey: "same-request",
};
describe("agent content handoff", () => {
  it("plans once, returns the actual rate and reuses the request", async () => {
    const d = deps();
    const result = await agentContentAction(req, d as any);
    expect(result).toMatchObject({
      state: "prepared",
      plan,
      quote: { creditsPerImage: 42, rateId: id },
    });
    expect(result["handoffUrl"]).toMatch(
      /^\/app\/create\?wizard=tiles&agentTile=[a-f0-9]{64}$/,
    );
    await agentContentAction(req, d as any);
    expect(d.plan).toHaveBeenCalledTimes(1);
    await expect(
      agentContentAction(
        { ...req, input: { brief: "Another brief" } },
        d as any,
      ),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });
  it("does not plan when the quote or access is unavailable", async () => {
    const d = deps();
    d.rate.mockRejectedValueOnce(new Error("unavailable"));
    await expect(agentContentAction(req, d as any)).rejects.toMatchObject({
      code: "quote_unavailable",
    });
    expect(d.plan).not.toHaveBeenCalled();
    d.db.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(agentContentAction(req, d as any)).rejects.toMatchObject({
      code: "access_denied",
    });
    expect(d.plan).not.toHaveBeenCalled();
  });
  it("exposes carousel handoff without private signed links", async () => {
    const d = deps();
    const result = await agentContentAction(
      { action: "list_carousels", userId, workspaceId, input: {} },
      d as any,
    );
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result).toMatchObject({
      carousels: [{ handoffUrl: `/app/create?carousel=${id}`, complete: true }],
    });
  });
  it("loads only an authorized, unexpired handoff", async () => {
    const result = {
      createdAt: new Date().toISOString(),
      brief: "Brief",
      referenceIds: [],
      plan,
    };
    const q: any = {
      select: () => q,
      eq: () => q,
      maybeSingle: async () => ({
        data: { status: "complete", result },
        error: null,
      }),
    };
    const db: any = {
      rpc: async () => ({ data: true, error: null }),
      from: () => q,
    };
    await expect(
      readAgentTileHandoff(userId, workspaceId, "a".repeat(64), db),
    ).resolves.toMatchObject({ plan });
    result.createdAt = "2000-01-01T00:00:00Z";
    await expect(
      readAgentTileHandoff(userId, workspaceId, "a".repeat(64), db),
    ).rejects.toMatchObject({ code: "handoff_expired" });
  });
  it("preserves valid handoff links through route parsing", () => {
    expect(
      createSearch({ wizard: "tiles", agentTile: "a".repeat(64) }),
    ).toEqual({ wizard: "tiles", agentTile: "a".repeat(64) });
    expect(createSearch({ wizard: "tiles", agentTile: "invalid" })).toEqual({
      wizard: "tiles",
    });
  });
  it("returns a workspace-scoped video job status without internal errors", async () => {
    const d = deps();
    const q: any = {
      select: vi.fn(() => q),
      eq: vi.fn(() => q),
      maybeSingle: async () => ({
        data: {
          id,
          variant_id: id,
          status: "failed",
          progress: 130,
          created_at: "now",
          updated_at: "now",
          error: "provider secret",
        },
        error: null,
      }),
    };
    (d.db as any).from = () => q;
    const result = await agentContentAction(
      { action: "get_video_status", userId, workspaceId, input: { jobId: id } },
      d as any,
    );
    expect(result).toMatchObject({
      jobId: id,
      status: "failed",
      progress: 100,
      handoffUrl: `/app/create?stage=production&item=video:${id}`,
    });
    expect(JSON.stringify(result)).not.toContain("provider secret");
    expect(q.eq).toHaveBeenCalledWith("workspace_id", workspaceId);
  });
});
