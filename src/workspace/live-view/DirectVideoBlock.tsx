import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, CheckCircle2, Film, Loader2, RefreshCw } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { chooseDirectVideo, getDirectVideoOptions } from "@/lib/direct-video.functions";
import type { Block } from "@/lib/sam.blocks";
import { refreshRenders } from "@/lib/creative.functions";
import { getRenderPlayback } from "@/lib/media.functions";
import { productionStage } from "@/features/create/wizard/BuildAnimation";
import { AssetWorkflow } from "@/features/create/AssetWorkflow";
import { requestVideoSupport } from "@/lib/video-support.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export type DirectVideoCard = Extract<Block, { type: "direct_video" }>;

const field = "rounded-[10px] border border-border-control bg-canvas px-3 py-2 text-[13px] text-foreground disabled:opacity-50";
const active = (status: string | undefined) => !!status && ["queued", "preparing", "rendering"].includes(status);

function SettingVisual({ kind, value }: { kind: "length" | "frame" | "resolution"; value: string }) {
  return <div aria-hidden="true" className="relative flex h-16 items-center justify-center overflow-hidden rounded-[12px] border border-inverse/20 bg-inverse/10">
    {kind === "length" && <div className="flex items-center gap-2">{[0, 1, 2, 3].map((frame) => <span key={frame} className={`h-9 w-7 rounded-[5px] border border-inverse/60 ${frame === 1 ? "bg-inverse/50" : "bg-inverse/15"}`} />)}</div>}
    {kind === "frame" && <span className={`rounded-[5px] border-2 border-inverse bg-inverse/15 ${value === "9:16" ? "h-11 w-7" : value === "16:9" ? "h-7 w-11" : "h-9 w-9"}`} />}
    {kind === "resolution" && <div className="flex items-end gap-1.5">{[4, 6, 8, 10, 12].map((height) => <span key={height} className="w-2 rounded-t-[3px] bg-inverse/70" style={{ height: `${height * 3}px` }} />)}</div>}
    <span className="absolute bottom-1 right-2 text-[10px] font-bold tracking-wider text-inverse/70">{value}</span>
  </div>;
}

