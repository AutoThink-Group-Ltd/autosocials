import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type {
  CallToolResult,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  agentOperationNames,
  agentOperations,
  defaultAgentScope,
  idempotencySchema,
  isMcpOnlyOperation,
  type AgentOperationName,
} from "./agent-access-contract";
import { getAgentDb, type AgentConnection } from "./agent-access-db.server";
import {
  agentApiEnabled,
  agentDraftsEnabled,
  agentPublishingEnabled,
  agentResearchProviderEnabled,
  agentTilePlanningEnabled,
  AgentApiError,
  boundedBody,
  digest,
  publicOriginMatches,
  takeAgentRateSlot,
} from "./agent-access-security.server";
import { mcpChallenge, mcpResource } from "./agent-oauth.server";
import {
  agentPublishingAction,
  AgentPublishingError,
} from "./agent-publishing.server";
import { agentContentAction, AgentContentError } from "./agent-content.server";
import {
  inspectAgentContentPlan,
  listAgentContentPlans,
  listAgentCreatorCollections,
  listAgentSchedule,
  workspaceAgentCapabilities,
} from "./agent-workspace.server";
import {
  agentResearchAction,
  AgentResearchError,
} from "./agent-research.server";
import { agentWinnersAction, AgentWinnersError } from "./agent-winners.server";
import { searchShortFormTrends } from "./agent-virlo.server";

const privateHeaders = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex",
  "X-Content-Type-Options": "nosniff",
};
const ratePerMinute = 60;
type Transport = "mcp" | "rest";

function providerRequestId(connectionId: string, key: string) {
  const hash = digest("virlo:" + connectionId + ":" + key);
  // Scope provider retries to this connection without storing or exposing its API secret.
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "8" + hash.slice(13, 16),
    "a" + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

export function connectionActive(
  connection: Pick<AgentConnection, "expires_at" | "revoked_at">,
  now = Date.now(),
) {
  return !connection.revoked_at && Date.parse(connection.expires_at) > now;
}

function serviceUnavailable() {
  return new AgentApiError(
    503,
    "SERVICE_UNAVAILABLE",
    "AutoSocials could not complete this request. Try again later.",
  );
}

function unauthorized() {
  return new AgentApiError(
    401,
    "UNAUTHORIZED",
    "Connect AutoSocials or use an active credential for this interface.",
  );
}

function visibleOperation(name: AgentOperationName) {
  if (isMcpOnlyOperation(name)) return agentPublishingEnabled();
  if (name === "prepare_social_tile") return agentTilePlanningEnabled();
  if (
    name === "find_social_research_targets" ||
    name === "start_social_research" ||
    name === "search_short_form_trends"
  )
    return agentResearchProviderEnabled();
  return !agentOperations[name].writes || agentDraftsEnabled();
}

async function authenticateAgent(
  request: Request,
  transport: Transport,
): Promise<AgentConnection> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer (as[ka]_[A-Za-z0-9_-]{43})$/i)?.[1];
  if (!token || !token.startsWith(transport === "mcp" ? "asa_" : "ask_"))
    throw unauthorized();

  const db = getAgentDb();
  let connectionId: string | undefined;
  if (transport === "mcp") {
    const { data, error } = await db
      .from("agent_api_oauth_tokens")
      .select("connection_id")
      .eq("secret_hash", digest(token))
      .eq("kind", "access")
      .eq("resource", mcpResource())
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (error) throw serviceUnavailable();
    if (!data) throw unauthorized();
    connectionId = data.connection_id;
  }
  let query = db.from("agent_api_connections").select("*");
  query = connectionId
    ? query.eq("id", connectionId).eq("kind", "oauth")
    : query.eq("kind", "api_key").eq("key_hash", digest(token));
  const { data: connection, error } = await query.maybeSingle();
  if (error) throw serviceUnavailable();
  if (!connection || !connectionActive(connection)) throw unauthorized();
  const access = await db.rpc("can_access_workspace", {
    _user_id: connection.user_id,
    _workspace_id: connection.workspace_id,
  });
  if (access.error) throw serviceUnavailable();
  if (!access.data) throw unauthorized();
  return connection;
}

