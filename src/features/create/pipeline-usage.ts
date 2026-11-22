export type PipelineFormat = "video" | "tiles" | "written" | "carousel";
export type PipelineUsage = {
  planned: number;
  created: number;
  scheduled: number;
  published: number;
};
export type LinkedOutput = { kind?: string; id?: string; status?: string };
export type LinkedPost = {
  id: string;
  status: string;
  created_via: string | null;
  variant_id: string | null;
  post_targets?: Array<{ status: string }> | null;
};

/** Counts distinct outputs, not delivery rows; matches only persisted identifiers. */
export function linkedUsage(
  outputs: LinkedOutput[],
  posts: LinkedPost[],
  planned: number,
): PipelineUsage {
  const ready = new Map<string, LinkedOutput>();
  for (const output of outputs) {
    if (
      !output.id ||
      !["tile", "video", "written"].includes(output.kind ?? "") ||
      !["ready", "done"].includes(output.status ?? "")
    )
      continue;
    ready.set(`${output.kind}:${output.id}`, output);
  }
  let scheduled = 0,
    published = 0;
  for (const output of ready.values()) {
    const associated = posts.filter((post) =>
      output.kind === "tile"
        ? post.created_via === `social_tile:${output.id}`
        : output.kind === "video"
          ? post.variant_id === output.id
          : post.id === output.id ||
            post.created_via === `written_post:${output.id}`,
    );
    if (
      associated.some(
        (post) =>
          post.status === "scheduled" &&
          (post.post_targets?.length
            ? post.post_targets.some((target) =>
                ["pending", "retrying"].includes(target.status),
              )
            : true),
      )
    )
      scheduled++;
    if (
      associated.some((post) =>
        post.post_targets?.length
          ? post.post_targets.some((target) => target.status === "published")
          : post.status === "published",
      )
    )
      published++;
  }
  return { planned, created: ready.size, scheduled, published };
}
export function parsePipelineFormat(
  value: unknown,
): PipelineFormat | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.toLowerCase();
  if (/carousel/.test(text)) return "carousel";
  if (/written|text|article/.test(text)) return "written";
  if (/tile|image|graphic/.test(text)) return "tiles";
  if (/video|reel|film/.test(text)) return "video";
  return undefined;
}
