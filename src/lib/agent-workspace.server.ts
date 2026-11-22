import { type SupabaseClient } from "@supabase/supabase-js";
import {
  agentOperationNames,
  agentOperations,
  type AgentOperationName,
} from "./agent-access-contract";
import { AgentApiError } from "./agent-access-security.server";
import { getAgentDb, type AgentConnection } from "./agent-access-db.server";
import { readContentCampaign } from "./content-campaign.server";
import { campaignSchema } from "./content-campaign";

const dayMs = 86400000;

export async function listAgentSchedule(
  workspaceId: string,
  input: {
    from?: string | undefined;
    until?: string | undefined;
    limit: number;
  },
) {
  const from = input.from ? new Date(input.from) : new Date();
  const until = input.until
    ? new Date(input.until)
    : new Date(from.getTime() + 30 * dayMs);
  const duration = until.getTime() - from.getTime();
  if (duration <= 0 || duration > 90 * dayMs)
    throw new AgentApiError(
      400,
      "INVALID_WINDOW",
      "Choose a schedule window of up to 90 days.",
    );

  const { data, error } = await getAgentDb()
    .from("posts")
    .select(
      "id,caption,status,scheduled_at,published_at,post_targets(social_account_id,platform,status)",
    )
    .eq("workspace_id", workspaceId)
    .gte("scheduled_at", from.toISOString())
    .lt("scheduled_at", until.toISOString())
    .in("status", [
      "scheduled",
      "publishing",
      "published",
      "partially_published",
      "needs_attention",
    ])
    .order("scheduled_at")
    .order("id")
    .limit(input.limit + 1);
  if (error)
    throw new AgentApiError(
      503,
      "SCHEDULE_UNAVAILABLE",
      "The schedule could not be read.",
    );
  return {
    from: from.toISOString(),
    until: until.toISOString(),
    truncated: data.length > input.limit,
    posts: data.slice(0, input.limit).map((post) => ({
      id: post.id,
      caption: post.caption,
      status: post.status,
      scheduledAt: post.scheduled_at,
      publishedAt: post.published_at,
      destinations: post.post_targets.map((target) => ({
        accountId: target.social_account_id,
        platform: target.platform,
        status: target.status,
      })),
    })),
  };
}

export async function listAgentContentPlans(
  workspaceId: string,
  limit: number,
) {
  const db = getAgentDb() as unknown as SupabaseClient;
  const { data, error } = await db
    .from("brand_work_operations")
    .select("result,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("kind", "content-campaign")
    .eq("status", "complete")
    .order("updated_at", { ascending: false })
    .limit(limit + 1);
  if (error)
    throw new AgentApiError(
      503,
      "PLANS_UNAVAILABLE",
      "Content plans could not be read.",
    );
  const visible = data.slice(0, limit);
  const plans = visible.flatMap((row) => {
    const result = campaignSchema.safeParse(row.result);
    return result.success
      ? [
          {
            id: result.data.id,
            title: result.data.title,
            timezone: result.data.timezone,
            postCount: result.data.posts.length,
            updatedAt: String(row.updated_at),
          },
        ]
      : [];
  });
  return {
    plans,
    truncated: data.length > limit,
    unreadable: visible.length - plans.length,
  };
}

export async function inspectAgentContentPlan(
  connection: AgentConnection,
  planId: string,
  limit: number,
) {
  try {
    const plan = await readContentCampaign(
      connection.user_id,
      connection.workspace_id,
      planId,
    );
    return {
      id: plan.id,
      title: plan.title,
      timezone: plan.timezone,
      postCount: plan.posts.length,
      posts: plan.posts
        .slice(0, limit)
        .map(({ id, date, platform, format, title, caption }) => ({
          id,
          date,
          platform,
          format,
          title,
          caption,
        })),
      truncated: plan.posts.length > limit,
      reviewPath: "/app/create?stage=plans",
    };
  } catch {
    throw new AgentApiError(
      404,
      "PLAN_UNAVAILABLE",
      "This content plan is unavailable in the connected workspace.",
    );
  }
}

export async function listAgentCreatorCollections(
  workspaceId: string,
  limit: number,
) {
  const { data, error } = await getAgentDb()
    .from("creator_lists")
    .select("id,name,description,updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .order("id")
    .limit(limit + 1);
  if (error)
    throw new AgentApiError(
      503,
      "CREATOR_COLLECTIONS_UNAVAILABLE",
      "Creator collections could not be read.",
    );
  return {
    collections: data.slice(0, limit).map((list) => ({
      id: list.id,
      name: list.name,
      description: list.description,
      updatedAt: list.updated_at,
    })),
    truncated: data.length > limit,
    reviewPath: "/app/discover",
  };
}

const unavailable = {
  area: "Paid ads",
  reason: "The paid ads module has not been built.",
};

const browserActions = [
  {
    area: "Brand and Profile DNA",
    path: "/app/brand-dna",
    reason: "Review sources and edit brand evidence in the app.",
  },
  {
    area: "Create and Production",
    path: "/app/create",
    reason:
      "Review credit quotes, generate assets and approve completed media in the app.",
  },
  {
    area: "Creator discovery",
    path: "/app/discover",
    reason:
      "Discover and review creators through the workspace's available providers.",
  },
  {
    area: "Social research",
    path: "/app/research/social-lens",
    reason:
      "Open reports and review provider coverage and evidence in the app.",
  },
  {
    area: "Organic Winners",
    path: "/app/winners",
    reason: "Manage saved organic results and related workspace actions.",
  },
  {
    area: "Schedule",
    path: "/app/schedule",
    reason:
      "Manage channel-specific approvals and review held deliveries in the app.",
  },
  {
    area: "Outreach",
    path: "/app/outreach",
    reason: "Sending requires the existing human confirmation workflow.",
  },
  {
    area: "Connected accounts",
    path: "/app/settings/connections",
    reason: "Authorize or disconnect providers directly in the app.",
  },
  {
    area: "Team and access",
    path: "/app/team",
    reason:
      "User roles, invites and access grants require the app's authenticated settings.",
  },
  {
    area: "Billing",
    path: "/app/billing",
    reason:
      "Billing and subscription changes require the app's authorized billing flow.",
  },
];

export function workspaceAgentCapabilities(
  connection: AgentConnection,
  available: (name: AgentOperationName) => boolean,
) {
  return {
    tools: agentOperationNames
      .filter(
        (name) =>
          available(name) &&
          connection.scopes.includes(agentOperations[name].scope),
      )
      .map((name) => ({
        name,
        scope: agentOperations[name].scope,
        summary: agentOperations[name].summary,
      })),
    browserActions,
    unavailable: [unavailable],
  };
}
