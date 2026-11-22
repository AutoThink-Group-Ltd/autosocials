import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { refreshRenders, saveWizard, startWizardBatch, setNarrativeLibraryStatus, startAssetFromNarrative } from "@/lib/creative.functions";
import { fetchAll } from "@/lib/fetch-all";
import { buildNarrativeLibrary, type LibraryAsset, type LibraryBatch } from "@/lib/narrative-library";
import { WIZARD_STAGES, type Narrative, type WizardStage } from "@/lib/wizard";
import { activePlanningVariants } from "@/lib/production-plan";
import { IDEATION_PROGRESS_PREFIX, ideationIsActive } from "@/lib/ideation-status";
import { Ellipsis } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StepNarratives } from "./StepNarratives";
import type { NarrativeLibraryItem } from "./NarrativeLibrary";
import { StepBriefs } from "./StepBriefs";
import { AssetTiles } from "./AssetTiles";
import { errMsg, primary, type Job, type Variant } from "./shared";
import { UnifiedStylePicker, TILE_STYLES, type UnifiedStyle } from "./UnifiedStylePicker";
import { AssetWorkflow } from "../AssetWorkflow";

type Batch = { id: string; title: string; stage: string; narratives: unknown; days: number; starts_on: string | null; voice_reason: string | null; created_at: string; active_plan_id: string | null };

