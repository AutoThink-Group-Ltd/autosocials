import {
  parsePipelineFormat,
  type PipelineFormat,
  type PipelineUsage,
} from "./pipeline-usage";
import { isLinkedInCarouselIdea } from "@/lib/linkedin-carousel";
import { parseBlocks } from "@/lib/sam.blocks";
import { findSocialTilePlan } from "@/workspace/live-view/social-tile-plan";

export type PipelineCanvas = {
  id: string;
  title: string;
  blocks: unknown;
  version: number;
  updated_at: string;
  archived?: boolean;
};
export type PipelineBatch = {
  id: string;
  title: string;
  goal: string;
  stage: string;
  narratives: unknown;
  updated_at: string;
  created_at: string;
};
export type PipelineOperation = {
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
export type PipelineEntry = {
  id: string;
  title: string;
  subtitle: string;
  updated: string;
  stage: "plans" | "production";
  kind: "canvas" | "batch" | "personal" | "narrative" | "campaign" | "carousel";
  sourceId: string;
  narrativeId?: string;
  hidden?: boolean;
  active?: boolean;
  formats?: PipelineFormat[];
  usage?: PipelineUsage;
};

export function pipelineEntries(
  canvases: PipelineCanvas[],
  batches: PipelineBatch[],
  operations: PipelineOperation[],
  canvasThreads: Array<{
    canvas_id: string | null;
    thread_id: string | null;
  }> = [],
): PipelineEntry[] {
  const entries: PipelineEntry[] = [];
  for (const canvas of canvases) {
    const blocks = parseBlocks(canvas.blocks);
    if (!blocks.length) continue;
    if (
      canvas.archived &&
      !blocks.some((block) =>
        [
          "variants",
          "content_campaign",
          "brief",
          "direct_video",
          "storyboard",
          "social_tiles",
        ].includes(block.type),
      )
    )
      continue;
    const duplicateCampaign =
      blocks.length === 1 &&
      blocks[0]?.type === "content_campaign" &&
      operations.some(
        (op) =>
          op.kind === "campaign" &&
          op.signature ===
            (blocks[0]?.type === "content_campaign"
              ? blocks[0].campaignId
              : ""),
      );
    const formats = new Set<PipelineFormat>();
    const tilePlan = findSocialTilePlan(blocks, canvas.title);
    if (tilePlan) formats.add("tiles");
    const tileBuild = operations.find(op => op.kind === "tile-canvas" && op.signature === canvas.id);
    for (const block of blocks) {
      if (block.type === "social_tiles") formats.add("tiles");
      if (block.type === "direct_video" || block.type === "storyboard")
        formats.add("video");
      if (block.type === "variants")
        for (const idea of block.items) {
          const format = isLinkedInCarouselIdea(block.title, idea)
            ? "carousel"
            : parsePipelineFormat(idea.format);
          if (format) formats.add(format);
        }
    }
    entries.push({
      formats: [...formats],
      id: `canvas:${canvas.id}`,
      sourceId: canvas.id,
      title: canvas.title || "Untitled plan",
      subtitle: tilePlan ? `${tilePlan.plan.tiles.length} social tiles` : "Saved plan",
      updated: canvas.updated_at,
      stage: "plans",
      kind: "canvas",
      hidden: duplicateCampaign || !!tileBuild,
    });
    if (tileBuild && !tileBuild.complete) entries.push({
      id: `canvas:${canvas.id}`,
      sourceId: canvas.id,
      title: canvas.title,
      subtitle: `${tileBuild.done} of ${tileBuild.total} designs ready`,
      updated: tileBuild.updated_at,
      stage: "production",
      kind: "canvas",
      active: !tileBuild.terminal,
      formats: ["tiles"],
    });
  }
  for (const batch of batches) {
    if (batch.stage === "briefs" || batch.stage === "producing") {
      const record = operations.find(
        (op) => op.kind === "video-batch" && op.signature === batch.id,
      );
      entries.push({
        formats: ["video"],
        ...(record?.usage ? { usage: record.usage } : {}),
        id: `batch:${batch.id}`,
        sourceId: batch.id,
        title: batch.title || "Untitled content",
        subtitle:
          batch.stage === "briefs" ? "Unfinished brief" : "Video production",
        updated: batch.updated_at,
        stage: batch.stage === "briefs" ? "plans" : "production",
        kind: "batch",
        hidden: batch.stage === "producing" && record?.complete === true,
        active: batch.stage === "producing" && !record?.terminal,
        ...(batch.stage === "producing" && record
          ? {
              subtitle: `${record.done}/${record.total} ready${record.terminal && !record.complete ? " · Needs attention" : ""}`,
            }
          : {}),
      });
    }
    if (!Array.isArray(batch.narratives)) continue;
    for (const raw of batch.narratives) {
      if (!raw || typeof raw !== "object") continue;
      const n = raw as Record<string, unknown>;
      if (
        typeof n["id"] !== "string" ||
        typeof n["title"] !== "string" ||
        n["origin"] ||
        n["libraryStatus"] === "binned" ||
        n["libraryStatus"] === "rejected" ||
        (typeof n["why"] === "string" &&
          n["why"].startsWith("Manual Models request."))
      )
        continue;
      const thread = batch.goal?.startsWith("sam-thread:")
        ? batch.goal.slice("sam-thread:".length)
        : null;
      const represented =
        !!thread &&
        canvasThreads.some(
          (link) =>
            link.thread_id === thread &&
            canvases.some((canvas) => {
              if (canvas.id !== link.canvas_id || !Array.isArray(canvas.blocks))
                return false;
              if (findSocialTilePlan(parseBlocks(canvas.blocks), canvas.title)?.plan.tiles.some(tile => tile.headline.replace(/\s+/g, " ").trim() === n["title"])) return true;
              return canvas.blocks.some((block: unknown) => {
                if (!block || typeof block !== "object") return false;
                const items = (block as { items?: unknown }).items;
                return (
                  Array.isArray(items) &&
                  items.some(
                    (item) =>
                      item &&
                      typeof item === "object" &&
                      ((item as { narrative_id?: unknown }).narrative_id ===
                        n["id"] ||
                        (item as { narrative_key?: unknown }).narrative_key ===
                          `${batch.id}:${n["id"]}`),
                  )
                );
              });
            }),
        );
      if (represented) continue;
      const record = operations.find(
        (op) =>
          op.kind === "video-narrative" &&
          op.signature === `${batch.id}:${n["id"]}`,
      );
      const format =
        parsePipelineFormat(n["format"]) ?? parsePipelineFormat(n["type"]);
      entries.push({
        formats: format ? [format] : (record?.formats ?? []),
        ...(record?.usage ? { usage: record.usage } : {}),
        id: `narrative:${batch.id}:${n["id"]}`,
        sourceId: batch.id,
        narrativeId: n["id"],
        title: n["title"],
        subtitle: "Narrative",
        updated:
          typeof n["createdAt"] === "string"
            ? n["createdAt"]
            : batch.created_at,
        stage: "plans",
        kind: "narrative",
      });
    }
  }
  for (const op of operations) {
    if (op.kind === "campaign") {
      entries.push({
        ...(op.formats ? { formats: op.formats } : {}),
        ...(op.usage ? { usage: op.usage } : {}),
        id: `campaign:${op.signature}`,
        sourceId: op.signature,
        title: op.title,
        subtitle: "Content campaign",
        updated: op.updated_at,
        stage: "plans",
        kind: "campaign",
      });
    } else if (op.kind === "campaign-production") {
      entries.push({
        ...(op.formats ? { formats: op.formats } : {}),
        ...(op.usage ? { usage: op.usage } : {}),
        id: `campaign-production:${op.signature}:${op.offset ?? 0}`,
        sourceId: op.signature,
        title: op.title,
        subtitle: `${op.done}/${op.total} ready${op.terminal && !op.complete ? " · Needs attention" : ""}`,
        updated: op.updated_at,
        stage: "production",
        kind: "campaign",
        hidden: op.complete,
        active: !op.terminal,
      });
    } else if (op.kind === "personal") {
      const submitted = op.offset !== -1;
      const common = {
        sourceId: op.signature,
        title: op.title,
        updated: op.updated_at,
        kind: "personal" as const,
        ...(op.formats ? { formats: op.formats } : {}),
        ...(op.usage ? { usage: op.usage } : {}),
      };
      entries.push({
        ...common,
        id: `personal:plan:${op.signature}`,
        stage: "plans",
        subtitle: `${op.total} selected idea${op.total === 1 ? "" : "s"}`,
      });
      if (submitted)
        entries.push({
          ...common,
          id: `personal:${op.signature}`,
          stage: "production",
          subtitle: `${op.done}/${op.total} ready${op.terminal && !op.complete ? " · Needs attention" : ""}`,
          hidden: op.complete,
          active: !op.terminal,
        });
      else
        entries.push({
          ...common,
          id: `personal:${op.signature}`,
          stage: "plans",
          subtitle: `${op.total} selected idea${op.total === 1 ? "" : "s"}`,
          hidden: true,
        });
    }
  }
  return entries.sort(
    (a, b) => b.updated.localeCompare(a.updated) || a.id.localeCompare(b.id),
  );
}

export function selectedNarrativeIdeas(
  batches: PipelineBatch[],
  keys: string[],
  format: "saved" | "video" | "tiles" | "written" = "saved",
) {
  if (!keys.length || keys.length > 20)
    throw new Error("Select between 1 and 20 narratives.");
  return keys.map((key) => {
    const split = key.indexOf(":");
    const batch = batches.find((b) => b.id === key.slice(0, split));
    const narrative = Array.isArray(batch?.narratives)
      ? batch.narratives.find(
          (value: { id?: string }) => value?.id === key.slice(split + 1),
        )
      : null;
    if (
      !narrative ||
      narrative.libraryStatus === "binned" ||
      narrative.libraryStatus === "rejected" ||
      !narrative.title
    )
      throw new Error(
        "A selected narrative is no longer available. Refresh and try again.",
      );
    if (
      format === "saved" &&
      /carousel/i.test(`${narrative.format ?? ""} ${narrative.type ?? ""}`)
    )
      throw new Error(
        "Open the LinkedIn carousel plan to review and build its slides.",
      );
    return {
      title: String(narrative.title).trim().slice(0, 100),
      angle: String(narrative.message || narrative.why || narrative.title)
        .trim()
        .slice(0, 240),
      format: format === "saved" ? narrativeFormat(narrative) : format,
    };
  });
}

export function narrativeFormat(narrative: {
  format?: unknown;
  type?: unknown;
}): "video" | "tiles" | "written" {
  const value =
    `${typeof narrative.format === "string" ? narrative.format : ""} ${typeof narrative.type === "string" ? narrative.type : ""}`.toLowerCase();
  if (/written|text|article/.test(value)) return "written";
  if (/tile|image|graphic/.test(value)) return "tiles";
  return "video";
}
