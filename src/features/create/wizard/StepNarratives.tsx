import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { clearNarrativesForFreshStart, getNarrativePlanningJob, moreNarratives, planFromNarratives } from "@/lib/creative.functions";
import { MAX_ASSETS_PER_BATCH, NEW_BATCH_SIZES } from "@/lib/content-rules";
import { videoStyleForNarrative } from "@/lib/video-styles";
import { QuickOptions } from "./QuickOptions";
import { seedSpecs, selectedNarratives, type AssetSpec, type Narrative } from "@/lib/wizard";
import { NarrativeLibrary, type NarrativeLibraryItem } from "./NarrativeLibrary";
import { CreativeProgress } from "./CreativeProgress";
import { CreationGuide } from "../CreationGuide";
import { CreationContextCards } from "../CreationContextCards";
import { narrativesFromBrief } from "@/lib/creation-entry";
import type { CreationContextMode } from "@/lib/creation-context-mode";

import { cn } from "@/lib/utils";
import { UploadAssetsCard } from "../CreateBatches";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { errMsg, primary } from "./shared";
import { CONTENT_RECIPES, type CreationState } from "@/lib/content-recipes";
import { UnifiedStylePicker, TILE_STYLES } from "./UnifiedStylePicker";

type Props = {
  ws: string; batchId: string; narratives: Narrative[]; library: NarrativeLibraryItem[]; ideating: boolean; autoOptions: boolean;
  onSave: (patch: { narratives?: Narrative[] }) => Promise<void>;
  onRefresh: () => Promise<void>;
  onOptionsExit: () => void;
  onNewIdeaBatch: (batchId: string) => void;
  onCreateIdea: (item: NarrativeLibraryItem) => Promise<void>;
  onCreateSelectedIdeas: (items: NarrativeLibraryItem[]) => Promise<void>;
  onSetIdeaStatus: (item: NarrativeLibraryItem, status: "available" | "rejected" | "binned") => Promise<void>;
  onViewAsset: (item: NarrativeLibraryItem) => void;
};

