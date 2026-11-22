/* eslint-disable @typescript-eslint/no-explicit-any -- Service-role table adapters and isolated test doubles use dynamic rows. */
import { createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export class AgentPublishingError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AgentPublishingError";
  }
}
export type AgentPublishingRequest = {
  action: "prepare" | "schedule" | "publish_now" | "status";
  workspaceId: string;
  userId: string;
  connectionId: string;
  input: unknown;
  idempotencyKey?: string;
};
type Db = any;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (
  message: string,
  status = 400,
  code = "invalid_request",
): never => {
  throw new AgentPublishingError(message, status, code);
};
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("Expected an input object.");
  return value as Record<string, unknown>;
}
function id(value: unknown): string {
  if (typeof value !== "string" || !uuid.test(value))
    return fail("Expected a valid identifier.");
  return value.toLowerCase();
}
export function parseAgentPublishingInput(
  action: AgentPublishingRequest["action"],
  value: unknown,
) {
  const input = object(value);
  if (action === "prepare") {
    const postId = id(input["postId"]),
      accountId = id(input["accountId"]);
    let scheduledAt: string | null = null;
    if (input["scheduledAt"] != null) {
      if (
        typeof input["scheduledAt"] !== "string" ||
        !Number.isFinite(Date.parse(input["scheduledAt"]))
      )
        return fail("Invalid scheduled time.");
      scheduledAt = new Date(input["scheduledAt"]).toISOString();
    }
    return { postId, accountId, scheduledAt };
  }
  if (action === "schedule" || action === "publish_now")
    return {
      previewId: id(input["previewId"]),
      policyId: id(input["policyId"]),
    };
  return { previewId: id(input["previewId"]) };
}
function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function access(db: Db, request: AgentPublishingRequest) {
  const { data: member, error: memberError } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", request.workspaceId)
    .eq("user_id", request.userId)
    .maybeSingle();
  if (memberError)
    return fail(
      "Could not verify workspace access.",
      503,
      "access_unavailable",
    );
  if (!member || !["owner", "admin", "member"].includes(member.role))
    return fail("Workspace access denied.", 403, "access_denied");
  const { data: connection, error } = await db
    .from("agent_api_connections")
    .select("id,workspace_id,user_id,expires_at,revoked_at")
    .eq("id", request.connectionId)
    .maybeSingle();
  if (error)
    return fail("Could not verify connection.", 503, "access_unavailable");
  if (
    !connection ||
    connection.workspace_id !== request.workspaceId ||
    connection.user_id !== request.userId ||
    connection.revoked_at ||
    (connection.expires_at && Date.parse(connection.expires_at) <= Date.now())
  )
    return fail("Connection is unavailable.", 403, "connection_unavailable");
}
export async function agentPublishingAction(
  request: AgentPublishingRequest,
  db: Db = supabaseAdmin,
): Promise<Record<string, unknown>> {
  id(request.workspaceId);
  id(request.userId);
  id(request.connectionId);
  const input = parseAgentPublishingInput(request.action, request.input);
  if (
    request.idempotencyKey !== undefined &&
    (typeof request.idempotencyKey !== "string" ||
      request.idempotencyKey.length < 1 ||
      request.idempotencyKey.length > 128)
  )
    return fail("Invalid idempotency key.");
  await access(db, request);
  if (request.action === "schedule" || request.action === "publish_now") {
    if (!request.idempotencyKey) return fail("An idempotency key is required.");
    const queued = input as { previewId: string; policyId: string };
    const { data, error } = await db.rpc("queue_agent_linkedin", {
      _workspace: request.workspaceId,
      _user: request.userId,
      _connection: request.connectionId,
      _preview: queued.previewId,
      _policy: queued.policyId,
      _action: request.action,
      _key: request.idempotencyKey,
      _hash: hash({ action: request.action, ...queued }),
    });
    if (error) {
      if (error.message?.includes("Idempotency conflict"))
        return fail(
          "Idempotency key was already used for another request.",
          409,
          "idempotency_conflict",
        );
      if (error.code === "P0001")
        return fail(error.message, 409, "queue_rejected");
      return fail("Could not queue this post.", 503, "queue_unavailable");
    }
    return data;
  }
  if (request.action === "status") {
    const { data, error } = await db
      .from("agent_publishing_previews")
      .select("id,post_id,account_id,scheduled_at,snapshot,created_at")
      .eq("id", (input as { previewId: string }).previewId)
      .eq("workspace_id", request.workspaceId)
      .eq("user_id", request.userId)
      .eq("connection_id", request.connectionId)
      .maybeSingle();
    if (error)
      return fail("Could not retrieve preview.", 503, "preview_unavailable");
    if (!data) return fail("Preview not found.", 404, "not_found");
    const { data: post, error: postError } = await db
      .from("posts")
      .select("id,status,scheduled_at,published_at")
      .eq("id", data.post_id)
      .eq("workspace_id", request.workspaceId)
      .maybeSingle();
    if (postError)
      return fail("Could not retrieve post status.", 503, "status_unavailable");
    const { data: requests, error: requestsError } = await db
      .from("agent_publishing_requests")
      .select("id,post_id,target_id,policy_id,action,scheduled_at,created_at")
      .eq("preview_id", data.id)
      .eq("workspace_id", request.workspaceId)
      .eq("user_id", request.userId)
      .eq("connection_id", request.connectionId)
      .order("created_at");
    if (requestsError)
      return fail(
        "Could not retrieve delivery status.",
        503,
        "status_unavailable",
      );
    const deliveries = await Promise.all(
      (requests ?? []).map(async (r: any) => {
        const { data: target, error: targetError } = await db
          .from("post_targets")
          .select("status,permalink,published_at")
          .eq("id", r.target_id)
          .maybeSingle();
        if (targetError)
          return fail(
            "Could not retrieve delivery status.",
            503,
            "status_unavailable",
          );
        const { data: policy, error: policyError } = await db
          .from("agent_publishing_policies")
          .select("revoked_at,expires_at")
          .eq("id", r.policy_id)
          .eq("workspace_id", request.workspaceId)
          .maybeSingle();
        if (policyError)
          return fail(
            "Could not retrieve delivery status.",
            503,
            "status_unavailable",
          );
        const held =
          ["pending", "retrying"].includes(target?.status) &&
          (!policy ||
            !!policy.revoked_at ||
            Date.parse(policy.expires_at) <= Date.now());
        return {
          requestId: r.id,
          postId: r.post_id,
          action: r.action,
          scheduledAt: r.scheduled_at,
          status: held
            ? "held"
            : target?.status === "skipped"
              ? "held"
              : (target?.status ?? "unknown"),
          error:
            held || target?.status === "skipped"
              ? "Delivery held for review."
              : target?.status === "failed"
                ? "Delivery needs attention; check the publishing workspace."
                : null,
          permalink: target?.permalink ?? null,
          publishedAt: target?.published_at ?? null,
        };
      }),
    );
    return {
      previewId: data.id,
      state: "preview",
      createdAt: data.created_at,
      scheduledAt: data.scheduled_at,
      snapshot: data.snapshot,
      post: post
        ? {
            id: post.id,
            status: post.status,
            scheduledAt: post.scheduled_at,
            publishedAt: post.published_at,
          }
        : null,
      deliveries,
    };
  }
  const parsed = input as {
    postId: string;
    accountId: string;
    scheduledAt: string | null;
  };
  const requestHash = hash(parsed);
  const previous = async () => {
    if (!request.idempotencyKey) return null;
    const { data, error } = await db
      .from("agent_publishing_previews")
      .select("id,request_hash,snapshot,created_at")
      .eq("connection_id", request.connectionId)
      .eq("idempotency_key", request.idempotencyKey)
      .maybeSingle();
    if (error)
      return fail("Could not retrieve preview.", 503, "preview_unavailable");
    if (data && data.request_hash !== requestHash)
      return fail(
        "Idempotency key was already used for another preview.",
        409,
        "idempotency_conflict",
      );
    return data;
  };
  const prior = await previous();
  if (prior)
    return {
      previewId: prior.id,
      state: "preview",
      snapshot: prior.snapshot,
      createdAt: prior.created_at,
    };
  const [postResult, accountResult, mediaResult, targetsResult] =
    await Promise.all([
      db
        .from("posts")
        .select("id,status,caption,first_comment,updated_at")
        .eq("id", parsed.postId)
        .eq("workspace_id", request.workspaceId)
        .maybeSingle(),
      db
        .from("social_accounts")
        .select("id,platform,display_name,handle,status,is_enabled,expires_at")
        .eq("id", parsed.accountId)
        .eq("workspace_id", request.workspaceId)
        .maybeSingle(),
      db
        .from("post_media")
        .select("id,kind,mime,width,height,duration_ms,position,storage_path")
        .eq("post_id", parsed.postId)
        .order("position")
        .order("id"),
      db.from("post_targets").select("id").eq("post_id", parsed.postId),
    ]);
  if (
    [postResult, accountResult, mediaResult, targetsResult].some((x) => x.error)
  )
    return fail("Could not inspect this draft.", 503, "preview_unavailable");
  const post = postResult.data,
    account = accountResult.data,
    media = mediaResult.data ?? [];
  if (!post || !account)
    return fail("Draft or account not found.", 404, "not_found");
  if (post.status !== "draft")
    return fail("Only draft posts can be previewed.", 409, "not_draft");
  if (
    account.platform !== "linkedin" ||
    account.status !== "connected" ||
    !account.is_enabled ||
    (account.expires_at && Date.parse(account.expires_at) <= Date.now())
  )
    return fail("LinkedIn account is unavailable.", 409, "account_unavailable");
  if ((targetsResult.data ?? []).length)
    return fail(
      "Draft already has destinations; review it in publishing.",
      409,
      "draft_has_targets",
    );
  const issues: string[] = [];
  if (
    (!post.caption?.trim() && !media.length) ||
    (post.caption?.length ?? 0) > 3000
  )
    issues.push(
      "LinkedIn requires content and allows up to 3,000 caption characters.",
    );
  if (post.first_comment?.trim())
    issues.push("LinkedIn first comments are not supported.");
  if (media.length > 1)
    issues.push("LinkedIn supports at most one image or video per post.");
  if (
    media.some(
      (m: any) =>
        !(
          (m.kind === "image" &&
            ["image/jpeg", "image/png", "image/gif"].includes(m.mime)) ||
          (m.kind === "video" && m.mime === "video/mp4")
        ),
    )
  )
    issues.push("LinkedIn supports JPEG, PNG, GIF or MP4.");
  if (
    media.some(
      (m: any) => !m.storage_path?.startsWith(`${request.workspaceId}/`),
    )
  )
    issues.push("Media is not stored in this workspace.");
  const snapshot = {
    postId: post.id,
    caption: post.caption,
    firstComment: post.first_comment,
    postUpdatedAt: post.updated_at,
    account: {
      id: account.id,
      displayName: account.display_name,
      handle: account.handle,
    },
    media: media.map(({ storage_path: _path, ...m }: any) => m),
    scheduledAt: parsed.scheduledAt,
    issues,
    publishable: false,
    note: "Preview only; no authorization or publication has occurred.",
  };
  const { data, error } = await db
    .from("agent_publishing_previews")
    .insert({
      workspace_id: request.workspaceId,
      user_id: request.userId,
      connection_id: request.connectionId,
      post_id: parsed.postId,
      account_id: parsed.accountId,
      scheduled_at: parsed.scheduledAt,
      idempotency_key: request.idempotencyKey ?? null,
      request_hash: requestHash,
      snapshot,
    })
    .select("id,snapshot,created_at")
    .single();
  if (error) {
    if (error.code === "23505") {
      const raced = await previous();
      if (raced)
        return {
          previewId: raced.id,
          state: "preview",
          snapshot: raced.snapshot,
          createdAt: raced.created_at,
        };
    }
    return fail("Could not save preview.", 503, "preview_unavailable");
  }
  return {
    previewId: data.id,
    state: "preview",
    snapshot: data.snapshot,
    createdAt: data.created_at,
  };
}

