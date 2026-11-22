import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  claim: {
    data: { id: "activity-1" } as { id: string } | null,
    error: null as unknown,
  },
  updateError: null as unknown,
  updates: [] as Array<Record<string, unknown>>,
  calls: [] as string[],
  signals: [] as AbortSignal[],
}));

vi.mock("./virlo-db.server", () => ({
  virloDb: () => ({
    from: () => ({
      insert: (data: Record<string, unknown>) => {
        mocks.calls.push("claim");
        expect(data).toMatchObject({
          workspace_id: "workspace-1",
          user_id: "user-1",
          operation: "search_videos",
          status: "started",
        });
        return {
          select: () => {
            const query = {
              single: () => Promise.resolve(mocks.claim),
              abortSignal: (signal: AbortSignal) => {
                mocks.signals.push(signal);
                return query;
              },
            };
            return query;
          },
        };
      },
      update: (data: Record<string, unknown>) => {
        mocks.calls.push("update");
        mocks.updates.push(data);
        return {
          eq: () => ({
            eq: () => Promise.resolve({ error: mocks.updateError }),
          }),
        };
      },
    }),
  }),
}));
vi.mock("./virlo.server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./virlo.server")>()),
  searchVirlo: mocks.search,
}));

import { recordedVirloSearch } from "./virlo-activity.server";
import { VirloError } from "./virlo.server";

const search = { kind: "videos" as const, query: "skincare" };
const run = (signal?: AbortSignal) =>
  recordedVirloSearch("workspace-1", "user-1", search, signal);

describe("Virlo activity accounting", () => {
  beforeEach(() => {
    mocks.search.mockReset();
    mocks.claim = { data: { id: "activity-1" }, error: null };
    mocks.updateError = null;
    mocks.updates.length = 0;
    mocks.calls.length = 0;
    mocks.signals.length = 0;
  });

  it("claims usage before calling the provider and records the known receipt", async () => {
    mocks.search.mockImplementation(async () => {
      mocks.calls.push("provider");
      expect(mocks.calls).toEqual(["claim", "provider"]);
      return {
        data: { videos: [] },
        receipt: { status: 200, costUsd: 0.05, creditsUsed: 5 },
      };
    });
    await expect(run()).resolves.toEqual({ videos: [] });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toMatchObject({
      status: "completed",
      provider_status: 200,
      cost_usd: 0.05,
      credits_used: 5,
    });
    expect(mocks.calls).toEqual(["claim", "provider", "update"]);
  });

  it("never calls the provider if the initial claim fails", async () => {
    mocks.claim = { data: null, error: { code: "unavailable" } };
    await expect(run()).rejects.toThrow("could not be recorded");
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.updates).toHaveLength(0);
  });

  it("never calls the provider if the request has been aborted before submission", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(run(controller.signal)).rejects.toThrow(
      "cancelled before submission",
    );
    expect(mocks.signals).toEqual([controller.signal]);
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.updates).toEqual([
      { status: "failed", cost_usd: 0, credits_used: 0 },
    ]);
  });

  it("does not retry an uncertain provider failure and marks the cost unknown", async () => {
    mocks.search.mockRejectedValue(new VirloError("Network uncertain", null));
    await expect(run()).rejects.toThrow("Network uncertain");
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toMatchObject({
      status: "unknown",
      provider_status: null,
      cost_usd: null,
      credits_used: null,
    });
  });

  it("does not overwrite a successful receipt with failure data if ledger update fails", async () => {
    mocks.search.mockResolvedValue({
      data: { videos: [] },
      receipt: { status: 200, costUsd: 0.05, creditsUsed: 5 },
    });
    mocks.updateError = { message: "database unavailable" };
    await expect(run()).rejects.toThrow("needs reconciliation");
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toMatchObject({
      status: "completed",
      provider_status: 200,
      cost_usd: 0.05,
      credits_used: 5,
    });
  });
});
