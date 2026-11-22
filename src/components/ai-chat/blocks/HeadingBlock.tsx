import type { HeadingBlock as HeadingBlockT } from "../types";

export function HeadingBlockView({ block }: { block: HeadingBlockT }) {
  const sizes = { 1: "text-lg", 2: "text-base", 3: "text-sm" } as const;
  const Tag = (`h${block.level}`) as "h1" | "h2" | "h3";
  return <Tag className={`${sizes[block.level]} font-semibold text-foreground tracking-tight`}>{block.body}</Tag>;
}