export type AgentPublishingPolicyInput = {
  workspaceId: string;
  userId: string;
  connectionId: string;
  accountIds: string[];
  expiresAt: string;
  maxCount: number;
  publishNowAccountIds?: string[];
  publishNowMaxCount?: number;
};
/** Caller must pass the browser session's verified user ID, never a client assertion. */
export async function createAgentPublishingPolicy(
  input: AgentPublishingPolicyInput,
  db: Db = supabaseAdmin,
) {
  id(input.workspaceId);
  id(input.userId);
  id(input.connectionId);
  if (
    !Array.isArray(input.accountIds) ||
    (input.publishNowAccountIds !== undefined &&
      !Array.isArray(input.publishNowAccountIds)) ||
    typeof input.expiresAt !== "string"
  )
    return fail("Invalid policy.");
  const accountIds = [...new Set(input.accountIds.map(id))];
  const immediate = [...new Set((input.publishNowAccountIds ?? []).map(id))];
  const maxNow = input.publishNowMaxCount ?? 0;
  if (
    !accountIds.length ||
    accountIds.length !== input.accountIds.length ||
    immediate.length !== (input.publishNowAccountIds ?? []).length ||
    immediate.some((x) => !accountIds.includes(x)) ||
    !Number.isInteger(input.maxCount) ||
    input.maxCount < 1 ||
    input.maxCount > 1000 ||
    !Number.isInteger(maxNow) ||
    maxNow < 0 ||
    maxNow > 1000 ||
    !!immediate.length !== maxNow > 0 ||
    !Number.isFinite(Date.parse(input.expiresAt)) ||
    Date.parse(input.expiresAt) <= Date.now()
  )
    return fail("Invalid policy limits or expiry.");
  await access(db, {
    action: "status",
    workspaceId: input.workspaceId,
    userId: input.userId,
    connectionId: input.connectionId,
    input: {},
  });
  const { data: owner, error: ownerError } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (ownerError)
    return fail("Could not verify owner access.", 503, "access_unavailable");
  if (owner?.role !== "owner")
    return fail(
      "Only the workspace owner can create publishing policies.",
      403,
      "owner_required",
    );
  const { data: accounts, error: accountError } = await db
    .from("social_accounts")
    .select("id,platform,status,is_enabled,expires_at")
    .eq("workspace_id", input.workspaceId)
    .in("id", accountIds);
  if (accountError)
    return fail("Could not verify accounts.", 503, "account_unavailable");
  if (
    accounts?.length !== accountIds.length ||
    accounts.some(
      (a: any) =>
        a.platform !== "linkedin" ||
        a.status !== "connected" ||
        !a.is_enabled ||
        (a.expires_at && Date.parse(a.expires_at) <= Date.now()),
    )
  )
    return fail(
      "A selected LinkedIn account is unavailable.",
      409,
      "account_unavailable",
    );
  const { data, error } = await db
    .from("agent_publishing_policies")
    .insert({
      workspace_id: input.workspaceId,
      connection_id: input.connectionId,
      created_by: input.userId,
      account_ids: accountIds,
      expires_at: new Date(input.expiresAt).toISOString(),
      max_count: input.maxCount,
      publish_now_account_ids: immediate,
      publish_now_max_count: maxNow,
    })
    .select(
      "id,workspace_id,connection_id,account_ids,expires_at,max_count,publish_now_account_ids,publish_now_max_count,revoked_at,created_at",
    )
    .single();
  if (error)
    return fail("Could not save publishing policy.", 503, "policy_unavailable");
  return data;
}
/** Revocation takes effect for future dispatch only; in-flight submissions cannot be recalled. */
export async function revokeAgentPublishingPolicy(
  input: { workspaceId: string; userId: string; policyId: string },
  db: Db = supabaseAdmin,
) {
  id(input.workspaceId);
  id(input.userId);
  id(input.policyId);
  const { data: owner, error: ownerError } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (ownerError)
    return fail("Could not verify owner access.", 503, "access_unavailable");
  if (owner?.role !== "owner")
    return fail(
      "Only the workspace owner can revoke publishing policies.",
      403,
      "owner_required",
    );
  const { data, error } = await db
    .from("agent_publishing_policies")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", input.policyId)
    .eq("workspace_id", input.workspaceId)
    .is("revoked_at", null)
    .select("id")
    .maybeSingle();
  if (error)
    return fail(
      "Could not revoke publishing policy.",
      503,
      "policy_unavailable",
    );
  return { revoked: !!data };
}

