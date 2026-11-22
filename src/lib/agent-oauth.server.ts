import { z } from "zod";
import {
  defaultAgentScope,
  pilotScopes,
  type AgentScope,
} from "./agent-access-contract";
import {
  getAgentDb,
  type AgentOAuthClient,
  type AgentOAuthRequest,
} from "./agent-access-db.server";
import {
  AgentApiError,
  agentApiEnabled,
  agentDraftsEnabled,
  agentOrigin,
  agentPublishingEnabled,
  agentResearchProviderEnabled,
  agentTilePlanningEnabled,
  boundedBody,
  digest,
  isLoopback,
  newSecret,
  pkceChallenge,
  publicOriginMatches,
  sameDigest,
  takeAgentRateSlot,
} from "./agent-access-security.server";

const protectedHeaders = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex",
};
const clientIdSchema = z.string().regex(/^asc_[A-Za-z0-9_-]{43}$/);
const verifierSchema = z
  .string()
  .min(43)
  .max(128)
  .regex(/^[A-Za-z0-9._~-]+$/);
const challengeSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const redirectSchema = z.string().max(2048).url().refine(exactRedirect);
const registrationSchema = z.object({
  client_name: z.string().trim().min(1).max(100).optional(),
  redirect_uris: z
    .array(redirectSchema)
    .min(1)
    .max(8)
    .refine((uris) => new Set(uris).size === uris.length),
  token_endpoint_auth_method: z
    .enum(["none", "client_secret_basic", "client_secret_post"])
    .default("none"),
  grant_types: z
    .array(z.enum(["authorization_code", "refresh_token"]))
    .optional(),
  response_types: z.array(z.literal("code")).optional(),
});

export function exactRedirect(value: string) {
  try {
    const url = new URL(value);
    return (
      !url.username &&
      !url.password &&
      !value.includes("#") &&
      (url.protocol === "https:" ||
        (url.protocol === "http:" && isLoopback(url.hostname)))
    );
  } catch {
    return false;
  }
}

export function availableOAuthScopes(): AgentScope[] {
  const scopes = agentDraftsEnabled()
    ? [...pilotScopes]
    : pilotScopes.filter((scope) => scope !== "drafts:write");
  if (agentPublishingEnabled()) scopes.push("posts:schedule", "posts:publish");
  if (agentTilePlanningEnabled()) scopes.push("content:prepare");
  if (agentResearchProviderEnabled())
    scopes.push("research:lookup", "research:run", "research:trends");
  return scopes;
}

export function mcpResource() {
  return agentOrigin() + "/mcp";
}

export function mcpChallenge(scope?: string) {
  return (
    'Bearer resource_metadata="' +
    agentOrigin() +
    '/.well-known/oauth-protected-resource/mcp"' +
    (scope ? ', scope="' + scope + '"' : "")
  );
}

export function protectedResourceMetadata(request: Request) {
  if (!agentApiEnabled() || !publicOriginMatches(request))
    return new Response(null, { status: 404, headers: protectedHeaders });
  return Response.json(
    {
      resource: mcpResource(),
      authorization_servers: [agentOrigin()],
      scopes_supported: availableOAuthScopes(),
      bearer_methods_supported: ["header"],
      resource_name: "AutoSocials",
    },
    { headers: protectedHeaders },
  );
}

export function oauthMetadata(request: Request) {
  if (!agentApiEnabled() || !publicOriginMatches(request))
    return new Response(null, { status: 404, headers: protectedHeaders });
  const issuer = agentOrigin();
  return Response.json(
    {
      issuer,
      authorization_endpoint: issuer + "/agent-oauth/authorize",
      token_endpoint: issuer + "/agent-oauth/token",
      registration_endpoint: issuer + "/agent-oauth/register",
      revocation_endpoint: issuer + "/agent-oauth/revoke",
      scopes_supported: availableOAuthScopes(),
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: [
        "none",
        "client_secret_basic",
        "client_secret_post",
      ],
      code_challenge_methods_supported: ["S256"],
    },
    { headers: protectedHeaders },
  );
}

class OAuthError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

