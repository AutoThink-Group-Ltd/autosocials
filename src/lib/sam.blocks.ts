import { z } from "zod";
import { MODULE_CONTRACTS } from "@/brand/modules";
import type { ModuleId } from "@/brand/tokens";
import { YouTubeGalleryBlockSchema } from "@/lib/youtube";
import { VirloOperationSchema } from "@/lib/virlo-catalog";
import { referenceIdsSchema } from "./social-design";
import { carouselDraftSchema } from "@/lib/linkedin-carousel";
import { tilePlanSchema } from "./social-tiles";

/** Typed Live View blocks. Sam may only emit these; anything else is dropped. */
export const BlockSchema = z.discriminatedUnion("type", [
  YouTubeGalleryBlockSchema,
  z.object({ type: z.literal("content_campaign"), campaignId: z.string().uuid() }),
  z.object({ type: z.literal("outreach_campaign"), title: z.string().min(1).max(200), campaign_id: z.string().uuid() }),
  z.object({ type: z.literal("virlo_action"), title: z.string().min(1).max(200), request_id: z.string().uuid(), operation: VirloOperationSchema }),
  z.object({ type: z.literal("virlo_research"), title: z.string().min(1).max(200), result_id: z.string().uuid() }),
  z.object({ type: z.literal("social_tiles"), referenceIds: referenceIdsSchema.optional(), count: z.number().int().min(1).max(5).optional(), title: z.string().min(1).max(120), brief: z.string().min(1).max(2000), plan: tilePlanSchema.optional() }),
  z.object({ type: z.literal("direct_video"), title: z.string(), request_id: z.string().uuid(),
    status: z.enum(["options", "starting", "queued", "failed"]), reason: z.string(), reference_count: z.number(),
    duration: z.number().nullable(), aspect_ratio: z.string().nullable(), resolution: z.string().nullable(),
    options: z.array(z.object({ id: z.string(), label: z.string() })), missing: z.array(z.string()).optional(),
    message: z.string().max(12000), thread_id: z.string().uuid(), file_ids: z.array(z.string().uuid()).max(20),
    batch_id: z.string().uuid().optional(), variant_id: z.string().uuid().optional(), error: z.string().optional(),
  }),
  z.object({ type: z.literal("heading"), text: z.string() }),
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({
    type: z.literal("brief"),
    title: z.string(),
    fields: z.array(z.object({ label: z.string(), value: z.string() })),
  }),
  z.object({
    type: z.literal("variants"),
    title: z.string(),
    items: z.array(
      z.object({ angle: z.string(), hook: z.string(), format: z.string().optional(), notes: z.string().optional(), carousel_plan: carouselDraftSchema.optional().catch(undefined) }),
    ),
  }),
  z.object({
    type: z.literal("schedule"),
    title: z.string(),
    items: z.array(z.object({ when: z.string(), account: z.string(), item: z.string() })),
  }),
  z.object({
    type: z.literal("table"),
    title: z.string(),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  }),
  z.object({
    type: z.literal("checklist"),
    title: z.string(),
    items: z.array(z.object({ text: z.string(), done: z.boolean().optional() })),
  }),
  z.object({ type: z.literal("notice"), tone: z.enum(["info", "warning"]), text: z.string() }),
  // Studio blocks: real files, rich docs, picks and sign-off.
  z.object({ type: z.literal("assets"), title: z.string(), file_ids: z.array(z.string()), layout: z.enum(["grid", "strip", "hero"]).optional() }),
  z.object({ type: z.literal("document"), title: z.string(), file_id: z.string().optional(), markdown: z.string().optional() }),
  z.object({
    type: z.literal("shotlist"), title: z.string(),
    items: z.array(z.object({ file_id: z.string(), role: z.string(), why: z.string(), at: z.string().optional() })),
  }),
  z.object({
    type: z.literal("confirm"), title: z.string(),
    action: z.enum(["render_variants", "schedule", "use_assets", "clear_narratives", "other"]),
    fields: z.array(z.object({ label: z.string(), value: z.string() })),
    variant_ids: z.array(z.string()).optional(),
    status: z.enum(["pending", "approved", "changes", "cancelled"]).optional(),
  }),
  z.object({ type: z.literal("palette"), title: z.string(), colours: z.array(z.object({ hex: z.string(), name: z.string().optional() })) }),
  z.object({ type: z.literal("type_specimen"), title: z.string(), fonts: z.array(z.object({ name: z.string(), role: z.string().optional(), sample: z.string().optional() })) }),
  z.object({
    type: z.literal("storyboard"), title: z.string(),
    frames: z.array(z.object({ at: z.string(), caption: z.string(), vo: z.string().optional(), file_id: z.string().optional() })),
  }),
  z.object({ type: z.literal("compare"), title: z.string(), left_file_id: z.string(), right_file_id: z.string(), left_label: z.string().optional(), right_label: z.string().optional() }),
]);

