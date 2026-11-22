import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const id = z.string().uuid();
const workspaceInput = z.object({ workspaceId: id }).strict();
const connectionInput = workspaceInput.extend({ connectionId: id });
const secretInput = workspaceInput.extend({
  label: z.string().trim().min(1).max(80),
  days: z.number().int().min(1).max(90),
  scopes: z.array(z.string().max(32)).min(1).max(20).optional(),
});

async function workspaceAccess(workspaceId: string) {
  const { requireUser } = await import("./supabase-admin.server");
  const { getAgentDb } = await import("./agent-access-db.server");
  const user = await requireUser();
  const db = getAgentDb();
  const [access, owner] = await Promise.all([
    db.rpc("can_access_workspace", {
      _user_id: user.id,
      _workspace_id: workspaceId,
    }),
    db.rpc("is_workspace_owner", {
      _user_id: user.id,
      _workspace_id: workspaceId,
    }),
  ]);
  if (access.error || owner.error || !access.data)
    throw new Error("Workspace access is unavailable.");
  return { db, user, owner: owner.data === true };
}

export const getAgentConsent = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) =>
    z.object({ requestId: id }).strict().parse(value),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { readAgentConsent } = await import("./agent-oauth.server");
    await requireUser();
    const { request, client } = await readAgentConsent(data.requestId);
    return {
      label: client.label,
      redirectHost: new URL(request.redirect_uri).hostname,
      scopes: request.scopes,
      expiresAt: request.expires_at,
    };
  });

export const resolveAgentConsent = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z
      .object({ requestId: id, workspaceId: id.optional(), allow: z.boolean() })
      .strict()
      .parse(value),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { resolveAgentOAuthConsent } = await import("./agent-oauth.server");
    const user = await requireUser();
    return resolveAgentOAuthConsent(
      data.requestId,
      user.id,
      data.workspaceId,
      data.allow,
    );
  });

const managedFields =
  "id,label,kind,scopes,key_prefix,created_at,expires_at,revoked_at,last_used_at" as const;
const adminConnectionFields =
  "id,label,kind,scopes,key_prefix,created_at,expires_at,revoked_at,last_used_at,workspace_id,user_id" as const;
const requestFields =
  "id,workspace_id,connection_id,operation,transport,occurred_at,outcome,duration_ms,settled_credits" as const;

export const getAgentAccessSettings = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => workspaceInput.parse(value))
  .handler(async ({ data }) => {
    const { db, user, owner } = await workspaceAccess(data.workspaceId);
    const { agentApiEnabled } = await import("./agent-access-security.server");
    const { availableOAuthScopes } = await import("./agent-oauth.server");
    const enabled = agentApiEnabled();
    const availableScopes = availableOAuthScopes().filter(
      (scope) => scope !== "posts:schedule" && scope !== "posts:publish",
    );
    let grants = db
      .from("agent_api_connections")
      .select(managedFields)
      .eq("workspace_id", data.workspaceId)
      .order("created_at", { ascending: false });
    if (!owner) grants = grants.eq("user_id", user.id);
    const grantResult = await grants.limit(100);
    if (grantResult.error) {
      if (!enabled && grantResult.error.code === "PGRST205")
        return {
          enabled,
          canManageAll: owner,
          availableScopes: [],
          connections: [],
          requests: [],
        };
      throw new Error("Connections are unavailable.");
    }
    let history = db
      .from("agent_api_requests")
      .select(requestFields)
      .eq("workspace_id", data.workspaceId)
      .order("occurred_at", { ascending: false });
    if (!owner) {
      const ids = grantResult.data.map((connection) => connection.id);
      if (!ids.length)
        return {
          enabled,
          canManageAll: owner,
          availableScopes,
          connections: grantResult.data,
          requests: [],
        };
      history = history.in("connection_id", ids);
    }
    const results = await history.limit(100);
    if (results.error) throw new Error("Request history is unavailable.");
    return {
      enabled,
      canManageAll: owner,
      availableScopes,
      connections: grantResult.data,
      requests: results.data,
    };
  });