async function listChannels(
  workspaceId: string,
  params: z.output<typeof agentOperations.list_connected_channels.input>,
) {
  const db = getAgentDb();
  let query = db
    .from("social_accounts")
    .select("id,platform,display_name,handle,status,is_enabled,expires_at")
    .eq("workspace_id", workspaceId)
    .order("id")
    .limit(params.limit + 1);
  if (params.cursor) query = query.gt("id", params.cursor);
  const { data, error } = await query;
  if (error) throw serviceUnavailable();
  const now = Date.now();
  const channels = data.slice(0, params.limit).map((channel) => ({
    id: channel.id,
    platform: channel.platform,
    name: channel.display_name,
    handle: channel.handle,
    status:
      channel.status === "connected" &&
      channel.expires_at &&
      Date.parse(channel.expires_at) <= now
        ? "reconnect_required"
        : channel.status,
    enabled: channel.is_enabled,
  }));
  return {
    channels,
    nextCursor:
      data.length > params.limit
        ? (channels[channels.length - 1]?.id ?? null)
        : null,
  };
}

async function brandSummary(workspaceId: string) {
  const db = getAgentDb();
  const [workspace, profile] = await Promise.all([
    db
      .from("workspaces")
      .select("name,website")
      .eq("id", workspaceId)
      .maybeSingle(),
    db
      .from("brand_profiles")
      .select("profile")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
  ]);
  if (workspace.error || profile.error) throw serviceUnavailable();
  if (!workspace.data)
    throw new AgentApiError(404, "NOT_FOUND", "Workspace not found.");
  const brand = profile.data?.profile;
  const voice =
    brand && typeof brand === "object" && !Array.isArray(brand)
      ? brand["tone"]
      : undefined;
  return {
    name: workspace.data.name,
    website: workspace.data.website,
    voice: typeof voice === "string" ? voice.slice(0, 1500) : null,
  };
}

async function createDraft(
  connection: AgentConnection,
  input: z.output<typeof agentOperations.create_written_draft.input>,
  key: string,
) {
  const { data, error } = await getAgentDb().rpc("create_agent_written_draft", {
    p_connection: connection.id,
    p_user: connection.user_id,
    p_workspace: connection.workspace_id,
    p_caption: input.caption,
    p_idempotency: key,
    p_body_hash: digest(input.caption),
  });
  if (error?.code === "23505")
    throw new AgentApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "Use a fresh idempotency key for changed content.",
    );
  if (error?.code === "42501") throw unauthorized();
  if (error?.code === "22023")
    throw new AgentApiError(400, "INVALID_INPUT", "Enter a valid caption.");
  if (error) throw serviceUnavailable();
  if (!data)
    throw new AgentApiError(
      409,
      "DRAFT_REMOVED",
      "The draft created by this request has been removed.",
    );
  return { postId: data, status: "draft" };
}

