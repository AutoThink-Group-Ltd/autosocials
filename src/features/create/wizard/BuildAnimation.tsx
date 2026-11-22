import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Only persisted states determine the label; elapsed time is never a completion estimate. */
export function productionStage(status: string | undefined, phase?: string | null): string {
  if (status === "done") return "Exported";
  if (status === "failed") return "Needs attention";
  if (phase === "reconciliation_required") return "Checking interrupted production";
  if (status === "queued") return phase === "assets_ready" ? "Queued for assembly" : "Queued";
  if (["provider_assets", "provider_poll"].includes(phase ?? "")) return "Generating scenes";
  if (["provider_finalizing", "provider_ingestion"].includes(phase ?? "")) return "Saving generated video";
  if (phase === "provider_canceling") return "Requesting cancellation";
  if (phase === "checking") return "Checking composition";
  if (phase === "finalizing") return "Checking & saving video";
  if (phase === "rendering") return "Assembling video";
  if (status === "preparing") return "Preparing assets & composition";
  return "Production in progress";
}

const elapsedLabel = (seconds: number) => seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${seconds}s`;
function badgeLabel(status: string | undefined, phase?: string | null) {
  if (status === "done") return "Exported";
  if (status === "failed") return "Failed";
  if (phase === "reconciliation_required") return "Review";
  if (status === "queued") return "Queued";
  if (["provider_assets", "provider_poll", "rendering"].includes(phase ?? "")) return "Making";
  if (["provider_finalizing", "provider_ingestion", "finalizing"].includes(phase ?? "")) return "Saving";
  if (phase === "checking") return "Checking";
  if (status === "preparing") return "Preparing";
  return "Working";
}

/** Branded illustration of an asset being built: frames draw in, layers assemble, voice waveform pulses. */
export function BuildAnimation({ beats, status, phase, aspect, label, createdAt, startedAt, reported }: { beats: string[]; status: string | undefined; phase?: string | null | undefined; aspect: string; label?: string | undefined; createdAt?: string | undefined; startedAt?: string | undefined; durationS?: number; reported?: number | null | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const since = Date.parse(createdAt ?? startedAt ?? "");
  const elapsed = Number.isFinite(since) ? Math.max(0, Math.floor((now - since) / 1000)) : null;
  const stage = productionStage(status, phase);
  const queued = status === "queued";
  const percent = typeof reported === "number" && Number.isFinite(reported) ? Math.round(Math.max(0, Math.min(100, reported))) : null;
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-surface-subtle p-3" style={{ aspectRatio: aspect }} role="status" aria-label={stage}>
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full border-2 border-dashed border-ink/20 build-orbit" aria-hidden />
      <div className="pointer-events-none absolute -bottom-14 -left-8 h-36 w-36 rounded-full border-2 border-ink/10 build-orbit" style={{ animationDirection: "reverse" }} aria-hidden />
      <div className="relative z-10 flex flex-col items-center gap-1 text-center">
        <span className="flex min-h-7 min-w-20 items-center justify-center rounded-full bg-ink px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-inverse">{label ? "Editing" : badgeLabel(status, phase)}</span>
        {elapsed !== null && <span className="text-[10px] tabular-nums text-muted-foreground">{createdAt ? "Elapsed" : "Processing"} {elapsedLabel(elapsed)}</span>}
      </div>
      <div className="relative z-10 mt-3 h-1.5 overflow-hidden rounded-full bg-ink/15" role="progressbar" aria-label={stage} aria-valuemin={percent === null ? undefined : 0} aria-valuemax={percent === null ? undefined : 100} aria-valuenow={percent ?? undefined} aria-valuetext={percent === null ? `${stage}; elapsed ${elapsed === null ? "time unavailable" : elapsedLabel(elapsed)}` : `${percent}%`}>
        <div className={cn("h-full rounded-full bg-ink", percent === null ? "build-progress-indeterminate" : "transition-[width] duration-700")} style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>
      <div className="relative z-10 mt-3 flex flex-1 flex-col justify-center gap-2">
        {(beats.length ? beats : ["Hook", "Proof", "Call to action"]).slice(0, 4).map((b, i) => (
          <div key={i} className="build-rise rounded-[8px] border-2 border-ink bg-surface px-2 py-1.5" style={{ animationDelay: `${i * 0.35}s` }}>
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-subtle">
              <div className="build-draw h-full bg-ink" style={{ animationDelay: `${i * 0.3}s` }} />
            </div>
            <p className="mt-1 truncate text-[11px] font-semibold">{b}</p>
          </div>
        ))}
      </div>
      <div className="relative z-10 mt-3 flex h-6 items-end gap-[3px]" aria-hidden>
        {Array.from({ length: 22 }, (_, i) => (
          <span key={i} className={cn("w-1 flex-1 rounded-full bg-ink", !queued && "build-wave")} style={{ height: "100%", animationDelay: `${(i % 7) * 0.12}s`, opacity: queued ? 0.2 : 0.75 }} />
        ))}
      </div>
      <p className="relative z-10 mt-2 text-center text-[10px] font-medium text-muted-foreground">{queued ? "Waiting for a production slot" : `${stage}…`}{percent !== null && ` · ${percent}%`}</p>
      {elapsed !== null && elapsed >= 300 && <p className="relative z-10 mt-1 text-[11px] leading-relaxed text-muted-foreground">{elapsed >= 600 ? "This video has passed the ten-minute target. Production is still being tracked. You can return later; completed videos stay available." : "This video is taking longer than five minutes. Queue and generation times vary. You can leave and return to this job."}</p>}
    </div>
  );
}
