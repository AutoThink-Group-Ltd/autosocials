export const pipelineStages = [
  "plans",
  "production",
  "ready",
  "scheduled",
  "published",
] as const;
export const pipelineFormats = [
  "video",
  "tiles",
  "written",
  "carousel",
] as const;
export type PipelineStage = (typeof pipelineStages)[number];
export type PipelineFormat = (typeof pipelineFormats)[number];
export type CreateSearch = {
  stage?: PipelineStage;
  format?: PipelineFormat;
  item?: string;
  start?: "video" | "tiles";
  wizard?: "video" | "tiles" | "written";
  batch?: string;
  carousel?: string;
  agentTile?: string;
  campaignPost?: string;
  ideaBatch?: string;
  production?: string;
  group?: number;
};

const uuid = (s: unknown): s is string =>
  typeof s === "string" &&
  /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(s);

export function createSearch(input: Record<string, unknown>): CreateSearch {
  const {
    stage,
    format,
    item,
    start,
    wizard,
    batch,
    carousel,
    agentTile,
    campaignPost,
    ideaBatch,
    production,
    group,
  } = input;
  const result: CreateSearch = {};
  const carouselItem = typeof item === "string" && item.startsWith("carousel:") ? item.slice("carousel:".length) : undefined;
  if (pipelineStages.some((s) => s === stage))
    result.stage = stage as PipelineStage;
  if (pipelineFormats.some((f) => f === format))
    result.format = format as PipelineFormat;
  if (typeof item === "string" && /^[\w:-]{1,240}$/.test(item))
    result.item = item;
  if (uuid(production)) {
    result.production = production;
    result.group = [0, 20, 40, 60, 80].includes(Number(group))
      ? Number(group)
      : 0;
  } else if (uuid(ideaBatch)) result.ideaBatch = ideaBatch;
  else if (carousel === "new" || uuid(carousel)) {
    result.carousel = carousel;
    if (uuid(campaignPost)) result.campaignPost = campaignPost;
  } else if (start === "video" || start === "tiles") result.start = start;
  else if (wizard === "video" || wizard === "tiles" || wizard === "written") {
    result.wizard = wizard;
    if (
      wizard === "tiles" &&
      typeof agentTile === "string" &&
      /^[a-f0-9]{64}$/.test(agentTile)
    )
      result.agentTile = agentTile;
    if (wizard === "video" && uuid(batch)) result.batch = batch;
  } else if ((stage === "plans" || stage === "production" || stage == null) && uuid(carouselItem)) {
    result.carousel = carouselItem;
  }
  return result;
}
