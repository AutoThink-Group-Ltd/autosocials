import { beforeEach, describe, expect, it, vi } from "vitest";

const { database, tables, rpc } = vi.hoisted(() => {
  const tables: Record<string, (query: Record<string, unknown>) => unknown> =
    {};
  const rpc = vi.fn(async (name: string) => ({
    data:
      name === "can_access_workspace" || name === "take_agent_api_rate_slot",
    error: null,
  }));
  const database = {
    rpc,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const methods = {
        eq: (key: string, value: unknown) => {
          filters[key] = value;
          return methods;
        },
        gt: (key: string, value: unknown) => {
          filters["gt." + key] = value;
          return methods;
        },
        select: (value: string) => {
          filters["select"] = value;
          return methods;
        },
        insert: (value: unknown) => {
          filters["insert"] = value;
          return methods;
        },
        update: (value: unknown) => {
          filters["update"] = value;
          return methods;
        },
        or: () => methods,
        order: () => methods,
        limit: () => methods,
        maybeSingle: async () => ({
          data: tables[table]?.(filters) ?? null,
          error: null,
        }),
        then: (resolve: (value: unknown) => unknown) =>
          resolve({ data: tables[table]?.(filters) ?? null, error: null }),
      };
      return methods;
    },
  };
  return { database, tables, rpc };
});

vi.mock("./agent-access-db.server", () => ({ getAgentDb: () => database }));
vi.mock("./agent-publishing.server", () => ({
  agentPublishingAction: vi.fn(),
  AgentPublishingError: class extends Error {},
}));
vi.mock("./agent-content.server", () => ({
  agentContentAction: vi.fn(),
  AgentContentError: class extends Error {},
}));

import { agentMcp, agentRest } from "./agent-api.server";
import { agentApiPaths, agentToolReference } from "./agent-api-reference";
import { digest } from "./agent-access-security.server";
import {
  exactRedirect,
  oauthMetadata,
  protectedResourceMetadata,
  startAgentOAuth,
} from "./agent-oauth.server";

const origin = "https://agents.autosocials.test";
const connectionId = "61db9119-dc97-41e5-bfef-52de91f4c725";
const workspaceId = "c92a539b-6e8a-4aa1-98b9-175f1ad7d448";
const accountId = "ab5a060b-4e4e-46bc-b5f2-f82db0a28419";
const key = "ask_" + "a".repeat(43);
const token = "asa_" + "b".repeat(43);
const clientId = "asc_" + "c".repeat(43);

function request(path: string, options: RequestInit = {}) {
  return new Request(origin + path, options);
}
function bearer(secret: string) {
  return { Authorization: "Bearer " + secret };
}

