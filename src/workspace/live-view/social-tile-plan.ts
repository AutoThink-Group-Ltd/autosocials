import type { Block } from "@/lib/sam.blocks";
import {
  defaultSocialDesign,
  designSchema,
  withDesignReferences,
} from "@/lib/social-design";
import { isLinkedInCarouselIdea } from "@/lib/linkedin-carousel";
import { tilePlanSchema } from "@/lib/social-tiles";

function savedDesign(notes: string) {
  const raw = /^Design:\s*(\{[^\r\n]+\})[ \t]*$/im.exec(notes)?.[1];
  if (!raw) return undefined;
  try {
    return designSchema.safeParse(JSON.parse(raw)).data;
  } catch {
    return undefined;
  }
}

export function findSocialTilePlan(blocks: Block[], title?: string) {
  // A saved static-tile canvas takes precedence over the old shared ideas view.
  const index = blocks.findIndex(
    (block) => block.type === "social_tiles" && !!block.plan,
  );
  const saved = blocks[index];
  if (saved?.type === "social_tiles" && saved.plan)
    return { index, plan: saved.plan };

  if (
    blocks.some(
      (block) =>
        block.type === "direct_video" ||
        block.type === "storyboard" ||
        block.type === "shotlist" ||
        block.type === "content_campaign",
    )
  )
    return null;
  for (const [index, block] of blocks.entries()) {
    if (block.type !== "variants" || !block.items.length) continue;
    const tileLabel =
      /\b(?:social(?: media)? tiles?|static (?:graphics?|designs?|tiles?))\b/i;
    if (!(
      tileLabel.test(block.title) ||
      tileLabel.test(title ?? "") ||
      block.items.every((item) => tileLabel.test(item.format ?? ""))
    ))
      continue;
    if (
      block.items.some(
        (item) =>
          isLinkedInCarouselIdea(block.title, item) ||
          /\b(?:videos?|reels?|carousels?)\b/i.test(item.format ?? ""),
      )
    )
      continue;

    const tiles = block.items.map((item) => {
      const copy = item.hook.trim();
      const splitAt = copy.length > 80 ? copy.lastIndexOf(" ", 80) : -1;
      const headline = splitAt > 0 ? copy.slice(0, splitAt) : copy;
      const notes = item.notes ?? "";
      const body = /^(?:Support(?:ing)? copy|Supporting line):[ \t]*(.+)$/im
        .exec(notes)?.[1]
        ?.trim();
      const cta = /^CTA:[ \t]*(.+)$/im.exec(notes)?.[1]?.trim();
      const supporting = [
        splitAt > 0 ? copy.slice(splitAt + 1).trimStart() : "",
        body,
        cta,
      ]
        .filter(Boolean)
        .join("\n");
      const originalDesign = savedDesign(notes);
      const direction = (originalDesign?.medium || item.angle).slice(0, 220);
      const design = withDesignReferences(
        originalDesign ?? defaultSocialDesign(direction),
        [],
      );
      return {
        headline,
        supporting,
        direction,
        design: { ...design, aspect: "square" },
      };
    });
    const parsed = tilePlanSchema.safeParse({
      brand:
        (title ?? block.title)
          .split(/\bsocial(?: media)? tiles?\b/i)[0]
          ?.trim()
          .slice(0, 60) || "Your brand",
      tiles,
    });
    if (parsed.success) return { index, plan: parsed.data };
  }
  return null;
}
