/* eslint-disable @typescript-eslint/no-explicit-any -- Supabase service adapters and test doubles use dynamic rows. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { getAdminClient } from "./supabase-admin.server";
import { tilePlanSchema } from "./social-tiles";
import { referenceIdsSchema } from "./social-design";

export class AgentContentError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
  ) {
    super(message);
    this.name = "AgentContentError";
  }
}
type ContentRequest = {
  action:
    "prepare_tile" | "list_carousels" | "get_carousel" | "get_video_status";
  workspaceId: string;
  userId: string;
  input: unknown;
  idempotencyKey?: string;
};
type Dependencies = {
  db: any;
  rate: (db: any) => Promise<{ credits: number; version: string }>;
  plan: (
    userId: string,
    workspaceId: string,
    brief: string,
    references: string[],
  ) => Promise<unknown>;
  run: (
    db: any,
    workspace: string,
    kind: string,
    key: unknown,
    task: () => Promise<any>,
  ) => Promise<{ result: any; busy: boolean }>;
  list: (userId: string, workspaceId: string) => Promise<any[]>;
  get: (userId: string, workspaceId: string, id: string) => Promise<any>;
  imageConnected: () => boolean;
};
const identity = z.string().uuid();
const tileInput = z
  .object({
    brief: z.string().trim().min(1).max(2000),
    referenceIds: referenceIdsSchema.optional(),
  })
  .strict();
const emptyInput = z.object({}).strict();
const carouselInput = z.object({ id: identity }).strict();
const videoInput = z.object({ jobId: identity }).strict();
async function defaults(): Promise<Dependencies> {
  const [
    { getContentCreditRate },
    { planSocialTilesForUser },
    { runBrandOperation },
    carousel,
  ] = await Promise.all([
    import("./content-credits.server"),
    import("./social-tiles.functions"),
    import("./brand-assets.functions"),
    import("./linkedin-carousel.server"),
  ]);
  return {
    db: getAdminClient(),
    rate: (db) => getContentCreditRate(db, "openai-image", 0),
    plan: (user, workspace, brief, refs) =>
      planSocialTilesForUser(user, workspace, brief, [], 1, refs),
    run: (db, workspace, kind, key, task) =>
      runBrandOperation(db, workspace, kind, key, task),
    list: carousel.listCarouselsForUser,
    get: (user, workspace, id) =>
      carousel.getCarouselForUser(user, { workspace_id: workspace, id }),
    imageConnected: () => !!process.env["OPENAI_API_KEY"]?.trim(),
  };
}
function signature(key: unknown) {
  return createHash("sha256").update(JSON.stringify(key)).digest("hex");
}
const parse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AgentContentError(
      "Invalid content request.",
      400,
      "invalid_request",
    );
  return result.data;
};
/** The user ID and workspace must come from the authenticated connection, not request data. */
export async function agentContentAction(
  request: ContentRequest,
  injected?: Dependencies,
): Promise<Record<string, unknown>> {
  parse(identity, request.workspaceId);
  parse(identity, request.userId);
  const deps = injected ?? (await defaults());
  const access = await deps.db.rpc("can_access_workspace", {
    _user_id: request.userId,
    _workspace_id: request.workspaceId,
  });
  if (access.error)
    throw new AgentContentError(
      "Could not verify workspace access.",
      503,
      "access_unavailable",
    );
  if (!access.data)
    throw new AgentContentError(
      "Workspace access denied.",
      403,
      "access_denied",
    );
  if (request.action === "get_video_status") {
    const { jobId } = parse(videoInput, request.input);
    const { data: job, error } = await deps.db
      .from("render_jobs")
      .select("id,variant_id,status,progress,created_at,updated_at")
      .eq("id", jobId)
      .eq("workspace_id", request.workspaceId)
      .maybeSingle();
    if (error)
      throw new AgentContentError(
        "Could not retrieve video status.",
        503,
        "video_status_unavailable",
      );
    if (!job)
      throw new AgentContentError("Video job not found.", 404, "not_found");
    const statuses: Record<string, string> = {
      queued: "queued",
      preparing: "preparing",
      rendering: "rendering",
      done: "completed",
      failed: "failed",
    };
    const status = statuses[job.status] ?? "unknown";
    const progress =
      typeof job.progress === "number" && Number.isFinite(job.progress)
        ? Math.max(0, Math.min(100, job.progress))
        : null;
    return {
      jobId: job.id,
      status,
      progress,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
      handoffUrl: `/app/create?stage=production&item=video:${encodeURIComponent(job.variant_id)}`,
      note:
        status === "completed"
          ? "Open AutoSocials to review the video before use."
          : status === "failed"
            ? "Open AutoSocials to review this job."
            : "Video production and approvals remain in AutoSocials.",
    };
  }
  if (request.action === "list_carousels") {
    parse(emptyInput, request.input);
    const rows = await deps.list(request.userId, request.workspaceId);
    return {
      carousels: rows.map(
        ({ id, title, updated_at, complete, unreadable }: any) => ({
          id,
          title,
          updatedAt: updated_at,
          complete,
          unreadable,
          handoffUrl: `/app/create?carousel=${encodeURIComponent(id)}`,
        }),
      ),
      note: "Open a completed carousel in AutoSocials to review and download its PDF. LinkedIn document posts require manual publishing.",
    };
  }
  if (request.action === "get_carousel") {
    const { id } = parse(carouselInput, request.input);
    const deck = await deps.get(request.userId, request.workspaceId, id);
    const complete = deck.plan.slides.every((slide: any) =>
      deck.slides.some((image: any) => image.id === slide.id),
    );
    return {
      id: deck.id,
      title: deck.plan.title,
      complete,
      slides: deck.plan.slides.map(
        ({ id: slideId, headline, supporting }: any) => ({
          id: slideId,
          headline,
          supporting,
        }),
      ),
      handoffUrl: `/app/create?carousel=${encodeURIComponent(id)}`,
      note: complete
        ? "Open the carousel to review and download its PDF; publish it manually on LinkedIn."
        : "Finish the slides in AutoSocials before downloading the PDF.",
    };
  }
  if (request.action !== "prepare_tile")
    throw new AgentContentError(
      "Unsupported content action.",
      400,
      "invalid_request",
    );
  const input = parse(tileInput, request.input);
  if (!request.idempotencyKey || request.idempotencyKey.length > 128)
    throw new AgentContentError(
      "An idempotency key is required.",
      400,
      "invalid_request",
    );
  if (!deps.imageConnected())
    throw new AgentContentError(
      "AI imagery is not connected.",
      503,
      "image_unavailable",
    );
  let rate: { credits: number; version: string };
  try {
    rate = await deps.rate(deps.db);
  } catch {
    throw new AgentContentError(
      "The image credit price is unavailable.",
      503,
      "quote_unavailable",
    );
  }
  const refs = input.referenceIds ?? [];
  const operationKey = { userId: request.userId, key: request.idempotencyKey };
  const work = await deps.run(
    deps.db,
    request.workspaceId,
    "agent-social-tile-plan",
    operationKey,
    async () => ({
      createdAt: new Date().toISOString(),
      brief: input.brief,
      referenceIds: refs,
      plan: tilePlanSchema.parse(
        await deps.plan(request.userId, request.workspaceId, input.brief, refs),
      ),
    }),
  );
  if (work.busy || !work.result)
    return {
      state: "planning",
      message:
        "This plan is still being prepared. Check again with the same request key.",
    };
  if (
    work.result.brief !== input.brief ||
    JSON.stringify(work.result.referenceIds) !== JSON.stringify(refs)
  )
    throw new AgentContentError(
      "This idempotency key was used for another brief.",
      409,
      "idempotency_conflict",
    );
  const plan = tilePlanSchema.parse(work.result.plan);
  const expiresAtMs = Date.parse(work.result.createdAt) + 24 * 60 * 60 * 1000;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now())
    throw new AgentContentError(
      "This handoff has expired. Prepare a new plan with a new request key.",
      410,
      "handoff_expired",
    );
  const handoffId = signature(operationKey);
  return {
    state: "prepared",
    plan,
    quote: {
      provider: "openai",
      creditsPerImage: rate.credits,
      rateId: rate.version,
    },
    handoffId,
    expiresAt: new Date(expiresAtMs).toISOString(),
    handoffUrl: `/app/create?wizard=tiles&agentTile=${handoffId}`,
    note: "The narrative is prepared. Image generation has not started; a person must review the plan and approve the current image price in AutoSocials.",
  };
}