export const createAgentApiKey = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => secretInput.parse(value))
  .handler(async ({ data }) => {
    const { db, user } = await workspaceAccess(data.workspaceId);
    const { agentApiEnabled, digest, newSecret, takeAgentRateSlot } =
      await import("./agent-access-security.server");
    const { availableOAuthScopes } = await import("./agent-oauth.server");
    if (!agentApiEnabled()) throw new Error("AI agent access is unavailable.");
    const scopes = [...new Set(data.scopes ?? ["channels:read"])];
    const available = new Set<string>(
      availableOAuthScopes().filter(
        (scope) => scope !== "posts:schedule" && scope !== "posts:publish",
      ),
    );
    if (scopes.some((scope) => !available.has(scope)))
      throw new Error("One or more permissions are unavailable.");
    if (!(await takeAgentRateSlot("key-create:" + user.id, 10)))
      throw new Error("Try again in a minute.");
    const secret = newSecret("ask_");
    const { error } = await db.from("agent_api_connections").insert({
      workspace_id: data.workspaceId,
      user_id: user.id,
      label: data.label,
      kind: "api_key",
      key_hash: digest(secret),
      key_prefix: secret.slice(0, 10),
      scopes,
      expires_at: new Date(Date.now() + data.days * 86400000).toISOString(),
    });
    if (error) throw new Error("Could not create this key.");
    return { secret };
  });

export const rotateAgentApiKey = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => connectionInput.parse(value))
  .handler(async ({ data }) => {
    const { db, user } = await workspaceAccess(data.workspaceId);
    const { agentApiEnabled, digest, newSecret, takeAgentRateSlot } =
      await import("./agent-access-security.server");
    if (!agentApiEnabled()) throw new Error("AI agent access is unavailable.");
    if (!(await takeAgentRateSlot("key-rotate:" + user.id, 10)))
      throw new Error("Try again in a minute.");
    const secret = newSecret("ask_");
    const result = await db.rpc("rotate_agent_api_key", {
      p_connection: data.connectionId,
      p_workspace: data.workspaceId,
      p_user: user.id,
      p_key_hash: digest(secret),
      p_key_prefix: secret.slice(0, 10),
    });
    if (result.error || !result.data)
      throw new Error("Only your own active keys can be rotated.");
    return { secret };
  });

export const revokeAgentConnection = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) => connectionInput.parse(value))
  .handler(async ({ data }) => {
    const { db, user, owner } = await workspaceAccess(data.workspaceId);
    let update = db
      .from("agent_api_connections")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.connectionId)
      .eq("workspace_id", data.workspaceId)
      .is("revoked_at", null);
    if (!owner) update = update.eq("user_id", user.id);
    const { error, data: revoked } = await update.select("id").maybeSingle();
    if (error || !revoked)
      throw new Error("This connection could not be revoked.");
    return { ok: true as const };
  });

export const getAgentPublishingSettings = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) => workspaceInput.parse(value))
  .handler(async ({ data }) => {
    const { db, owner, user } = await workspaceAccess(data.workspaceId);
    const { agentPublishingEnabled } =
      await import("./agent-access-security.server");
    if (!owner)
      return { enabled: false, accounts: [], policies: [], requests: [] };
    const { listAgentPublishingPolicies } =
      await import("./agent-publishing-settings.server");
    const { listAgentPublishingRequestsForOwner } =
      await import("./agent-publishing.server");
    const enabled = agentPublishingEnabled();
    const [accounts, policies] = await Promise.all([
      db
        .from("social_accounts")
        .select("id,display_name,handle")
        .eq("workspace_id", data.workspaceId)
        .eq("platform", "linkedin")
        .eq("status", "connected")
        .eq("is_enabled", true)
        .order("display_name")
        .limit(100),
      listAgentPublishingPolicies(data.workspaceId),
    ]);
    if (accounts.error)
      throw new Error("LinkedIn account settings are unavailable.");
    if (policies.error) {
      if (!enabled && policies.error.code === "PGRST205")
        return { enabled, accounts: [], policies: [], requests: [] };
      throw new Error("Publishing permissions are unavailable.");
    }
    const requests = await listAgentPublishingRequestsForOwner({
      workspaceId: data.workspaceId,
      userId: user.id,
    });
    return {
      enabled,
      accounts: accounts.data,
      policies: policies.data,
      requests,
    };
  });

