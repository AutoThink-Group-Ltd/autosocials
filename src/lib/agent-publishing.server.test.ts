/* eslint-disable @typescript-eslint/no-explicit-any -- Service-role table adapters and isolated test doubles use dynamic rows. */
import { describe, expect, it } from "vitest";
import {
  agentPublishingAction,
  AgentPublishingError,
  parseAgentPublishingInput,
  createAgentPublishingPolicy,
  listAgentPublishingRequestsForOwner,
} from "./agent-publishing.server";
const userId = "11111111-1111-4111-8111-111111111111";
const workspaceId = "22222222-2222-4222-8222-222222222222";
const connectionId = "33333333-3333-4333-8333-333333333333";
const postId = "44444444-4444-4444-8444-444444444444";
const accountId = "55555555-5555-4555-8555-555555555555";
function dbFor(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const query: any = {
        select: () => query,
        eq: () => query,
        order: () => query,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve({ data: rows[table] ?? [], error: null }).then(
            resolve,
          ),
        insert: (value: unknown) => {
          rows["inserted"] = value;
          return query;
        },
        single: async () => ({
          data: {
            id: postId,
            snapshot: (rows["inserted"] as any).snapshot,
            created_at: "now",
          },
          error: null,
        }),
      };
      return query;
    },
  };
}
const request = {
  action: "prepare" as const,
  userId,
  workspaceId,
  connectionId,
  input: { postId, accountId },
};
const connection = {
  id: connectionId,
  workspace_id: workspaceId,
  user_id: userId,
  revoked_at: null,
  expires_at: null,
};
describe("agent publishing preview", () => {
  it("normalizes times and rejects malformed IDs", () => {
    expect(
      parseAgentPublishingInput("prepare", {
        postId,
        accountId,
        scheduledAt: "2026-11-25T12:00:00Z",
      }),
    ).toMatchObject({ scheduledAt: "2026-11-25T12:00:00.000Z" });
    expect(() =>
      parseAgentPublishingInput("status", { previewId: "bad" }),
    ).toThrow(AgentPublishingError);
  });
  it("refuses revoked connections before accessing content", async () => {
    const db = dbFor({
      workspace_members: { role: "owner" },
      agent_api_connections: { ...connection, revoked_at: "2026-01-01" },
    });
    await expect(agentPublishingAction(request, db)).rejects.toMatchObject({
      status: 403,
      code: "connection_unavailable",
    });
  });
  it("saves a safe preview without media paths or access tokens", async () => {
    const rows: Record<string, unknown> = {
      workspace_members: { role: "member" },
      agent_api_connections: connection,
      posts: {
        id: postId,
        status: "draft",
        caption: "Hello",
        first_comment: null,
        updated_at: "now",
      },
      social_accounts: {
        id: accountId,
        platform: "linkedin",
        status: "connected",
        is_enabled: true,
        access_token: "secret",
      },
      post_media: [
        {
          id: postId,
          kind: "image",
          mime: "image/png",
          storage_path: `${workspaceId}/private.png`,
        },
      ],
      post_targets: [],
    };
    const result = await agentPublishingAction(request, dbFor(rows));
    expect(result).toMatchObject({
      state: "preview",
      snapshot: { publishable: false, issues: [] },
    });
    expect(JSON.stringify(result)).not.toContain("private.png");
    expect(JSON.stringify(result)).not.toContain("secret");
  });
  it("requires an idempotency key before queueing", async () => {
    const db = dbFor({
      workspace_members: { role: "owner" },
      agent_api_connections: connection,
    });
    await expect(
      agentPublishingAction(
        {
          ...request,
          action: "schedule",
          input: { previewId: postId, policyId: accountId },
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 400, code: "invalid_request" });
  });
  it("returns a queued request without claiming publication", async () => {
    const db: any = dbFor({
      workspace_members: { role: "owner" },
      agent_api_connections: connection,
    });
    db.rpc = async (name: string, args: any) => ({
      data: { requestId: postId, state: "requested", postId: accountId },
      error:
        name === "queue_agent_linkedin" && args._action === "schedule"
          ? null
          : { code: "bad" },
    });
    await expect(
      agentPublishingAction(
        {
          ...request,
          action: "schedule",
          idempotencyKey: "once",
          input: { previewId: postId, policyId: accountId },
        },
        db,
      ),
    ).resolves.toMatchObject({ state: "requested" });
  });
  it("requires the owner to create a policy", async () => {
    const db = dbFor({
      workspace_members: { role: "member" },
      agent_api_connections: connection,
    });
    await expect(
      createAgentPublishingPolicy(
        {
          userId,
          workspaceId,
          connectionId,
          accountIds: [accountId],
          expiresAt: "2099-01-01T00:00:00Z",
          maxCount: 10,
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 403, code: "owner_required" });
  });
  it("rejects immediate accounts outside the allowed set", async () => {
    const db = dbFor({});
    await expect(
      createAgentPublishingPolicy(
        {
          userId,
          workspaceId,
          connectionId,
          accountIds: [accountId],
          expiresAt: "2099-01-01T00:00:00Z",
          maxCount: 10,
          publishNowAccountIds: [postId],
          publishNowMaxCount: 1,
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 400, code: "invalid_request" });
  });
  it("returns stored preview and current post state", async () => {
    const db = dbFor({
      workspace_members: { role: "member" },
      agent_api_connections: connection,
      agent_publishing_previews: {
        id: postId,
        post_id: postId,
        account_id: accountId,
        scheduled_at: null,
        snapshot: { caption: "Saved" },
        created_at: "now",
      },
      posts: {
        id: postId,
        status: "draft",
        scheduled_at: null,
        published_at: null,
      },
    });
    await expect(
      agentPublishingAction(
        { ...request, action: "status", input: { previewId: postId } },
        db,
      ),
    ).resolves.toMatchObject({
      state: "preview",
      snapshot: { caption: "Saved" },
      post: { status: "draft" },
    });
  });
  it("surfaces transaction rejection without reporting a queued post", async () => {
    const db: any = dbFor({
      workspace_members: { role: "owner" },
      agent_api_connections: connection,
    });
    db.rpc = async () => ({
      data: null,
      error: { code: "P0001", message: "Workspace requires team approval" },
    });
    await expect(
      agentPublishingAction(
        {
          ...request,
          action: "publish_now",
          idempotencyKey: "once",
          input: { previewId: postId, policyId: accountId },
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409, code: "queue_rejected" });
  });
  it("reports conflicting idempotency keys", async () => {
    const db: any = dbFor({
      workspace_members: { role: "owner" },
      agent_api_connections: connection,
    });
    db.rpc = async () => ({
      data: null,
      error: { code: "P0001", message: "Idempotency conflict" },
    });
    await expect(
      agentPublishingAction(
        {
          ...request,
          action: "schedule",
          idempotencyKey: "once",
          input: { previewId: postId, policyId: accountId },
        },
        db,
      ),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
  });
  it("batches owner status lookups and preserves in-flight status", async () => {
    const calls: string[] = [];
    const data: Record<string, unknown> = {
      workspace_members: { role: "owner" },
      agent_publishing_requests: [
        {
          id: "one",
          post_id: postId,
          target_id: "target1",
          connection_id: connectionId,
          policy_id: "policy",
          action: "schedule",
          scheduled_at: "later",
          created_at: "now",
        },
        {
          id: "two",
          post_id: postId,
          target_id: "target2",
          connection_id: connectionId,
          policy_id: "policy",
          action: "schedule",
          scheduled_at: "later",
          created_at: "now",
        },
      ],
      post_targets: [
        {
          id: "target1",
          status: "pending",
          submission_started_at: null,
          published_at: null,
        },
        {
          id: "target2",
          status: "publishing",
          submission_started_at: "now",
          published_at: null,
        },
      ],
      agent_api_connections: [
        { id: connectionId, revoked_at: "now", expires_at: "2099-01-01" },
      ],
      agent_publishing_policies: [
        { id: "policy", revoked_at: null, expires_at: "2099-01-01" },
      ],
    };
    const db = {
      from(table: string) {
        calls.push(table);
        const q: any = {
          select: () => q,
          eq: () => q,
          order: () => q,
          limit: () => q,
          in: () => q,
          maybeSingle: async () => ({ data: data[table], error: null }),
          then: (resolve: (value: unknown) => unknown) =>
            Promise.resolve({ data: data[table], error: null }).then(resolve),
        };
        return q;
      },
    };
    const result = await listAgentPublishingRequestsForOwner(
      { workspaceId, userId },
      db,
    );
    expect(result.map((row) => row.status)).toEqual(["held", "publishing"]);
    expect(calls).toEqual([
      "workspace_members",
      "agent_publishing_requests",
      "post_targets",
      "agent_api_connections",
      "agent_publishing_policies",
    ]);
  });
});
