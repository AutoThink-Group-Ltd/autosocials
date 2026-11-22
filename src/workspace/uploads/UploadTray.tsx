import { formatBytes } from "@/lib/brand-files";
import { dismissUpload, useUploads, canRetry, retryUpload, type UploadJob } from "./uploadStore";

export function jobLabel(j: UploadJob) {
  if (j.phase === "unpacking") return "Unpacking…";
  if (j.phase === "uploading") return `Uploading ${Math.min(j.filesDone + 1, j.filesTotal)} of ${j.filesTotal} · ${pct(j)}%`;
  if (j.phase === "sorting") return `Sam is reading ${j.filesDone - j.errors.length} file${j.filesDone - j.errors.length === 1 ? "" : "s"}…`;
  if (j.phase === "done" && j.filesTotal === 0 && j.skipped) return "Nothing new to add";
  if (j.phase === "done") return `✓ ${j.filesDone - j.errors.length} file${j.filesDone - j.errors.length === 1 ? "" : "s"} added${j.samRead ? " — Sam has read them" : ""}`;
  return "Upload failed";
}
export const pct = (j: UploadJob) => (j.bytesTotal ? Math.round((j.bytesDone / j.bytesTotal) * 100) : 0);

export function UploadBar({ job }: { job: UploadJob }) {
  const indeterminate = job.phase === "unpacking" || job.phase === "sorting";
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-surface-subtle">
      <div className={indeterminate ? "h-full w-1/3 animate-pulse bg-ink" : "h-full bg-ink transition-[width] duration-300"} style={indeterminate ? undefined : { width: `${job.phase === "done" ? 100 : pct(job)}%` }} />
    </div>
  );
}

/** Floating tray on every /app page so uploads stay visible while you browse. */
export function UploadTray() {
  const jobs = useUploads();
  if (!jobs.length) return null;
  return (
    <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom))] right-4 z-50 max-h-[50dvh] w-[min(320px,calc(100vw-2rem))] space-y-2 overflow-y-auto md:bottom-4 md:max-h-[60vh]">
      {jobs.map((j) => (
        <div key={j.id} className="rounded-[12px] border-2 border-ink bg-surface p-3 text-[13px] shadow-lg">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{jobLabel(j)}</span>
            {(j.phase === "done" || j.phase === "error") && (
              <button type="button" aria-label="Dismiss" className="text-muted-foreground hover:text-foreground" onClick={() => dismissUpload(j.id)}>✕</button>
            )}
          </div>
          {j.phase === "uploading" && <p className="mt-0.5 text-[12px] text-muted-foreground"><span className="block truncate">Current: {j.current}</span><span className="block">Whole batch: {formatBytes(j.bytesDone)} / {formatBytes(j.bytesTotal)}</span></p>}
          <div className="mt-2"><UploadBar job={j} /></div>
          {!!j.skipped && <p className="mt-0.5 text-[12px] text-muted-foreground">{j.skipped} skipped — already in your library</p>}
          {j.folderLabel && <p className="mt-0.5 text-[12px] text-muted-foreground">Into {j.folderLabel}</p>}
          {j.errors.length > 0 && <p className="mt-1 text-[12px] text-destructive">{j.errors.length} couldn't be saved: {j.errors.slice(0, 2).join("; ")}</p>}
          {j.errors.length > 0 && canRetry(j.id) && (
            <button type="button" onClick={() => retryUpload(j.id)} className="mt-2 h-7 rounded-[8px] bg-ink px-3 text-[12px] font-medium text-inverse hover:bg-ink-hover">Retry {j.errors.length} failed</button>
          )}
        </div>
      ))}
    </div>
  );
}