/** A browser session must authenticate its user before invoking this function. */
export async function readAgentTileHandoff(
  userId: string,
  workspaceId: string,
  handoffId: string,
  db: any = getAdminClient(),
) {
  parse(identity, userId);
  parse(identity, workspaceId);
  if (!/^[a-f0-9]{64}$/.test(handoffId))
    throw new AgentContentError("Invalid handoff.", 400, "invalid_request");
  const access = await db.rpc("can_access_workspace", {
    _user_id: userId,
    _workspace_id: workspaceId,
  });
  if (access.error || !access.data)
    throw new AgentContentError(
      "Workspace access denied.",
      403,
      "access_denied",
    );
  const { data, error } = await db
    .from("brand_work_operations")
    .select("result,status")
    .eq("workspace_id", workspaceId)
    .eq("kind", "agent-social-tile-plan")
    .eq("signature", handoffId)
    .maybeSingle();
  if (error)
    throw new AgentContentError(
      "Could not load the handoff.",
      503,
      "handoff_unavailable",
    );
  if (!data || data.status !== "complete")
    throw new AgentContentError("Handoff not found.", 404, "not_found");
  const result = data.result;
  if (
    !result ||
    !Number.isFinite(Date.parse(result.createdAt)) ||
    Date.parse(result.createdAt) + 86400000 <= Date.now()
  )
    throw new AgentContentError(
      "This handoff has expired.",
      410,
      "handoff_expired",
    );
  const brief = z.string().trim().min(1).max(2000).parse(result.brief);
  const referenceIds = referenceIdsSchema.parse(result.referenceIds);
  return { brief, referenceIds, plan: tilePlanSchema.parse(result.plan) };
}