function handleOAuthError(error: unknown) {
  if (error instanceof OAuthError || error instanceof AgentApiError) {
    const status = error.status;
    return Response.json(
      {
        error:
          error instanceof OAuthError ? error.code : "temporarily_unavailable",
        error_description: error.message,
      },
      {
        status,
        headers: {
          ...protectedHeaders,
          ...(status === 401
            ? { "WWW-Authenticate": 'Basic realm="AutoSocials OAuth"' }
            : {}),
          ...(status === 429 ? { "Retry-After": "60" } : {}),
        },
      },
    );
  }
  return Response.json(
    { error: "temporarily_unavailable" },
    { status: 503, headers: protectedHeaders },
  );
}

function redirectWith(
  uri: string,
  state: string,
  result: Record<string, string>,
) {
  const destination = new URL(uri);
  for (const [key, value] of Object.entries(result))
    destination.searchParams.set(key, value);
  if (state) destination.searchParams.set("state", state);
  return destination.toString();
}

function redirectResponse(location: string) {
  return new Response(null, {
    status: 303,
    headers: { ...protectedHeaders, Location: location },
  });
}

function inputValue(params: URLSearchParams, name: string, maxLength: number) {
  const values = params.getAll(name);
  if (values.length > 1 || (values[0]?.length ?? 0) > maxLength)
    throw new OAuthError("invalid_request", "Invalid " + name + ".");
  return values[0] ?? "";
}

function validateResource(params: URLSearchParams) {
  const resource = inputValue(params, "resource", 2048);
  if (resource && resource !== mcpResource())
    throw new OAuthError(
      "invalid_target",
      "Use the AutoSocials MCP resource URL.",
    );
  return mcpResource();
}

async function enforceLimit(bucket: string, max: number) {
  if (!(await takeAgentRateSlot(bucket, max)))
    throw new OAuthError(
      "temporarily_unavailable",
      "Try again in a minute.",
      429,
    );
}

async function loadClient(id: string) {
  if (!clientIdSchema.safeParse(id).success) return null;
  const { data, error } = await getAgentDb()
    .from("agent_api_oauth_clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error)
    throw new OAuthError("temporarily_unavailable", "Try again later.", 503);
  return data;
}

function requestedScopes(value: string) {
  const supported = new Set<string>(availableOAuthScopes());
  const scopes = [
    ...new Set((value || defaultAgentScope).split(/\s+/).filter(Boolean)),
  ];
  if (!scopes.length || scopes.some((scope) => !supported.has(scope))) {
    throw new OAuthError(
      "invalid_scope",
      "One or more requested permissions are unavailable.",
    );
  }
  return scopes;
}

function endpoint(handler: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      if (!agentApiEnabled() || !publicOriginMatches(request))
        return new Response(null, { status: 404, headers: protectedHeaders });
      return await handler(request);
    } catch (error) {
      return handleOAuthError(error);
    }
  };
}

