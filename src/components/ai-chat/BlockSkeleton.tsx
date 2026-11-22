import { cn } from "@/lib/utils";

/**
 * Streaming placeholder shown beneath validated blocks while Vibe is still
 * emitting the next block. Pure presentational — uses semantic tokens so it
 * adapts to light/dark themes.
 */
export function BlockSkeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Vibe is composing the next block"
      className={cn(
        "rounded-lg border border-border bg-muted/30 p-3 space-y-2 animate-pulse",
        className,
      )}
    >
      <div className="h-3 w-1/3 rounded bg-muted" />
      <div className="h-3 w-4/5 rounded bg-muted" />
      <div className="h-3 w-3/5 rounded bg-muted" />
    </div>
  );
}