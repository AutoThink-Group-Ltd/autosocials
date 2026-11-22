import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUp, Check, CheckCircle2, Download, History, LifeBuoy, Loader2, RefreshCw, Sparkles, Star, X } from "lucide-react";
import { toast } from "sonner";
import samPortrait from "@/assets/sam-portrait.jpg";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getAssetVersionPlayback, getAssetVersions, setPrimaryAssetVersion } from "@/lib/asset-versions.functions";
import { refreshRenders, reviseVariant, startRender } from "@/lib/creative.functions";
import { requestAiSupport } from "@/lib/openai-support.functions";
import { cn } from "@/lib/utils";
import { BuildAnimation } from "./BuildAnimation";
import { errMsg, field, ghost, primary } from "./shared";

type Version = {
  id: string; version: number | null; status: string; phase: string | null; progress: number | null;
  error: string | null; created_at: string; started_at: string | null; revision_note: string | null;
  is_primary: boolean; has_snapshot: boolean; hook: string; size: string; duration_s: number;
};

type Props = {
  ws: string;
  assetId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => Promise<void>;
};

const ACTIVE = new Set(["queued", "preparing", "rendering"]);
const versionLabel = (version: Version) => `Version ${version.version ?? 1}`;
const statusLabel = (status: string) => status === "done" ? "Exported" : status === "failed" ? "Needs attention" : status === "queued" ? "Queued" : "In progress";
const phaseLabel = (version: Version | undefined) => version?.status === "queued" ? "Waiting for a studio slot…" : version?.phase === "designing" ? "Reworking your story and composition…" : version?.phase === "checking" ? "Checking the layout, timing and media…" : version?.status === "rendering" ? "Rendering your new video…" : "The studio is rebuilding your video…";
const dateLabel = (value: string) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** A version-safe editing studio: revisions become candidates until the user chooses a primary. */
export function AssetEditor({ ws, assetId, open, onOpenChange, onChanged }: Props) {
  const versionsFn = useServerFn(getAssetVersions);
  const playbackFn = useServerFn(getAssetVersionPlayback);
  const revise = useServerFn(reviseVariant);
  const choosePrimary = useServerFn(setPrimaryAssetVersion);
  const refresh = useServerFn(refreshRenders);
  const retryRender = useServerFn(startRender);
  const support = useServerFn(requestAiSupport);
  const qc = useQueryClient();
  const changed = useRef(onChanged);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const polling = useRef(false);
  const context = useRef(`${ws}:${assetId}`);
  const video = useRef<HTMLVideoElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [submittedNote, setSubmittedNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [quotaSupport, setQuotaSupport] = useState(false);
  const [supportSent, setSupportSent] = useState(false);
  const [supportSending, setSupportSending] = useState(false);
  const [playbackSlow, setPlaybackSlow] = useState(false);
  const [videoProblem, setVideoProblem] = useState<string | null>(null);

  useEffect(() => { changed.current = onChanged; }, [onChanged]);
  useEffect(() => {
    context.current = `${ws}:${assetId}`;
    setSelectedId(null); setNote(""); setSubmittedNote(null); setRequestError(null); setPollError(null);
    setSubmitting(false); setChoosing(false);
    setQuotaSupport(false); setSupportSent(false); setVideoProblem(null); setPlaybackSlow(false);
  }, [assetId, ws]);

  const history = useQuery({
    queryKey: ["asset-versions", ws, assetId], enabled: open,
    queryFn: async () => {
      const result = await versionsFn({ data: { id: assetId } });
      if (result.asset.workspace_id !== ws) throw new Error("This asset belongs to another workspace.");
      return result;
    },
  });
  const versions = (history.data?.versions ?? []) as Version[];
  const originalId = versions.filter((version) => version.status === "done").reduce<Version | undefined>((first, version) => !first || version.created_at < first.created_at ? version : first, undefined)?.id;
  const asset = history.data?.asset;
  const selected = versions.find((version) => version.id === selectedId)
    ?? versions.find((version) => version.is_primary)
    ?? versions.find((version) => version.status === "done")
    ?? versions[0];
  const inFlight = versions.some((version) => ACTIVE.has(version.status));
  const selectedActive = !!selected && ACTIVE.has(selected.status);
  const busy = submitting || inFlight;
  const sourceCanEdit = !!selected && selected.status === "done" && selected.has_snapshot;
  const refetchHistory = history.refetch;

  useEffect(() => {
    if (!open || busy || !sourceCanEdit) return;
    const timer = window.setTimeout(() => noteInput.current?.focus(), 200);
    return () => window.clearTimeout(timer);
  }, [open, assetId, busy, sourceCanEdit]);

  useEffect(() => {
    if (!open || !inFlight) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (polling.current) { timer = setTimeout(() => void tick(), 8000); return; }
      polling.current = true;
      try {
        await refresh({ data: { workspace_id: ws } });
        const result = await refetchHistory();
        if (result.error) throw result.error;
        if (!stopped) setPollError(null);
        if (result.data && !result.data.versions.some((version) => ACTIVE.has(version.status))) {
          await qc.invalidateQueries({ queryKey: ["asset-gallery", ws] });
          await changed.current();
        }
      } catch {
        if (!stopped) setPollError("The studio is taking a little longer to respond. Your primary version is safe; I’ll keep checking.");
      } finally {
        polling.current = false;
        if (!stopped) timer = setTimeout(() => void tick(), 8000);
      }
    };
    timer = setTimeout(() => void tick(), 1500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [open, inFlight, ws, refresh, refetchHistory, qc]);

  const playback = useQuery({
    queryKey: ["asset-version-playback", ws, assetId, selected?.id],
    enabled: open && !!selected && selected.status === "done",
    staleTime: 25 * 60 * 1000,
    queryFn: async () => {
      const result = await playbackFn({ data: { id: assetId, render_id: selected!.id } });
      if (!result.url) throw new Error("The video preview is temporarily unavailable.");
      return result;
    },
  });

  useEffect(() => {
    setPlaybackSlow(false); setVideoProblem(null);
    if (!open || !selected || selected.status !== "done") return;
    const timer = window.setTimeout(() => {
      if (!playback.data?.url) setPlaybackSlow(true);
      else if (video.current && video.current.readyState < 2) setVideoProblem("This preview is taking longer than expected. Try it again or download this version.");
    }, 20000);
    return () => window.clearTimeout(timer);
  }, [open, selected?.id, selected?.status, playback.data?.url, playback.dataUpdatedAt]);

  async function applyChanges() {
    if (!sourceCanEdit || busy || choosing || note.trim().length < 2 || !selected) return;
    const changeRequest = note.trim();
    const requestContext = `${ws}:${assetId}`;
    setSubmitting(true); setRequestError(null); setSubmittedNote(changeRequest);
    setQuotaSupport(false); setSupportSent(false);
    try {
      const result = await revise({ data: { id: assetId, note: changeRequest, rebuild: true, source_render_id: selected.id } });
      if (context.current !== requestContext) return;
      const latest = await refetchHistory();
      if (context.current !== requestContext) return;
      setSelectedId(result.render_id ?? latest.data?.versions[0]?.id ?? selected.id);
      setNote("");
      await changed.current();
    } catch (error) {
      if (context.current !== requestContext) return;
      const message = errMsg(error, "I couldn’t start that edit. Your existing versions are safe. Please try again.");
      const quota = /ai_quota_exhausted|run out of credits|insufficient_quota/i.test(message);
      setQuotaSupport(quota);
      setRequestError(quota ? "Sam is temporarily unavailable. Your saved videos are safe. Send a support request and we’ll help you continue." : message);
      await refetchHistory();
    } finally { if (context.current === requestContext) setSubmitting(false); }
  }

  async function requestSupport() {
    if (supportSent || supportSending) return;
    setSupportSending(true);
    try { await support({ data: {} }); setSupportSent(true); }
    catch { toast.error("Couldn’t send the support request. Please email info@autosocials.com."); }
    finally { setSupportSending(false); }
  }

  function selectVersion(id: string) {
    setSelectedId(id); setSubmittedNote(null); setRequestError(null); setQuotaSupport(false);
  }

  async function makePrimary() {
    if (!selected || selected.status !== "done" || selected.is_primary || choosing || busy) return;
    const requestContext = `${ws}:${assetId}`;
    setChoosing(true); setRequestError(null);
    try {
      await choosePrimary({ data: { id: assetId, render_id: selected.id } });
      if (context.current !== requestContext) return;
      await refetchHistory(); await changed.current();
      toast.success(`${versionLabel(selected)} is now the primary version.`);
    } catch (error) { if (context.current === requestContext) setRequestError(errMsg(error, "Couldn’t change the primary version. Please try again.")); }
    finally { if (context.current === requestContext) setChoosing(false); }
  }

  async function retry() {
    if (!selected || !asset || busy || selected.version !== asset.version) return;
    const requestContext = `${ws}:${assetId}`;
    setSubmitting(true); setRequestError(null);
    try {
      await retryRender({ data: { variant_id: assetId } });
      if (context.current !== requestContext) return;
      const result = await refetchHistory();
      if (context.current !== requestContext) return;
      setSelectedId(result.data?.versions[0]?.id ?? selected.id);
      await changed.current();
    } catch (error) { if (context.current === requestContext) setRequestError(errMsg(error, "I couldn’t restart this version. Please try again.")); }
    finally { if (context.current === requestContext) setSubmitting(false); }
  }

  const title = selected?.hook || asset?.hook || "Edit asset";
  const dimensions = (selected?.size ?? asset?.size ?? "1080x1920").split("x").map(Number);
  const aspect = `${dimensions[0] || 1080} / ${dimensions[1] || 1920}`;
  const duration = selected?.duration_s ?? asset?.duration_s ?? 30;
  const working = submitting || selectedActive;
  const samMessage = submitting
    ? "I’m applying your changes to a new version. I’ll keep your primary video safe while I work."
    : selectedActive
      ? "I’m rebuilding your video now. The studio is applying your changes to the visuals, timing and voice."
      : selected?.status === "failed"
        ? "This version needs attention. Your earlier versions are still here, and you can try the render again."
        : selected && !selected.is_primary && selected.status === "done"
          ? "This version was exported. Watch and check its quality, then make it primary if it’s the one you want to use."
          : "What would you like me to change? Tell me about the words, visuals, pacing or voice.";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="inset-0 left-0 top-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 bg-canvas p-0 sm:rounded-none [&>button]:hidden" aria-describedby="asset-editor-description">
        <header className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3 md:px-6">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-ink text-inverse"><Sparkles className="h-4 w-4" /></span>
          <div className="min-w-0 flex-1"><DialogTitle className="truncate font-display text-[17px] font-bold leading-normal">{title}</DialogTitle><DialogDescription id="asset-editor-description" className="text-[12px]">Edit with Sam · Every saved version stays in your history</DialogDescription></div>
          {selected?.is_primary && <span className="hidden items-center gap-1.5 rounded-full bg-success/10 px-3 py-1 text-[12px] font-semibold text-success sm:inline-flex"><Star className="h-3.5 w-3.5 fill-current" />Primary version</span>}
          <button type="button" className={ghost} onClick={() => onOpenChange(false)} aria-label="Close editor"><X className="h-4 w-4" /><span className="hidden sm:inline">Close</span></button>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_390px] lg:overflow-hidden xl:grid-cols-[minmax(0,1fr)_430px]">
          <section className="flex min-h-[55dvh] min-w-0 flex-col bg-ink text-inverse lg:min-h-0" aria-label="Video and versions">
            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 md:p-6">
              {working ? (
                <div className="relative grid w-full max-w-xl gap-5">
                  <div className="pointer-events-none absolute -inset-8 rounded-full border border-inverse/10 build-orbit" aria-hidden />
                  <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-full bg-inverse text-ink"><Sparkles className="h-5 w-5 animate-pulse" /></span><div><p className="font-display text-[22px] font-bold">{submitting ? "Sam is shaping your edit" : "Your new version is taking shape"}</p><p className="mt-1 text-[13px] text-inverse/70">{submitting ? "Reading your notes and planning the changes…" : phaseLabel(selected)}</p></div></div>
                  <div className="overflow-hidden rounded-[20px] border border-inverse/20 shadow-2xl">
                    {submitting ? <PlanningAnimation /> : <BuildAnimation beats={["Applying your feedback", "Rebuilding the composition", "Preparing your new video"]} status={selected?.status} aspect="16 / 10" label="Sam is editing" startedAt={selected?.started_at ?? selected?.created_at} durationS={duration} reported={selected?.progress} />}
                  </div>
                  <p className="text-center text-[12px] text-inverse/70">Your primary version stays unchanged until you choose another one.</p>
                </div>
              ) : selected?.status === "done" ? (
                playback.data?.url && !videoProblem ? <video ref={video} key={selected.id} src={`${playback.data.url}${playback.data.url.includes("#") ? "" : "#t=0.1"}`} controls playsInline preload="metadata" className="h-[55dvh] w-full max-h-[65dvh] rounded-[12px] object-contain shadow-2xl lg:h-full lg:max-h-full" style={{ aspectRatio: aspect }} aria-label={`Preview ${versionLabel(selected)}`} onError={() => setVideoProblem("This preview couldn’t be played. Try it again or download this version.")} />
                  : <div className="max-w-sm space-y-3 p-8 text-center"><Loader2 className={cn("mx-auto h-7 w-7", playback.isPending && !playbackSlow && "animate-spin")} /><p className="text-[14px]">{videoProblem || (playback.error ? "The preview is temporarily unavailable." : playbackSlow ? "Opening the video is taking longer than expected." : "Opening your video…")}</p>{(playback.error || playbackSlow || videoProblem) && <button type="button" className="text-[13px] underline" onClick={() => { setVideoProblem(null); void playback.refetch(); }}>Try preview again</button>}</div>
              ) : selected?.status === "failed" ? (
                <div className="max-w-md rounded-[20px] border border-inverse/20 bg-inverse/5 p-8 text-center"><RefreshCw className="mx-auto h-8 w-8" /><h2 className="mt-4 font-display text-[22px] font-bold">This version needs attention</h2><p className="mt-3 text-[14px] text-inverse/75">{selected.error || "The studio couldn’t finish this render."}</p>{selected.version === asset?.version && <button type="button" className="mt-5 rounded-[10px] bg-inverse px-4 py-2.5 text-[14px] font-semibold text-ink" onClick={() => void retry()}>Try this render again</button>}</div>
              ) : <div className="p-8 text-center text-[14px] text-inverse/70">{history.isPending ? "Opening the editing studio…" : "Choose a saved video version below to preview it."}</div>}
            </div>

            <div className="shrink-0 border-t border-inverse/15 bg-inverse/5 px-4 py-4 md:px-6">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]"><History className="h-4 w-4" /><b>Version history</b><span className="text-inverse/60">Choose a version to compare</span>{selected?.status === "done" && playback.data?.download_url && <a className="ml-auto inline-flex items-center gap-1.5 text-inverse/85 underline underline-offset-2" href={playback.data.download_url} download rel="noopener"><Download className="h-3.5 w-3.5" />Download this version</a>}</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {versions.map((version) => <button key={version.id} type="button" onClick={() => selectVersion(version.id)} aria-pressed={selected?.id === version.id} className={cn("w-48 shrink-0 rounded-[12px] border px-3 py-2.5 text-left transition-colors", selected?.id === version.id ? "border-inverse bg-inverse text-ink" : "border-inverse/20 bg-inverse/5 hover:bg-inverse/10")}><span className="flex items-center justify-between gap-2 text-[13px] font-bold">{versionLabel(version)}{version.is_primary && <Star className="h-3.5 w-3.5 fill-current" aria-label="Primary version" />}</span><span className={cn("mt-1 block text-[11px]", selected?.id === version.id ? "text-ink/65" : "text-inverse/60")}>{version.id === originalId ? "Original · " : ""}{statusLabel(version.status)} · {dateLabel(version.created_at)}</span>{version.revision_note && <span className="mt-1.5 line-clamp-1 text-[11px]">{version.revision_note}</span>}</button>)}
                {!history.isPending && !versions.length && <p className="py-2 text-[13px] text-inverse/60">No saved video versions yet.</p>}
              </div>
            </div>
          </section>

          <aside className="flex min-h-0 flex-col border-l border-border bg-canvas" aria-label="Edit with Sam">
            <div className="flex items-center gap-3 border-b border-border px-5 py-4"><img src={samPortrait} alt="Sam" className="h-12 w-12 rounded-full border-2 border-canvas object-cover ring-1 ring-border-control" /><div><h2 className="font-display text-[18px] font-bold">Sam’s editing studio</h2><p className="mt-0.5 flex items-center gap-1.5 text-[12px] text-muted-foreground"><span className="h-1.5 w-1.5 rounded-full bg-success" />Here to help you make it right</p></div></div>
            <div className="min-h-0 flex-1 space-y-4 p-5 lg:overflow-y-auto">
              <div className="rounded-[16px] rounded-tl-[4px] border border-border-control bg-surface px-4 py-3"><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Sam</p><p className="text-[15px] leading-relaxed">{samMessage}</p></div>
              {(submittedNote || selected?.revision_note) && <div className="ml-5 rounded-[16px] rounded-tr-[4px] bg-ink px-4 py-3 text-inverse"><p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-inverse/60">Your changes</p><p className="whitespace-pre-wrap text-[14px] leading-relaxed">{submittedNote || selected?.revision_note}</p></div>}
              {selected?.status === "done" && <div className={cn("rounded-[14px] border p-4", selected.is_primary ? "border-success/30 bg-success/5" : "border-border-control bg-surface-subtle")}><div className="flex items-center gap-2 text-[13px] font-semibold">{selected.is_primary ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Star className="h-4 w-4" />}{selected.is_primary ? "This is your primary version" : "Review this version"}</div><p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">{selected.is_primary ? "Downloads and share links use this version. You can choose any saved version again." : "Make it primary to use this version for downloads and sharing. Your other versions stay saved."}</p>{!selected.is_primary && <button type="button" className={cn(primary, "mt-3 w-full justify-center py-2.5")} disabled={choosing || busy} onClick={() => void makePrimary()}>{choosing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}{choosing ? "Updating…" : "Make this the primary version"}</button>}</div>}
              {selected?.status === "done" && !selected.has_snapshot && <p className="rounded-[12px] border border-border-control p-3 text-[12px] leading-relaxed text-muted-foreground">You can watch and make this earlier video primary. Its original editable brief wasn’t saved, so choose a newer version to request further changes.</p>}
              {(requestError || pollError || history.error) && <div role="alert" className="rounded-[12px] border border-destructive/30 bg-destructive/5 px-4 py-3 text-[13px] leading-relaxed"><p>{requestError || pollError || errMsg(history.error, "I couldn’t load the version history. Please try again.")}</p>{history.error && <button type="button" className="mt-2 underline" onClick={() => void refetchHistory()}>Try again</button>}</div>}
              {quotaSupport && <button type="button" className={cn(ghost, "w-full justify-center py-2.5")} disabled={supportSent || supportSending} onClick={() => void requestSupport()}>{supportSent ? <CheckCircle2 className="h-4 w-4" /> : <LifeBuoy className="h-4 w-4" />}{supportSent ? "Support request sent" : supportSending ? "Sending request…" : "Send a support request"}</button>}
              {busy && <div className="flex items-center gap-2 text-[12px] text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />{submitting ? "Sam is working through your notes…" : "Checking the studio for progress…"}</div>}
            </div>

            <form className="shrink-0 border-t border-border bg-surface px-5 py-4" onSubmit={(event) => { event.preventDefault(); void applyChanges(); }}>
              <label htmlFor="asset-revision-note" className="mb-2 block text-[13px] font-semibold">What should I change?</label>
              <textarea ref={noteInput} id="asset-revision-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} disabled={busy || !sourceCanEdit || choosing} className={cn(field, "min-h-28 resize-none bg-canvas text-[14px] leading-relaxed disabled:opacity-60")} placeholder="For example: make the opening punchier, slow down the captions, and finish with our website." />
              <div className="mt-2 flex items-center justify-between gap-3"><p className="text-[11px] text-muted-foreground">A new version is saved for every edit.</p><span className="text-[11px] tabular-nums text-muted-foreground">{note.length}/1000</span></div>
              <button type="submit" className={cn(primary, "mt-3 w-full justify-center py-3 text-[14px] font-semibold")} disabled={busy || choosing || !sourceCanEdit || note.trim().length < 2}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}{submitting ? "Sam is applying your changes…" : inFlight ? "Your edit is in progress" : requestError ? "Try these changes again" : "Apply changes with Sam"}</button>
            </form>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PlanningAnimation() {
  return (
    <div className="relative overflow-hidden bg-surface-subtle p-6 text-ink" role="status" aria-label="Sam is planning your changes">
      <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border-2 border-dashed border-ink/15 build-orbit" aria-hidden />
      <div className="relative grid gap-3 py-5">
        {["Reading your feedback", "Reworking the story and design", "Preparing the studio"].map((label, index) => <div key={label} className="build-rise flex items-center gap-3 rounded-[12px] border-2 border-ink bg-canvas p-4" style={{ animationDelay: `${index * 0.25}s` }}><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-inverse"><Sparkles className="h-4 w-4 animate-pulse" /></span><div className="min-w-0 flex-1"><p className="text-[13px] font-semibold">{label}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="build-draw h-full bg-ink" style={{ animationDelay: `${index * 0.4}s` }} /></div></div></div>)}
      </div>
      <div className="flex h-8 items-end gap-1" aria-hidden>{Array.from({ length: 28 }, (_, index) => <span key={index} className="build-wave h-full flex-1 rounded-full bg-ink/65" style={{ animationDelay: `${(index % 7) * 0.13}s` }} />)}</div>
      <p className="mt-4 text-center text-[12px] text-muted-foreground">Sam is planning the edit before the render begins.</p>
    </div>
  );
}
