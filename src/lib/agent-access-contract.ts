import { z } from "zod";
import { tilePlanSchema } from "./social-tiles";
import { referenceIdsSchema } from "./social-design";
import {
  agentVirloSearchInput,
  agentVirloSearchOutput,
} from "./agent-virlo-contract";
import {
  researchGetInput,
  researchGetOutput,
  researchListInput,
  researchListOutput,
  researchLookupInput,
  researchLookupOutput,
  researchStartInput,
  researchStartOutput,
} from "./agent-research-contract";
import {
  listWinnerFindingsInput,
  listWinnerFindingsOutput,
  listWinnerShortlistInput,
  listWinnerShortlistOutput,
  rankOrganicInput,
  rankOrganicOutput,
} from "./agent-winners-contract";

export const agentScopeLabels = {
  "channels:read": "View connected channels",
  "brand:read": "Read the workspace's brand summary",
  "drafts:write": "Save written drafts and prepare post previews",
  "posts:read": "Check publication status",
  "posts:schedule": "Request scheduling where separately authorized",
  "posts:publish": "Request immediate publishing where separately authorized",
  "content:prepare": "Prepare a brand-aware tile plan and image credit quote",
  "carousels:read": "Read saved LinkedIn carousel plans and PDF handoff links",
  "videos:read": "Check workspace video generation status",
  "schedule:read": "View publishing calendar and destination statuses",
  "planning:read": "Review saved organic content plans",
  "research:read": "Review saved social research and public evidence",
  "research:lookup":
    "Find public profiles using the configured discovery providers",
  "research:run": "Start social research runs that may use provider allowance",
  "research:trends":
    "Search public short-form video trends using Virlo provider allowance",
  "winners:read": "Rank measured organic posts and view evidence",
  "creators:read": "Read workspace creator collection names and descriptions",
} as const;

export type AgentScope = keyof typeof agentScopeLabels;
export const agentScopes = Object.keys(agentScopeLabels) as AgentScope[];
export const pilotScopes: AgentScope[] = [
  "channels:read",
  "brand:read",
  "drafts:write",
  "posts:read",
  "carousels:read",
  "videos:read",
  "schedule:read",
  "planning:read",
  "research:read",
  "winners:read",
  "creators:read",
];
export const defaultAgentScope: AgentScope = "channels:read";
export const idempotencySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

const id = z.string().uuid();
const instant = z.string().datetime({ offset: true });
const nullableString = z.string().nullable();
const media = z.object({
  id,
  kind: z.string(),
  mime: nullableString,
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration_ms: z.number().nullable(),
  position: z.number(),
});
const previewSnapshot = z.object({
  postId: id,
  caption: z.string(),
  firstComment: nullableString,
  postUpdatedAt: instant,
  account: z.object({
    id,
    displayName: nullableString,
    handle: nullableString,
  }),
  media: z.array(media),
  scheduledAt: instant.nullable(),
  issues: z.array(z.string()),
  publishable: z.boolean(),
  note: z.string(),
});
const previewOutput = z.object({
  previewId: id,
  state: z.literal("preview"),
  snapshot: previewSnapshot,
  createdAt: instant,
});
const delivery = z.object({
  requestId: id,
  postId: id,
  action: z.enum(["schedule", "publish_now"]),
  scheduledAt: instant,
  status: z.string(),
  error: nullableString,
  permalink: nullableString,
  publishedAt: instant.nullable(),
});
const requestedOutput = z.object({
  requestId: id,
  postId: id,
  state: z.literal("requested"),
  scheduledAt: instant,
});
const standingPermission = z.object({
  id,
  account_ids: z.array(id),
  expires_at: instant,
  max_count: z.number().int(),
  publish_now_account_ids: z.array(id),
  publish_now_max_count: z.number().int(),
});
const tileResult = z.discriminatedUnion("state", [
  z.object({ state: z.literal("planning"), message: z.string() }),
  z.object({
    state: z.literal("prepared"),
    plan: tilePlanSchema,
    quote: z.object({
      provider: z.literal("openai"),
      creditsPerImage: z.number(),
      rateId: z.string(),
    }),
    handoffId: z.string().regex(/^[a-f0-9]{64}$/),
    expiresAt: instant,
    handoffUrl: z.string(),
    note: z.string(),
  }),
]);

