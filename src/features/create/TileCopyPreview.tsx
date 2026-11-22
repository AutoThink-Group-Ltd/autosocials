import type { TilePlan } from "@/lib/social-tiles";

export function TileCopyPreview({ tile }: { tile: TilePlan["tiles"][number] }) {
  const headline = tile.quote?.text ?? tile.headline;
  const supporting = tile.quote?.speaker ?? tile.supporting;
  return <div className="@container aspect-square w-full min-w-0 overflow-auto rounded-xl border border-border-control bg-surface-subtle">
    <div className="m-[5%] flex min-h-[90%] flex-col justify-center gap-3 rounded-lg border border-dashed border-border-control p-[5%]">
      <p className="whitespace-pre-wrap break-words font-display text-[clamp(16px,7cqw,28px)] font-bold leading-tight">{headline}</p>
      {supporting && <p className="whitespace-pre-wrap break-words text-[clamp(13px,4.5cqw,18px)] leading-snug text-muted-foreground">{supporting}</p>}
    </div>
  </div>;
}