export function DirectVideoBlock({ b, canvas, index, onRefresh }: {
  b: DirectVideoCard; canvas: { id: string; version: number }; index: number; onRefresh?: (() => void) | undefined;
}) {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const qc = useQueryClient();
  const choose = useServerFn(chooseDirectVideo);
  const getOptions = useServerFn(getDirectVideoOptions);
  const refresh = useServerFn(refreshRenders);
  const playback = useServerFn(getRenderPlayback);
  const sendSupport = useServerFn(requestVideoSupport);
  const submitting = useRef(false);
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [admitted, setAdmitted] = useState<{ variantId: string; batchId?: string | undefined } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failureOpen, setFailureOpen] = useState(false);
  const [supportSending, setSupportSending] = useState(false);
  const [supportReference, setSupportReference] = useState<string | null>(null);
  const [supportError, setSupportError] = useState<string | null>(null);
  const [duration, setDuration] = useState(b.duration ?? 30);
  const [ratio, setRatio] = useState(b.aspect_ratio ?? "9:16");
  const [resolution, setResolution] = useState(b.resolution ?? "1080p");
  useEffect(() => {
    setDuration(b.duration ?? 30); setRatio(b.aspect_ratio ?? "9:16"); setResolution(b.resolution ?? "1080p");
    setSubmitted(false); setAdmitted(null); setError(null);
  }, [b.request_id]);
  const variantId = admitted?.variantId ?? b.variant_id;

  const modelOptions = useQuery({
    queryKey: ["direct-video-options", ws, canvas.id, canvas.version, index, b.request_id, duration, ratio, resolution],
    enabled: b.status === "options" && !!ws,
    queryFn: () => getOptions({ data: { canvas_id: canvas.id, index, duration, aspect_ratio: ratio, resolution } }),
    staleTime: 60_000,
  });

  const job = useQuery({
    queryKey: ["direct-video-render", ws, variantId],
    enabled: !!ws && !!variantId,
    queryFn: async () => {
      // A worker wake-up error must not hide a persisted provider failure or finished job.
      await refresh({ data: { workspace_id: ws! } }).catch(() => undefined);
      const result = await supabase.from("render_jobs")
        .select("id,status,phase,error,storage_path,created_at")
        .eq("workspace_id", ws!).eq("variant_id", variantId!)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw result.error;
      return result.data;
    },
    refetchInterval: (query) => !query.state.data || active(query.state.data.status) ? 8000 : false,
  });
  const video = useQuery({
    queryKey: ["direct-video-playback", ws, job.data?.id, job.data?.storage_path],
    enabled: !!ws && job.data?.status === "done" && !!job.data.storage_path,
    staleTime: 45 * 60_000,
    queryFn: async () => {
      const path = job.data!.storage_path!;
      if (path.startsWith("autotoast:")) return (await playback({ data: { workspace_id: ws!, media_id: path.slice(10) } })).url;
      const result = await supabase.storage.from("brand-assets-private").createSignedUrl(path, 3600);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    },
  });

  const options = b.status === "options" && !admitted && !submitted;
  const pending = busy || (!variantId && (submitted || b.status === "starting"));
  const generating = !!variantId || b.status === "queued";
  const failed = job.data ? job.data.status === "failed" : b.status === "failed";
  useEffect(() => { if (failed) setFailureOpen(true); }, [failed]);
  const completed = job.data?.status === "done";
  const failureMessage = failed ? job.data?.error || b.error || error : completed ? null : error;
  const connectionFailure = /credentials|unauthori[sz]ed|authentication|\b401\b/i.test(failureMessage ?? "");
  const trackingUnavailable = generating && job.isError;
  const moving = !failed && !completed && !trackingUnavailable && (pending || generating);
  const status = failed ? "Animation failed" : completed ? "Your video is ready" : trackingUnavailable ? "Production status unavailable" : pending ? "Submitting your animation…" : generating
    ? job.data ? productionStage(job.data.status, job.data.phase) : "Animation queued"
    : "Choose how to animate your photos";
  const detail = failed ? "Your photos and brief are saved. Review the error below before starting another generation." : completed ? "Watch your finished video below." : trackingUnavailable ? "The saved job is still attached to this card. Refresh its status here; do not submit another generation." : pending ? "Sending your chosen model, settings and saved photos. Waiting for the queue to confirm acceptance." : generating
    ? job.data?.status === "queued" || !job.data ? "Your request is in the production queue. This card will update automatically when the job starts." : "The production job is being tracked here. You can keep this view open while it works."
    : "Select a supported model to start directly from your saved reference photos.";
  const durationChoices = [...new Set([15, 30, duration])].sort((a, c) => a - c);
  const ratioChoices = [...new Set(["9:16", "16:9", "1:1", ratio])];
  const resolutionChoices = [...new Set(["720p", "1080p", resolution])];
  const availableOptions = modelOptions.data?.options ?? [];
  const reason = options ? modelOptions.data?.reason ?? b.reason : b.reason;
  const validDuration = duration === 15 || duration === 30;
  const validRatio = ratio === "9:16" || ratio === "16:9" || ratio === "1:1";
  const validResolution = resolution === "480p" || resolution === "720p" || resolution === "1080p" || resolution === "4k";

  async function start(capabilityId: string) {
    if (submitting.current || submitted || !ws || modelOptions.isFetching || !availableOptions.some((option) => option.id === capabilityId)) return;
    const selectedOption = availableOptions.find((option) => option.id === capabilityId);
    if (!selectedOption?.creditCost || !selectedOption.creditRateId) return;
    if ((duration !== 15 && duration !== 30) || (ratio !== "9:16" && ratio !== "16:9" && ratio !== "1:1") || (resolution !== "480p" && resolution !== "720p" && resolution !== "1080p" && resolution !== "4k")) return;
    submitting.current = true; setBusy(true); setError(null);
    try {
      const result = await choose({ data: { canvas_id: canvas.id, index, capability_id: capabilityId, expected_version: canvas.version, duration, aspect_ratio: ratio, resolution, expected_credits: selectedOption.creditCost, expected_rate_id: selectedOption.creditRateId } });
      if (result.variant_id) setAdmitted({ variantId: result.variant_id, batchId: result.batch_id });
      setSubmitted(true);
      await Promise.all([qc.invalidateQueries({ queryKey: ["batches", ws] }), qc.invalidateQueries({ queryKey: ["sam-messages", ws, "create"] })]);
      onRefresh?.();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The animation could not start. Please try again.");
      onRefresh?.();
    } finally { submitting.current = false; setBusy(false); }
  }

  return (
    <section className="overflow-hidden rounded-[16px] border border-border bg-surface" aria-label="Photo animation">
      <AssetWorkflow stage={pending || generating || failed ? "production" : "plans"} />
      <div className="flex items-center gap-3 border-b border-border bg-canvas p-4">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-ink text-inverse">
          {moving ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : failed ? <AlertCircle className="h-5 w-5" aria-hidden /> : completed ? <CheckCircle2 className="h-5 w-5" aria-hidden /> : <Film className="h-5 w-5" aria-hidden />}
        </span>
        <div className="min-w-0"><h3 className="font-display text-[16px] font-bold">{b.title}</h3><p className="mt-0.5 text-[13px] text-muted-foreground" role="status">{status}</p></div>
      </div>
      <div className="space-y-4 p-4">
        {(pending || generating || failed) && <div className="overflow-hidden rounded-[14px] border-2 border-ink bg-canvas p-4" role="status" aria-live="polite" aria-label="Animation progress">
          <p className="text-[15px] font-bold">{status}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
          {moving && <><div className="mt-4 flex gap-2" aria-hidden>{[0, 1, 2].map((frame) => <div key={frame} className="h-9 flex-1 animate-pulse rounded-[8px] border border-ink/30 bg-surface-subtle" style={{ animationDelay: `${frame * 0.25}s` }} />)}</div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/15" role="progressbar" aria-label={status} aria-valuetext={status}><div className="build-progress-indeterminate h-full rounded-full bg-ink" /></div></>}
          {failureMessage && <p role="alert" className="mt-3 rounded-[10px] border border-warning/40 bg-warning-surface p-3 text-[13px] text-warning">{failureMessage}</p>}
          {variantId && <button type="button" disabled={job.isFetching} onClick={() => void job.refetch()} className="mt-3 inline-flex items-center gap-2 rounded-[10px] border border-border-control px-3 py-2 text-[13px] font-semibold hover:bg-surface-subtle disabled:opacity-50"><RefreshCw size={14} className={job.isFetching ? "animate-spin" : ""} aria-hidden />{job.isFetching ? "Checking status…" : "Refresh job status"}</button>}
          {failed && <p className="mt-3 text-[12px] text-muted-foreground">{connectionFailure ? "The Higgsfield API connection needs valid credentials. Update the provider connection before trying again." : "Review the provider connection and request settings with Sam before trying again."} Your reference photos remain available in Brand Assets.</p>}
          {failed && <button type="button" onClick={() => setFailureOpen(true)} className="mt-3 rounded-[10px] border border-border-control px-3 py-2 text-[13px] font-semibold">View error and support</button>}
        </div>}
        <p className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{b.reference_count} reference photos · Your video setup</p>
        {reason && options && <p className="text-[13px] leading-relaxed text-muted-foreground">{reason}</p>}
        {options && <>
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Video settings">
            <label className="grid gap-2 rounded-[16px] bg-ink p-3 text-inverse"><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inverse/70">01 · Length</span><SettingVisual kind="length" value={`${duration}s`} /><select className={field} value={duration} disabled={pending} onChange={(e) => setDuration(Number(e.target.value))}>{durationChoices.map((value) => <option key={value} value={value}>{value} seconds</option>)}</select></label>
            <label className="grid gap-2 rounded-[16px] bg-ink p-3 text-inverse"><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inverse/70">02 · Frame</span><SettingVisual kind="frame" value={ratio} /><select className={field} value={ratio} disabled={pending} onChange={(e) => setRatio(e.target.value)}>{ratioChoices.map((value) => <option key={value} value={value}>{value}{value === "9:16" ? " · Portrait" : value === "16:9" ? " · Landscape" : value === "1:1" ? " · Square" : ""}</option>)}</select></label>
            <label className="grid gap-2 rounded-[16px] bg-ink p-3 text-inverse"><span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-inverse/70">03 · Resolution</span><SettingVisual kind="resolution" value={resolution} /><select className={field} value={resolution} disabled={pending} onChange={(e) => setResolution(e.target.value)}>{resolutionChoices.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
          </div>
          {modelOptions.isFetching && <p role="status" className="flex items-center gap-2 text-[13px] text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Checking models for these settings…</p>}
          {modelOptions.isError && <p role="alert" className="text-[13px] text-muted-foreground">Available models could not be checked. <button type="button" className="font-semibold underline" onClick={() => void modelOptions.refetch()}>Try again</button></p>}
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Video models">{availableOptions.map((option, at) => <div key={option.id} className="flex flex-col justify-between gap-3 rounded-[16px] border border-border bg-canvas p-3"><div className="space-y-2"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Model 0{at + 1}</span><Film className="h-4 w-4 text-muted-foreground" aria-hidden /></div><p className="min-h-10 font-display text-[15px] font-bold leading-tight">{option.label}</p><p className="text-[12px] text-muted-foreground">{option.creditCost && option.creditRateId ? `${option.creditCost} credits` : "Credit price unavailable for these settings"}</p></div><button type="button" disabled={pending || !ws || modelOptions.isFetching || modelOptions.isError || !validDuration || !validRatio || !validResolution || !option.estimatedUsd || !option.creditCost || !option.creditRateId} onClick={() => void start(option.id)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-[10px] bg-ink px-3 py-2 text-[12px] font-semibold text-inverse hover:bg-ink-hover disabled:opacity-50">{pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{pending ? "Starting video…" : `Create video with ${option.label}`}</button></div>)}</div>
          <p className="text-[12px] text-muted-foreground">Credits are reserved when production starts and settled after successful completion.</p>
        </>}
        {error && !(pending || generating || failed) && <p role="alert" className="rounded-[10px] border border-warning/40 bg-warning-surface p-3 text-[13px] text-warning">{error}</p>}
        {video.data && <video key={video.data} src={video.data} controls playsInline preload="metadata" aria-label={b.title} className="max-h-[480px] w-full rounded-[12px] bg-canvas" />}
        {video.isError && <p role="alert" className="text-[13px] text-muted-foreground">The video is ready, but its playback link could not be loaded. <button type="button" className="font-semibold underline" onClick={() => void video.refetch()}>Reload playback</button></p>}
        {completed && video.isPending && <p role="status" className="text-[13px] text-muted-foreground">Loading your finished video…</p>}
        {(admitted?.batchId ?? b.batch_id) && <details className="text-[12px] text-muted-foreground"><summary className="cursor-pointer">More video tools</summary><a href="/app/create" onClick={() => { if (ws) sessionStorage.setItem(`as:create-batch:${ws}`, (admitted?.batchId ?? b.batch_id)!); }} className="mt-2 inline-flex rounded-[10px] border border-border-control px-3 py-2 font-semibold hover:bg-surface-subtle">Open editing tools in Create →</a></details>}
      </div>
      <Dialog open={failureOpen && failed} onOpenChange={setFailureOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>We couldn’t create this video</DialogTitle><DialogDescription>Your photos and production brief are saved. This is a generation service issue; your available credits do not guarantee that our video provider can accept a job.</DialogDescription></DialogHeader>
          <div role="alert" className="rounded-[10px] border border-warning/40 bg-warning-surface p-3 text-[13px] text-warning">{failureMessage ?? "The production job failed before a video was available."}</div>
          <p className="text-[13px] text-muted-foreground">Our support team can investigate the provider status using this job’s saved details. The ticket contains no API keys or full production prompt.</p>
          {supportReference ? <p role="status" className="text-[13px] font-semibold">Support request sent. Reference {supportReference}.</p> : <button type="button" disabled={supportSending} onClick={async () => { setSupportSending(true); setSupportError(null); try { const result = await sendSupport({ data: { canvas_id: canvas.id } }); setSupportReference(result.reference); } catch (cause) { setSupportError(cause instanceof Error ? cause.message : "Support request could not be sent."); } finally { setSupportSending(false); } }} className="rounded-[10px] bg-ink px-4 py-2 text-[13px] font-semibold text-inverse disabled:opacity-50">{supportSending ? "Sending support request…" : "Send support ticket"}</button>}
          {supportError && <p role="alert" className="text-[13px] text-destructive">{supportError}</p>}
        </DialogContent>
      </Dialog>
    </section>
  );
}
