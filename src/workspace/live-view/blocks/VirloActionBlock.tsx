import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVirloTrackingResource, runVirloOperation } from "@/lib/virlo.functions";
import { buildVirloOperation } from "@/lib/virlo-catalog";
import type { Block } from "@/lib/sam.blocks";
import { ResultCards } from "@/features/virlo/VirloResearchPage";

type Action = Extract<Block, { type: "virlo_action" }>;
export function VirloActionBlock({ b, workspaceId }: { b: Action; workspaceId?: string | null }) {
  const run = useServerFn(runVirloOperation);
  const getTracking = useServerFn(getVirloTrackingResource);
  const resume = b.operation.operation === "tracking_update" && b.operation.status === "active" ? b.operation : null;
  const research = b.operation.operation === "research_update" ? b.operation : null;
  const removal = b.operation.operation === "research_delete" ? { id: b.operation.id, kind: "research" as const } : b.operation.operation === "untrack" ? { id: b.operation.id, kind: b.operation.kind } : null;
  const resource = resume ? { id: resume.id, kind: resume.kind } : research ? { id: research.id, kind: "research" as const } : removal;
  const tracking = useQuery({ queryKey: ["virlo-tracking-review", workspaceId, resource?.kind, resource?.id],
    queryFn: () => getTracking({ data: { workspace_id: workspaceId!, provider_id: resource!.id, kind: resource!.kind } }), enabled: !!workspaceId && !!resource, retry: false });
  const [result, setResult] = useState<{ id: string; data: unknown } | null>(null);
  const mutation = useMutation({ mutationFn: () => run({ data: { workspace_id: workspaceId!, request_id: b.request_id, operation: b.operation, confirmed: true } }), onSuccess: setResult });
  const details = buildVirloOperation(b.operation);
  const recurringResearch = b.operation.operation === "research_start" && b.operation.recurring;
  const recurringText = research ? `Changes may affect recurring runs, which cost up to US$1.50 each. Current schedule: ${tracking.data?.cadence?.replaceAll("_", " ") ?? "not available"}.` : recurringResearch ? `Research runs ${"cadence" in b.operation ? b.operation.cadence ?? "on its schedule" : "on its schedule"} until paused. AutoSocials pays an estimated US$${details.estimatedCostUsd.toFixed(2)} per run.` : `Tracking repeats ${resume ? (tracking.data?.cadence?.replaceAll("_", " ") ?? "at an unavailable frequency") : ("cadence" in b.operation && b.operation.cadence ? b.operation.cadence.replaceAll("_", " ") : "on its schedule")} until paused. AutoSocials pays an estimated US$0.25 per check.`;
  const description = Object.entries(b.operation).filter(([key]) => key !== "operation").map(([key, value]) => `${key.replaceAll("_", " ")}: ${Array.isArray(value) ? value.join(", ") : String(value)}`).join(" · ");
  const audienceRead = b.operation.operation === "tracking_data" && (b.operation.view === "audience-demographics" || b.operation.view === "audience-geography");
  return <section aria-label={b.title} className="space-y-3 rounded-2xl border border-border bg-surface p-4">
    <h3 className="text-lg font-semibold text-ink">{b.title}</h3>
    <p className="text-sm text-text-secondary">{description}</p>
    {removal && <p className="text-sm text-danger">{tracking.data?.label ? `Item: ${tracking.data.label}. ` : ""}{removal.kind === "research" ? "Deleting this research agent cannot be undone and stops its future runs." : removal.kind === "videos" ? "This stops checks. To track this video again, resume this existing item rather than adding the URL again." : "This stops checks and hides the creator; its existing history remains available."}</p>}
    <p className="text-sm text-text-secondary">{removal ? "Virlo does not charge for this removal." : audienceRead ? "A fresh audience snapshot costs an estimated US$0.50; Virlo’s receipt confirms the actual charge." : details.recurring ? recurringText : `Estimated provider cost: US${details.estimatedCostUsd.toFixed(2)}. This starts or changes research.`}</p>
    {!result && <button type="button" disabled={!workspaceId || mutation.isPending || (!!resume && !tracking.data?.cadence) || (!!research && !tracking.data) || (!!removal && !tracking.data) || (!!research?.active && !research.cadence && !tracking.data?.cadence)} onClick={() => { if (window.confirm(removal ? (removal.kind === "research" ? "Permanently delete this research agent? This cannot be undone." : removal.kind === "videos" ? "Stop tracking this video? To restart, you must resume this existing item." : "Stop tracking this creator? Existing history remains available.") : research?.active === false ? "Pause this research agent?" : research ? "Apply these changes to this research agent and its future runs?" : audienceRead ? "Get the audience snapshot for an estimated US$0.50?" : details.recurring ? "Start or resume recurring research checks and their future charges?" : "Start this research action?")) mutation.mutate(); }} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-inverse disabled:opacity-50">{mutation.isPending ? "Working…" : removal ? "Confirm removal" : audienceRead ? "Confirm paid data refresh" : "Confirm research"}</button>}
    {resource && tracking.isError && <p role="alert" className="text-sm text-warning">Tracking frequency is unavailable. Open Research to check it before resuming.</p>}
    {mutation.isError && <p role="alert" className="text-sm text-warning">{mutation.error instanceof Error ? mutation.error.message : "Research could not be started."}</p>}
    {result && <ResultCards result={{ ...result, title: b.title, kind: b.operation.operation, page: 1 }} workspaceId={workspaceId!} />}
  </section>;
}