export const agentOperations = {
  search_short_form_trends: {
    path: "short-form-trends",
    method: "POST",
    scope: "research:trends",
    summary:
      "Search public organic short-form videos with the configured Virlo integration and explicit metered search consent.",
    input: agentVirloSearchInput,
    output: agentVirloSearchOutput,
    writes: true,
  },
  list_creator_collections: {
    path: "creator-collections",
    method: "GET",
    scope: "creators:read",
    summary:
      "List workspace creator collections. For creator search and outreach, open the workspace tools.",
    input: z
      .object({ limit: z.coerce.number().int().min(1).max(50).default(25) })
      .strict(),
    output: z.object({
      collections: z.array(
        z.object({
          id,
          name: z.string(),
          description: nullableString,
          updatedAt: instant.nullable(),
        }),
      ),
      truncated: z.boolean(),
      reviewPath: z.string(),
    }),
    writes: false,
  },
  list_social_research: {
    path: "research-reports",
    method: "GET",
    scope: "research:read",
    summary:
      "List saved research, status and evidence counts in this workspace.",
    input: researchListInput.extend({
      limit: z.coerce.number().int().min(1).max(30).default(10),
    }),
    output: researchListOutput,
    writes: false,
  },
  get_social_research_report: {
    path: "research-report",
    method: "GET",
    scope: "research:read",
    summary:
      "Read a saved social research report, public post evidence and available measurements.",
    input: researchGetInput,
    output: researchGetOutput,
    writes: false,
  },
  find_social_research_targets: {
    path: "research-targets",
    method: "POST",
    scope: "research:lookup",
    summary:
      "Find candidate public social profiles. Company search uses the configured provider after explicit metered lookup consent.",
    input: researchLookupInput,
    output: researchLookupOutput,
    writes: false,
  },
  start_social_research: {
    path: "research-runs",
    method: "POST",
    scope: "research:run",
    summary:
      "Start a workspace audit of up to three public social profiles under explicit metered consent and an idempotency key.",
    input: researchStartInput,
    output: researchStartOutput,
    writes: true,
  },
  find_organic_winners: {
    path: "organic-winners",
    method: "POST",
    scope: "winners:read",
    summary:
      "Rank measured organic posts by engagement, views or reach. Includes freshness, evidence and scan limits.",
    input: rankOrganicInput.innerType(),
    output: rankOrganicOutput,
    writes: false,
  },
  list_organic_winner_findings: {
    path: "organic-winner-findings",
    method: "GET",
    scope: "winners:read",
    summary:
      "Read saved, fresh organic performance findings and their source posts.",
    input: listWinnerFindingsInput.extend({
      limit: z.coerce.number().int().min(1).max(30).default(10),
    }),
    output: listWinnerFindingsOutput,
    writes: false,
  },
  list_organic_winner_shortlist: {
    path: "organic-winner-shortlist",
    method: "GET",
    scope: "winners:read",
    summary:
      "Read the workspace's saved organic shortlist and the evidence recorded at selection time.",
    input: listWinnerShortlistInput.extend({
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
    output: listWinnerShortlistOutput,
    writes: false,
  },
  list_workspace_capabilities: {
    path: "capabilities",
    method: "GET",
    scope: "channels:read",
    summary:
      "See the tools available under this connection, app handoffs and product limitations.",
    input: z.object({}).strict(),
    output: z.object({
      tools: z.array(
        z.object({ name: z.string(), scope: z.string(), summary: z.string() }),
      ),
      browserActions: z.array(
        z.object({ area: z.string(), path: z.string(), reason: z.string() }),
      ),
      unavailable: z.array(z.object({ area: z.string(), reason: z.string() })),
    }),
    writes: false,
  },
  list_publishing_calendar: {
    path: "publishing-calendar",
    method: "GET",
    scope: "schedule:read",
    summary:
      "Review the publishing calendar, including queued posts and destination outcomes.",
    input: z
      .object({
        from: instant.optional(),
        until: instant.optional(),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      })
      .strict(),
    output: z.object({
      from: instant,
      until: instant,
      truncated: z.boolean(),
      posts: z.array(
        z.object({
          id,
          caption: z.string(),
          status: z.string(),
          scheduledAt: instant.nullable(),
          publishedAt: instant.nullable(),
          destinations: z.array(
            z.object({
              accountId: id,
              platform: z.string(),
              status: z.string(),
            }),
          ),
        }),
      ),
    }),
    writes: false,
  },
  list_organic_content_plans: {
    path: "organic-plans",
    method: "GET",
    scope: "planning:read",
    summary: "List saved organic content plans and their draft counts.",
    input: z
      .object({ limit: z.coerce.number().int().min(1).max(25).default(15) })
      .strict(),
    output: z.object({
      plans: z.array(
        z.object({
          id,
          title: z.string(),
          timezone: z.string(),
          postCount: z.number().int(),
          updatedAt: instant,
        }),
      ),
      truncated: z.boolean(),
      unreadable: z.number().int(),
    }),
    writes: false,
  },
  get_organic_content_plan: {
    path: "organic-plan",
    method: "GET",
    scope: "planning:read",
    summary:
      "Read saved organic captions, channels, formats and calendar dates.",
    input: z
      .object({ id, limit: z.coerce.number().int().min(1).max(30).default(10) })
      .strict(),
    output: z.object({
      id,
      title: z.string(),
      timezone: z.string(),
      postCount: z.number().int(),
      posts: z.array(
        z.object({
          id,
          date: z.string().date(),
          platform: z.string(),
          format: z.string(),
          title: z.string(),
          caption: z.string(),
        }),
      ),
      truncated: z.boolean(),
      reviewPath: z.string(),
    }),
    writes: false,
  },
  list_connected_channels: {
    path: "channels",
    method: "GET",
    scope: "channels:read",
    summary:
      "List workspace channels without credentials. An empty list means no channels are connected.",
    input: z
      .object({
        cursor: id.optional(),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      })
      .strict(),
    output: z
      .object({
        channels: z.array(
          z
            .object({
              id,
              platform: z.string(),
              name: z.string().nullable(),
              handle: z.string().nullable(),
              status: z.string(),
              enabled: z.boolean(),
            })
            .strict(),
        ),
        nextCursor: id.nullable(),
      })
      .strict(),
    writes: false,
  },
  get_brand_summary: {
    path: "brand-summary",
    method: "GET",
    scope: "brand:read",
    summary:
      "Read the workspace name, website and available brand voice summary for draft planning.",
    input: z.object({}).strict(),
    output: z
      .object({
        name: z.string(),
        website: z.string().nullable(),
        voice: z.string().nullable(),
      })
      .strict(),
    writes: false,
  },
  create_written_draft: {
    path: "written-drafts",
    method: "POST",
    scope: "drafts:write",
    summary:
      "Save supplied LinkedIn copy as a reviewable draft. Does not generate copy, charge credits, or publish.",
    input: z.object({ caption: z.string().trim().min(1).max(3000) }).strict(),
    output: z.object({ postId: id, status: z.literal("draft") }).strict(),
    writes: true,
  },
  preview_linkedin_post: {
    path: "publication-previews",
    method: "POST",
    scope: "drafts:write",
    summary:
      "Prepare a LinkedIn preview from an existing draft and connected account.",
    input: z
      .object({
        postId: id,
        accountId: id,
        scheduledAt: z.string().datetime({ offset: true }).optional(),
      })
      .strict(),
    output: previewOutput,
    writes: true,
  },
  get_publication_status: {
    path: "publication-status",
    method: "GET",
    scope: "posts:read",
    summary: "Check the status of a publication preview for this connection.",
    input: z.object({ previewId: id }).strict(),
    output: previewOutput.extend({
      scheduledAt: instant.nullable(),
      post: z
        .object({
          id,
          status: z.string(),
          scheduledAt: instant.nullable(),
          publishedAt: instant.nullable(),
        })
        .nullable(),
      deliveries: z.array(delivery),
    }),
    writes: false,
  },
  list_linkedin_publishing_permissions: {
    path: "linkedin-publishing-permissions",
    method: "GET",
    scope: "posts:schedule",
    summary:
      "List active owner-approved text-only LinkedIn permissions for this OAuth connection.",
    input: z.object({}).strict(),
    output: z.object({ permissions: z.array(standingPermission) }),
    writes: false,
  },
  schedule_linkedin_post: {
    path: "schedule-linkedin",
    method: "POST",
    scope: "posts:schedule",
    summary:
      "Queue an unchanged text-only LinkedIn draft for the previewed time under a standing owner policy. Delivery remains pending.",
    input: z.object({ previewId: id, policyId: id }).strict(),
    output: requestedOutput,
    writes: true,
  },
  publish_linkedin_post_now: {
    path: "publish-linkedin-now",
    method: "POST",
    scope: "posts:publish",
    summary:
      "Queue an unchanged text-only LinkedIn draft for immediate delivery under an explicit Publish now policy. Delivery remains pending.",
    input: z.object({ previewId: id, policyId: id }).strict(),
    output: requestedOutput,
    writes: true,
  },
  prepare_social_tile: {
    path: "tile-preparations",
    method: "POST",
    scope: "content:prepare",
    summary:
      "Prepare one brand-aware tile and a current credit quote. Open the returned link to review and approve image generation.",
    input: z
      .object({
        brief: z.string().trim().min(1).max(2000),
        referenceIds: referenceIdsSchema.optional(),
      })
      .strict(),
    output: tileResult,
    writes: true,
  },
  list_linkedin_carousels: {
    path: "carousels",
    method: "GET",
    scope: "carousels:read",
    summary:
      "List saved LinkedIn carousels and links to review their slides and download a PDF.",
    input: z.object({}).strict(),
    output: z.object({
      carousels: z.array(
        z.object({
          id,
          title: z.string(),
          updatedAt: instant,
          complete: z.boolean(),
          unreadable: z.boolean(),
          handoffUrl: z.string(),
        }),
      ),
      note: z.string(),
    }),
    writes: false,
  },
  get_linkedin_carousel: {
    path: "carousel",
    method: "GET",
    scope: "carousels:read",
    summary:
      "Inspect a saved carousel's slide copy and find its review and PDF download page.",
    input: z.object({ id }).strict(),
    output: z.object({
      id,
      title: z.string(),
      complete: z.boolean(),
      slides: z.array(
        z.object({
          id: z.string(),
          headline: z.string(),
          supporting: z.string(),
        }),
      ),
      handoffUrl: z.string(),
      note: z.string(),
    }),
    writes: false,
  },
  get_video_job_status: {
    path: "video-status",
    method: "GET",
    scope: "videos:read",
    summary:
      "Check an existing workspace video job and open its Production view. This operation does not start generation.",
    input: z.object({ jobId: id }).strict(),
    output: z.object({
      jobId: id,
      status: z.enum([
        "queued",
        "preparing",
        "rendering",
        "completed",
        "failed",
        "unknown",
      ]),
      progress: z.number().min(0).max(100).nullable(),
      createdAt: instant,
      updatedAt: instant,
      handoffUrl: z.string(),
      note: z.string(),
    }),
    writes: false,
  },
} as const satisfies Record<
  string,
  {
    path: string;
    method: "GET" | "POST";
    scope: AgentScope;
    summary: string;
    input: z.AnyZodObject;
    output: z.ZodTypeAny;
    writes: boolean;
  }
>;

export type AgentOperationName = keyof typeof agentOperations;
export const agentOperationNames = Object.keys(
  agentOperations,
) as AgentOperationName[];

export function isMcpOnlyOperation(name: AgentOperationName) {
  return (
    agentOperations[name].scope === "posts:schedule" ||
    agentOperations[name].scope === "posts:publish"
  );
}
