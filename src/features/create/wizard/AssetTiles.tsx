import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, CheckCircle2, Download, Maximize2, Share2, Trash2, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getRenderPlayback } from "@/lib/media.functions";
import { reviewVariant, sendToPublish, retryFailedProduction, getRetryProductionQuote, reviseVariant, deleteVariant } from "@/lib/creative.functions";
import { BrandedVideo } from "@/features/brand/BrandedVideo";
import { batchSummary, tileState, type TileState } from "@/lib/wizard";
import { readVideoStyle, styleEngineLabel } from "@/lib/video-styles";
import { cn } from "@/lib/utils";
import { BuildAnimation } from "./BuildAnimation";
import { CreativeProgress } from "./CreativeProgress";
import { VideoPlanDrawer } from "./VideoPlanDrawer";
import { ShareDialog } from "./ShareDialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ApprovedStamp } from "./ApprovedStamp";
import { downloadVideo } from "@/lib/share.functions";
import { beatsOf, errMsg, field, fmtDay, ghost, primary, type Job, type Variant } from "./shared";
import { qualityApprovalProblem } from "@/lib/export-review";
import { QualityReview } from "./QualityReview";

const latest = (jobs: Job[], id: string) => jobs.find((j) => j.variant_id === id);
export const stateOf = (v: Variant, jobs: Job[]) => {
  const job = latest(jobs, v.id);
  const candidate = !!v.primary_render_id && !!job && job.id !== v.primary_render_id;
  return tileState(candidate ? "draft" : v.review_state, job?.status, candidate || v.review_state === "needs_revision");
};

type Props = { ws: string; variants: Variant[]; jobs: Job[]; review: boolean; onRefresh: () => Promise<void>; onNext?: () => void; onNew?: () => void };