export const registerOAuthClient = endpoint(async (request) => {
  await enforceLimit("oauth:registration", 40);
  if (
    !/^application\/json(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new OAuthError(
      "invalid_client_metadata",
      "Use a JSON client registration request.",
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(await boundedBody(request));
  } catch (error) {
    if (error instanceof AgentApiError) throw error;
    throw new OAuthError("invalid_client_metadata", "Invalid JSON.");
  }
  const metadata = registrationSchema.safeParse(body);
  if (!metadata.success)
    throw new OAuthError(
      "invalid_client_metadata",
      "Provide valid, exact OAuth redirect URIs.",
    );

  const { client_name, redirect_uris, token_endpoint_auth_method } =
    metadata.data;
  const clientId = newSecret("asc_");
  const clientSecret =
    token_endpoint_auth_method === "none" ? null : newSecret("ascs_");
  const { error } = await getAgentDb()
    .from("agent_api_oauth_clients")
    .insert({
      id: clientId,
      label: client_name ?? "AI connection",
      redirect_uris,
      auth_method: token_endpoint_auth_method,
      secret_hash: clientSecret ? digest(clientSecret) : null,
    });
  if (error)
    throw new OAuthError("temporarily_unavailable", "Try again later.", 503);
  return Response.json(
    {
      client_id: clientId,
      client_name: client_name ?? "AI connection",
      redirect_uris,
      token_endpoint_auth_method,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      ...(clientSecret
        ? { client_secret: clientSecret, client_secret_expires_at: 0 }
        : {}),
    },
    { status: 201, headers: protectedHeaders },
  );
});

export const startAgentOAuth = endpoint(async (request) => {
  await enforceLimit("oauth:authorize", 120);
  const params = new URL(request.url).searchParams;
  const client = await loadClient(inputValue(params, "client_id", 100));
  const uri = inputValue(params, "redirect_uri", 2048);
  if (!client || !client.redirect_uris.includes(uri) || !exactRedirect(uri)) {
    throw new OAuthError(
      "invalid_request",
      "The redirect URI does not match this client.",
    );
  }
  const state = inputValue(params, "state", 2048);
  try {
    if (inputValue(params, "response_type", 20) !== "code")
      throw new OAuthError(
        "unsupported_response_type",
        "Use the authorization code flow.",
      );
    const challenge = inputValue(params, "code_challenge", 128);
    if (
      inputValue(params, "code_challenge_method", 8) !== "S256" ||
      !challengeSchema.safeParse(challenge).success
    ) {
      throw new OAuthError(
        "invalid_request",
        "A valid S256 PKCE challenge is required.",
      );
    }
    const { data, error } = await getAgentDb()
      .from("agent_api_oauth_requests")
      .insert({
        client_id: client.id,
        redirect_uri: uri,
        resource: validateResource(params),
        state,
        challenge,
        scopes: requestedScopes(inputValue(params, "scope", 512)),
      })
      .select("id")
      .single();
    if (error)
      throw new OAuthError("temporarily_unavailable", "Try again later.", 503);
    return redirectResponse(
      agentOrigin() + "/agent-connect?request_id=" + data.id,
    );
  } catch (error) {
    if (!(error instanceof OAuthError)) throw error;
    return redirectResponse(
      redirectWith(uri, state, {
        error: error.code,
        error_description: error.message,
      }),
    );
  }
});

export async function readAgentConsent(
  id: string,
): Promise<{ request: AgentOAuthRequest; client: AgentOAuthClient }> {
  if (!agentApiEnabled())
    throw new Error("AI agent connections are unavailable.");
  const { data, error } = await getAgentDb()
    .from("agent_api_oauth_requests")
    .select("*")
    .eq("id", id)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data)
    throw new Error(
      "This connection request has expired. Restart the connection in your AI client.",
    );
  const client = await loadClient(data.client_id);
  if (!client) throw new Error("This AI client is unavailable.");
  return { request: data, client };
}

export async function resolveAgentOAuthConsent(
  id: string,
  userId: string,
  workspaceId: string | undefined,
  allow: boolean,
) {
  const { request } = await readAgentConsent(id);
  if (allow && !workspaceId)
    throw new Error("Choose a workspace before continuing.");
  if (
    allow &&
    request.scopes.some(
      (scope) => !availableOAuthScopes().some((enabled) => enabled === scope),
    )
  ) {
    throw new Error(
      "A requested permission is currently unavailable. Restart the connection.",
    );
  }
  const code = newSecret("aso_");
  const { data, error } = await getAgentDb().rpc(
    "authorize_agent_api_request",
    {
      p_request: id,
      p_user: userId,
      p_workspace: workspaceId ?? null,
      p_code_hash: digest(code),
      p_allow: allow,
    },
  );
  if (error || !data)
    throw new Error(
      "The connection request expired or the workspace is unavailable.",
    );
  return {
    redirectUri: redirectWith(
      request.redirect_uri,
      request.state,
      allow ? { code } : { error: "access_denied" },
    ),
  };
}

async function tokenForm(request: Request) {
  if (
    !/^application\/x-www-form-urlencoded(?:\s*;|$)/i.test(
      request.headers.get("content-type") ?? "",
    )
  ) {
    throw new OAuthError("invalid_request", "Use a form-encoded request.");
  }
  return new URLSearchParams(await boundedBody(request));
}

async function authenticateOAuthClient(
  request: Request,
  params: URLSearchParams,
) {
  let id = inputValue(params, "client_id", 100);
  let secret = inputValue(params, "client_secret", 200);
  const header = request.headers.get("authorization") ?? "";
  let method: AgentOAuthClient["auth_method"] = secret
    ? "client_secret_post"
    : "none";
  if (header) {
    if (secret || !/^Basic [A-Za-z0-9+/=]{1,400}$/i.test(header))
      throw new OAuthError(
        "invalid_client",
        "Invalid client authentication.",
        401,
      );
    const credentials = Buffer.from(header.slice(6), "base64").toString("utf8");
    const separator = credentials.indexOf(":");
    if (separator < 0 || (id && id !== credentials.slice(0, separator)))
      throw new OAuthError(
        "invalid_client",
        "Invalid client authentication.",
        401,
      );
    id = credentials.slice(0, separator);
    secret = credentials.slice(separator + 1);
    method = "client_secret_basic";
  }
  const client = await loadClient(id);
  if (
    !client ||
    client.auth_method !== method ||
    (client.secret_hash && !sameDigest(client.secret_hash, digest(secret)))
  ) {
    throw new OAuthError(
      "invalid_client",
      "Invalid client authentication.",
      401,
    );
  }
  return client;
}

export const exchangeAgentOAuthToken = endpoint(async (request) => {
  await enforceLimit("oauth:token", 240);
  const params = await tokenForm(request);
  const client = await authenticateOAuthClient(request, params);
  const grant = inputValue(params, "grant_type", 32);
  if (grant !== "authorization_code" && grant !== "refresh_token")
    throw new OAuthError(
      "unsupported_grant_type",
      "This grant type is unavailable.",
    );
  const resource = validateResource(params);
  const source = inputValue(
    params,
    grant === "authorization_code" ? "code" : "refresh_token",
    200,
  );
  const redirect = inputValue(params, "redirect_uri", 2048);
  const verifier = inputValue(params, "code_verifier", 128);
  if (
    !source ||
    (grant === "authorization_code" &&
      (!client.redirect_uris.includes(redirect) ||
        !verifierSchema.safeParse(verifier).success))
  ) {
    throw new OAuthError(
      "invalid_grant",
      "Restart the connection in your AI client.",
    );
  }
  const scope = inputValue(params, "scope", 512);
  const access = newSecret("asa_");
  const refresh = newSecret("asr_");
  const { data, error } = await getAgentDb().rpc("exchange_agent_api_token", {
    p_kind: grant,
    p_secret_hash: digest(source),
    p_client: client.id,
    p_resource: resource,
    p_redirect: redirect,
    p_challenge: grant === "authorization_code" ? pkceChallenge(verifier) : "",
    p_access_hash: digest(access),
    p_refresh_hash: digest(refresh),
    p_scopes: scope ? requestedScopes(scope) : null,
  });
  if (error)
    throw new OAuthError("temporarily_unavailable", "Try again later.", 503);
  if (!data)
    throw new OAuthError(
      "invalid_grant",
      "Restart the connection in your AI client.",
    );
  return Response.json(
    {
      token_type: "Bearer",
      access_token: access,
      refresh_token: refresh,
      expires_in: data.expiresIn,
      scope: data.scopes.join(" "),
    },
    { headers: protectedHeaders },
  );
});

export const revokeAgentOAuth = endpoint(async (request) => {
  await enforceLimit("oauth:revoke", 120);
  const params = await tokenForm(request);
  const client = await authenticateOAuthClient(request, params);
  const token = inputValue(params, "token", 200);
  if (!token) throw new OAuthError("invalid_request", "A token is required.");
  const db = getAgentDb();
  const row = await db
    .from("agent_api_oauth_tokens")
    .select("connection_id")
    .eq("secret_hash", digest(token))
    .maybeSingle();
  if (row.error)
    throw new OAuthError("temporarily_unavailable", "Try again later.", 503);
  if (row.data) {
    const { error } = await db
      .from("agent_api_connections")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", row.data.connection_id)
      .eq("oauth_client_id", client.id)
      .is("revoked_at", null);
    if (error)
      throw new OAuthError("temporarily_unavailable", "Try again later.", 503);
  }
  return new Response(null, { headers: protectedHeaders });
});
