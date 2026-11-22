import { describe, expect, it } from "vitest";
import { agentWinnersAction } from "./agent-winners.server";
import {
  rankOrganicOutput,
  listWinnerFindingsOutput,
  listWinnerShortlistOutput,
} from "./agent-winners-contract";
const workspaceId = "22222222-2222-4222-8222-222222222222",
  other = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  userId = "11111111-1111-4111-8111-111111111111",
  accountId = "33333333-3333-4333-8333-333333333333";
const now = Date.parse("2026-11-22T12:00:00Z");
type FixtureRow = Record<string, unknown>;
type FixtureQuery = {
  select(): FixtureQuery;
  eq(field: string, value: unknown): FixtureQuery;
  is(field: string, value: unknown): FixtureQuery;
  in(field: string, values: unknown[]): FixtureQuery;
  gte(field: string, value: string): FixtureQuery;
  lt(field: string, value: string): FixtureQuery;
  order(): FixtureQuery;
  limit(count: number): Promise<{ data: FixtureRow[]; error: null }>;
};
function dbFor(tables: Record<string, FixtureRow[]>, allowed = true) {
  const calls: string[] = [];
  return {
    calls,
    rpc: async () => ({ data: allowed, error: null }),
    from(table: string) {
      calls.push(table);
      let rows = [...(tables[table] ?? [])];
      const q: FixtureQuery = {
        select: () => q,
        eq: (field: string, value: unknown) => {
          rows = rows.filter((x) => x[field] === value);
          return q;
        },
        is: (field: string, value: unknown) => {
          rows = rows.filter((x) => x[field] === value);
          return q;
        },
        in: (field: string, values: unknown[]) => {
          rows = rows.filter((x) => values.includes(x[field]));
          return q;
        },
        gte: (field: string, value: string) => {
          rows = rows.filter(
            (row) =>
              typeof row[field] === "string" && String(row[field]) >= value,
          );
          return q;
        },
        lt: (field: string, value: string) => {
          rows = rows.filter(
            (row) =>
              typeof row[field] === "string" && String(row[field]) < value,
          );
          return q;
        },
        order: () => q,
        limit: async (n: number) => ({ data: rows.slice(0, n), error: null }),
      };
      return q;
    },
  };
}
function post(
  id: string,
  likes: number | null,
  ws = workspaceId,
  measured = "2026-11-22T10:00:00Z",
) {
  return {
    id,
    workspace_id: ws,
    account_id: accountId,
    platform: "instagram",
    format: "reel",
    published_at: "2026-11-19T10:00:00Z",
    measured_at: measured,
    likes,
    comments_count: 1,
    shares: null,
    views: null,
    reach: null,
    caption: "content",
    title: null,
    permalink: null,
  };
}
const request = { userId, workspaceId };
describe("agent Winners", () => {
  it("ranks fresh organic evidence using existing cohort rules and excludes another workspace", async () => {
    const db = dbFor({
      winner_posts: [
        post("a", 1),
        post("b", 3),
        post("c", 10),
        post("stale", 100, workspaceId, "2026-10-01T00:00:00Z"),
        post("other", 999, other),
      ],
    });
    const result = await agentWinnersAction(
      {
        ...request,
        action: "rank_organic",
        input: { accountIds: [accountId] },
      },
      db,
      now,
    );
    expect(result).toMatchObject({
      scanned: 4,
      fresh: 3,
      staleOrUnavailable: 1,
      rankable: 3,
      scanTruncated: false,
      posts: expect.arrayContaining([
        expect.objectContaining({
          postId: "c",
          percentile: 100,
          metricsUsed: ["likes", "comments"],
          metrics: expect.objectContaining({ shares: null }),
        }),
      ]),
    });
    expect(JSON.stringify(result)).not.toContain('"other"');
    expect(rankOrganicOutput.safeParse(result).success).toBe(true);
    expect(db.calls).toEqual(["winner_posts"]);
  });
  it("does not invent a score where shared evidence is missing", async () => {
    const db = dbFor({ winner_posts: [post("a", 1), post("b", null)] });
    const result = await agentWinnersAction(
      { ...request, action: "rank_organic", input: {} },
      db,
      now,
    );
    expect(result).toMatchObject({
      rankable: 0,
      posts: expect.arrayContaining([
        expect.objectContaining({
          percentile: null,
          evidenceStatus: "not_comparable",
        }),
      ]),
    });
  });
  it("returns reviewed fresh findings and excludes stale evidence", async () => {
    const evidence = [
      {
        id: "a",
        measured_at: "2026-11-22T10:00:00Z",
        analysis_method: "reviewed_v3",
      },
      {
        id: "b",
        measured_at: "2026-11-22T10:00:00Z",
        analysis_method: "reviewed_v3",
      },
    ];
    const finding = {
      id: "f",
      workspace_id: workspaceId,
      title: "Pattern",
      explanation: "Hypothesis",
      evidence,
      source_post_ids: ["a", "b"],
      updated_at: "2026-11-22T10:00:00Z",
      active: true,
      dismissed_at: null,
    };
    const db = dbFor({
      winner_findings: [
        finding,
        {
          ...finding,
          id: "bad",
          evidence: [
            { ...evidence[0], analysis_method: "unknown" },
            evidence[1],
          ],
        },
      ],
    });
    const result = await agentWinnersAction(
      { ...request, action: "list_findings", input: {} },
      db,
      now,
    );
    expect(listWinnerFindingsOutput.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      findings: [{ id: "f", sourcePostIds: ["a", "b"] }],
      excludedStaleOrUnverified: 1,
    });
  });
  it("marks stale shortlist evidence and denies other workspace access", async () => {
    const db = dbFor({
      winner_shortlist: [
        {
          workspace_id: workspaceId,
          winner_post_id: "a",
          selected_at: "today",
          evidence_snapshot: { measured_at: "2026-01-01T00:00:00Z" },
        },
      ],
    });
    const result = await agentWinnersAction(
      { ...request, action: "list_shortlist", input: {} },
      db,
      now,
    );
    expect(listWinnerShortlistOutput.safeParse(result).success).toBe(true);
    expect(result).toMatchObject({
      shortlist: [{ postId: "a", evidenceStatus: "stale_or_unavailable" }],
    });
    await expect(
      agentWinnersAction(
        { ...request, action: "rank_organic", input: {} },
        dbFor({}, false),
        now,
      ),
    ).rejects.toMatchObject({ status: 403, code: "access_denied" });
  });
  it("rejects bad dates and oversized scopes", async () => {
    const db = dbFor({});
    await expect(
      agentWinnersAction(
        {
          ...request,
          action: "rank_organic",
          input: {
            publishedAfter: "2026-11-20T00:00:00Z",
            publishedBefore: "2026-11-19T00:00:00Z",
          },
        },
        db,
        now,
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      agentWinnersAction(
        {
          ...request,
          action: "rank_organic",
          input: { accountIds: Array(21).fill(accountId) },
        },
        db,
        now,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