async function operationResult(
  name: AgentOperationName,
  connection: AgentConnection,
  input: unknown,
  key?: string,
) {
  switch (name) {
    case "search_short_form_trends":
      return searchShortFormTrends({
        workspaceId: connection.workspace_id,
        userId: connection.user_id,
        requestId: providerRequestId(connection.id, key!),
        input,
      });
    case "list_creator_collections":
      return listAgentCreatorCollections(
        connection.workspace_id,
        agentOperations[name].input.parse(input).limit,
      );
    case "list_social_research":
    case "get_social_research_report":
    case "find_social_research_targets":
    case "start_social_research":
      return agentResearchAction({
        action: researchActions[name],
        workspaceId: connection.workspace_id,
        userId: connection.user_id,
        input,
        connectionId: connection.id,
        ...(key ? { idempotencyKey: key } : {}),
      });
    case "find_organic_winners":
    case "list_organic_winner_findings":
    case "list_organic_winner_shortlist":
      return agentWinnersAction({
        action: winnerActions[name],
        workspaceId: connection.workspace_id,
        userId: connection.user_id,
        input,
      });
    case "list_workspace_capabilities":
      return workspaceAgentCapabilities(connection, visibleOperation);
    case "list_publishing_calendar":
      return listAgentSchedule(
        connection.workspace_id,
        agentOperations[name].input.parse(input),
      );
    case "list_organic_content_plans":
      return listAgentContentPlans(
        connection.workspace_id,
        agentOperations[name].input.parse(input).limit,
      );
    case "get_organic_content_plan": {
      const params = agentOperations[name].input.parse(input);
      return inspectAgentContentPlan(connection, params.id, params.limit);
    }
    case "list_connected_channels":
      return listChannels(
        connection.workspace_id,
        agentOperations[name].input.parse(input),
      );
    case "get_brand_summary":
      return brandSummary(connection.workspace_id);
    case "create_written_draft":
      return createDraft(
        connection,
        agentOperations[name].input.parse(input),
        key!,
      );
    case "list_linkedin_publishing_permissions": {
      const { data, error } = await getAgentDb()
        .from("agent_publishing_policies")
        .select(
          "id,account_ids,expires_at,max_count,publish_now_account_ids,publish_now_max_count",
        )
        .eq("workspace_id", connection.workspace_id)
        .eq("connection_id", connection.id)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw serviceUnavailable();
      return { permissions: data };
    }
    case "preview_linkedin_post":
    case "get_publication_status":
    case "schedule_linkedin_post":
    case "publish_linkedin_post_now":
      return agentPublishingAction({
        action: publishingAction[name],
        workspaceId: connection.workspace_id,
        connectionId: connection.id,
        userId: connection.user_id,
        input,
        ...(key ? { idempotencyKey: key } : {}),
      });
    case "prepare_social_tile":
    case "list_linkedin_carousels":
    case "get_linkedin_carousel":
    case "get_video_job_status":
      return agentContentAction({
        action: contentActions[name],
        workspaceId: connection.workspace_id,
        userId: connection.user_id,
        input,
        ...(key ? { idempotencyKey: key } : {}),
      });
  }
}

const publishingAction = {
  preview_linkedin_post: "prepare",
  get_publication_status: "status",
  schedule_linkedin_post: "schedule",
  publish_linkedin_post_now: "publish_now",
} as const;

const contentActions = {
  prepare_social_tile: "prepare_tile",
  list_linkedin_carousels: "list_carousels",
  get_linkedin_carousel: "get_carousel",
  get_video_job_status: "get_video_status",
} as const;

const researchActions = {
  list_social_research: "list",
  get_social_research_report: "get",
  find_social_research_targets: "lookup",
  start_social_research: "start",
} as const;

const winnerActions = {
  find_organic_winners: "rank_organic",
  list_organic_winner_findings: "list_findings",
  list_organic_winner_shortlist: "list_shortlist",
} as const;

function operationError(error: unknown) {
  if (error instanceof AgentApiError) return error;
  if (
    error instanceof AgentPublishingError ||
    error instanceof AgentContentError ||
    error instanceof AgentResearchError ||
    error instanceof AgentWinnersError
  ) {
    return new AgentApiError(
      error.status,
      error.code.toUpperCase(),
      error.message,
    );
  }
  if (error instanceof z.ZodError)
    return new AgentApiError(
      400,
      "INVALID_INPUT",
      "Check the operation's input fields and limits.",
    );
  return serviceUnavailable();
}