export const activateAgentPublishingPolicy = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    connectionInput
      .extend({
        accountIds: z.array(id).min(1).max(20),
        expiresAt: z.string().datetime({ offset: true }),
        maxCount: z.number().int().min(1).max(1000),
        publishNowAccountIds: z.array(id).max(20),
        publishNowMaxCount: z.number().int().min(0).max(1000),
        confirmed: z.literal(true),
      })
      .parse(value),
  )
  .handler(async ({ data }) => {
    const { db, user, owner } = await workspaceAccess(data.workspaceId);
    const { agentPublishingEnabled } =
      await import("./agent-access-security.server");
    const { createAgentPublishingPolicy } =
      await import("./agent-publishing.server");
    if (!owner || !agentPublishingEnabled())
      throw new Error("Standing publishing permission is unavailable.");
    const connection = await db
      .from("agent_api_connections")
      .select("kind,user_id,scopes,expires_at")
      .eq("workspace_id", data.workspaceId)
      .eq("id", data.connectionId)
      .is("revoked_at", null)
      .maybeSingle();
    if (
      connection.error ||
      !connection.data ||
      connection.data.user_id !== user.id ||
      connection.data.kind !== "oauth" ||
      !connection.data.scopes.includes("posts:schedule") ||
      (data.publishNowMaxCount > 0 &&
        !connection.data.scopes.includes("posts:publish")) ||
      Date.parse(data.expiresAt) > Date.parse(connection.data.expires_at)
    ) {
      throw new Error(
        "Choose your active OAuth connection with the required publishing permissions and an earlier expiry.",
      );
    }
    const policy = await createAgentPublishingPolicy({
      ...data,
      userId: user.id,
    });
    return { id: policy.id as string };
  });

export const disableAgentPublishingPolicy = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    workspaceInput.extend({ policyId: id }).parse(value),
  )
  .handler(async ({ data }) => {
    const { user, owner } = await workspaceAccess(data.workspaceId);
    const { revokeAgentPublishingPolicy } =
      await import("./agent-publishing.server");
    if (!owner)
      throw new Error(
        "Only the workspace owner can revoke standing permission.",
      );
    return revokeAgentPublishingPolicy({ ...data, userId: user.id });
  });

export const getAgentAdminOverview = createServerFn({ method: "GET" })
  .inputValidator((value: unknown) =>
    z
      .object({
        page: z.number().int().min(0).max(1000),
        workspaceId: id.optional(),
        requestId: id.optional(),
        outcome: z
          .string()
          .regex(/^[A-Z_]{1,64}$/)
          .optional(),
      })
      .strict()
      .parse(value),
  )
  .handler(async ({ data }) => {
    const { requireUser } = await import("./supabase-admin.server");
    const { getAgentDb } = await import("./agent-access-db.server");
    const db = getAgentDb();
    const user = await requireUser();
    const role = await db.rpc("has_role", {
      _user_id: user.id,
      _role: "super_admin",
    });
    if (role.error || !role.data)
      throw new Error("Super Admin access is required.");
    let logs = db
      .from("agent_api_requests")
      .select(requestFields)
      .order("occurred_at", { ascending: false })
      .order("id");
    let grants = db
      .from("agent_api_connections")
      .select(adminConnectionFields)
      .order("created_at", { ascending: false });
    if (data.workspaceId) {
      logs = logs.eq("workspace_id", data.workspaceId);
      grants = grants.eq("workspace_id", data.workspaceId);
    }
    if (data.requestId) logs = logs.eq("id", data.requestId);
    if (data.outcome) logs = logs.eq("outcome", data.outcome);
    const offset = data.page * 25;
    const [requests, connections] = await Promise.all([
      logs.range(offset, offset + 25),
      grants.range(offset, offset + 25),
    ]);
    if (requests.error || connections.error)
      throw new Error("Agent request and connection records are unavailable.");
    return {
      requests: requests.data.slice(0, 25),
      connections: connections.data.slice(0, 25),
      hasNext: requests.data.length > 25 || connections.data.length > 25,
    };
  });
