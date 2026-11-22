import { defaultSocialDesign } from "@/lib/social-design";
import type { TilePlan } from "@/lib/social-tiles";

/** Prepare approved copy for the space available on a social tile. */
export function productionTileInput(tile: TilePlan["tiles"][number], index: number) {
  const original = tile.design ?? defaultSocialDesign(tile.direction ?? "");
  const directions = [
    { treatment: "typography" as const, composition: "full" as const },
    { treatment: "illustration" as const, composition: "top" as const },
    { treatment: "illustration" as const, composition: "right" as const },
  ];
  const kinds = ["product", "promotional", "educational"] as const;
  const firstLine = tile.supporting.split(/\r?\n/)[0]?.trim() ?? "";
  const sentence = firstLine.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? firstLine;
  const firstHeadlineSentence = tile.headline.match(/^.+?[.!?](?=\s|$)/)?.[0];
  const headline = tile.headline.split(/\s+/).length > 7 && firstHeadlineSentence
    ? firstHeadlineSentence : tile.headline;
  const keepDesign = !!tile.quote || !!original.referenceIds?.length;
  return {
    headline,
    supporting: sentence.length <= 70 ? sentence : "",
    direction: tile.direction || "Use the approved brand direction.",
    design: {
      ...original,
      ...(!keepDesign ? directions[index % directions.length]! : {}),
      aspect: "square" as const,
      ...(!keepDesign
        ? { showcaseKind: kinds[index % kinds.length] }
        : { showcaseKind: undefined }),
    },
    ...(tile.quote ? { quote: tile.quote } : {}),
  };
}