export function CreateWizard({ onTileIdea, onOpenTileHistory, initialBatchId, onBatchChange, requestedCount = 1, fresh = false }: { initialBatchId?: string | undefined; onBatchChange?: (id: string) => void; onTileIdea?: (idea: NarrativeLibraryItem, style: { name: string; direction: string }) => void; onOpenTileHistory?: () => void; requestedCount?: number; fresh?: boolean } = {}) {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const start = useServerFn(startWizardBatch);
  const save = useServerFn(saveWizard);
  const setIdeaStatus = useServerFn(setNarrativeLibraryStatus);
  const startFromIdea = useServerFn(startAssetFromNarrative);
  const refresh = useServerFn(refreshRenders);
  const autoStarted = useRef<string | null>(null);
  const [picked, setPicked] = useState<string | null>(initialBatchId ?? null);
  const [optionsBatchId, setOptionsBatchId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [pendingStyleIdeas, setPendingStyleIdeas] = useState<{ workspaceId: string; items: NarrativeLibraryItem[] } | null>(null);
  const selectBatch = (id: string) => {
    if (ws) sessionStorage.setItem(`as:create-batch:${ws}`, id);
    setPicked(id);
    onBatchChange?.(id);
  };
  useEffect(() => {
    if (!ws) return;
    setPicked(initialBatchId ?? (fresh ? null : sessionStorage.getItem(`as:create-batch:${ws}`)));
    const openOptions = sessionStorage.getItem(`as:create-options:${ws}`);
    if (openOptions) { setOptionsBatchId(openOptions); sessionStorage.removeItem(`as:create-options:${ws}`); }
  }, [ws, initialBatchId, fresh]);

  const { data: batches = [], isFetched } = useQuery({
    queryKey: ["batches", ws], enabled: !!ws,
    queryFn: async (): Promise<Batch[]> => (await supabase.from("creative_batches").select("id,title,stage,narratives,days,starts_on,voice_reason,created_at,active_plan_id").eq("workspace_id", ws!).not("goal", "like", "sam-thread:%").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  const { data: library = [] } = useQuery({
    queryKey: ["narrative-library", ws], enabled: !!ws,
    queryFn: async () => {
      const [allBatches, allAssets] = await Promise.all([
        fetchAll<LibraryBatch>(async (from, to) => {
          const { data, error } = await supabase.from("creative_batches").select("id,goal,created_at,narratives").eq("workspace_id", ws!).order("created_at", { ascending: false }).range(from, to);
          return { data, error };
        }),
        fetchAll<LibraryAsset>(async (from, to) => {
          const { data, error } = await supabase.from("creative_variants").select("id,batch_id,angle,production_plan,render_jobs!render_jobs_variant_id_fkey(id,status,created_at)").eq("workspace_id", ws!).order("created_at", { ascending: false }).range(from, to);
          return { data: data as unknown as LibraryAsset[] | null, error };
        }),
      ]);
      return buildNarrativeLibrary(allBatches, allAssets);
    },
  });
  const { data: ideationMessages = [] } = useQuery({
    queryKey: ["create-ideation", ws], enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_messages").select("id,content,created_at")
        .eq("workspace_id", ws!).eq("role", "assistant")
        .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
        .order("created_at", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: (query) => query.state.data?.some((message) => ideationIsActive(message)) ? 3000 : false,
  });
  const latestIdeation = ideationMessages.find((message) => message.content.startsWith(IDEATION_PROGRESS_PREFIX) || message.content.startsWith("Stopped creating new narratives.") || message.content.startsWith("I saved ") || message.content.startsWith("I couldn't save a supportable new set"));
  const ideating = ideationIsActive(latestIdeation);
  useEffect(() => {
    if (!latestIdeation || ideating) return;
    void qc.invalidateQueries({ queryKey: ["narrative-library", ws] });
    void qc.invalidateQueries({ queryKey: ["batches", ws] });
  }, [latestIdeation?.id, latestIdeation?.content, ideating, qc, ws]);
  // A batch opened from the manager may be older than the newest 20: load it on its own.
  const pickedMissing = !!picked && isFetched && !batches.some((b) => b.id === picked);
  const { data: older, isFetched: checkedOlder } = useQuery({
    queryKey: ["batch-one", ws, picked], enabled: pickedMissing,
    queryFn: async (): Promise<Batch | null> => (await supabase.from("creative_batches").select("id,title,stage,narratives,days,starts_on,voice_reason,created_at,active_plan_id").eq("workspace_id", ws!).eq("id", picked!).maybeSingle()).data,
  });
  const batch = batches.find((b) => b.id === picked) ?? (pickedMissing ? older : batches[0]);
  useEffect(() => { if (isFetched && batches.length === 0) autoStarted.current = null; }, [isFetched, batches.length]);
  useEffect(() => {
    if (!ws || !isFetched || !batch || sessionStorage.getItem(`as:canvas-hook-selection:${ws}`) !== "1") return;
    sessionStorage.removeItem(`as:canvas-hook-selection:${ws}`);
    if (batch.stage !== "narratives") void newBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, isFetched, batch?.id, batch?.stage]);
  const { data: variants = [] } = useQuery({
    queryKey: ["variants", batch?.id], enabled: !!batch,
    queryFn: async (): Promise<Variant[]> => ((await supabase.from("creative_variants").select("*").eq("batch_id", batch!.id).order("position")).data ?? []) as Variant[],
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["renders", batch?.id, variants.map((v) => v.id).join()], enabled: variants.length > 0,
    queryFn: async (): Promise<Job[]> => ((await supabase.from("render_jobs").select("id,variant_id,status,phase,error,storage_path,created_at,started_at,progress,frame_qa,technical_status,creative_status,qa_issues").in("variant_id", variants.map((v) => v.id)).order("created_at", { ascending: false })).data as Job[] | null) ?? [],
  });
  const inFlight = jobs.some((j) => ["queued", "preparing", "rendering"].includes(j.status));

  useEffect(() => {
    if (!inFlight || !ws) return;
    const t = setInterval(async () => {
      try { await refresh({ data: { workspace_id: ws } }); await qc.invalidateQueries({ queryKey: ["renders"] }); } catch { /* next tick */ }
    }, 8000);
    return () => clearInterval(t);
  }, [inFlight, ws, refresh, qc]);

  const reload = async () => {
    await Promise.all([qc.invalidateQueries({ queryKey: ["batches", ws] }), qc.invalidateQueries({ queryKey: ["batch-one"] }), qc.invalidateQueries({ queryKey: ["variants"] }), qc.invalidateQueries({ queryKey: ["renders"] }), qc.invalidateQueries({ queryKey: ["narrative-library", ws] }), qc.invalidateQueries({ queryKey: ["create-ideation", ws] })]);
  };

  const sourceIdea = (item: NarrativeLibraryItem) => library.find((idea) => idea.id === item.id);
  async function createFromIdea(item: NarrativeLibraryItem) {
    await createFromIdeas([item]);
  }
  async function createFromIdeas(items: NarrativeLibraryItem[]) {
    if (items.length !== 1) throw new Error("Choose one idea to create. Your other ideas stay saved for later.");
    if (ws && onTileIdea) {
      const tileId = sessionStorage.getItem(`as:unified-tile-style:${ws}`);
      const tileStyle = TILE_STYLES.find((style) => style.id === tileId);
      if (tileStyle) { sessionStorage.removeItem(`as:unified-tile-style:${ws}`); onTileIdea(items[0]!, tileStyle); setPendingStyleIdeas(null); return; }
      if (sessionStorage.getItem(`as:create-format:${ws}`) !== "video" && !sessionStorage.getItem(`as:video-entry-style:${ws}`)) { setPendingStyleIdeas({ workspaceId: ws, items }); return; }
    }
    await createVideoFromIdeas(items);
  }
  async function createVideoFromIdeas(items: NarrativeLibraryItem[]) {
    const sources = items.map(sourceIdea);
    if (sources.some((source) => !source)) throw new Error("Refresh the idea stream and try again.");
    setStarting(true);
    try {
      const result = await startFromIdea({ data: { ideas: sources.map((source) => ({ batch_id: source!.batch_id, narrative_id: source!.narrative_id })), count: requestedCount } });
      selectBatch(result.batchId);
      setOptionsBatchId(result.batchId);
      await reload();
    } catch (error) { toast.error(errMsg(error, "Sam couldn't prepare those ideas")); await reload(); throw error; }
    finally { setStarting(false); }
  }

  async function changeIdeaStatus(item: NarrativeLibraryItem, status: "available" | "rejected" | "binned") {
    const source = sourceIdea(item); if (!source) return;
    try {
      await setIdeaStatus({ data: { batch_id: source.batch_id, narrative_id: source.narrative_id, status } });
      await reload();
      toast.success(status === "binned" ? "Moved to bin" : status === "rejected" ? "Narrative rejected" : "Narrative restored");
    } catch (error) { toast.error(errMsg(error, "Couldn't update this narrative")); }
  }

  const startingBatch = useRef(false);
  async function newBatch(forceFresh = false) {
    if (!ws || startingBatch.current) return;
    startingBatch.current = true;
    setStarting(true);
    try {
      const r = await start({ data: { workspace_id: ws, ...(forceFresh ? { fresh: true } : {}) } });
      selectBatch(r.batchId); await reload();
      // Opening an empty workspace does not authorise paid ideation. The user can write a brief or explicitly request ideas.
    }
    catch (e) { toast.error(errMsg(e, "Couldn't start a new asset")); }
    finally { startingBatch.current = false; setStarting(false); }
  }

  useEffect(() => {
    if (!ws || !fresh) return;
    for (const key of ["create-entry", "create-own-brief", "create-count", "unified-tile-style", "video-entry-style"]) sessionStorage.removeItem(`as:${key}:${ws}`);
    sessionStorage.setItem(`as:create-format:${ws}`, "video");
    void newBatch(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh, ws]);

  async function setStage(stage: WizardStage) {
    if (!batch) return;
    try { await save({ data: { batch_id: batch.id, stage } }); await reload(); } catch (e) { toast.error(errMsg(e, "Couldn't switch step")); }
  }

  // Sidebar "New asset": start fresh whether or not this page was already open.
  useEffect(() => {
    if (!ws) return;
    const go = () => { sessionStorage.removeItem("as:new-asset"); void newBatch(); };
    if (sessionStorage.getItem("as:new-asset")) go();
    window.addEventListener("as:new-asset", go);
    return () => window.removeEventListener("as:new-asset", go);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws]);

  useEffect(() => {
    const selected = sessionStorage.getItem("as:selected-asset-folder");
    if (selected) {
      sessionStorage.removeItem("as:selected-asset-folder");
      selectBatch(selected);
    }
  }, []);

  const needsAuto = !!ws && !fresh && isFetched && !batch && !pickedMissing;
  useEffect(() => {
    if (!needsAuto || autoStarted.current === ws) return;
    autoStarted.current = ws!;
    void newBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needsAuto, ws]);

  if (!ws) return <Empty title="Pick a business first" body="Sam makes content for one business at a time. Choose one from the menu." />;
  // A short user brief is a valid starting point; brand uploads remain available in the wizard.

  if (pickedMissing && !batch) return <p role="status" className="p-5">{checkedOlder ? "This batch is unavailable in this workspace." : "Loading saved batch…"}</p>;
  if (fresh || (isFetched && !batch)) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 p-10 text-center build-in">
        <div className="grid h-16 w-16 place-items-center rounded-full border-2 border-ink font-display text-[26px] font-bold">S</div>
        <h1 className="font-display text-[28px] font-bold tracking-tight">Let's make your first asset</h1>
        <button type="button" className={primary} disabled={starting} onClick={() => void newBatch(fresh)}>{starting ? "Preparing your workspace…" : "Open video planning"}</button>
      </div>
    );
  }
  if (!batch) return null;

  if (pendingStyleIdeas?.workspaceId === ws) return <div className="space-y-5 p-5"><button type="button" className="text-sm font-semibold underline" onClick={() => setPendingStyleIdeas(null)}>← Back to narratives</button><p className="text-sm">Selected idea: <strong>{pendingStyleIdeas.items[0]?.title}</strong></p><UnifiedStylePicker ws={ws} onChoose={(style: UnifiedStyle) => { if (style.kind === "tile") { sessionStorage.removeItem(`as:video-entry-style:${ws}`); onTileIdea?.(pendingStyleIdeas.items[0]!, style); setPendingStyleIdeas(null); } else { sessionStorage.setItem(`as:video-entry-style:${ws}`, style.id); sessionStorage.removeItem(`as:unified-tile-style:${ws}`); const pending = pendingStyleIdeas; setPendingStyleIdeas(null); void createVideoFromIdeas(pending.items).catch(() => setPendingStyleIdeas(pending)); } }} /></div>;

  const stage = (WIZARD_STAGES as readonly string[]).includes(batch.stage) ? (batch.stage as WizardStage) : "review";
  const narratives = (Array.isArray(batch.narratives) ? batch.narratives : []) as Narrative[];
  const reviewed = !inFlight && variants.some((variant) => variant.review_state === "approved");

  return (
    <div className="relative flex h-full min-h-0 flex-col px-4 pt-4 md:px-6 md:pt-6">
      <AssetWorkflow stage={stage === "narratives" || stage === "briefs" ? "plans" : reviewed ? "ready" : "production"} />
      <div className="mb-3 flex shrink-0 justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="More create actions" className="ml-auto rounded-[8px] p-2 text-muted-foreground hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"><Ellipsis className="h-5 w-5" aria-hidden /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild><Link to="/app/sam-creations">View creations</Link></DropdownMenuItem>
            {onOpenTileHistory && <DropdownMenuItem onSelect={onOpenTileHistory}>View saved tile work</DropdownMenuItem>}
            <DropdownMenuItem disabled={starting} onSelect={() => void newBatch()}>Start a new asset</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {stage === "narratives" && (
          <StepNarratives key={batch.id} ws={ws} batchId={batch.id} narratives={narratives} library={library} ideating={ideating} autoOptions={optionsBatchId === batch.id} onOptionsExit={() => setOptionsBatchId(null)} onRefresh={reload}
            onNewIdeaBatch={selectBatch}
            onCreateIdea={createFromIdea} onCreateSelectedIdeas={createFromIdeas} onSetIdeaStatus={changeIdeaStatus}
            onViewAsset={(item) => { if (item.latest_variant_id) { sessionStorage.setItem("as:open-asset-id", item.latest_variant_id); void navigate({ to: "/app/sam-creations" }); } }}
            onSave={async (patch) => {
              qc.setQueryData<Batch[]>(["batches", ws], (old) => old?.map((b) => (b.id === batch.id ? { ...b, ...patch } : b)));
              try { await save({ data: { batch_id: batch.id, ...patch } }); } catch (e) { toast.error(errMsg(e, "Couldn't save")); await reload(); throw e; }
            }} />
        )}
        {stage === "briefs" && <StepBriefs key={batch.id} ws={ws} batchId={batch.id} variants={activePlanningVariants(variants, batch.active_plan_id)} voiceReason={batch.voice_reason} onRefresh={reload} onBack={() => setStage("narratives")} />}
        {stage === "producing" && <AssetTiles ws={ws} variants={activePlanningVariants(variants, batch.active_plan_id)} jobs={jobs} review={false} onRefresh={reload} onNext={() => void setStage("review")} />}
        {stage === "review" && <AssetTiles ws={ws} variants={activePlanningVariants(variants, batch.active_plan_id)} jobs={jobs} review onRefresh={reload} onNew={() => void newBatch()} />}
      </div>
    </div>
  );
}

function Empty({ title, body }: { title: string; body: string }) {
  return <div className="mx-auto max-w-xl p-10 text-center"><h1 className="font-display text-[22px] font-bold">{title}</h1><p className="mt-2 text-[14px] text-muted-foreground">{body}</p></div>;
}