describe("agent access REST and MCP pilot", () => {
  beforeEach(() => {
    vi.stubEnv("AUTOSOCIALS_AGENT_ORIGIN", origin);
    vi.stubEnv("AUTOSOCIALS_AGENT_API_ENABLED", "1");
    vi.stubEnv("AUTOSOCIALS_AGENT_DRAFTS_ENABLED", "");
    vi.stubEnv("AUTOSOCIALS_AGENT_PUBLISHING_ENABLED", "");
    vi.stubEnv("AUTOSOCIALS_AGENT_RESEARCH_PROVIDER_ENABLED", "");
    vi.stubEnv("AUTOSOCIALS_AGENT_ALLOWED_ORIGINS", "");
    rpc.mockClear();
    tables["agent_api_connections"] = (filters) => ({
      id: connectionId,
      workspace_id: workspaceId,
      user_id: accountId,
      scopes: ["channels:read"],
      kind: filters["kind"],
      expires_at: "2099-01-01T00:00:00Z",
      revoked_at: null,
    });
    tables["agent_api_oauth_tokens"] = (filters) =>
      filters["resource"] === origin + "/mcp"
        ? { connection_id: connectionId }
        : null;
    tables["agent_api_oauth_clients"] = () => ({
      id: clientId,
      redirect_uris: ["https://client.test/callback"],
    });
    tables["social_accounts"] = () => [];
  });

  it("authenticates a scoped key, returns the empty result and records a safe settled request", async () => {
    const log: Record<string, unknown>[] = [];
    const queries: Record<string, unknown>[] = [];
    tables["agent_api_requests"] = (filters) => {
      log.push(filters);
    };
    tables["social_accounts"] = (filters) => {
      queries.push(filters);
      return [];
    };
    tables["agent_api_connections"] = (filters) =>
      filters["key_hash"] === digest(key)
        ? {
            id: connectionId,
            workspace_id: workspaceId,
            user_id: accountId,
            scopes: ["channels:read"],
            expires_at: "2099-01-01T00:00:00Z",
            revoked_at: null,
          }
        : null;
    const reply = await agentRest(
      request("/api/v1/channels", { headers: bearer(key) }),
      "channels",
    );
    expect(reply.status).toBe(200);
    expect(await reply.json()).toMatchObject({
      requestId: reply.headers.get("x-request-id"),
      data: { channels: [], nextCursor: null },
    });
    expect(queries).toEqual([
      {
        select: "id,platform,display_name,handle,status,is_enabled,expires_at",
        workspace_id: workspaceId,
      },
    ]);
    expect(log).toEqual([
      expect.objectContaining({
        insert: expect.objectContaining({
          operation: "list_connected_channels",
          workspace_id: workspaceId,
        }),
      }),
      expect.objectContaining({
        update: expect.objectContaining({ outcome: "OK", settled_credits: 0 }),
      }),
    ]);
    expect(JSON.stringify(log)).not.toContain(key);
  });

  it("rejects credentials for a different audience and requests with a foreign Origin", async () => {
    const wrongAudience = await agentRest(
      request("/api/v1/channels", { headers: bearer(token) }),
      "channels",
    );
    expect(wrongAudience.status).toBe(401);
    const csrf = await agentMcp(
      request("/mcp", {
        method: "POST",
        headers: { ...bearer(token), Origin: "https://other.test" },
      }),
    );
    expect(csrf.status).toBe(404);
    const missing = await agentMcp(request("/mcp", { method: "POST" }));
    expect(missing.status).toBe(401);
    expect(missing.headers.get("www-authenticate")).toContain(
      origin + "/.well-known/oauth-protected-resource/mcp",
    );
  });

  it("rechecks workspace access and rejects scope mismatch", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null });
    expect(
      (
        await agentRest(
          request("/api/v1/channels", { headers: bearer(key) }),
          "channels",
        )
      ).status,
    ).toBe(401);
    const forbidden = await agentRest(
      request("/api/v1/brand-summary", { headers: bearer(key) }),
      "brand-summary",
    );
    expect(forbidden.status).toBe(403);
    expect(await forbidden.json()).toMatchObject({
      error: { code: "INSUFFICIENT_SCOPE" },
    });
  });

  it("uses the SDK to enumerate and call only tools granted to the connection", async () => {
    const send = (method: string, params: Record<string, unknown> = {}) =>
      agentMcp(
        request("/mcp", {
          method: "POST",
          headers: {
            ...bearer(token),
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        }),
      );
    const list = await send("tools/list");
    expect(list.status).toBe(200);
    const toolList = await list.json();
    expect(
      toolList.result.tools.map((tool: { name: string }) => tool.name),
    ).toEqual(["list_workspace_capabilities", "list_connected_channels"]);
    const result = await send("tools/call", {
      name: "list_connected_channels",
      arguments: {},
    });
    expect(await result.json()).toMatchObject({
      result: {
        structuredContent: { data: { channels: [], nextCursor: null } },
      },
    });
    const capabilities = await send("tools/call", {
      name: "list_workspace_capabilities",
      arguments: {},
    });
    expect(await capabilities.json()).toMatchObject({
      result: {
        structuredContent: { data: { unavailable: [{ area: "Paid ads" }] } },
      },
    });
  });

  it("keeps publishing off by default and excludes it from key-facing OpenAPI", async () => {
    const response = await agentRest(
      request("/api/v1/schedule-linkedin", {
        method: "POST",
        headers: bearer(key),
      }),
      "schedule-linkedin",
    );
    expect(response.status).toBe(404);
    const paths = agentApiPaths();
    expect(paths["/api/v1/channels"]).toBeDefined();
    expect(paths["/api/v1/organic-winners"]).toBeDefined();
    expect(paths["/api/v1/research-runs"]).toBeDefined();
    expect(paths["/api/v1/schedule-linkedin"]).toBeUndefined();
    expect(
      agentToolReference(origin).tools.some(
        ({ name }) => name === "schedule_linkedin_post",
      ),
    ).toBe(true);
  });

  it("publishes OAuth metadata for its own audience and rejects mismatched redirects", async () => {
    const resource = protectedResourceMetadata(
      request("/.well-known/oauth-protected-resource/mcp"),
    );
    expect(await resource.json()).toMatchObject({
      resource: origin + "/mcp",
      authorization_servers: [origin],
    });
    const issuer = oauthMetadata(
      request("/.well-known/oauth-authorization-server"),
    );
    expect(await issuer.json()).toMatchObject({
      issuer: origin,
      code_challenge_methods_supported: ["S256"],
    });
    const bad = await startAgentOAuth(
      request(
        "/agent-oauth/authorize?client_id=" +
          clientId +
          "&redirect_uri=https://another.test/callback",
      ),
    );
    expect(bad.status).toBe(400);
    expect(bad.headers.get("location")).toBeNull();
    expect(exactRedirect("http://127.0.0.1:8001/callback")).toBe(true);
    expect(exactRedirect("http://outside.test/callback")).toBe(false);
    expect(exactRedirect("https://user@example.test/callback")).toBe(false);
  });
});
