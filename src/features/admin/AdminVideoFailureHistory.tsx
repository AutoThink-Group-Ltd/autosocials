import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSupportVideoFailureHistory } from "@/lib/video-failure-history-admin.functions";

export function AdminVideoFailureHistory() {
  const [open, setOpen] = useState(false);
  const getHistory = useServerFn(getSupportVideoFailureHistory);
  const history = useQuery({ queryKey: ["support-video-failure-history"], queryFn: () => getHistory({ data: {} }), enabled: open });
  return <section className="rounded-lg border border-border bg-surface p-4">
    <button type="button" className="font-semibold underline" aria-expanded={open} onClick={() => setOpen(value => !value)}>Video failure history</button>
    {open && <div className="mt-3 space-y-3 text-sm">
      <p className="text-muted-foreground">Latest 100 planning, production and provider failure events. Attempts remain after retry or Trash.</p>
      {history.isLoading && <p>Loading failures…</p>}
      {history.isError && <p role="alert">Failure history is unavailable. <button type="button" className="underline" onClick={() => void history.refetch()}>Try again</button></p>}
      {history.data?.length === 0 && <p>No failures recorded.</p>}
      {history.data?.map(event => <article key={event.id} className="rounded border border-border p-3">
        <p className="font-medium">{event.stage} · {event.style ?? "style unknown"} · {new Date(event.occurred_at).toLocaleString()}</p>
        <p className="mt-1 whitespace-pre-wrap break-words">{event.cause}</p>
        <p className="mt-2 break-all text-xs text-muted-foreground">Workspace {event.workspace_id} · Job {event.job_id}{event.provider ? ` · ${event.provider}` : ""}{event.model ? ` · ${event.model}` : ""}{event.error_code ? ` · ${event.error_code}` : ""}{event.provider_job_id ? ` · Provider job ${event.provider_job_id}` : ""}{event.provider_request_id ? ` · Provider request ${event.provider_request_id}` : ""}{event.retry_of_event_id ? ` · Retry of event ${event.retry_of_event_id}` : ""}</p>
      </article>)}
    </div>}
  </section>;
}