export async function executeAgentOperation(
  requestId: string,
  name: AgentOperationName,
  connection: AgentConnection,
  transport: Transport,
  input: unknown,
  key?: string,
) {
  const db = getAgentDb();
  const start = performance.now();
  const allowed = await takeAgentRateSlot(
    "connection:" + connection.id,
    ratePerMinute,
  );
  if (!allowed)
    throw new AgentApiError(
      429,
      "RATE_LIMITED",
      "This connection reached 60 calls per minute. Try again in a minute.",
    );
  const record = await db.from("agent_api_requests").insert({
    id: requestId,
    workspace_id: connection.workspace_id,
    connection_id: connection.id,
    operation: name,
    transport,
  });
  if (record.error) throw serviceUnavailable();

  let outcome = "OK";
  try {
    const operation = agentOperations[name];
    if (!visibleOperation(name))
      throw new AgentApiError(
        503,
        "OPERATION_UNAVAILABLE",
        "This operation is currently unavailable.",
      );
    if (isMcpOnlyOperation(name) && connection.kind !== "oauth") {
      throw new AgentApiError(
        403,
        "OAUTH_REQUIRED",
        "Use an OAuth connection with explicit owner authorization.",
      );
    }
    if (!connection.scopes.includes(operation.scope))
      throw new AgentApiError(
        403,
        "INSUFFICIENT_SCOPE",
        "This connection lacks " + operation.scope + ".",
      );
    if (
      name === "prepare_social_tile" &&
      !(await takeAgentRateSlot("tile-planning:" + connection.workspace_id, 5))
    ) {
      throw new AgentApiError(
        429,
        "RATE_LIMITED",
        "This workspace reached five tile planning calls per minute. Try again in a minute.",
      );
    }
    if (
      (name === "start_social_research" ||
        name === "search_short_form_trends" ||
        name === "find_social_research_targets") &&
      !(await takeAgentRateSlot(
        name + ":" + connection.workspace_id,
        name === "start_social_research" ? 2 : 5,
      ))
    ) {
      throw new AgentApiError(
        429,
        "RATE_LIMITED",
        "This workspace reached its research provider rate limit. Try again in a minute.",
      );
    }
    const parsed = operation.input.parse(input);
    if (operation.writes && !idempotencySchema.safeParse(key).success) {
      throw new AgentApiError(
        400,
        "IDEMPOTENCY_REQUIRED",
        "Provide an idempotency key of 8 to 128 safe ASCII characters.",
      );
    }
    const data = await operationResult(name, connection, parsed, key);
    const result = operation.output.safeParse(data);
    if (!result.success) throw serviceUnavailable();
    return result.data;
  } catch (error) {
    const safe = operationError(error);
    outcome = safe.code;
    throw safe;
  } finally {
    const timestamp = new Date();
    await Promise.allSettled([
      db
        .from("agent_api_requests")
        .update({
          outcome,
          duration_ms: Math.round(performance.now() - start),
          settled_credits: 0,
        })
        .eq("id", requestId),
      db
        .from("agent_api_connections")
        .update({ last_used_at: timestamp.toISOString() })
        .eq("id", connection.id)
        .or(
          "last_used_at.is.null,last_used_at.lt." +
            new Date(timestamp.getTime() - 60000).toISOString(),
        ),
    ]);
  }
}

function failure(error: unknown, requestId: string, transport: Transport) {
  const safe = operationError(error);
  const headers: Record<string, string> = {
    ...privateHeaders,
    "X-Request-Id": requestId,
  };
  if (safe.status === 401)
    headers["WWW-Authenticate"] =
      transport === "mcp"
        ? mcpChallenge(defaultAgentScope)
        : 'Bearer realm="AutoSocials API"';
  if (safe.status === 429) headers["Retry-After"] = "60";
  return Response.json(
    { requestId, error: { code: safe.code, message: safe.message } },
    { status: safe.status, headers },
  );
}

function restResponse(data: unknown, requestId: string) {
  return Response.json(
    { requestId, data },
    { headers: { ...privateHeaders, "X-Request-Id": requestId } },
  );
}

async function restInput(request: Request) {
  if (request.method === "GET") {
    const params = new URL(request.url).searchParams;
    if (new Set(params.keys()).size !== params.size)
      throw new AgentApiError(
        400,
        "INVALID_INPUT",
        "Each query parameter may appear only once.",
      );
    return Object.fromEntries(params);
  }
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new AgentApiError(
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "Use application/json for the request body.",
    );
  }
  const body = await boundedBody(request);
  try {
    return JSON.parse(body);
  } catch {
    throw new AgentApiError(400, "INVALID_INPUT", "Send a valid JSON body.");
  }
}