export function AssetTiles({ ws, variants, jobs, review, onRefresh, onNext, onNew }: Props) {
  const states = variants.map((v) => stateOf(v, jobs));
  const s = batchSummary(states);
  const [shareAll, setShareAll] = useState(false);
  const [dismissedFailures, setDismissedFailures] = useState<Set<string>>(new Set());
  const failedJobs = variants.map((variant) => ({ variant, job: latest(jobs, variant.id) })).filter(({ job }) => job?.status === "failed");
  const visibleFailure = failedJobs.find(({ job }) => job && !dismissedFailures.has(job.id));
  const readyCount = s.approved + s.waiting;
  // Progress only while something is actually being made; a short success note replaces it when done.
  const inProgress = s.building + s.rebuilding;
  const activeVariant = variants.find((_, i) => ["queued", "building", "rebuilding"].includes(states[i]!));
  const activeJob = activeVariant ? latest(jobs, activeVariant.id) : undefined;
  const wasBusy = useRef(false);
  const [justDone, setJustDone] = useState(false);
  useEffect(() => {
    if (inProgress > 0) { wasBusy.current = true; setJustDone(false); return; }
    if (!wasBusy.current) return;
    wasBusy.current = false;
    setJustDone(true);
    const t = setTimeout(() => setJustDone(false), 4000);
    return () => clearTimeout(t);
  }, [inProgress]);
  // Keep the finished batch in view after review so publishing stays the next action.
  const decided = useRef(false);
  const [celebrate, setCelebrate] = useState(false);
  useEffect(() => {
    if (!review || !decided.current || !s.allTriaged) return;
    decided.current = false;
    setCelebrate(true);
    const t = setTimeout(() => setCelebrate(false), 2600);
    return () => clearTimeout(t);
  }, [review, s.allTriaged]);
  const approvedIds = variants.filter((_, i) => states[i] === "approved").map((v) => v.id);
  return (
    <div className="build-in space-y-5">
      <Dialog open={!!visibleFailure} onOpenChange={(open) => { if (!open && visibleFailure?.job) setDismissedFailures((old) => new Set(old).add(visibleFailure.job!.id)); }}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[20px] border-2 border-ink bg-canvas p-0">
          <div className="border-b-2 border-ink bg-surface px-6 py-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-inverse"><AlertCircle className="h-4 w-4" /> AutoSocials</span>
            <DialogTitle className="mt-4 font-display text-[28px] font-bold">A video needs attention</DialogTitle>
            <DialogDescription className="mt-2 text-[14px]">{visibleFailure?.variant.hook || "This video"} could not be completed. Other videos in this set can continue independently. We've recorded the failure for our team.</DialogDescription>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p className="text-[13px]">Your brief and completed scene files are saved. On the failed video's card, choose <b>Retry failed work</b>. You’ll see what may be repeated and confirm before Sam sends new requests.</p>
            {visibleFailure?.job?.error && <details className="rounded-[10px] border border-border-control bg-surface p-3 text-[12px]"><summary className="cursor-pointer font-semibold">Technical details</summary><p className="mt-2 break-words text-muted-foreground">{visibleFailure.job.error}</p></details>}
            <div className="flex justify-end"><button type="button" className={primary} onClick={() => { if (visibleFailure?.job) setDismissedFailures((old) => new Set(old).add(visibleFailure.job!.id)); }}>View videos</button></div>
          </div>
        </DialogContent>
      </Dialog>
      {celebrate && (
        <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-canvas/85 backdrop-blur-sm build-in">
          <div className="flex flex-col items-center gap-4 text-center">
            <ApprovedStamp size={132} />
            <p className="font-display text-[28px] font-bold tracking-tight">{s.approved === 1 ? "Asset approved" : "Assets approved"}</p>
            <p className="text-[14px] text-muted-foreground">{s.approved} asset{s.approved === 1 ? "" : "s"} in Ready to Publish.</p>
          </div>
        </div>
      )}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[24px] font-bold tracking-tight">{review ? "Review & approve" : "Sam is in the studio"}</h2>
          <p className="mt-1 max-w-2xl text-[14px] text-muted-foreground">
            {review ? "Review each asset before sending it to Publish as a draft, set up but not posted. Ask for edits on anything else and Sam rebuilds it." : "Each asset appears here the moment it's finished. Press play to preview. You can leave this page — production keeps going."}
          </p>
        </div>
        <p className="text-[13px]"><b className="tabular-nums">{s.approved}</b> approved · <b className="tabular-nums">{s.rebuilding}</b> rebuilding · <b className="tabular-nums">{s.building}</b> in production · <b className="tabular-nums">{s.waiting}</b> awaiting review{s.failed ? <> · <b className="tabular-nums">{s.failed}</b> failed</> : null}</p>
      </header>
      {inProgress > 0 && (
        <div className="space-y-3">
          <CreativeProgress phase="rendering" count={variants.length} titles={variants.map((v) => v.narrative || v.hook)} readyCount={readyCount} activeCount={inProgress} />
          {activeVariant && <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-border-control bg-surface px-4 py-3">
            <div><p className="text-sm font-semibold">See what Sam is making</p><p className="mt-1 text-xs text-muted-foreground">The full prompt, selected references and provider steps.</p></div>
            <VideoPlanDrawer variantId={activeVariant.id} renderId={activeJob?.id} status={activeJob?.status} phase={activeJob?.phase} prominent />
          </div>}
        </div>
      )}
      {!review && justDone && (
        <div role="status" className={cn("build-in flex items-center gap-2 rounded-[14px] border-2 px-4 py-3 text-[14px] font-semibold", s.failed ? "border-border-control bg-surface text-ink" : "border-success bg-success/10 text-success")}>
          <CheckCircle2 className="h-5 w-5" />{s.failed ? `${readyCount} awaiting review · ${s.failed} failed. Videos are available below.` : `Asset${readyCount > 1 ? "s" : ""} created successfully`}
        </div>
      )}
      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {variants.map((v, i) => <Tile key={v.id} ws={ws} v={v} n={i + 1} job={latest(jobs, v.id)} state={states[i]!} review={review} onRefresh={onRefresh} onDecided={() => { decided.current = true; }} />)}
      </div>
      <footer className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t-2 border-ink bg-canvas px-4 py-3 shadow-lg md:-mx-6 md:px-6">
        {s.approved > 0 && <Link to="/app/create" search={{ stage: "ready", format: "video" }} className={ghost}>Open Ready to Publish</Link>}
        {approvedIds.length > 1 && <button type="button" className={ghost} onClick={() => setShareAll(true)}><Share2 className="h-4 w-4" />Share all approved</button>}
        <ShareDialog ws={ws} variantIds={approvedIds} title="New videos" open={shareAll} onOpenChange={setShareAll} />
        {review && s.allTriaged && <span className="text-[13px] font-semibold">Every asset has a decision — approved ones are waiting in Publish.</span>}
        <div className="ml-auto flex gap-2">
          {review && onNew && <button type="button" className={s.allTriaged ? primary : ghost} onClick={onNew}>Make another</button>}
          {!review && onNext && <button type="button" className={cn(primary, "h-11 px-6 text-[14px] font-semibold")} disabled={!states.some((x) => x === "ready" || x === "approved")} onClick={onNext}>Review assets →</button>}
        </div>
      </footer>
    </div>
  );
}

