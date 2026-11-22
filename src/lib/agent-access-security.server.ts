import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getAgentDb } from "./agent-access-db.server";

export function agentApiEnabled() {
  return process.env["AUTOSOCIALS_AGENT_API_ENABLED"] === "1";
}

export function agentDraftsEnabled() {
  return process.env["AUTOSOCIALS_AGENT_DRAFTS_ENABLED"] === "1";
}

export function agentPublishingEnabled() {
  return (
    agentApiEnabled() &&
    agentDraftsEnabled() &&
    process.env["AUTOSOCIALS_AGENT_PUBLISHING_ENABLED"] === "1"
  );
}

export function agentTilePlanningEnabled() {
  return (
    agentApiEnabled() &&
    agentDraftsEnabled() &&
    process.env["AUTOSOCIALS_AGENT_TILE_PLANNING_ENABLED"] === "1"
  );
}

export function agentResearchProviderEnabled() {
  return (
    agentApiEnabled() &&
    process.env["AUTOSOCIALS_AGENT_RESEARCH_PROVIDER_ENABLED"] === "1"
  );
}

export function agentOrigin() {
  const url = new URL(
    process.env["AUTOSOCIALS_AGENT_ORIGIN"] ?? "https://autosocials.com",
  );
  if (
    url.protocol !== "https:" &&
    !(url.protocol === "http:" && isLoopback(url.hostname))
  ) {
    throw new Error("AutoSocials agent origin requires HTTPS");
  }
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "AutoSocials agent origin must contain only scheme and host",
    );
  }
  return url.origin;
}

export function isLoopback(host: string) {
  return ["127.0.0.1", "localhost", "[::1]"].includes(host);
}

export function publicOriginMatches(request: Request) {
  const configured = agentOrigin();
  const supplied = request.headers.get("origin");
  const allowed = new Set([
    configured,
    ...(process.env["AUTOSOCIALS_AGENT_ALLOWED_ORIGINS"] ?? "")
      .split(",")
      .map((value) => value.trim()),
  ]);
  return (
    new URL(request.url).origin === configured &&
    (!supplied || allowed.has(supplied))
  );
}

export function digest(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function newSecret(prefix: string) {
  return prefix + randomBytes(32).toString("base64url");
}

export function sameDigest(expected: string, actual: string) {
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function takeAgentRateSlot(bucket: string, limit: number) {
  const { data, error } = await getAgentDb().rpc("take_agent_api_rate_slot", {
    p_bucket: bucket,
    p_limit: limit,
  });
  if (error)
    throw new AgentApiError(503, "SERVICE_UNAVAILABLE", "Try again later.");
  return data === true;
}

export class AgentApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function boundedBody(request: Request, maxBytes = 32768) {
  const length = request.headers.get("content-length");
  if (length !== null && Number(length) > maxBytes)
    throw new AgentApiError(
      413,
      "REQUEST_TOO_LARGE",
      "The request body is too large.",
    );
  if (!request.body) return "";
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let output = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) return output + decoder.decode();
      size += result.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new AgentApiError(
          413,
          "REQUEST_TOO_LARGE",
          "The request body is too large.",
        );
      }
      output += decoder.decode(result.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}