export async function agentRest(request: Request, path: string) {
  const requestId = crypto.randomUUID();
  try {
    if (!agentApiEnabled() || !publicOriginMatches(request))
      throw new AgentApiError(404, "NOT_FOUND", "Operation not found.");
    const name = agentOperationNames.find(
      (operation) => agentOperations[operation].path === path,
    );
    if (!name || !visibleOperation(name) || isMcpOnlyOperation(name))
      throw new AgentApiError(404, "NOT_FOUND", "Operation not found.");
    if (agentOperations[name].method !== request.method) {
      const response = failure(
        new AgentApiError(
          405,
          "METHOD_NOT_ALLOWED",
          "Use the documented HTTP method.",
        ),
        requestId,
        "rest",
      );
      response.headers.set("Allow", agentOperations[name].method);
      return response;
    }
    const connection = await authenticateAgent(request, "rest");
    const input = await restInput(request);
    return restResponse(
      await executeAgentOperation(
        requestId,
        name,
        connection,
        "rest",
        input,
        request.headers.get("idempotency-key") ?? undefined,
      ),
      requestId,
    );
  } catch (error) {
    return failure(error, requestId, "rest");
  }
}

function mcpServer(connection: AgentConnection) {
  const server = new McpServer({ name: "autosocials", version: "0.1.0" });
  // The SDK's dual Zod v3/v4 overload is recursive. Runtime schemas validate both boundaries.
  const registrar = server as unknown as {
    registerTool(
      name: string,
      config: {
        description: string;
        inputSchema: z.AnyZodObject;
        outputSchema: z.AnyZodObject;
        annotations: ToolAnnotations;
      },
      callback: (args: Record<string, unknown>) => Promise<CallToolResult>,
    ): void;
  };
  for (const name of agentOperationNames) {
    const operation = agentOperations[name];
    if (!visibleOperation(name) || !connection.scopes.includes(operation.scope))
      continue;
    const schema: z.AnyZodObject = operation.writes
      ? operation.input.extend({ idempotencyKey: idempotencySchema }).strict()
      : operation.input;
    const outputSchema: z.AnyZodObject = z.object({
      requestId: z.string().uuid(),
      data: operation.output,
    });
    registrar.registerTool(
      name,
      {
        description: operation.summary,
        inputSchema: schema,
        outputSchema,
        annotations: {
          readOnlyHint: !operation.writes,
          destructiveHint: name === "publish_linkedin_post_now",
          idempotentHint: name !== "find_social_research_targets",
          openWorldHint:
            name === "schedule_linkedin_post" ||
            name === "publish_linkedin_post_now" ||
            name === "prepare_social_tile" ||
            name === "find_social_research_targets" ||
            name === "search_short_form_trends" ||
            name === "start_social_research",
        },
      },
      async (args) => {
        const requestId = crypto.randomUUID();
        const { idempotencyKey, ...input } = args;
        try {
          const data = await executeAgentOperation(
            requestId,
            name,
            connection,
            "mcp",
            input,
            typeof idempotencyKey === "string" ? idempotencyKey : undefined,
          );
          const content = { requestId, data };
          return {
            structuredContent: content,
            content: [{ type: "text", text: JSON.stringify(content) }],
          };
        } catch (error) {
          const safe = operationError(error);
          const content = {
            requestId,
            error: { code: safe.code, message: safe.message },
          };
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify(content) }],
          };
        }
      },
    );
  }
  return server;
}

export async function agentMcp(request: Request) {
  const requestId = crypto.randomUUID();
  try {
    if (!agentApiEnabled() || !publicOriginMatches(request))
      throw new AgentApiError(404, "NOT_FOUND", "MCP is unavailable.");
    const connection = await authenticateAgent(request, "mcp");
    if (request.method !== "POST")
      return new Response(null, {
        status: 405,
        headers: {
          ...privateHeaders,
          Allow: "POST",
          "X-Request-Id": requestId,
        },
      });
    const server = mcpServer(connection);
    const transport = new WebStandardStreamableHTTPServerTransport({
      enableJsonResponse: true,
      maxRequestBodySize: 32768,
    });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(privateHeaders))
        headers.set(key, value);
      headers.set("X-Request-Id", requestId);
      return new Response(response.body, { status: response.status, headers });
    } finally {
      await server.close();
    }
  } catch (error) {
    return failure(error, requestId, "mcp");
  }
}
