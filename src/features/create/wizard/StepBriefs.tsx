import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Ellipsis, FileText, Film, Images, Pencil, SlidersHorizontal, Type } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { updateVariant, deleteVariant, duplicateVariant, reviseVariant, produceBatch, motionKitStatus, planFromNarratives, getVideoModelOptions, getAssetProductionQuote } from "@/lib/creative.functions";
import { NEW_BATCH_SIZES, VIDEO_DURATIONS, type VideoDuration } from "@/lib/content-rules";
import { readVideoStyle, styleEngineLabel } from "@/lib/video-styles";
import { cn } from "@/lib/utils";
import { BriefFiles } from "./BriefFiles";
import { CreativeProgress } from "./CreativeProgress";
import { FactsPanel, BuildPromptButton } from "./Playbook";
import { beatsOf, errMsg, field, ghost, primary, type Variant } from "./shared";
import { VisualStoryboard } from "./VisualStoryboard";
import { storyboardScenesOf } from "./VisualStoryboard";
import { usePreviewMap } from "@/workspace/live-view/blocks/usePreviews";
import { VideoModelCatalogue } from "./QuickOptions";
import { CONTENT_RECIPES } from "@/lib/content-recipes";

export function StepBriefs({ ws, batchId, variants, voiceReason, onRefresh, onBack }: { ws: string; batchId: string; variants: Variant[]; voiceReason: string | null; onRefresh: () => Promise<void>; onBack: () => void | Promise<void> }) {
  const produce = useServerFn(produceBatch);
  const replan = useServerFn(planFromNarratives);
  const getModels = useServerFn(getVideoModelOptions);
  const queryClient = useQueryClient();
  const { data: modelOptions, isPending: modelsLoading, isError: modelsError } = useQuery({ queryKey: ["video-model-options", ws], queryFn: () => getModels({ data: { workspace_id: ws } }) });
  const [going, setGoing] = useState(false);
  const [replanning, setReplanning] = useState(false);
  const goingRef = useRef(false);
  const replanningRef = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const quote = useServerFn(getAssetProductionQuote);
  const quotes = useQuery({ queryKey: ["asset-production-quotes", batchId, variants.map((variant) => `${variant.id}:${variant.version}`).join("|")], enabled: confirming && variants.length > 0, retry: false, staleTime: 60_000, queryFn: () => Promise.all(variants.map((variant) => quote({ data: { variant_id: variant.id } }))) });
  const quotesReady = !!quotes.data?.length && quotes.data.every((item, index) => item.ready && item.creditVersion === variants[index]?.version && typeof item.creditCost === "number" && !!item.creditLines?.length);
  const [productionError, setProductionError] = useState<string | null>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  const detailsTriggerRef = useRef<HTMLElement | null>(null);
  const [assetIndex, setAssetIndex] = useState(0);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsDirty, setDetailsDirty] = useState(false);
  const [editSceneIndex, setEditSceneIndex] = useState(0);
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const kitFn = useServerFn(motionKitStatus);
  const [kit, setKit] = useState<string[] | null>(null);
  useEffect(() => { kitFn({ data: { workspace_id: ws } }).then((r) => setKit(r.guides)).catch(() => setKit(null)); }, [ws, kitFn]);
  async function go() {
    if (goingRef.current || !quotesReady) return;
    goingRef.current = true;
    setGoing(true);
    setProductionError(null);
    try { const approvals = variants.map((variant, index) => ({ variant_id: variant.id, version: variant.version, credits: quotes.data![index]!.creditCost!, lines: quotes.data![index]!.creditLines! })); const r = await produce({ data: { batch_id: batchId, approvals } }); await onRefresh(); setConfirming(false); if (r.failed) toast.error(`${r.queued} video${r.queued === 1 ? "" : "s"} queued; ${r.failed} could not start. ${r.first_error ?? "Try again from this batch."}`); }
    catch (e) { const message = errMsg(e, "I couldn't start these videos. Please try again."); setProductionError(message); toast.error(message); }
    finally { goingRef.current = false; setGoing(false); void onRefresh(); }
  }
  async function reconsiderStyles() {
    if (replanningRef.current || !variants.length) return;
    replanningRef.current = true;
    setReplanning(true);
    try {
      await replan({ data: { batch_id: batchId, count: variants.length, reconsider_styles: crypto.randomUUID() } });
      await queryClient.invalidateQueries({ queryKey: ["narrative-planning-job", batchId] });
      await onBack();
    } catch (e) { toast.error(errMsg(e, "Couldn't reconsider video styles")); }
    finally { replanningRef.current = false; setReplanning(false); }
  }
  async function chooseModel(styleId: NonNullable<typeof modelOptions>[number]["id"]) {
    if (replanningRef.current || !current || routes[currentIndex]?.id === styleId) { setModelOpen(false); return; }
    replanningRef.current = true;
    setReplanning(true);
    try {
      await replan({ data: { batch_id: batchId, count: variants.length, reconsider_styles: crypto.randomUUID(), style_overrides: variants.map((_, index) => index === currentIndex ? styleId : routes[index]?.id ?? null), user_choice_index: currentIndex } });
      await queryClient.invalidateQueries({ queryKey: ["narrative-planning-job", batchId] });
      setModelOpen(false);
      await onBack();
    } catch (e) { toast.error(errMsg(e, "Couldn't update the video model")); }
    finally { replanningRef.current = false; setReplanning(false); }
  }
  const routes = variants.map((v) => readVideoStyle(v.production_plan));
  const sameRoute = routes.length > 1 && !!routes[0] && routes.every((route) => route?.id === routes[0]?.id && route?.engine_ids.join("|") === routes[0]?.engine_ids.join("|"));
  const creativeNotes = variants.flatMap((v) => {
    const notes = v.production_plan && typeof v.production_plan === "object" && !Array.isArray(v.production_plan)
      ? (v.production_plan as { diversity_issues?: unknown }).diversity_issues : null;
    return Array.isArray(notes) ? notes.filter((note): note is string => typeof note === "string") : [];
  });
  const blocked = variants.flatMap((v, index) => Array.isArray(v.build_prompt_issues) && v.build_prompt_issues.length ? [index] : []);
  const currentIndex = Math.min(assetIndex, Math.max(variants.length - 1, 0));
  const current = variants[currentIndex];
  const currentRoute = routes[currentIndex];
  const currentRecipe = CONTENT_RECIPES.find((recipe) => recipe.id === (current?.production_plan && typeof current.production_plan === "object" ? (current.production_plan as Record<string, unknown>)["recipe_id"] : undefined));
  const modelChoice = current?.production_plan && typeof current.production_plan === "object" && !Array.isArray(current.production_plan)
    ? (current.production_plan as { model_choice?: string }).model_choice : null;
  const openDetails = (sceneIndex = 0) => { detailsTriggerRef.current = document.activeElement as HTMLElement | null; setEditSceneIndex(sceneIndex); setDetailsOpen(true); };
  const selectAsset = (index: number) => { setAssetIndex(index); setDetailsOpen(false); setDetailsDirty(false); setMoreOpen(false); };
  if (going) return <CreativeProgress phase="starting" count={variants.length} titles={variants.map((v) => v.narrative || v.hook)} />;
  return (
    <div className="build-in relative flex h-full min-h-0 flex-col gap-3 overflow-y-auto pb-3 lg:overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Sam's plan</p><h2 className="truncate font-display text-xl font-bold tracking-tight md:text-2xl">{current?.narrative || current?.angle || "Your video"}</h2></div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{variants.length ? currentIndex + 1 : 0} / {variants.length}</span>
          <button type="button" className={ghost} aria-label="Previous asset" disabled={currentIndex === 0} onClick={() => selectAsset(currentIndex - 1)}><ChevronLeft className="size-4" /></button>
          <button type="button" className={ghost} aria-label="Next asset" disabled={currentIndex >= variants.length - 1} onClick={() => selectAsset(currentIndex + 1)}><ChevronRight className="size-4" /></button>
        </div>
      </header>
      {current && <div className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-border-control bg-surface px-4 py-2.5">
        <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{currentRecipe ? "Your content style" : modelChoice === "user" ? "Your chosen model" : "Sam recommends"}</p><p className="truncate text-sm font-semibold">{currentRecipe?.name ?? (currentRoute ? `${currentRoute.name} · ${styleEngineLabel(currentRoute)}` : "Model being planned")}</p></div>
        <button type="button" className={cn(ghost, "min-h-10 shrink-0")} disabled={replanning} onClick={() => currentRecipe ? void onBack() : setModelOpen(true)}>{replanning ? "Updating…" : currentRecipe ? "Change style" : "Change model"}</button>
      </div>}
      {current ? <div className="flex min-h-0 flex-1 flex-col"><VisualStoryboard key={current.id} ws={ws} v={current} onEdit={openDetails} /></div>
        : <div className="grid min-h-0 flex-1 place-items-center rounded-2xl border border-dashed border-border-control text-sm text-muted-foreground">No assets planned. Pick an idea to begin.</div>}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <button type="button" className={ghost} onClick={onBack}><ChevronLeft className="size-4" /> Ideas</button>
        <button type="button" className={ghost} onClick={() => setBrandOpen(true)}><FileText className="size-4" /> Brand & facts</button>
        {current && <><button type="button" className={ghost} onClick={() => openDetails()}><Pencil className="size-4" /> Edit details</button><div className="relative"><button type="button" className={ghost} aria-expanded={moreOpen} onClick={() => setMoreOpen(!moreOpen)}><Ellipsis className="size-4" /> More</button>{moreOpen && <div className="absolute bottom-full left-0 z-30 mb-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-xl"><BuildPromptButton v={current} onRefresh={onRefresh} />{sameRoute && <button type="button" className={cn(ghost, "mt-1 w-full justify-start")} disabled={replanning} onClick={() => void reconsiderStyles()}>{replanning ? "Comparing styles…" : "Compare video styles"}</button>}</div>}</div></>}
        <button ref={createButtonRef} type="button" className={cn(primary, "ml-auto h-11 px-5 text-sm font-semibold")} disabled={!variants.length || going} onClick={() => { setProductionError(null); setConfirming(true); }}>Create {variants.length} video{variants.length === 1 ? "" : "s"} <ChevronRight className="size-4" /></button>
      </div>
      <Sheet open={detailsOpen} onOpenChange={(open) => { if (!open && detailsDirty) { toast.info("Save your changes or choose Discard before closing."); return; } setDetailsOpen(open); }}><SheetContent side="right" onCloseAutoFocus={(event) => { event.preventDefault(); detailsTriggerRef.current?.focus(); }} className="flex h-full w-full flex-col gap-0 overflow-hidden border-border bg-canvas p-0 sm:max-w-xl"><SheetHeader className="shrink-0 border-b border-border px-5 py-5 pr-14 text-left"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Video {currentIndex + 1} of {variants.length}</p><SheetTitle className="truncate font-display text-xl">{current?.narrative || current?.angle || "Edit video"}</SheetTitle><SheetDescription className="sr-only">Edit one part of this video at a time.</SheetDescription></SheetHeader>{current && <BriefCard key={current.id} ws={ws} v={current} initialSceneIndex={editSceneIndex} onRefresh={onRefresh} onDirtyChange={setDetailsDirty} onClose={() => { setDetailsDirty(false); setDetailsOpen(false); }} />}</SheetContent></Sheet>
      <Sheet open={brandOpen} onOpenChange={setBrandOpen}><SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl"><SheetHeader><SheetTitle>Brand & facts</SheetTitle></SheetHeader><div className="mt-4 space-y-4"><FactsPanel ws={ws} />{kit && <p className="text-sm text-muted-foreground">Motion kit: {kit.length ? `${kit.length} guide${kit.length === 1 ? "" : "s"}` : "No guides found"}</p>}{voiceReason && <p className="text-sm text-muted-foreground">Narrator: {voiceReason}</p>}{sameRoute && <p className="text-sm text-muted-foreground">Style: {routes[0]!.name} · {styleEngineLabel(routes[0])}</p>}</div></SheetContent></Sheet>
      <Sheet open={modelOpen} onOpenChange={setModelOpen}><SheetContent side="right" className="w-full overflow-y-auto bg-canvas sm:max-w-xl"><SheetHeader><SheetTitle className="font-display text-xl">Choose a video model</SheetTitle><SheetDescription>Sam will make a new draft plan and storyboard for this choice. Your current draft stays saved. Nothing renders until you confirm Create.</SheetDescription></SheetHeader>
        <div className="mt-6">{modelsLoading ? <p className="text-sm text-muted-foreground">Checking connected models…</p> : modelsError ? <p role="alert" className="text-sm text-muted-foreground">Models could not be loaded. Close this panel and try again.</p> : modelOptions && <VideoModelCatalogue models={modelOptions.filter((model) => ["brand-motion", "illustrated-explainer", "drawn-explainer", "cinematic-scene", "reference-story"].includes(model.id))} selectedId={currentRoute?.id} disabled={replanning} onChoose={(id) => void chooseModel(id)} compact />}</div>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">Connected means the API is configured; it does not guarantee account access or a successful render. Models that need reference footage or images require suitable brand files.</p>
      </SheetContent></Sheet>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); createButtonRef.current?.focus(); }} className="max-h-[85dvh] w-[calc(100%-2rem)] min-w-0 max-w-lg grid-cols-[minmax(0,1fr)] overflow-x-hidden overflow-y-auto rounded-[20px] border-border bg-canvas p-5 sm:p-6">
          <AlertDialogHeader className="min-w-0 text-left">
            <AlertDialogTitle className="font-display text-[26px] font-bold tracking-tight">{variants.length === 1 ? "Ready to make this video?" : "Ready to make these videos?"}</AlertDialogTitle>
            <AlertDialogDescription>{variants.length === 1 ? "I’ll turn this plan into a video." : `I’ll turn these ${variants.length} plans into videos.`} You can follow progress here or on Home.</AlertDialogDescription>
          </AlertDialogHeader>
          <ol className="min-w-0 space-y-2">{variants.map((v, i) => { const route = routes[i]; return <li key={v.id} className="min-w-0 rounded-xl bg-surface-subtle px-3 py-2.5 text-sm"><div className="flex items-start gap-3"><span className="shrink-0 font-semibold tabular-nums">{String(i + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 break-words [overflow-wrap:anywhere]">{v.narrative || v.angle}</span><span className="shrink-0 text-muted-foreground">{v.duration_s}s</span></div><p className="mt-1 break-words pl-7 text-xs text-muted-foreground">{route ? `${route.name} · ${styleEngineLabel(route)}` : "Model unavailable"}</p></li>; })}</ol>
          <section aria-label="Production estimate" className="min-w-0 space-y-2 rounded-xl border border-border-control p-4 text-sm"><h3 className="font-semibold">Before you create</h3><p>Includes your saved narration, caption and media choices. Any selected soundtrack must be rights-cleared; no music is added merely because it appears in a prompt.</p>{quotes.isPending ? <p role="status">Checking external provider pricing. No generation has started…</p> : quotes.isError ? <><p role="alert">The production estimate could not be checked. Nothing has started.</p><button type="button" className={ghost} onClick={() => void quotes.refetch()}>Check estimate again</button></> : quotes.data?.map((item, index) => <div key={variants[index]?.id}><p className="font-semibold">{variants.length > 1 ? `Asset ${index + 1} · ` : ""}Credit cost: {item.creditCost === null ? "unavailable" : `${item.creditCost} credits`}</p><p className="mt-1 text-xs text-muted-foreground">{item.message}</p>{!item.ready && <p role="alert" className="mt-1 text-xs text-warning">Resolve this check before creating. No provider generation was submitted.</p>}</div>)}<p className="text-xs text-muted-foreground">Credits are reserved before production. Stock already licensed during setup is separate; no new stock licence is purchased by this button.</p></section>
          {creativeNotes.length > 0 && <p className="text-sm text-muted-foreground">I have creative notes on these plans. They’re suggestions; you can review them under Edit details or make the videos as planned.</p>}
          {blocked.length > 0 && <p role="alert" className="rounded-xl border border-border-control bg-surface-subtle p-3 text-sm">I need to resolve a production check on video {blocked.map((i) => i + 1).join(", ")} before I can make {blocked.length === 1 ? "it" : "them"}. Open its full build prompt under More to see the check.</p>}
          {quotes.data?.some((item, index) => item.creditVersion !== variants[index]?.version) && <p role="alert" className="text-sm">This storyboard has changed. Close this window and refresh the storyboard before approving.</p>}
          {productionError && <p role="alert" className="rounded-xl border border-border-control bg-surface-subtle p-3 text-sm">{productionError}</p>}
          <AlertDialogFooter className="min-w-0 gap-2 sm:flex-wrap"><AlertDialogCancel className={ghost}>Keep editing</AlertDialogCancel><button type="button" className={cn(primary, "h-11 px-5")} disabled={blocked.length > 0 || going || !quotesReady} onClick={() => void go()}>Make {variants.length} video{variants.length === 1 ? "" : "s"}</button></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BriefCard({ ws, v, initialSceneIndex, onRefresh, onDirtyChange, onClose }: { ws: string; v: Variant; initialSceneIndex: number; onRefresh: () => Promise<void>; onDirtyChange: (dirty: boolean) => void; onClose: () => void }) {
  type Panel = "scene" | "words" | "media" | "setup";
  const [panel, setPanel] = useState<Panel>("scene");
  const [sceneIndex, setSceneIndex] = useState(initialSceneIndex);
  const [hook, setHook] = useState(v.hook);
  const [beats, setBeats] = useState(beatsOf(v));
  const [vo, setVo] = useState(v.voiceover);
  const [caption, setCaption] = useState(v.caption);
  const [cta, setCta] = useState(v.cta);
  const [duration, setDuration] = useState(v.duration_s);
  const [size, setSize] = useState(v.size);
  const [note, setNote] = useState("");
  const [reworking, setReworking] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Refresh the draft only after the saved variant changes, never during typing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setHook(v.hook); setBeats(beatsOf(v)); setVo(v.voiceover); setCaption(v.caption); setCta(v.cta); setDuration(v.duration_s); setSize(v.size); }, [v.id, v.version]);
  const update = useServerFn(updateVariant);
  const remove = useServerFn(deleteVariant);
  const dup = useServerFn(duplicateVariant);
  const revise = useServerFn(reviseVariant);
  const { previews } = usePreviewMap(ws, v.file_ids ?? []);
  const scenes = storyboardScenesOf({ ...v, beats });
  const selectedScene = scenes[Math.min(sceneIndex, scenes.length - 1)];
  const mediaIds = [...(selectedScene?.fileIds ?? []), ...(v.file_ids ?? [])];
  const shot = mediaIds.map((id) => previews.get(id)).find((file) => file && (file.kind === "image" || file.kind === "logo" || file.kind === "video") && (file.url || file.playback));
  const videoStyle = readVideoStyle(v.production_plan);
  const creativeNotes = v.production_plan && typeof v.production_plan === "object" && !Array.isArray(v.production_plan)
    ? (v.production_plan as { diversity_issues?: unknown }).diversity_issues : null;
  const reviewNotes = Array.isArray(creativeNotes) ? creativeNotes.filter((item): item is string => typeof item === "string") : [];
  const dirty = hook !== v.hook || JSON.stringify(beats) !== JSON.stringify(beatsOf(v)) || vo !== v.voiceover || caption !== v.caption || cta !== v.cta || duration !== v.duration_s || size !== v.size;
  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);

  async function run(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try { await fn(); await onRefresh(); if (ok) toast.success(ok); }
    catch (e) { toast.error(errMsg(e, "Something went wrong")); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!dirty || busy) return;
    const patch: { hook?: string; beats?: string[]; voiceover?: string; caption?: string; cta?: string; duration_s?: VideoDuration; size?: (typeof NEW_BATCH_SIZES)[number] } = {};
    if (hook !== v.hook) patch.hook = hook;
    if (JSON.stringify(beats) !== JSON.stringify(beatsOf(v))) patch.beats = beats;
    if (vo !== v.voiceover) patch.voiceover = vo;
    if (caption !== v.caption) patch.caption = caption;
    if (cta !== v.cta) patch.cta = cta;
    if (duration !== v.duration_s) patch.duration_s = duration as VideoDuration;
    if (size !== v.size) patch.size = size as (typeof NEW_BATCH_SIZES)[number];
    setBusy(true);
    try {
      await update({ data: { id: v.id, ...patch } });
      await onRefresh();
      onDirtyChange(false);
      toast.success("Changes saved.");
    } catch (e) { toast.error(errMsg(e, "Couldn't save changes")); }
    finally { setBusy(false); }
  }
  const panels: { id: Panel; label: string; icon: typeof Film }[] = [
    { id: "scene", label: "Scenes", icon: Film }, { id: "words", label: "Words", icon: Type },
    { id: "media", label: "Media", icon: Images }, { id: "setup", label: "Options", icon: SlidersHorizontal },
  ];
  return <div className="flex min-h-0 flex-1 flex-col">
    <nav aria-label="Edit video sections" className="grid shrink-0 grid-cols-4 gap-1 border-b border-border px-4 py-2">
      {panels.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={panel === id ? "page" : undefined} onClick={() => setPanel(id)} className={cn("flex min-h-12 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink", panel === id ? "bg-ink text-inverse" : "text-muted-foreground hover:bg-surface-subtle hover:text-foreground")}><Icon className="size-4" />{label}</button>)}
    </nav>
    <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
      {panel === "scene" && selectedScene && <section aria-label="Edit storyboard scene" className="space-y-5">
        <div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scene {sceneIndex + 1} of {scenes.length} · {selectedScene.time}</p><h3 className="font-display text-lg font-bold">{selectedScene.name}</h3></div><div className="flex gap-2"><button type="button" aria-label="Previous scene" className={ghost} disabled={sceneIndex === 0} onClick={() => setSceneIndex((i) => i - 1)}><ChevronLeft className="size-4" /></button><button type="button" aria-label="Next scene" className={ghost} disabled={sceneIndex >= scenes.length - 1} onClick={() => setSceneIndex((i) => i + 1)}><ChevronRight className="size-4" /></button></div></div>
        <div className="relative flex h-52 flex-col overflow-hidden rounded-2xl bg-ink text-inverse">
          {shot && (shot.kind === "image" || shot.kind === "logo") && shot.url && <img src={shot.url} alt={shot.name} className={cn("absolute inset-0 h-full w-full", shot.kind === "logo" ? "object-contain p-8" : "object-cover opacity-70")} />}
          {shot?.kind === "video" && (shot.playback || shot.url) && <video src={shot.playback ?? shot.url ?? undefined} poster={shot.thumbnail ?? undefined} controls playsInline preload="metadata" className="absolute inset-0 h-full w-full object-contain" />}
          {shot?.kind !== "video" && <div className="relative flex min-h-0 flex-1 flex-col justify-center gap-2 bg-gradient-to-t from-ink via-ink/30 to-transparent p-5 pr-12">{selectedScene.copy.slice(0, 2).map((line, index) => <p key={index} className={cn("line-clamp-2 font-display font-bold leading-tight tracking-tight", index === 0 ? "text-2xl" : "text-lg text-inverse/75")}>{line}</p>)}</div>}
          {shot?.kind !== "video" && <div className="pointer-events-none relative mt-auto w-full bg-gradient-to-t from-ink to-transparent px-5 py-3 text-xs font-semibold">{shot ? shot.name : "Type & motion study · no image or clip selected"}</div>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">{scenes.map((scene, index) => <button key={index} type="button" aria-pressed={sceneIndex === index} onClick={() => setSceneIndex(index)} className={cn("min-h-14 min-w-24 flex-1 rounded-xl border px-3 py-2 text-left text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-ink", sceneIndex === index ? "border-ink bg-ink text-inverse" : "border-border-control bg-surface-subtle hover:border-ink")}><span className="block font-bold">{String(index + 1).padStart(2, "0")}</span><span className="line-clamp-1">{scene.name}</span></button>)}</div>
        <Field label="What happens in this scene"><textarea value={beats[sceneIndex] ?? ""} disabled={busy} onChange={(e) => setBeats(beats.map((beat, index) => index === sceneIndex ? e.target.value : beat))} rows={4} className={cn(field, "resize-y leading-relaxed")} /></Field>
      </section>}
      {panel === "words" && <section className="space-y-5"><div><h3 className="font-display text-lg font-bold">Words people hear and see</h3><p className="text-sm text-muted-foreground">Keep each message short and clear.</p></div><Field label="Opening line"><input value={hook} disabled={busy} onChange={(e) => setHook(e.target.value)} className={field} /></Field><Field label="Voiceover"><textarea value={vo} disabled={busy} onChange={(e) => setVo(e.target.value)} rows={6} className={cn(field, "resize-y leading-relaxed")} /></Field><Field label="Post caption"><textarea value={caption} disabled={busy} onChange={(e) => setCaption(e.target.value)} rows={4} className={cn(field, "resize-y leading-relaxed")} /></Field><Field label="Final call to action"><input value={cta} disabled={busy} onChange={(e) => setCta(e.target.value)} className={field} /></Field></section>}
      {panel === "media" && <section className="space-y-4"><div><h3 className="font-display text-lg font-bold">Images, clips and files</h3><p className="text-sm text-muted-foreground">These are the actual brand files Sam will use.</p></div>{dirty && <p role="status" className="rounded-xl bg-surface-subtle p-3 text-sm">Save your edits before changing files.</p>}<BriefFiles ws={ws} ids={v.file_ids ?? []} disabled={busy || dirty} onChange={(file_ids) => void run(() => update({ data: { id: v.id, file_ids } }))} /></section>}
      {panel === "setup" && <section className="space-y-6"><div><h3 className="font-display text-lg font-bold">Video options</h3><p className="text-sm text-muted-foreground">Adjust the format or ask Sam to rethink the plan.</p></div><div className="grid grid-cols-2 gap-3"><Field label="Length"><select aria-label="Length" value={duration} disabled={busy} onChange={(e) => setDuration(Number(e.target.value) as VideoDuration)} className={field}>{VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d} seconds</option>)}</select></Field><Field label="Size"><select aria-label="Size" value={size} disabled={busy} onChange={(e) => setSize(e.target.value as (typeof NEW_BATCH_SIZES)[number])} className={field}>{[...new Set([...NEW_BATCH_SIZES, v.size])].map((s) => <option key={s} value={s}>{s}</option>)}</select></Field></div>{videoStyle && <p className="text-sm text-muted-foreground">Visual style: <span className="font-semibold text-foreground">{videoStyle.name}</span></p>}
        {reviewNotes.length > 0 && <details className="rounded-xl border border-border-control bg-surface-subtle p-4 text-sm"><summary className="cursor-pointer font-semibold">Sam’s creative notes · {reviewNotes.length}</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-muted-foreground">{reviewNotes.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
        {v.script && <details className="rounded-xl border border-border-control p-4 text-sm"><summary className="cursor-pointer font-semibold">Production direction</summary><p className="mt-3 whitespace-pre-wrap text-muted-foreground">{v.script}</p></details>}
        <div className="border-t border-border pt-5"><h4 className="mb-3 text-sm font-semibold">More actions</h4>{dirty ? <p className="text-sm text-muted-foreground">Save your changes to use these actions.</p> : <div className="flex flex-wrap gap-2"><BuildPromptButton v={v} onRefresh={onRefresh} /><button type="button" className={ghost} disabled={busy} onClick={() => setReworking((open) => !open)}>Ask Sam to rework</button><button type="button" className={ghost} disabled={busy} onClick={() => void run(() => dup({ data: { id: v.id } }), "Duplicated.")}>Duplicate</button><button type="button" className={ghost} disabled={busy} onClick={() => setRemoveOpen(true)}>Remove</button></div>}{reworking && !dirty && <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); if (!dirty && note.trim().length > 1) void run(() => revise({ data: { id: v.id, note, rebuild: false } }), "Sam reworked the plan."); }}><Field label="What should Sam change?"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example, make the opening more playful" className={field} /></Field><button type="submit" className={primary} disabled={busy || dirty || note.trim().length < 2}>Send to Sam</button></form>}</div>
      </section>}
    </div>
    <div className="flex shrink-0 items-center gap-2 border-t border-border bg-canvas px-5 py-3"><span role="status" className="min-w-0 flex-1 text-xs text-muted-foreground">{dirty ? "Unsaved changes" : "All changes saved"}</span>{dirty && <button type="button" className={ghost} disabled={busy} onClick={onClose}>Discard</button>}<button type="button" className={cn(primary, "min-h-11 px-5")} disabled={busy} onClick={() => dirty ? void save() : onClose()}>{busy ? "Saving…" : dirty ? "Save changes" : "Done"}</button></div>
    <AlertDialog open={removeOpen} onOpenChange={setRemoveOpen}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove this video?</AlertDialogTitle><AlertDialogDescription>This removes the planned video from this set.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep video</AlertDialogCancel><button type="button" className={primary} disabled={busy} onClick={() => { setRemoveOpen(false); void run(() => remove({ data: { id: v.id } })); }}>Remove video</button></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>{children}</label>;
}
