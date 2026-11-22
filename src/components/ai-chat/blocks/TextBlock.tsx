import type { TextBlock as TextBlockT } from "../types";
import { cn } from "@/lib/utils";

const toneClass: Record<NonNullable<TextBlockT["tone"]>, string> = {
  neutral: "text-foreground",
  positive: "text-foreground",
  warning: "text-foreground",
  critical: "text-destructive",
};

export function TextBlockView({ block }: { block: TextBlockT }) {
  return (
    <p className={cn("text-sm leading-relaxed whitespace-pre-wrap", toneClass[block.tone ?? "neutral"])}>
      {block.body}
    </p>
  );
}