function Tile({ ws, v, n, job, state, review, onRefresh, onDecided }: { ws: string; v: Variant; n: number; job: Job | undefined; state: TileState; review: boolean; onRefresh: () => Promise<void>; onDecided: () => void }) {
  const videoStyle = readVideoStyle(v.production_plan);
  const playback = useServerFn(getRenderPlayback);
  const approve = useServerFn(reviewVariant);
  const send = useServerFn(sendToPublish);
  const retry = useServerFn(retryFailedProduction);
  const getRetryQuote = useServerFn(getRetryProductionQuote);
  const revise = useServerFn(reviseVariant);
  const del = useServerFn(deleteVariant);
  const [askDel, setAskDel] = useState(false);
  const [askRetry, setAskRetry] = useState(false);
  const retryQuote = useQuery({ queryKey: ["retry-production-quote", v.id, job?.id], enabled: askRetry && !!job?.id, retry: false, queryFn: () => getRetryQuote({ data: { variant_id: v.id, render_id: job!.id } }) });
  const [url, setUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [full, setFull] = useState(false);
  const [sharing, setSharing] = useState(false);
  const dl = useServerFn(downloadVideo);
  const downloadLink = useQuery({
    queryKey: ["video-download", ws, v.id, v.primary_render_id ?? job?.id],
    queryFn: () => dl({ data: { id: v.id } }),
    enabled: job?.status === "done",
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
  const downloadControl = (className: string) => downloadLink.data?.url
    ? <a aria-label="Download" title="Download video" href={downloadLink.data.url} download rel="noopener noreferrer" target="_blank" className={className} onClick={() => toast.info("Download requested", { description: "Check your browser’s downloads for progress." })}><Download className="h-4 w-4" /></a>
    : <button type="button" aria-label={downloadLink.isError ? "Retry preparing download" : "Preparing download"} title={downloadLink.isError ? "Retry preparing download" : "Preparing download…"} disabled={!downloadLink.isError} onClick={() => void downloadLink.refetch()} className={className}>{downloadLink.isError ? <Download className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}</button>;
  const [w, h] = v.size.split("x").map(Number);
  const aspect = `${w} / ${h}`;
  const path = job?.status === "done" ? job.storage_path : null;

  useEffect(() => {
    if (!path) { setUrl(null); return; }
    if (path.startsWith("autotoast:")) { void playback({ data: { workspace_id: ws, media_id: path.slice(10) } }).then((r) => setUrl(r.url)).catch(() => setUrl(null)); return; }
    void supabase.storage.from("brand-assets-private").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [path, ws, playback]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); await onRefresh(); if (ok) toast.success(ok); }
    catch (e) { toast.error(errMsg(e, "Something went wrong")); }
    finally { setBusy(false); }
  }

  const quality = qualityApprovalProblem({ technicalStatus: job?.technical_status ?? "unverified", creativeStatus: job?.creative_status ?? "unverified", frameQa: job?.frame_qa, qaIssues: job?.qa_issues });
  const doApprove = () => {
    if (quality.problem) { toast.error(quality.problem); return; }
    void run(async () => { await approve({ data: { id: v.id, state: "approved", ...(job ? { render_id: job.id } : {}) } }); await send({ data: { workspace_id: ws, variant_ids: [v.id] } }); onDecided(); setFull(false); }, "Approved — it's waiting in Publish.");
  };
  const building = state === "queued" || state === "building" || state === "rebuilding";
  return (
    <>
    {full && url && (
      <div role="dialog" aria-label={v.hook} className="fixed inset-0 z-50 flex flex-col bg-ink/95 text-inverse backdrop-blur" onClick={() => setFull(false)}>
        <header className="flex items-center gap-3 px-5 py-3" onClick={(e) => e.stopPropagation()}>
          <div className="min-w-0 flex-1"><p className="truncate font-display text-[15px] font-bold">Asset {n} · {v.hook}</p><p className="text-[12px] opacity-70">{v.duration_s}s · {v.size}{v.planned_for ? ` · ${fmtDay(v.planned_for)}` : ""}</p></div>
          {review && state === "ready" && <>
            <button type="button" className="rounded-[10px] bg-inverse px-4 py-2 text-[14px] font-semibold text-ink disabled:opacity-40" disabled={busy || Boolean(quality.problem)} title={quality.problem ?? "Approve after watching and listening to this video"} onClick={doApprove}>Approve</button>
            <button type="button" className="rounded-[10px] border border-inverse/40 px-4 py-2 text-[14px] font-semibold" onClick={() => { setFull(false); setEditing(true); }}>Edit</button>
          </>}
          <button type="button" aria-label="Share" onClick={() => setSharing(true)} className="rounded-full p-2 hover:bg-inverse/10"><Share2 className="h-5 w-5" /></button>
          {downloadControl("rounded-full p-2 hover:bg-inverse/10")}
          <button type="button" aria-label="Close" onClick={() => setFull(false)} className="rounded-full p-2 hover:bg-inverse/10"><X className="h-5 w-5" /></button>
        </header>
        <p className="px-5 pb-2 text-[12px] opacity-80">{quality.problem ?? quality.limitation}</p>
        <div className="flex min-h-0 flex-1 items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
          <div className="max-h-full max-w-full overflow-hidden rounded-[18px]" style={{ aspectRatio: aspect, height: w! < h! ? "100%" : "auto", width: w! < h! ? "auto" : "100%" }}><BrandedVideo fill src={url} name={v.hook} /></div>
        </div>
      </div>
    )}
    <AlertDialog open={askDel} onOpenChange={setAskDel}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Delete this asset?</AlertDialogTitle>
          <AlertDialogDescription>"{v.hook}" and its videos will be removed. Drafts already in Publish stay. This can't be undone.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction className={primary} onClick={() => void run(() => del({ data: { id: v.id } }), "Asset deleted.")}>Delete</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={askRetry} onOpenChange={setAskRetry}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Retry this failed video?</AlertDialogTitle>
          <AlertDialogDescription>{retryQuote.isPending ? "Checking the cost of unfinished work…" : retryQuote.isError ? "A safe retry quote is unavailable. Check the original production before retrying." : `Retrying unfinished work costs ${retryQuote.data.creditCost} credits. Completed scene files will be reused.`}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep failed attempt</AlertDialogCancel>
          <AlertDialogAction disabled={busy || !job || !retryQuote.data || retryQuote.isFetching || retryQuote.isError} onClick={() => { if (job && retryQuote.data) { const quote = retryQuote.data; void run(() => retry({ data: { variant_id: v.id, render_id: job.id, confirmed: true, expected_version: quote.creditVersion, expected_credits: quote.creditCost, expected_lines: quote.creditLines, expected_completed_step_ids: quote.completedStepIds } }), "Sam is retrying the failed work."); } setAskRetry(false); }}>Confirm retry</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    <ShareDialog ws={ws} variantIds={[v.id]} title={v.hook} open={sharing} onOpenChange={setSharing} />
    <article style={{ maxWidth: `max(280px, calc(min(60vh, 520px) * ${w} / ${h}))` }} className="build-in relative min-w-0 justify-self-start flex h-full w-full flex-col overflow-hidden rounded-[16px] border-2 border-ink bg-surface">
      {state === "approved" && <div className="pointer-events-none absolute right-2 top-2 z-20"><ApprovedStamp size={84} /></div>}
      {state === "rebuilding" && <span className="absolute right-0 top-3 z-20 rounded-l-full bg-ink px-3 py-1 text-[12px] font-bold text-inverse">Rebuilding v{v.version}</span>}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: aspect }}>
        {building ? <BuildAnimation beats={beatsOf(v)} status={job?.status} phase={job?.phase} aspect={aspect} createdAt={job?.created_at} startedAt={job?.started_at ?? job?.created_at} durationS={v.duration_s} reported={job?.progress} label={state === "rebuilding" ? "Sam is rebuilding" : undefined} />
          : url ? <><BrandedVideo fill src={url} name={v.hook} />
            <div className="absolute left-2 top-2 z-10 flex gap-1.5">
              {[{ l: "Full screen", i: Maximize2, f: () => setFull(true) }, { l: "Share", i: Share2, f: () => setSharing(true) }].map(({ l, i: I, f }) => (
                <button key={l} type="button" aria-label={l} title={l} onClick={f} className="grid h-8 w-8 place-items-center rounded-full bg-canvas/90 text-foreground shadow-sm hover:bg-canvas"><I className="h-4 w-4" /></button>
              ))}
              {downloadControl("grid h-8 w-8 place-items-center rounded-full bg-canvas/90 text-foreground shadow-sm hover:bg-canvas disabled:opacity-60")}
            </div></>
          : state === "failed" ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 bg-surface-subtle p-4 text-center" style={{ aspectRatio: aspect }}>
              <p className="text-[13px] font-semibold">{busy ? "Starting again…" : "This one didn't render"}</p>
              {!busy && <p className="text-[12px] text-muted-foreground">The brief is saved. Open technical details in the failure notice or review before retrying.</p>}
              <button type="button" className={primary} disabled={busy || !job} onClick={() => setAskRetry(true)}>{busy ? "Retrying…" : "Retry failed work"}</button>
            </div>
          ) : <div className="grid h-full place-items-center bg-surface-subtle text-[12px] text-muted-foreground" style={{ aspectRatio: aspect }}>{state === "brief" ? "Not started" : "Loading preview…"}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-2 border-t-2 border-ink p-3 text-[13px]">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          <span>Asset {n}</span><span>·</span><span>{v.duration_s}s</span><span>·</span><span className="tabular-nums">{v.size}</span>{v.planned_for && <span className="ml-auto normal-case">{fmtDay(v.planned_for)}</span>}
          <button type="button" aria-label="Delete asset" title="Delete asset" disabled={busy} className={cn("grid h-7 w-7 place-items-center rounded-full text-destructive hover:bg-surface-subtle", !v.planned_for && "ml-auto")}
            onClick={() => setAskDel(true)}><Trash2 className="h-4 w-4" /></button>
        </div>
        <p className="font-semibold leading-snug">{v.hook}</p>
        {v.narrative && <p className="text-[12px] text-muted-foreground">{v.narrative}</p>}
        {videoStyle && <p className="text-[11px] font-semibold text-muted-foreground">{videoStyle.name} · {styleEngineLabel(videoStyle)}</p>}
        {v.design_mode === "simple" && <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Simple version · Sam's custom design didn't pass checks</p>}
        {v.design_mode === "failed" && <p className="text-[11px] font-semibold uppercase tracking-wide text-destructive">Needs fixing · didn't pass Sam's quality checks</p>}
        {review && state === "ready" && !editing && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button type="button" className={cn(primary, "py-2.5 text-[14px] font-semibold")} disabled={busy || Boolean(quality.problem)} title={quality.problem ?? "Approve after watching and listening to this video"}
              onClick={doApprove}>Approve</button>
            <button type="button" className={cn(ghost, "py-2.5 text-[14px] font-semibold")} disabled={busy} onClick={() => setEditing(true)}>Edit</button>
          </div>
        )}
        {editing && (
          <form className="space-y-2 pt-1" onSubmit={(e) => { e.preventDefault(); if (note.trim().length > 1) void run(async () => { await revise({ data: { id: v.id, note, rebuild: true } }); setEditing(false); setNote(""); }, "Sam is rebuilding it."); }}>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus aria-label="What should change?" placeholder="What should change?" className={cn(field, "resize-none")} />
            <div className="flex gap-2">
              <button type="submit" className={cn(primary, "flex-1")} disabled={busy || note.trim().length < 2}>{busy ? "Sending…" : "Rebuild"}</button>
              <button type="button" className={ghost} onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        )}
        {state === "approved" && <p className="pt-1 text-[12px] font-semibold">Sent to Publish as a draft{v.planned_for ? ` for ${fmtDay(v.planned_for)}` : ", ready to schedule"} — not posted.</p>}
        <VideoPlanDrawer variantId={v.id} renderId={job?.id} status={job?.status} phase={job?.phase} qualityDetails={job ? <QualityReview job={job} humanStatus={state === "approved" ? "approved" : v.review_state === "needs_revision" ? "needs_revision" : "draft"} /> : undefined} />
      </div>
    </article>
    </>
  );
}