export function StepNarratives({ ws, batchId, narratives, library, ideating, autoOptions, onOptionsExit, onSave, onRefresh, onNewIdeaBatch, onCreateIdea, onCreateSelectedIdeas, onSetIdeaStatus, onViewAsset }: Props) {
  const more = useServerFn(moreNarratives);
  const clearNarratives = useServerFn(clearNarrativesForFreshStart);
  const plan = useServerFn(planFromNarratives);
  const getPlanningJob = useServerFn(getNarrativePlanningJob);
  const [entryTab, setEntryTab] = useState<"narratives" | "styles">("narratives");
  const [briefOpen, setBriefOpen] = useState(false);
  const [useDna, setUseDna] = useState(true);
  const [savingIdea, setSavingIdea] = useState(false);
  const [requestedCount, setRequestedCount] = useState(1);
  useEffect(() => {
    const start = sessionStorage.getItem(`as:create-entry:${ws}`) ?? "ideas";
    setBriefOpen(start === "brief" || start === "media");
    setEntryTab(start === "style" ? "styles" : "narratives");
    setRequestedCount(Math.min(MAX_ASSETS_PER_BATCH, Math.max(1, Number(sessionStorage.getItem(`as:create-count:${ws}`)) || 1)));
  }, [ws]);
  const [chosenStyle, setChosenStyle] = useState<string | null>(null);
  const [chosenTile, setChosenTile] = useState<string | null>(null);
  useEffect(() => { setChosenStyle(sessionStorage.getItem(`as:video-entry-style:${ws}`)); setChosenTile(sessionStorage.getItem(`as:unified-tile-style:${ws}`)); }, [ws]);
  const qc = useQueryClient();
  const [writing, setWriting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const writingEpoch = useRef(0);
  useEffect(() => {
    const stopped = (event: Event) => {
      if ((event as CustomEvent<{ workspaceId: string }>).detail?.workspaceId !== ws) return;
      writingEpoch.current++;
      setWriting(false);
    };
    window.addEventListener("as:sam-ideation-stopped", stopped);
    return () => window.removeEventListener("as:sam-ideation-stopped", stopped);
  }, [ws]);
  const [planning, setPlanning] = useState(false);
  const [waitingForJob, setWaitingForJob] = useState(false);
  const planningRef = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [dismissedFailureId, setDismissedFailureId] = useState<string | null>(null);
  const [own, setOwn] = useState("");
  useEffect(() => { setOwn(sessionStorage.getItem(`as:create-own-brief:${ws}`) ?? ""); }, [ws]);
  const picked = selectedNarratives(narratives);
  const [specs, setSpecs] = useState<AssetSpec[]>([]);
  const [voice, setVoice] = useState<string>("");
  const [confirming, setConfirming] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const openedBatch = useRef<string | null>(null);
  const pickKey = picked.map((p) => p.title).join("|");
  const count = specs.length;
  const { data: planningJob, isPending: checkingPlanningJob } = useQuery({
    queryKey: ["narrative-planning-job", batchId],
    queryFn: () => getPlanningJob({ data: { batch_id: batchId } }),
    refetchInterval: (query) => ["queued", "running"].includes(query.state.data?.status ?? "") ? 3000 : false,
  });
  const jobActive = planningJob?.status === "queued" || planningJob?.status === "running";
  const failedJobId = planningJob?.status === "failed" ? planningJob.job_id : null;
  const failureOpen = !!localError || (!!failedJobId && failedJobId !== dismissedFailureId);
  useEffect(() => {
    if (planningJob?.status) setWaitingForJob(false);
    if (planningJob?.status === "completed") void onRefresh();
    // Completion is a durable server state. Refresh the persisted wizard stage once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planningJob?.job_id, planningJob?.status]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setSpecs((prev) => seedSpecs(picked, picked.length, prev).map((spec, index) => {
    const saved = (picked[index] as Narrative & { asset_creation?: CreationState }).asset_creation;
    const entryStyle = sessionStorage.getItem(`as:video-entry-style:${ws}`);
    return { ...spec, narrative: picked[index]!.title, ...(!prev[index] && saved ? { style_id: saved.style_id, ...(saved.duration ? { duration: saved.duration } : {}), ...(saved.size ? { size: saved.size } : {}), ...(saved.captions ? { captions: saved.captions } : {}), ...(saved.note ? { note: saved.note } : {}) } : {}), ...(entryStyle ? { style_id: entryStyle } : {}) };
  })); const savedVoice = (picked[0] as Narrative & { asset_creation?: CreationState } | undefined)?.asset_creation?.voice; if (savedVoice) setVoice(savedVoice); }, [pickKey]);
  useEffect(() => {
    if (autoOptions && picked.length && openedBatch.current !== batchId) {
      openedBatch.current = batchId;
      setConfirming(true);
    }
  }, [autoOptions, batchId, picked.length]);
  useEffect(() => { if (confirming) rootRef.current?.scrollIntoView({ block: "start" }); }, [confirming]);
  useEffect(() => { if (planning || jobActive) rootRef.current?.scrollIntoView({ block: "start" }); }, [planning, jobActive]);

  async function requestMore() {
    const r = await more({ data: { batch_id: batchId, from_goals: true } });
    await onRefresh();
    if (r.alreadyRunning || ("cancelled" in r && r.cancelled)) return;
    if (r.batchId !== batchId) onNewIdeaBatch(r.batchId);
    if (!r.added) toast("Sam's out of fresh angles for now — pick from these or write your own.");
  }

  async function getMore() {
    if (writing || ideating || clearing) return;
    const epoch = ++writingEpoch.current;
    setEntryTab("narratives");
    setWriting(true);
    window.dispatchEvent(new CustomEvent("as:sam-ideation", { detail: { workspaceId: ws, active: true } }));
    try {
      await requestMore();
    } catch (e) { toast.error(errMsg(e, "Couldn't get more narratives")); }
    finally {
      if (epoch === writingEpoch.current) {
        setWriting(false);
        window.dispatchEvent(new CustomEvent("as:sam-ideation", { detail: { workspaceId: ws, active: false } }));
      }
    }
  }

  async function clearOnly() {
    if (clearing || jobActive) return;
    setClearing(true);
    try {
      const result = await clearNarratives({ data: { workspace_id: ws } });
      writingEpoch.current++;
      setWriting(false);
      window.dispatchEvent(new CustomEvent("as:sam-ideation-stopped", { detail: { workspaceId: ws } }));
      window.dispatchEvent(new CustomEvent("as:sam-ideation", { detail: { workspaceId: ws, active: false } }));
      await onRefresh();
      await qc.invalidateQueries({ queryKey: ["sam-messages", ws] });
      toast.success(`${result.cleared} narrative${result.cleared === 1 ? "" : "s"} moved to the bin. No new ideas will be generated.`);
    } catch (e) {
      await onRefresh();
      toast.error(errMsg(e, "Couldn't clear narratives"));
    } finally { setClearing(false); }
  }

  async function addOwn(mode: "idea" | "standalone") {
    if (jobActive || savingIdea) return;
    const t = own.trim();
    if (t.length < 3) return;
    setSavingIdea(true);
    try {
      await onSave({ narratives: narrativesFromBrief(narratives, t, requestedCount, () => crypto.randomUUID().slice(0, 8), mode) });
      setOwn("");
      sessionStorage.removeItem(`as:create-own-brief:${ws}`);
      setConfirming(true);
    } catch {
      // The wizard reports the save error. Keep the brief available to retry.
    } finally {
      setSavingIdea(false);
    }
  }

  function generate(mode: CreationContextMode) {
    if (mode === "goals") void getMore();
    else void addOwn(mode);
  }

  async function next() {
    if (planningRef.current || jobActive) return;
    if (specs.some((spec) => !spec.style_id)) { setLocalError("Choose a video model before Sam plans the storyboard."); return; }
    planningRef.current = true;
    setPlanning(true);
    try {
      const r = await plan({ data: { batch_id: batchId, count, assets: specs.map((x) => ({ ...x, size: x.size as (typeof NEW_BATCH_SIZES)[number], note: x.note?.trim() || undefined })), voice: voice || null, ...(planningJob?.status === "failed" ? { retry: true } : {}) } });
      sessionStorage.removeItem(`as:video-entry-style:${ws}`);
      setChosenStyle(null);
      if (r.status !== "completed") setWaitingForJob(true);
      onOptionsExit();
      setConfirming(false);
      setLocalError(null);
      setDismissedFailureId(null);
      await qc.invalidateQueries({ queryKey: ["narrative-planning-job", batchId] });
      await onRefresh();
    } catch (e) { setWaitingForJob(false); setConfirming(false); setLocalError(errMsg(e, "Sam couldn't start planning")); }
    finally { planningRef.current = false; setPlanning(false); void qc.invalidateQueries({ queryKey: ["narrative-planning-job", batchId] }); void onRefresh(); }
  }

  if (planning || waitingForJob || jobActive) return <div ref={rootRef} className="min-h-full"><CreativeProgress phase="planning" count={planningJob?.count || count || picked.length} titles={picked.map((n) => n.title)} detail={planningJob?.progress} /></div>;

  if (checkingPlanningJob && picked.length && !confirming) return <div ref={rootRef} className="min-h-full"><CreativeProgress phase="checking" count={picked.length} titles={picked.map((n) => n.title)} /></div>;

  if (confirming && count) return <div ref={rootRef} className="build-in min-h-full">
    <QuickOptions recommendationContext={picked.map((idea) => `${idea.title} ${idea.message} ${idea.treatment ?? ""}`).join(" ")} suggestedStyleId={picked[0] ? videoStyleForNarrative(picked[0])?.id : undefined} standalone={picked[0]?.context_mode === "standalone"} ws={ws} batchId={batchId} onBack={() => { onOptionsExit(); setConfirming(false); void onRefresh(); }} specs={specs} setSpecs={setSpecs} voice={voice} setVoice={setVoice} planning={planning} narrativeTitles={picked.map((n) => n.title)} onConfirm={() => void next()} />
  </div>;

  return (
    <div ref={rootRef} className="build-in space-y-5">
      <CreationContextCards brief={own} onBriefChange={(value) => { setOwn(value); sessionStorage.setItem(`as:create-own-brief:${ws}`, value); }}
        ideaOpen={briefOpen} onIdeaOpenChange={setBriefOpen} useDna={useDna} onUseDnaChange={setUseDna}
        onGenerate={generate} busy={writing || ideating || clearing || savingIdea} maxLength={600} minLength={3} submitLabel="Use this idea"
        ideaOptions={<label className="text-sm font-semibold">Number of videos <select value={requestedCount} onChange={(event) => setRequestedCount(Number(event.target.value))} className="ml-2 rounded-lg border border-border-control bg-surface p-2">
          {Array.from({ length: MAX_ASSETS_PER_BATCH }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
        </select></label>}
      />
      <CreationGuide story={picked.length > 0} style={!!chosenStyle || !!chosenTile} onStory={() => setEntryTab("narratives")} onStyle={() => setEntryTab("styles")} />
      <div role="tablist" aria-label="Start creating with" className="flex gap-2 border-b border-border pb-3">
        <button type="button" role="tab" aria-selected={entryTab === "narratives"} className={cn("rounded-lg px-4 py-2 font-semibold", entryTab === "narratives" ? "bg-ink text-inverse" : "border border-border-control")} onClick={() => setEntryTab("narratives")}>Narratives</button>
        <button type="button" role="tab" aria-selected={entryTab === "styles"} className={cn("rounded-lg px-4 py-2 font-semibold", entryTab === "styles" ? "bg-ink text-inverse" : "border border-border-control")} onClick={() => setEntryTab("styles")}>Styles</button>
      </div>
      {entryTab === "styles" ? <UnifiedStylePicker ws={ws} onChoose={(style) => { if (style.kind === "video") { sessionStorage.removeItem(`as:unified-tile-style:${ws}`); sessionStorage.setItem(`as:video-entry-style:${ws}`, style.id); setChosenStyle(style.id); setChosenTile(null); setSpecs((current) => current.map((spec) => ({ ...spec, style_id: style.id }))); } else { sessionStorage.removeItem(`as:video-entry-style:${ws}`); sessionStorage.setItem(`as:unified-tile-style:${ws}`, style.id); setChosenStyle(null); setChosenTile(style.id); } setEntryTab("narratives"); }} /> : <>
      {chosenStyle && <p role="status" className="rounded-xl border border-border-control bg-surface-subtle p-3 text-sm">Style selected: {CONTENT_RECIPES.find((recipe) => recipe.styleId === chosenStyle)?.name}. Choose an idea to continue. <button type="button" className="underline" onClick={() => setEntryTab("styles")}>Change style</button></p>}
      {chosenTile && <p role="status" className="rounded-xl border border-border-control bg-surface-subtle p-3 text-sm">Social tile style selected: {TILE_STYLES.find((style) => style.id === chosenTile)?.name}. Choose an idea to continue. <button type="button" className="underline" onClick={() => setEntryTab("styles")}>Change style</button></p>}
      <NarrativeLibrary workspaceId={ws} items={library} busy={planning || jobActive || clearing} generating={writing || ideating} resumeCount={!jobActive && count <= MAX_ASSETS_PER_BATCH ? count : 0} retrying={!!failedJobId} onResume={() => setConfirming(true)} onClear={clearOnly} onCreate={onCreateIdea} onCreateSelected={onCreateSelectedIdeas} onReject={(item) => void onSetIdeaStatus(item, "rejected")}
        onRestore={(item) => void onSetIdeaStatus(item, "available")} onBin={(item) => void onSetIdeaStatus(item, "binned")} onViewAsset={onViewAsset} />
      </>}

      <details className="rounded-[16px] border border-border-control bg-canvas p-4 md:p-5">
        <summary className="cursor-pointer font-display text-[16px] font-bold">Upload reference assets</summary>
        <div className="mt-4"><UploadAssetsCard ws={ws} /></div>
      </details>

      <Dialog open={failureOpen} onOpenChange={(open) => { if (!open) { setLocalError(null); setDismissedFailureId(failedJobId); } }}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto rounded-[20px] border-2 border-ink bg-canvas p-0">
          <div className="border-b-2 border-ink bg-surface px-6 py-5">
            <span className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-inverse"><AlertCircle className="h-4 w-4" /> AutoSocials</span>
            <DialogTitle className="mt-4 font-display text-[28px] font-bold">We couldn't plan these videos</DialogTitle>
            <DialogDescription className="mt-2 text-[14px]">Your narratives are saved. No video renders were started. The failure details have been recorded for our team.</DialogDescription>
          </div>
          <div className="space-y-4 px-6 py-5">
            <p className="text-[13px]">You can review your choices and try again. If the issue persists, your saved narratives will still be here.</p>
            {(localError || planningJob?.error) && <details className="rounded-[10px] border border-border-control bg-surface p-3 text-[12px]"><summary className="cursor-pointer font-semibold">Technical details</summary><p className="mt-2 break-words text-muted-foreground">{localError || planningJob?.error}</p></details>}
            <div className="flex flex-wrap justify-end gap-2"><button type="button" className="rounded-[10px] border border-border-control px-4 py-2 text-[13px] font-semibold" onClick={() => { setLocalError(null); setDismissedFailureId(failedJobId); }}>Close</button><button type="button" className={primary} onClick={() => { setLocalError(null); setDismissedFailureId(failedJobId); setConfirming(true); }}>Review options</button></div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