export type Block = z.infer<typeof BlockSchema>;
export type BlockType = Block["type"];

export function parseBlocks(input: unknown): Block[] {
  if (!Array.isArray(input)) return [];
  const out: Block[] = [];
  for (const b of input) {
    const r = BlockSchema.safeParse(b);
    if (r.success) out.push(r.data);
  }
  return out;
}

/** Parse, then keep only block types the module's contract allows. */
export function filterBlocksForModule(module: ModuleId, input: unknown): Block[] {
  const allowed = MODULE_CONTRACTS[module].blocks;
  return parseBlocks(input).filter((b) => allowed.includes(b.type));
}

/** Every file id a block points at. */
export function fileIdsIn(blocks: Block[]): string[] {
  const ids: string[] = [];
  for (const b of blocks) {
    if (b.type === "direct_video") ids.push(...b.file_ids);
    else if (b.type === "assets") ids.push(...b.file_ids);
    else if (b.type === "document" && b.file_id) ids.push(b.file_id);
    else if (b.type === "shotlist") ids.push(...b.items.map((i) => i.file_id));
    else if (b.type === "storyboard") b.frames.forEach((f) => f.file_id && ids.push(f.file_id));
    else if (b.type === "compare") ids.push(b.left_file_id, b.right_file_id);
  }
  return [...new Set(ids)];
}

/** Drops references to files outside the business; blocks left empty are removed. Confirms always start pending. */
export function keepOwnFiles(blocks: Block[], own: Set<string>): Block[] {
  const out: Block[] = [];
  for (const b of blocks) {
    if (b.type === "assets") { const ids = b.file_ids.filter((i) => own.has(i)); if (ids.length) out.push({ ...b, file_ids: ids }); }
    else if (b.type === "document") { if (b.markdown || (b.file_id && own.has(b.file_id))) out.push(b.file_id && !own.has(b.file_id) ? { ...b, file_id: undefined } : b); }
    else if (b.type === "shotlist") { const items = b.items.filter((i) => own.has(i.file_id)); if (items.length) out.push({ ...b, items }); }
    else if (b.type === "storyboard") out.push({ ...b, frames: b.frames.map((f) => (f.file_id && !own.has(f.file_id) ? { ...f, file_id: undefined } : f)) });
    else if (b.type === "compare") { if (own.has(b.left_file_id) && own.has(b.right_file_id)) out.push(b); }
    else if (b.type === "confirm") out.push({ ...b, status: "pending" });
    else out.push(b);
  }
  return out;
}

/** Only an explicit user decision moves a confirm card; a decided card can't be re-decided. */
export function decideConfirm(blocks: Block[], index: number, decision: "approved" | "changes" | "cancelled"): Block[] {
  const b = blocks[index];
  if (!b || b.type !== "confirm") throw new Error("That approval card no longer exists.");
  if (b.status && b.status !== "pending") throw new Error("You've already answered this one.");
  return blocks.map((x, i) => (i === index ? { ...b, status: decision } : x));
}
