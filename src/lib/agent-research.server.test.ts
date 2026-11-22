import { describe, it, expect, vi } from "vitest";
import { agentResearchAction } from "./agent-research.server";
const workspace = "11111111-1111-4111-8111-111111111111",
  user = "22222222-2222-4222-8222-222222222222",
  id = "33333333-3333-4333-8333-333333333333";
const row = {
  id,
  query: "Example",
  question: "Question",
  status: "complete",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  targets: [
    { url: "https://www.instagram.com/example", id: "provider-target" },
  ],
  posts: [
    {
      id: "provider-internal-id",
      platform: "instagram",
      url: "https://www.instagram.com/p/public-post/?token=private",
      caption: "x".repeat(2000),
      media_type: "video",
      review_basis: "thumbnail",
      metrics: { views: 5 },
      thumbnail_url: "https://example.invalid/secret",
    },
  ],
  analysis: {
    summary: "Summary",
    findings: [{ post_ids: ["provider-internal-id"] }],
  },
  provider_runs: { instagram: "provider-secret" },
};
function deps(access = true) {
  const filters: any[] = [];
  const discover = vi.fn(async () => ({
    candidates: [
      {
        id: "instagram:example",
        platform: "instagram" as const,
        handle: "example",
        url: "https://www.instagram.com/example",
      },
    ],
    warnings: [],
  }));
  const q: any = {
    select: (...args: any[]) => {
      filters.push(["select", ...args]);
      return q;
    },
    eq: (...args: any[]) => {
      filters.push(["eq", ...args]);
      return q;
    },
    order: () => q,
    limit: async () => ({ data: [row], error: null }),
    maybeSingle: async () => ({ data: row, error: null }),
  };
  const db = {
    rpc: vi.fn(async () => ({ data: access, error: null })),
    from: vi.fn(() => q),
  };
  return { db, discover, filters };
}
describe("agent research safety", () => {
  it("denies before any read or provider call without workspace access", async () => {
    const d = deps(false);
    await expect(
      agentResearchAction(
        { action: "get", workspaceId: workspace, userId: user, input: { id } },
        d,
      ),
    ).rejects.toThrow("Workspace access denied");
    expect(d.db.from).not.toHaveBeenCalled();
    expect(d.discover).not.toHaveBeenCalled();
  });
  it("requires metered consent for company discovery and rejects inferred handle targets", async () => {
    const d = deps();
    await expect(
      agentResearchAction(
        {
          action: "lookup",
          workspaceId: workspace,
          userId: user,
          input: { query: "Example Ltd" },
        },
        d,
      ),
    ).rejects.toThrow("consent");
    expect(d.discover).not.toHaveBeenCalled();
    await expect(
      agentResearchAction(
        {
          action: "lookup",
          workspaceId: workspace,
          userId: user,
          input: { query: "@example", allowMeteredLookup: true },
        },
        d,
      ),
    ).rejects.toThrow();
    const result = await agentResearchAction(
      {
        action: "lookup",
        workspaceId: workspace,
        userId: user,
        input: { query: "Example Ltd", allowMeteredLookup: true },
      },
      d,
    );
    if (!("candidates" in result))
      throw new Error("Expected target candidates");
    expect(result.candidates[0]?.verified).toBe(false);
    expect(d.discover).toHaveBeenCalledTimes(1);
  });
  it("normalizes direct profile URLs without a provider request", async () => {
    const d = deps();
    const result = await agentResearchAction(
      {
        action: "lookup",
        workspaceId: workspace,
        userId: user,
        input: { query: "https://instagram.com/example/" },
      },
      d,
    );
    if (!("candidates" in result))
      throw new Error("Expected target candidates");
    expect(result.candidates[0]).toMatchObject({
      platform: "instagram",
      handle: "example",
      verified: false,
    });
    expect(d.discover).not.toHaveBeenCalled();
  });
  it("reads scoped saved reports without provider IDs, transient media, token query or provider calls", async () => {
    const d = deps();
    const result = await agentResearchAction(
      { action: "get", workspaceId: workspace, userId: user, input: { id } },
      d,
    );
    expect(d.filters).toContainEqual(["eq", "workspace_id", workspace]);
    expect(d.filters).toContainEqual(["eq", "id", id]);
    expect(JSON.stringify(result)).not.toContain("provider-");
    expect(JSON.stringify(result)).not.toContain("token=");
    if (!("report" in result)) throw new Error("Expected a saved report");
    expect(result.report.evidence[0]?.caption).toHaveLength(1000);
    expect(result.report.evidence[0]?.reference).toBe("e1");
    expect(d.discover).not.toHaveBeenCalled();
  });
});