/** Browser owner view: revoked agent credentials cannot query their own status. */
export async function listAgentPublishingRequestsForOwner(
  input: { workspaceId: string; userId: string },
  db: Db = supabaseAdmin,
) {
  id(input.workspaceId);
  id(input.userId);
  const { data: owner, error: ownerError } = await db
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", input.workspaceId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (ownerError)
    return fail("Could not verify owner access.", 503, "access_unavailable");
  if (owner?.role !== "owner")
    return fail(
      "Only the workspace owner can inspect publishing requests.",
      403,
      "owner_required",
    );
  const { data: rows, error } = await db
    .from("agent_publishing_requests")
    .select(
      "id,post_id,target_id,connection_id,policy_id,scheduled_at,action,created_at",
    )
    .eq("workspace_id", input.workspaceId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error)
    return fail(
      "Could not retrieve publishing requests.",
      503,
      "status_unavailable",
    );
  type RequestRow = {
    id: string;
    post_id: string;
    target_id: string;
    connection_id: string;
    policy_id: string;
    scheduled_at: string;
    action: string;
    created_at: string;
  };
  type TargetRow = {
    id: string;
    status: string;
    submission_started_at: string | null;
    published_at: string | null;
  };
  type AuthorizationRow = {
    id: string;
    revoked_at: string | null;
    expires_at: string;
  };
  const requests = (rows ?? []) as RequestRow[];
  if (!requests.length) return [];
  const [targets, connections, policies] = await Promise.all([
    db
      .from("post_targets")
      .select("id,status,submission_started_at,published_at")
      .in("id", [...new Set(requests.map((row) => row.target_id))]),
    db
      .from("agent_api_connections")
      .select("id,revoked_at,expires_at")
      .eq("workspace_id", input.workspaceId)
      .in("id", [...new Set(requests.map((row) => row.connection_id))]),
    db
      .from("agent_publishing_policies")
      .select("id,revoked_at,expires_at")
      .eq("workspace_id", input.workspaceId)
      .in("id", [...new Set(requests.map((row) => row.policy_id))]),
  ]);
  if (targets.error || connections.error || policies.error)
    return fail(
      "Could not retrieve publishing requests.",
      503,
      "status_unavailable",
    );
  const targetMap = new Map<string, TargetRow>(
    ((targets.data ?? []) as TargetRow[]).map((row) => [row.id, row]),
  );
  const connectionMap = new Map<string, AuthorizationRow>(
    ((connections.data ?? []) as AuthorizationRow[]).map((row) => [
      row.id,
      row,
    ]),
  );
  const policyMap = new Map<string, AuthorizationRow>(
    ((policies.data ?? []) as AuthorizationRow[]).map((row) => [row.id, row]),
  );
  return requests.map((row) => {
    const target = targetMap.get(row.target_id),
      connection = connectionMap.get(row.connection_id),
      policy = policyMap.get(row.policy_id);
    const invalid =
      !connection ||
      !!connection.revoked_at ||
      Date.parse(connection.expires_at) <= Date.now() ||
      !policy ||
      !!policy.revoked_at ||
      Date.parse(policy.expires_at) <= Date.now();
    const status = target?.status;
    const held =
      status === "skipped" ||
      (invalid &&
        !!status &&
        ["pending", "retrying", "publishing"].includes(status) &&
        !target?.submission_started_at);
    return {
      requestId: row.id,
      postId: row.post_id,
      action: row.action,
      scheduledAt: row.scheduled_at,
      createdAt: row.created_at,
      status: held ? "held" : (status ?? "unavailable"),
      publishedAt: target?.published_at ?? null,
    };
  });
}
