import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  linkedUsage,
  parsePipelineFormat,
  type PipelineFormat,
  type PipelineUsage,
  type LinkedPost,
} from "@/features/create/pipeline-usage";
import { fetchAll } from "./fetch-all";

type Row = {
  kind: string;
  signature: string;
  status: string;
  result: unknown;
  updated_at: string;
};
type Result = { kind?: string; id?: string; status?: string };
type Summary = {
  kind:
    | "campaign"
    | "campaign-production"
    | "personal"
    | "video-batch"
    | "video-narrative"
    | "tile-canvas";
  signature: string;
  title: string;
  updated_at: string;
  total: number;
  done: number;
  terminal: boolean;
  complete: boolean;
  offset?: number;
  formats?: PipelineFormat[];
  usage?: PipelineUsage;
};

/** Only display data leaves this function; operation payloads remain server-side. */
export const getPipelineRecords = createServerFn({ method: "POST" })
  .inputValidator((value: unknown) =>
    z.object({ workspace_id: z.string().uuid() }).strict().parse(value),
  )
  .handler(async ({ data }): Promise<Summary[]> => {
    const { requireUser, getAdminClient } =
      await import("./supabase-admin.server");
    const { contentCampaignBatchId } =
      await import("./content-campaign-batch.server");
    const user = await requireUser();
    const admin = getAdminClient();
    const access = await admin.rpc("can_access_workspace", {
      _user_id: user.id,
      _workspace_id: data.workspace_id,
    });
    if (access.error || !access.data)
      throw new Error("Workspace access required.");
    const rows = await fetchAll<Row>((from, to) =>
      (admin as unknown as SupabaseClient)
        .from("brand_work_operations")
        .select("kind,signature,status,result,updated_at")
        .eq("workspace_id", data.workspace_id)
        .in("kind", [
          "personal-idea-batch",
          "personal-idea-production",
          "content-campaign",
        ])
        .order("signature")
        .range(from, to),
    );
    const productions = new Map(
      rows
        .filter(
          (row) =>
            row.kind === "personal-idea-production" &&
            (row.result as { stage?: string } | null)?.stage !==
              "quote_abandoned",
        )
        .map((row) => [row.signature, row]),
    );
    const batches = new Map(
      rows
        .filter(
          (row) =>
            row.kind === "personal-idea-batch" && row.status === "complete",
        )
        .map((row) => [row.signature, row]),
    );
    const campaigns = rows.filter(
      (row) => row.kind === "content-campaign" && row.status === "complete",
    );
    const posts = await fetchAll<LinkedPost>((from, to) =>
      admin
        .from("posts")
        .select("id,status,created_via,variant_id,post_targets(status)")
        .eq("workspace_id", data.workspace_id)
        .order("id")
        .range(from, to),
    );
    const videoRows = await fetchAll<{
      id: string;
      batch_id: string;
      source_narrative_key: string | null;
      render_jobs: Array<{ status: string; created_at: string }> | null;
    }>(async (from, to) => {
      const { data: variants, error } = await admin
        .from("creative_variants")
        .select(
          "id,batch_id,source_narrative_key:production_plan->>source_narrative_key,render_jobs!render_jobs_variant_id_fkey(status,created_at)",
        )
        .eq("workspace_id", data.workspace_id)
        .order("id")
        .range(from, to);
      return {
        data: variants as unknown as Array<{
          id: string;
          batch_id: string;
          source_narrative_key: string | null;
          render_jobs: Array<{ status: string; created_at: string }> | null;
        }> | null,
        error,
      };
    });
    const videoOutputs = (rows: typeof videoRows) =>
      rows.map((variant) => ({
        kind: "video",
        id: variant.id,
        status: [...(variant.render_jobs ?? [])].sort((a, b) =>
          b.created_at.localeCompare(a.created_at),
        )[0]?.status,
      }));
    const videoGroups = new Map<string, typeof videoRows>();
    const narrativeGroups = new Map<string, typeof videoRows>();
    for (const variant of videoRows) {
      videoGroups.set(variant.batch_id, [
        ...(videoGroups.get(variant.batch_id) ?? []),
        variant,
      ]);
      if (variant.source_narrative_key)
        narrativeGroups.set(variant.source_narrative_key, [
          ...(narrativeGroups.get(variant.source_narrative_key) ?? []),
          variant,
        ]);
    }
    const linked = new Set<string>();
    const summaries: Summary[] = [];
    const { createHash } = await import("node:crypto");
    const { canvasTileRunKey, tileRequestUuid } = await import("./social-tile-run");
    const { parseBlocks } = await import("./sam.blocks");
    const { findSocialTilePlan } = await import("@/workspace/live-view/social-tile-plan");
    const canvases = await fetchAll<{ id: string; title: string; version: number; blocks: unknown }>((from, to) =>
      admin.from("canvases").select("id,title,version,blocks").eq("workspace_id", data.workspace_id)
        .eq("module", "create").order("id").range(from, to),
    );
    const tilePlans = canvases.flatMap(canvas => {
      const plan = findSocialTilePlan(parseBlocks(canvas.blocks), canvas.title);
      if (!plan) return [];
      const key = canvasTileRunKey(data.workspace_id, canvas.id, canvas.version, plan.index);
      const signatures = plan.plan.tiles.map((_, index) => {
        const requestId = tileRequestUuid(Uint8Array.from(createHash("sha256").update(`${key}:${index}`).digest()));
        return createHash("sha256").update(JSON.stringify({ request_id: requestId })).digest("hex");
      });
      return [{ canvas, signatures }];
    });
    const tileOperations = new Map<string, Pick<Row, "signature" | "status" | "updated_at">>();
    const tileSignatures = tilePlans.flatMap(plan => plan.signatures);
    for (let offset = 0; offset < tileSignatures.length; offset += 80) {
      const { data: matches, error } = await (admin as unknown as SupabaseClient).from("brand_work_operations").select("signature,status,updated_at")
        .eq("workspace_id", data.workspace_id).eq("kind", "postcard-social-tile")
        .in("signature", tileSignatures.slice(offset, offset + 80));
      if (error) throw new Error("Could not load social tile production status.");
      for (const item of matches ?? []) tileOperations.set(item.signature, item);
    }
    for (const { canvas, signatures } of tilePlans) {
      const matches = signatures.flatMap(signature => tileOperations.get(signature) ?? []);
      if (!matches.length) continue;
      const done = matches.filter(operation => operation.status === "complete").length;
      summaries.push({
        kind: "tile-canvas",
        signature: canvas.id,
        title: canvas.title,
        updated_at: matches.map(operation => operation.updated_at).sort().at(-1)!,
        total: signatures.length,
        done,
        terminal: matches.every(operation => operation.status !== "running"),
        complete: done === signatures.length,
        formats: ["tiles"],
      });
    }
    const progress = async (id: string, count: number) => {
      const row = productions.get(id);
      const raw = row?.result as { results?: Result[] } | null;
      let results = Array.isArray(raw?.results) ? raw.results : [];
      // Re-read current tile and video state, without resuming or starting any work.
      if (
        row &&
        results.some(
          (result) =>
            ![
              "ready",
              "done",
              "failed",
              "needs_attention",
              "reconciliation_required",
              "limit_reached",
            ].includes(result.status ?? ""),
        )
      ) {
        const { checkPostcardTileStatus } =
          await import("./postcard-tiles.server");
        results = await Promise.all(
          results.map(async (result) => {
            if (!result.id) return result;
            if (result.kind === "tile") {
              try {
                const status = await checkPostcardTileStatus(
                  user.id,
                  data.workspace_id,
                  result.id,
                  false,
                );
                return { ...result, status: status.status };
              } catch {
                return result;
              }
            }
            if (result.kind === "video") {
              const job = await admin
                .from("render_jobs")
                .select("status")
                .eq("workspace_id", data.workspace_id)
                .eq("variant_id", result.id)
                .order("created_at", { ascending: false })
                .limit(1)
                .maybeSingle();
              return job.error || !job.data
                ? result
                : { ...result, status: job.data.status };
            }
            return result;
          }),
        );
      }
      const total = Math.max(count, results.length);
      const done = results.filter(
        (result) => result.status === "ready" || result.status === "done",
      ).length;
      const terminal =
        total > 0 &&
        results.length >= total &&
        results.every((result) =>
          [
            "ready",
            "done",
            "failed",
            "needs_attention",
            "reconciliation_required",
            "limit_reached",
          ].includes(result.status ?? ""),
        );
      return {
        total,
        done,
        terminal,
        complete: terminal && done === total,
        outputs: results,
      };
    };
    for (const campaign of campaigns) {
      const value = campaign.result as {
        title?: unknown;
        revision?: unknown;
        posts?: unknown;
      } | null;
      const title =
        typeof value?.title === "string" ? value.title : "Content campaign";
      const campaignPosts = Array.isArray(value?.posts)
        ? (value.posts as Array<{ format?: unknown }>)
        : [];
      const formats = [
        ...new Set(
          campaignPosts
            .map((post) => parsePipelineFormat(post.format))
            .filter((format): format is PipelineFormat => !!format),
        ),
      ];
      const campaignSummary: Summary = {
        kind: "campaign",
        signature: campaign.signature,
        title,
        updated_at: campaign.updated_at,
        total: 0,
        done: 0,
        terminal: true,
        complete: false,
        formats,
        usage: linkedUsage([], posts, campaignPosts.length),
      };
      summaries.push(campaignSummary);
      const campaignOutputs: Result[] = [];
      if (typeof value?.revision !== "string" || !Array.isArray(value.posts))
        continue;
      for (let offset = 0; offset < value.posts.length; offset += 20) {
        const id = contentCampaignBatchId(
          data.workspace_id,
          campaign.signature,
          value.revision,
          offset,
        );
        const row = productions.get(id);
        if (batches.has(id)) linked.add(id);
        if (!row) continue;
        const batch = batches.get(id)?.result as
          { items?: unknown[] } | undefined;
        const { outputs, ...state } = await progress(
          id,
          batch?.items?.length ?? 0,
        );
        campaignOutputs.push(...outputs);
        summaries.push({
          kind: "campaign-production",
          signature: campaign.signature,
          title,
          updated_at: row.updated_at,
          offset,
          ...state,
          formats,
          usage: linkedUsage(outputs, posts, state.total),
        });
      }
      campaignSummary.usage = linkedUsage(
        campaignOutputs,
        posts,
        campaignPosts.length,
      );
    }
    for (const [id, batch] of batches) {
      if (linked.has(id)) continue;
      const value = batch.result as {
        items?: Array<{ title?: unknown; format?: unknown }>;
      } | null;
      if (!Array.isArray(value?.items) || !value.items.length) continue;
      const row = productions.get(id);
      const formats = [
        ...new Set(
          value.items
            .map((item) => parsePipelineFormat(item.format))
            .filter((format): format is PipelineFormat => !!format),
        ),
      ];
      const progressResult = row
        ? await progress(id, value.items.length)
        : null;
      const { outputs, ...state } = progressResult ?? {
        total: value.items.length,
        done: 0,
        terminal: true,
        complete: false,
        outputs: [],
      };
      summaries.push({
        kind: "personal",
        signature: id,
        title:
          typeof value.items[0]?.title === "string"
            ? value.items[0].title
            : "Content plan",
        updated_at: row?.updated_at ?? batch.updated_at,
        ...state,
        formats,
        usage: linkedUsage(outputs, posts, value.items.length),
        ...(row ? {} : { offset: -1 }),
      });
    }
    for (const [id, variants] of videoGroups) {
      const outputs = videoOutputs(variants);
      const done = outputs.filter((output) => output.status === "done").length;
      summaries.push({
        kind: "video-batch",
        signature: id,
        title: "",
        updated_at: "",
        total: variants.length,
        done,
        terminal: outputs.every(
          (output) => output.status === "done" || output.status === "failed",
        ),
        complete: done === variants.length,
        formats: ["video"],
        usage: linkedUsage(outputs, posts, variants.length),
      });
    }
    for (const [id, variants] of narrativeGroups)
      summaries.push({
        kind: "video-narrative",
        signature: id,
        title: "",
        updated_at: "",
        total: variants.length,
        done: 0,
        terminal: true,
        complete: false,
        formats: ["video"],
        usage: linkedUsage(videoOutputs(variants), posts, variants.length),
      });
    return summaries;
  });
