import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown } from "lucide-react";
import { getVideoFailureHistory } from "@/lib/video-failure-history.functions";
import type { VideoFailureEvent } from "@/lib/video-failure-history.server";

const styleNames: Record<string, string> = {
  "branded-motion": "Branded motion", "brand-motion": "Branded motion",
  "illustrated-explainer": "Illustrated explainer", "cinematic-ad": "Cinematic ad",
  "cinematic-scene": "Cinematic ad", "reaction-demo": "Reaction + demo", "reference-story": "Reaction + demo",
};
const stageNames: Record<VideoFailureEvent["stage"], string> = { planning: "Planning", production: "Video production", provider: "Provider step" };

export function VideoFailureHistory({ workspaceId }: { workspaceId: string }) {
  const [open, setOpen] = useState(false);
  const getHistory = useServerFn(getVideoFailureHistory);
  const history = useQuery({
    queryKey: ["video-failure-history", workspaceId],
    queryFn: () => getHistory({ data: { workspace_id: workspaceId } }),
    enabled: open,
  });
  return <section className="mt-6 rounded-2xl border border-border bg-card" aria-label="Video failure history">
    <button type="button" className="flex w-full items-center justify-between gap-3 p-4 text-left font-semibold" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
      Video failure history <ChevronDown className={open ? "size-4 rotate-180" : "size-4"} aria-hidden="true" />
    </button>
    {open && <div className="space-y-3 border-t border-border p-4">
      <p className="text-sm text-muted-foreground">Past failures remain here when work is retried or moved to Trash.</p>
      {history.isLoading ? <p className="text-sm text-muted-foreground">Loading history…</p> : history.isError
        ? <p className="text-sm text-muted-foreground">History could not be loaded. <button type="button" className="underline" onClick={() => void history.refetch()}>Try again</button></p>
        : !history.data?.length ? <p className="text-sm text-muted-foreground">No recorded video failures.</p>
        : <ol className="space-y-3">{history.data.map((event) => <li key={event.id} className="rounded-xl border border-border p-4 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong>{stageNames[event.stage]}{event.style ? ` · ${styleNames[event.style] ?? event.style}` : ""}</strong><time dateTime={event.occurred_at} className="text-xs text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</time></div>
          <p className="mt-2 whitespace-pre-wrap break-words">{event.cause}</p>
          <details className="mt-2 text-xs text-muted-foreground"><summary className="cursor-pointer">Details for support</summary>
            <dl className="mt-2 grid gap-1 break-all">
              <div><dt className="inline font-semibold">Job: </dt><dd className="inline">{event.job_id}</dd></div>
              {event.provider && <div><dt className="inline font-semibold">Provider: </dt><dd className="inline">{event.provider}</dd></div>}
              {event.model && <div><dt className="inline font-semibold">Model: </dt><dd className="inline">{event.model}</dd></div>}
              {event.provider_job_id && <div><dt className="inline font-semibold">Provider job: </dt><dd className="inline">{event.provider_job_id}</dd></div>}
              {event.provider_request_id && <div><dt className="inline font-semibold">Provider request: </dt><dd className="inline">{event.provider_request_id}</dd></div>}
              {event.error_code && <div><dt className="inline font-semibold">Code: </dt><dd className="inline">{event.error_code}</dd></div>}
              {event.retry_of_event_id && <div><dt className="inline font-semibold">Previous attempt: </dt><dd className="inline">{event.retry_of_event_id}</dd></div>}
            </dl>
          </details>
        </li>)}</ol>}
    </div>}
  </section>;
}
