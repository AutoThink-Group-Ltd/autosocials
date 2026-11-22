/* Workspace-scoped agent research. Reads never advance runs or invoke providers. */
import { z } from "zod";
import { createHash } from "node:crypto";
import { waitUntil } from "@vercel/functions";
import {
  researchLookupInput,
  researchListInput,
  researchGetInput,
  researchLookupOutput,
  researchListOutput,
  researchGetOutput,
  researchStartInput,
  researchStartOutput,
  type ResearchRequest,
} from "./agent-research-contract";
import { targetFromSocialUrl, type ResearchTarget } from "./research";

// The service client reads the migration-owned research and agent rows.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
type Discovery = (
  query: string,
) => Promise<{ candidates: ResearchTarget[]; warnings: string[] }>;
type Dependencies = {
  db: Db;
  discover: Discovery;
  configured?: () => boolean;
  start?: (target: ResearchTarget) => Promise<string>;
  handoff?: (workspaceId: string, id: string) => void;
};
export class AgentResearchError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AgentResearchError";
  }
}
async function defaults(): Promise<Dependencies> {
  const [{ getAdminClient }, provider] = await Promise.all([
    import("./supabase-admin.server"),
    import("./research-provider.server"),
  ]);
  return {
    db: getAdminClient(),
    discover: provider.discoverResearchTargets,
    configured: provider.apifyConfigured,
    start: provider.startApifyRun,
    handoff: (workspaceId, id) => {
      try {
        waitUntil(
          import("./research.server").then(({ processResearchInBackground }) =>
            processResearchInBackground(workspaceId, id),
          ),
        );
      } catch {
        /* Saved run can be resumed from the application. */
      }
    },
  };
}
async function access(db: Db, workspaceId: string, userId: string) {
  if (
    !z.string().uuid().safeParse(workspaceId).success ||
    !z.string().uuid().safeParse(userId).success
  )
    throw new Error("Invalid workspace or user");
  const { data, error } = await db.rpc("can_access_workspace", {
    _user_id: userId,
    _workspace_id: workspaceId,
  });
  if (error || data !== true) throw new Error("Workspace access denied");
}
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.slice(0, max) : "";
const metric = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
const statuses = new Set([
  "queued",
  "fetching",
  "analyzing",
  "complete",
  "partial",
  "failed",
]);
function summary(row: Record<string, unknown>) {
  const status = String(row["status"]);
  if (!statuses.has(status)) throw new Error("Invalid saved research status");
  return {
    id: String(row["id"]),
    query: str(row["query"], 500),
    status,
    createdAt: String(row["created_at"]),
    postCount: array(row["posts"]).length,
  };
}
function publicPostUrl(platform: string, value: unknown): string | null {
  try {
    const u = new URL(String(value));
    const hosts: Record<string, string[]> = {
      instagram: ["instagram.com", "www.instagram.com"],
      facebook: ["facebook.com", "www.facebook.com", "m.facebook.com"],
      tiktok: ["tiktok.com", "www.tiktok.com"],
    };
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      u.port ||
      !(hosts[platform] ?? []).includes(u.hostname.toLowerCase())
    )
      return null;
    u.search = "";
    u.hash = "";
    return u.toString().slice(0, 500);
  } catch {
    return null;
  }
}
function cleanReport(row: Record<string, unknown>) {
  const targets = array(row["targets"])
    .flatMap((raw) => {
      const t = obj(raw);
      const target = targetFromSocialUrl(str(t["url"], 500));
      return target
        ? [
            {
              platform: target.platform,
              handle: target.handle,
              url: target.url,
            },
          ]
        : [];
    })
    .slice(0, 3);
  const evidence = array(row["posts"])
    .flatMap((raw, index) => {
      const p = obj(raw),
        platform = str(p["platform"], 20),
        url = publicPostUrl(platform, p["url"]);
      if (!url || !["instagram", "facebook", "tiktok"].includes(platform))
        return [];
      const m = obj(p["metrics"]),
        kind = str(p["media_type"], 20),
        basis = str(p["review_basis"], 20);
      return [
        {
          reference: `e${index + 1}`,
          platform,
          url,
          caption: str(p["caption"], 1000),
          publishedAt:
            typeof p["published_at"] === "string"
              ? p["published_at"].slice(0, 40)
              : null,
          mediaType: ["image", "video", "carousel"].includes(kind)
            ? kind
            : "unknown",
          reviewBasis: ["frames", "thumbnail"].includes(basis)
            ? basis
            : "metadata",
          metrics: {
            likes: metric(m["likes"]),
            comments: metric(m["comments"]),
            views: metric(m["views"]),
            shares: metric(m["shares"]),
          },
        },
      ];
    })
    .slice(0, 20);
  const analysis = obj(row["analysis"]);
  return {
    ...summary(row),
    updatedAt: String(row["updated_at"]),
    question: str(row["question"], 2000),
    summary:
      typeof analysis["summary"] === "string"
        ? analysis["summary"].slice(0, 2000)
        : null,
    targets,
    evidence,
  };
}
/** Trusted caller provides the verified agent principal and authorized workspace. */
export async function agentResearchAction(
  request: ResearchRequest,
  dependencies?: Dependencies,
) {
  const deps = dependencies ?? (await defaults());
  await access(deps.db, request.workspaceId, request.userId);
  if (request.action === "start") {
    const input = researchStartInput.parse(request.input);
    if (
      !request.connectionId ||
      !z.string().uuid().safeParse(request.connectionId).success ||
      !request.idempotencyKey ||
      request.idempotencyKey.length > 128
    )
      throw new AgentResearchError(
        "A valid connection and idempotency key are required",
        400,
        "invalid_request",
      );
    const targets = input.targets.map((value) => {
      const u = new URL(value),
        parts = u.pathname.split("/").filter(Boolean),
        target = targetFromSocialUrl(value);
      if (
        u.protocol !== "https:" ||
        u.username ||
        u.password ||
        u.port ||
        u.search ||
        u.hash ||
        parts.length !== 1 ||
        !target
      )
        throw new AgentResearchError(
          "Choose exact public profile URLs",
          400,
          "invalid_target",
        );
      return target;
    });
    if (new Set(targets.map((t) => t.id)).size !== targets.length)
      throw new AgentResearchError(
        "Choose each profile once",
        400,
        "invalid_target",
      );
    const connection = await deps.db
      .from("agent_api_connections")
      .select("id,workspace_id,user_id,scopes,expires_at,revoked_at")
      .eq("id", request.connectionId)
      .maybeSingle();
    const c = connection.data;
    if (
      connection.error ||
      !c ||
      c.workspace_id !== request.workspaceId ||
      c.user_id !== request.userId ||
      c.revoked_at ||
      !Number.isFinite(Date.parse(c.expires_at)) ||
      Date.parse(c.expires_at) <= Date.now() ||
      !Array.isArray(c.scopes) ||
      !c.scopes.includes("research:run")
    )
      throw new AgentResearchError(
        "Research authorization is unavailable",
        403,
        "access_denied",
      );
    const hash = createHash("sha256")
      .update(
        JSON.stringify({
          query: input.query,
          question: input.question,
          targets: targets.map((t) => t.url),
        }),
      )
      .digest("hex");
    const existing = async () => {
      const r = await deps.db
        .from("research_runs")
        .select("id,status,agent_request_hash")
        .eq("agent_connection_id", request.connectionId)
        .eq("agent_idempotency_key", request.idempotencyKey)
        .maybeSingle();
      if (r.error)
        throw new AgentResearchError(
          "Could not check research request",
          503,
          "research_unavailable",
        );
      return r.data;
    };
    const replay = (r: {
      agent_request_hash: unknown;
      id: unknown;
      status: unknown;
    }) => {
      if (r.agent_request_hash !== hash)
        throw new AgentResearchError(
          "Idempotency key was used for a different request",
          409,
          "idempotency_conflict",
        );
      return researchStartOutput.parse({
        id: r.id,
        status: r.status,
        reused: true,
      });
    };
    const prior = await existing();
    if (prior) return replay(prior);
    if (!deps.configured?.() || !deps.start)
      throw new AgentResearchError(
        "Public research is not configured",
        503,
        "research_unavailable",
      );
    const created = await deps.db
      .from("research_runs")
      .insert({
        workspace_id: request.workspaceId,
        user_id: request.userId,
        query: input.query,
        question: input.question,
        targets,
        posts: [],
        errors: [],
        status: "queued",
        provider_runs: {},
        agent_connection_id: request.connectionId,
        agent_idempotency_key: request.idempotencyKey,
        agent_request_hash: hash,
      })
      .select("id,status")
      .single();
    if (created.error?.code === "23505") {
      const concurrent = await existing();
      if (concurrent) return replay(concurrent);
      throw new AgentResearchError(
        "Another research run is active in this workspace",
        409,
        "research_active",
      );
    }
    if (created.error || !created.data)
      throw new AgentResearchError(
        "Could not create research run",
        503,
        "research_unavailable",
      );
    const id = String(created.data.id),
      providerRuns: Record<string, string> = {},
      errors: string[] = [];
    await Promise.all(
      targets.map(async (target) => {
        try {
          providerRuns[target.id] = await deps.start!(target);
        } catch {
          errors.push(
            `${target.platform} ${target.handle}: could not start public post collection`,
          );
        }
      }),
    );
    const status = Object.keys(providerRuns).length ? "fetching" : "failed";
    const updated = await deps.db
      .from("research_runs")
      .update({
        provider_runs: providerRuns,
        errors,
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("workspace_id", request.workspaceId);
    if (updated.error)
      throw new AgentResearchError(
        "Research start outcome is unavailable; check the saved run before retrying",
        503,
        "research_unavailable",
      );
    if (status === "fetching") deps.handoff?.(request.workspaceId, id);
    return researchStartOutput.parse({ id, status, reused: false });
  }
  if (request.action === "lookup") {
    const input = researchLookupInput.parse(request.input),
      direct = targetFromSocialUrl(input.query);
    let candidates: ResearchTarget[], warnings: string[];
    if (direct) {
      candidates = [direct];
      warnings = [
        "Profile URL is syntactically valid; its existence and ownership have not been verified.",
      ];
    } else {
      if (!input.allowMeteredLookup)
        throw new Error(
          "Explicit consent is required for metered profile search",
        );
      if (
        /https?:\/\/|\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}\b|^@/i.test(input.query)
      )
        throw new Error("Enter a company name or an exact public profile URL");
      const result = await deps.discover(input.query);
      candidates = result.candidates;
      warnings = result.warnings;
    }
    const cleaned = candidates
      .flatMap((t) => {
        const target = targetFromSocialUrl(t.url);
        return target
          ? [
              {
                id: target.id,
                platform: target.platform,
                handle: target.handle,
                url: target.url,
                verified: false as const,
              },
            ]
          : [];
      })
      .slice(0, 12);
    return researchLookupOutput.parse({
      candidates: cleaned,
      warnings: [
        ...warnings,
        "Confirm profile ownership before starting research.",
      ]
        .slice(0, 8)
        .map((x) => x.slice(0, 300)),
    });
  }
  if (request.action === "list") {
    const input = researchListInput.parse(request.input);
    const { data, error } = await deps.db
      .from("research_runs")
      .select("id,query,status,created_at,posts")
      .eq("workspace_id", request.workspaceId)
      .order("created_at", { ascending: false })
      .limit(input.limit);
    if (error) throw new Error("Could not load research history");
    return researchListOutput.parse({ reports: (data ?? []).map(summary) });
  }
  if (request.action === "get") {
    const input = researchGetInput.parse(request.input);
    const { data, error } = await deps.db
      .from("research_runs")
      .select(
        "id,query,question,status,created_at,updated_at,targets,posts,analysis",
      )
      .eq("workspace_id", request.workspaceId)
      .eq("id", input.id)
      .maybeSingle();
    if (error) throw new Error("Could not load research report");
    if (!data) throw new Error("Research report not found in this workspace");
    return researchGetOutput.parse({ report: cleanReport(data) });
  }
  throw new Error("Unsupported research action");
}
