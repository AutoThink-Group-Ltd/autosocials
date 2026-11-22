import { TileCopyPreview } from "./TileCopyPreview";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Check, Clapperboard, FileText, Images, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { getPersonalIdeaBatch, preparePersonalIdeaVideos, quotePersonalIdeaProduction, producePersonalIdeaBatch, retryPersonalIdeaProduction, getPersonalIdeaProductionStatus, getActivePersonalIdeaProduction, getPersonalIdeaPrepared, savePersonalIdeaPrepared, abandonPersonalIdeaProductionQuote } from "@/lib/personal-idea-batch.functions";
import { generateWrittenPosts } from "@/lib/written-posts.functions";
import { planSocialTiles } from "@/lib/social-tiles.functions";
import { tilePlanSchema, type TilePlan } from "@/lib/social-tiles";
import { supabase } from "@/integrations/supabase/client";
import { VisualStoryboard } from "./wizard/VisualStoryboard";
import { ProductionProgress } from "./ProductionProgress";
import { AssetWorkflow } from "./AssetWorkflow";
import { activePlanningVariants } from "@/lib/production-plan";
import type { Variant } from "./wizard/shared";

export type BatchIdea = { title: string; angle: string; format: "written" | "tiles" | "video" };
type ProductionQuote = { quoteId: string; totalCredits: number; tiles: Array<{ index: number; request_id: string; quote: { provider: string; credits: number; rateId: string } }>; videos: Array<{ batchId: string; id: string; title: string; credits: number; engines: string[] }>; written: Array<{ index: number; title: string }> };
type ProductionStatus = { status: "not_submitted" | "in_progress" | "submitted" | "cancelled"; results: Array<{ kind: "written" | "tile" | "video"; id: string; status: string; message?: string; previewUrl?: string; downloadUrl?: string; text?: string; artworkFileId?: string }> };
export type PreparedBatchIdea = { text?: string; plan?: TilePlan; error?: string; videoBatchId?: string; revision?: string; locked?: boolean };

// A remount must join ongoing preparation rather than submit the same AI work again.
const pendingBatches = new Map<string, Promise<Record<string, PreparedBatchIdea>>>();

/** Review for a saved selection. Planning never starts a paid render or publishes content. */
export function PersonalIdeaBatchReview({ workspaceId, batchId, onBack, backLabel = "Back to ideas", onOpenItem }: {
  workspaceId: string;
  batchId: string;
  onBack: () => void;
  backLabel?: string;
  onOpenItem: (idea: BatchIdea, result: PreparedBatchIdea) => void;
}) {
  const getBatch = useServerFn(getPersonalIdeaBatch);
  const writePost = useServerFn(generateWrittenPosts);
  const prepareVideos = useServerFn(preparePersonalIdeaVideos);
  const quoteProduction = useServerFn(quotePersonalIdeaProduction);
  const produce = useServerFn(producePersonalIdeaBatch);
  const retryProduction = useServerFn(retryPersonalIdeaProduction);
  const getProductionStatus = useServerFn(getPersonalIdeaProductionStatus);
  const getActiveProduction = useServerFn(getActivePersonalIdeaProduction);
  const abandonQuote = useServerFn(abandonPersonalIdeaProductionQuote);
  const getPrepared = useServerFn(getPersonalIdeaPrepared);
  const savePrepared = useServerFn(savePersonalIdeaPrepared);
  const planTile = useServerFn(planSocialTiles);
  const query = useQuery({ queryKey: ["personal-idea-batch", workspaceId, batchId], queryFn: () => getBatch({ data: { workspace_id: workspaceId, batch_id: batchId } }), retry: false, refetchOnWindowFocus: false });
  const [prepared, setPrepared] = useState<Record<string, PreparedBatchIdea>>({});
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const revisions = useRef<Record<string, string>>({});
  const desired = useRef<Record<string, string>>({});
  const writes = useRef<Record<string, Promise<void>>>({});
  const [preparing, setPreparing] = useState(false);
  const [quoting, setQuoting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [quote, setQuote] = useState<ProductionQuote | null>(null);
  const [pendingQuote, setPendingQuote] = useState<string | null>(null);
  const [production, setProduction] = useState<ProductionStatus | null>(null);
  const [productionError, setProductionError] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState("");
  const [productionLoaded, setProductionLoaded] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const started = useRef<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const cacheKey = `as:personal-batch-review:${workspaceId}:${batchId}`;
  const productionKey = `as:personal-batch-production:${workspaceId}:${batchId}`;
  useEffect(() => {
    setProductionLoaded(false); setPendingQuote(null); setProduction(null); setQuote(null);
    try {
      const saved = JSON.parse(sessionStorage.getItem(productionKey) ?? "null");
      if (saved && typeof saved.quoteId === "string") setPendingQuote(saved.quoteId);
    } catch { /* Invalid cached requests are ignored. */ }
    setProductionLoaded(true);
  }, [productionKey]);
  const activeProduction = useQuery({ queryKey: ["personal-idea-active-production", workspaceId, batchId], queryFn: () => getActiveProduction({ data: { workspace_id: workspaceId, batch_id: batchId } }), retry: false, refetchOnWindowFocus: false });
  useEffect(() => {
    const active = activeProduction.data;
    if (!active?.quoteId) return;
    if (active.status === "cancelled") {
      setPendingQuote(previous => previous === active.quoteId ? null : previous);
      try { const cached = JSON.parse(sessionStorage.getItem(productionKey) ?? "null"); if (cached?.quoteId === active.quoteId) sessionStorage.removeItem(productionKey); } catch { /* No valid local request to clear. */ }
      return;
    }
    setPendingQuote(active.quoteId);
    if (active.status === "in_progress" || active.status === "submitted") setProduction({ status: active.status, results: active.results });
    try { sessionStorage.setItem(productionKey, JSON.stringify({ quoteId: active.quoteId })); } catch { /* Server retains the production reservation. */ }
  }, [activeProduction.data, productionKey]);
  const items = query.data?.items as BatchIdea[] | undefined;
  const savedPrepared = useQuery({ queryKey: ["personal-idea-prepared", workspaceId, batchId], enabled: !!items, queryFn: () => getPrepared({ data: { workspace_id: workspaceId, batch_id: batchId } }), retry: false, refetchOnWindowFocus: false });
  const videos = useQuery({
    queryKey: ["personal-idea-video-plans", workspaceId, batchId],
    enabled: !!items?.some(item => item.format === "video"),
    queryFn: () => prepareVideos({ data: { workspace_id: workspaceId, batch_id: batchId } }),
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: query => query.state.data?.batches.some(batch => !batch.job || batch.job.status === "queued" || batch.job.status === "running") ? 5000 : false,
  });
  const readyBatches = videos.data?.batches.filter(batch => batch.job?.status === "completed") ?? [];
  const readyIds = readyBatches.map(batch => batch.batchId).join(",");
  const videoPlans = useQuery({
    queryKey: ["personal-idea-video-variants", workspaceId, readyIds],
    enabled: !!readyIds,
    queryFn: async () => {
      const groups = await Promise.all(readyBatches.map(async batch => {
        const [result, metadata] = await Promise.all([
          supabase.from("creative_variants").select("*").eq("workspace_id", workspaceId).eq("batch_id", batch.batchId).order("position"),
          supabase.from("creative_batches").select("active_plan_id").eq("workspace_id", workspaceId).eq("id", batch.batchId).maybeSingle(),
        ]);
        if (result.error || metadata.error || !metadata.data?.active_plan_id) throw result.error || metadata.error || new Error("The current video plan is unavailable.");
        const active = activePlanningVariants((result.data ?? []) as Variant[], metadata.data.active_plan_id);
        if (active.length !== batch.titles.length) throw new Error("The current video storyboards are incomplete.");
        return batch.titles.map((title, index) => ({ title, batchId: batch.batchId, variant: active[index] }));
      }));
      return groups.flat();
    },
  });
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 10000); return () => window.clearInterval(timer); }, []);
  const videoPreparing = !!items?.some(item => item.format === "video") && (videos.isPending || videos.data?.batches.some(batch => !batch.job || batch.job.status === "queued" || batch.job.status === "running"));

  useEffect(() => {
    if (!savedPrepared.isSuccess || loadedKey === cacheKey) return;
    const saved: Record<string, PreparedBatchIdea> = {};
    const versions: Record<string, string> = {};
    for (const item of savedPrepared.data.items) { const key = String(item.index); saved[key] = { ...("text" in item ? { text: item.text } : {}), ...("plan" in item ? { plan: item.plan } : {}), revision: item.revision, locked: item.locked }; versions[key] = item.revision; }
    revisions.current = versions;
    setPrepared(saved);
    setLoadedKey(cacheKey);
  }, [savedPrepared.isSuccess, savedPrepared.data, cacheKey, loadedKey]);

  useEffect(() => {
    const attempt = `${cacheKey}:${retryKey}`;
    if (!items || loadedKey !== cacheKey || started.current === attempt) return;
    started.current = attempt;
    let live = true;
    setPreparing(true);
    let pending = pendingBatches.get(cacheKey);
    if (!pending) {
      const next = { ...prepared };
      const tasks = items.map((item, index) => ({ item, index })).filter(({ item, index }) => item.format !== "video" && !next[String(index)]?.text && !tilePlanSchema.safeParse(next[String(index)]?.plan).success);
      let cursor = 0;
      pending = (async () => {
        const work = async () => {
          while (cursor < tasks.length) {
            const { item, index } = tasks[cursor++]!;
            const key = String(index);
            const brief = `${item.title}\n\n${item.angle}`;
            try {
              const output = item.format === "written" ? { text: (await writePost({ data: { workspace_id: workspaceId, brief, count: 1 } }))[0]! } : { plan: await planTile({ data: { workspace_id: workspaceId, brief, count: 1, previous_titles: [] } }) };
              const saved = await savePrepared({ data: { workspace_id: workspaceId, batch_id: batchId, index, output, expected_revision: null } });
              next[key] = { ...("text" in saved ? { text: saved.text } : {}), ...("plan" in saved ? { plan: saved.plan } : {}), revision: saved.revision, locked: saved.locked };
              revisions.current[key] = saved.revision;
            } catch {
              try { const latest = await getPrepared({ data: { workspace_id: workspaceId, batch_id: batchId } }); const saved = latest.items.find(value => value.index === index); if (!saved) throw new Error("Missing result"); next[key] = { ...(saved.text !== undefined ? { text: saved.text } : {}), ...(saved.plan ? { plan: saved.plan } : {}), revision: saved.revision, locked: saved.locked }; revisions.current[key] = saved.revision; }
              catch { next[key] = { error: "Sam couldn’t prepare this idea. Please try again." }; }
            }
            if (live) setPrepared({ ...next });
          }
        };
        await Promise.all(Array.from({ length: Math.min(3, tasks.length) }, () => work()));
        return next;
      })();
      pendingBatches.set(cacheKey, pending);
      void pending.finally(() => pendingBatches.delete(cacheKey));
    }
    void pending.then(result => { if (live) { for (const [key, item] of Object.entries(result)) if (item.revision) revisions.current[key] = item.revision; setPrepared({ ...result }); setPreparing(false); } });
    return () => { live = false; };
  }, [items, loadedKey, cacheKey, workspaceId, batchId, writePost, planTile, getPrepared, savePrepared, retryKey]);

  const retry = () => {
    const retained = Object.fromEntries(Object.entries(prepared).filter(([, value]) => !value.error));
    setPrepared(retained);
    setRetryKey(value => value + 1);
  };

  const saveEdit = (index: number, text: string) => {
    const key = String(index);
    desired.current[key] = text;
    setPrepared(old => ({ ...old, [key]: { ...old[key], text } }));
    setDirty(old => ({ ...old, [key]: true }));
    setSaveErrors(old => { const next = { ...old }; delete next[key]; return next; });
    if (writes.current[key]) return;
    const work = async () => {
      try {
        while (true) {
          const value = desired.current[key] ?? "";
          if (!value.trim()) throw new Error("Add text before saving this draft.");
          const saved = await savePrepared({ data: { workspace_id: workspaceId, batch_id: batchId, index, output: { text: value }, expected_revision: revisions.current[key] ?? null } });
          revisions.current[key] = saved.revision;
          setPrepared(old => ({ ...old, [key]: { ...old[key], revision: saved.revision, locked: saved.locked } }));
          if (desired.current[key] === value) { setDirty(old => { const next = { ...old }; delete next[key]; return next; }); break; }
        }
      } catch (error) { setSaveErrors(old => ({ ...old, [key]: error instanceof Error ? error.message : "Couldn’t save your changes." })); }
    };
    const pending = work().finally(() => { delete writes.current[key]; });
    writes.current[key] = pending;
  };

  const readyCount = items?.filter((item, index) => item.format === "written" ? !!prepared[String(index)]?.text : item.format === "tiles" ? !!prepared[String(index)]?.plan?.tiles[0]?.direction : !!videoPlans.data?.find(plan => plan.title === item.title)?.variant).length ?? 0;
  const slowVideo = videos.data?.batches.some(batch => batch.job && ["queued", "running"].includes(batch.job.status) && now - Date.parse(batch.job.started_at || batch.job.created_at) > 3 * 60_000);
  const complete = savedPrepared.isSuccess && !Object.keys(dirty).length && !!items?.length && !preparing && !videoPreparing && items.every((item, index) => item.format === "written" ? !!prepared[String(index)]?.text : item.format === "tiles" ? !!prepared[String(index)]?.plan?.tiles[0]?.direction : !!videoPlans.data?.find(plan => plan.title === item.title)?.variant);
  const prepareQuote = async () => {
    if (!items || !complete || pendingQuote || !activeProduction.isSuccess || activeProduction.data?.status === "other_request") return;
    setQuoting(true); setProductionError(null);
    try {
      const tiles = items.flatMap((item, index) => { const tile = prepared[String(index)]?.plan?.tiles[0]; return item.format === "tiles" && tile?.direction ? [{ index, tile: { ...tile, direction: tile.direction } }] : []; });
      const written = items.flatMap((item, index) => item.format === "written" && prepared[String(index)]?.text ? [{ index, text: prepared[String(index)]!.text! }] : []);
      const videos = items.flatMap(item => { const variant = item.format === "video" ? videoPlans.data?.find(plan => plan.title === item.title)?.variant : null; return variant ? [{ id: variant.id, version: variant.version }] : []; });
      const result = await quoteProduction({ data: { workspace_id: workspaceId, batch_id: batchId, tiles, written, videos } });
      setQuote(result); setConfirming(true);
    } catch (error) { setProductionError(error instanceof Error ? error.message : "Couldn’t check the production estimate."); }
    finally { setQuoting(false); }
  };
  const confirmProduction = async () => {
    if (!quote || pendingQuote || submitting) return;
    // Persist the immutable request identity before submitting any paid work.
    try { sessionStorage.setItem(productionKey, JSON.stringify({ quoteId: quote.quoteId })); }
    catch { setProductionError("Couldn’t save the production request safely. Check browser storage and try again."); return; }
    setPendingQuote(quote.quoteId); setSubmitting(true); setProductionError(null); setConfirming(false);
    try {
      const result = await produce({ data: { workspace_id: workspaceId, batch_id: batchId, quote_id: quote.quoteId, confirmed: true } });
      setProduction({ status: result.status === "submitted" ? "submitted" : "in_progress", results: result.results });
      try { setProduction(await getProductionStatus({ data: { workspace_id: workspaceId, batch_id: batchId, quote_id: quote.quoteId } })); } catch { setProductionError("Couldn’t refresh the latest asset details. Use Check production status."); }
    } catch { setProductionError("The result is not yet confirmed. Check production status before trying again."); }
    finally { setSubmitting(false); }
  };
  const retrySameProduction = async () => {
    if (!pendingQuote || submitting || production?.status !== "not_submitted") return;
    setSubmitting(true); setProductionError(null);
    try {
      const result = await produce({ data: { workspace_id: workspaceId, batch_id: batchId, quote_id: pendingQuote, confirmed: true } });
      setProduction({ status: result.status === "submitted" ? "submitted" : "in_progress", results: result.results });
    } catch { setProductionError("The result is still unconfirmed. Check production status before taking further action."); }
    finally { setSubmitting(false); }
  };
  const recoverProduction = async () => {
    if (!pendingQuote || submitting) return;
    setSubmitting(true); setProductionError(null); setStatusNotice("");
    setProduction(previous => previous ? { status: "in_progress", results: previous.results.map(result => ["failed", "needs_attention", "reconciliation_required", "limit_reached", "unconfirmed"].includes(result.status) ? (({ message: _message, ...rest }) => ({ ...rest, status: "pending" }))(result) : result) } : previous);
    try {
      const result = await retryProduction({ data: { workspace_id: workspaceId, batch_id: batchId, quote_id: pendingQuote, confirmed: true } });
      setProduction({ status: result.status === "submitted" ? "submitted" : "in_progress", results: result.results });
      setProduction(await getProductionStatus({ data: { workspace_id: workspaceId, batch_id: batchId, quote_id: pendingQuote } }));
    } catch { setProductionError("Couldn’t restart the confirmed work. Check its status before trying again."); }
    finally { setSubmitting(false); }
  };
  const abandonPendingQuote = async () => {
    if (!pendingQuote || submitting || (production?.status !== "not_submitted" && production?.status !== "cancelled")) return;
    setSubmitting(true); setProductionError(null);
    try {
      const result = await abandonQuote({ data: { workspace_id: workspaceId, batch_id: batchId, quote_id: pendingQuote } });
      if (!result.cancelled) throw new Error("Couldn’t safely cancel this estimate.");
      try { sessionStorage.removeItem(productionKey); } catch { /* Server confirms this quote is retired. */ }
      setPendingQuote(null); setQuote(null); setProduction(null);
      await activeProduction.refetch();
    } catch (error) { setProductionError(error instanceof Error ? error.message : "Couldn’t safely cancel this estimate. Check production status."); }
    finally { setSubmitting(false); }
  };
  const checkProduction = async () => {
    if (!pendingQuote || submitting) return;
    setSubmitting(true); setProductionError(null); setStatusNotice("");
    try {
      const result = await getProductionStatus({ data: { workspace_id: workspaceId, batch_id: batchId, quote_id: pendingQuote } });
      setProduction(result);
      setStatusNotice(`Status checked at ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}.`);
      if (result.status === "not_submitted") setProductionError("The request has not been recorded yet. You can check again or retry the same request safely.");
    } catch { setProductionError("Couldn’t check production status. Please try again before starting another request."); }
    finally { setSubmitting(false); }
  };

  const needsPolling = !!pendingQuote && !!production && (production.status === "in_progress" || production.results.some(result => ["queued", "running", "rendering", "preparing", "pending"].includes(result.status)));
  useEffect(() => {
    if (!pendingQuote || !needsPolling) return;
    let live = true;
    const timer = window.setInterval(() => {
      void getProductionStatus({ data: { workspace_id: workspaceId, batch_id: batchId, quote_id: pendingQuote } }).then(result => { if (live) setProduction(result); }).catch(() => { if (live) setProductionError("Couldn’t update production status. Use Check production status to try again."); });
    }, 5000);
    return () => { live = false; window.clearInterval(timer); };
  }, [pendingQuote, needsPolling, workspaceId, batchId, getProductionStatus]);

  if (items && activeProduction.isPending) return <main className="mx-auto w-full max-w-4xl px-5 py-10"><p role="status">Checking your saved production…</p></main>;
  if (pendingQuote && items && production?.status !== "not_submitted" && production?.status !== "cancelled") return <ProductionProgress workspaceId={workspaceId} trashScope={{ kind: "batch", id: batchId }} items={items} results={production?.results ?? []} checking={submitting} notice={statusNotice} error={productionError} onCheck={() => void checkProduction()} onRetry={() => void recoverProduction()} onBack={onBack} backLabel={backLabel} />;

  return <main className="mx-auto w-full max-w-5xl px-5 py-10 md:px-10">
    <AssetWorkflow stage={items?.length && items.every(item => item.format === "written") ? "production" : "plans"} />
    <button type="button" onClick={onBack} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"><ArrowLeft className="h-4 w-4" /> {backLabel}</button>
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Create with Sam</p>
    <h1 className="mt-3 font-display text-3xl font-bold">Your content</h1>
    <p className="mt-2 text-sm text-muted-foreground">Review the drafts and visual concepts for your selected ideas.</p>
    {query.isPending ? <p role="status" className="mt-8">Loading your selected ideas…</p> : query.isError ? <p role="alert" className="mt-8 text-destructive">Couldn’t load your selection. Please return to your ideas and try again.</p> : <>
      {(preparing || videoPreparing) && <section aria-label="Content preparation progress" className="relative my-8 overflow-hidden rounded-2xl border border-border bg-surface-subtle p-6 sm:p-8">
        <div aria-hidden className="build-orbit pointer-events-none absolute -right-12 -top-20 size-56 rounded-full border-2 border-dashed border-ink/15" />
        <div className="relative flex flex-wrap items-start gap-4"><span className="grid size-12 shrink-0 place-items-center rounded-full bg-ink text-inverse"><Sparkles className="size-6 motion-safe:animate-pulse" /></span><div className="min-w-0 flex-1"><p className="text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Creating with Sam</p><h2 className="mt-2 font-display text-2xl font-bold">Your ideas are taking shape<span className="build-wave inline-block" aria-hidden>…</span></h2><p role="status" aria-live="polite" className="mt-2 text-sm text-muted-foreground">{readyCount} of {items?.length ?? 0} drafts ready. {videoPreparing ? "Sam is planning your video storyboard; this can take a few minutes." : "Sam is preparing your remaining drafts."}</p><p className="mt-1 text-xs text-muted-foreground">Your selection is saved. No content has been produced or published yet.</p></div></div>
        <div aria-hidden className="relative mt-5 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="build-draw h-full w-full origin-left bg-ink" /></div>
        <div className="relative mt-5 flex flex-wrap gap-2">{items?.map((item, index) => { const ready = item.format === "written" ? !!prepared[String(index)]?.text : item.format === "tiles" ? !!prepared[String(index)]?.plan?.tiles[0]?.direction : !!videoPlans.data?.find(plan => plan.title === item.title)?.variant; return <span key={index} className="inline-flex items-center gap-2 rounded-full border border-border-control bg-surface px-3 py-1.5 text-xs font-medium">{ready ? <Check className="size-3.5" /> : <span className="size-2 rounded-full bg-ink motion-safe:animate-pulse" />}<span>{item.format === "video" ? "Video" : item.format === "tiles" ? "Social tile" : "Written post"}: {ready ? "Ready" : "Preparing"}</span></span>; })}</div>
        {slowVideo && <p role="status" className="relative mt-4 text-sm text-muted-foreground">Video planning is taking longer than usual. We’re still checking its saved status; you can return later. If it cannot finish, you’ll see an option to continue in the video studio.</p>}
      </section>}
      {videos.isError && <div role="alert" className="mt-4 rounded-xl border border-border p-4 text-sm"><p>Video planning couldn’t start. Your selected ideas are saved.</p><Button type="button" variant="outline" className="mt-3" disabled={videos.isFetching} onClick={() => void videos.refetch()}>{videos.isFetching ? "Retrying…" : "Retry video preparation"}</Button></div>}
      {videoPlans.isError && <div role="alert" className="mt-4 rounded-xl border border-border p-4 text-sm"><p>Couldn’t load the prepared video storyboards.</p><Button type="button" variant="outline" className="mt-3" disabled={videoPlans.isFetching} onClick={() => void videoPlans.refetch()}>{videoPlans.isFetching ? "Retrying…" : "Retry loading storyboards"}</Button></div>}
      {savedPrepared.isError && <p role="alert" className="mt-4 text-sm text-destructive">Couldn’t load your saved drafts. Refresh before continuing.</p>}
      {savedPrepared.isPending && <p role="status" className="mt-4 text-sm text-muted-foreground">Loading saved drafts…</p>}
      <div className="mt-8 space-y-4">{items?.map((item, index) => {
        const result = prepared[String(index)];
        const videoBatch = videos.data?.batches.find(batch => batch.titles.includes(item.title));
        const videoPlan = videoPlans.data?.find(plan => plan.title === item.title);
        const ready = item.format === "written" ? !!result?.text : item.format === "tiles" ? !!result?.plan : !!videoPlan?.variant;
        return <article key={`${index}:${item.title}`} className="rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-subtle">{item.format === "video" ? <Clapperboard className="size-5" /> : item.format === "tiles" ? <Images className="size-5" /> : <FileText className="size-5" />}</span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.format === "video" ? "Video" : item.format === "tiles" ? "Social tile" : "Written post"}</p><h2 className="mt-1 font-display text-lg font-bold">{item.title}</h2></div></div>
          {item.format === "video" ? videoPlan?.variant ? <div className="mt-4 min-h-64"><VisualStoryboard ws={workspaceId} v={videoPlan.variant} onEdit={() => onOpenItem(item, { videoBatchId: videoPlan.batchId })} /></div> : <p className="mt-4 text-sm text-muted-foreground">{videos.isError ? "Video planning could not start. Retry preparation above." : videoPlans.isError ? "The storyboard could not be loaded. Retry above." : videoBatch?.job?.status === "failed" ? "Video planning needs attention. Open the video studio to continue." : videoBatch?.job?.progress || "Sam is preparing your storyboard…"}</p> : result?.error ? <p role="alert" className="mt-4 text-sm text-destructive">{result.error}</p> : !ready ? <p className="mt-4 text-sm text-muted-foreground">{preparing ? "Preparing…" : "Waiting to prepare."}</p> : item.format === "written" ? <div><textarea maxLength={3000} aria-label={`Written post: ${item.title}`} className="mt-4 min-h-44 w-full resize-y rounded-xl border border-border-control bg-surface p-3 text-sm leading-relaxed" value={result?.text ?? ""} disabled={!!pendingQuote || !!quote || !!result?.locked || preparing} onChange={event => saveEdit(index, event.target.value)} />{result?.locked || quote ? <p className="mt-1 text-xs text-muted-foreground">This draft is locked for its production quote. Start a new content plan to change it.</p> : saveErrors[String(index)] ? <p role="alert" className="mt-1 text-xs text-destructive">{saveErrors[String(index)]} <button type="button" className="underline" onClick={() => saveEdit(index, result?.text ?? "")}>Retry save</button></p> : dirty[String(index)] ? <p role="status" className="mt-1 text-xs text-muted-foreground">Saving changes…</p> : null}</div> : result?.plan?.tiles[0] && <div className="mt-4 max-w-sm"><TileCopyPreview tile={result.plan.tiles[0]} /></div>}
          {item.format === "tiles" && result?.plan && (() => {
            const tileQuote = quote?.tiles.find(tile => tile.index === index);
            const made = production?.results.find(row => row.kind === "tile" && row.id === tileQuote?.request_id);
            const first = result.plan.tiles[0];
            const editable = first && made?.status === "ready" && (first.design?.treatment === "typography" || made.artworkFileId) ? { ...result.plan, tiles: [{ ...first, artwork: { requestId: made.id, ...(made.artworkFileId ? { fileId: made.artworkFileId } : {}) } }] } : result.plan;
            return <Button type="button" variant="outline" className="mt-4" onClick={() => onOpenItem(item, { plan: editable })}>Open tile editor</Button>;
          })()}
          {item.format === "video" && !ready && videoBatch?.job?.status === "failed" && <Button type="button" variant="outline" className="mt-4" onClick={() => onOpenItem(item, { videoBatchId: videoBatch.batchId })}>Open video studio</Button>}
        </article>;
      })}</div>
      {!preparing && Object.values(prepared).some(value => value.error) && <Button type="button" className="mt-5" onClick={retry}>Retry failed ideas</Button>}
      {activeProduction.isError && <p role="alert" className="mt-4 text-sm text-destructive">Couldn’t check existing production. Refresh before starting another request.</p>}
      {activeProduction.data?.status === "other_request" && <p role="alert" className="mt-4 text-sm text-destructive">Another workspace member started production for this plan. Ask them to check its status.</p>}
      {productionError && <p role="alert" className="mt-4 text-sm text-destructive">{productionError}</p>}
      {production && <div className="mt-5 rounded-xl border border-border p-4"><p className="font-semibold">{production.status === "submitted" ? "Production requests received" : "Production status"}</p><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{production.results.map((result, index) => <li key={`${result.kind}:${result.id}:${index}`}>{result.kind}: {result.status}{result.message ? ` — ${result.message}` : ""}</li>)}</ul><div className="mt-3 flex flex-wrap gap-4 text-sm font-semibold"><a href="/app/sam-creations" className="underline">View creations</a><a href="/app/schedule" className="underline">Open Publish</a></div></div>}
      {pendingQuote ? <div className="mt-5 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={submitting} onClick={() => void checkProduction()}>{submitting ? "Checking…" : "Check production status"}</Button>{production?.status === "not_submitted" && <Button type="button" disabled={submitting} onClick={() => void retrySameProduction()}>Retry same request</Button>}{(production?.status === "not_submitted" || production?.status === "cancelled") && <Button type="button" variant="outline" disabled={submitting} onClick={() => void abandonPendingQuote()}>Cancel estimate and start again</Button>}</div> : <Button type="button" className="mt-5" disabled={!productionLoaded || !activeProduction.isSuccess || activeProduction.data?.status === "other_request" || !complete || quoting} onClick={() => void prepareQuote()}>{quoting ? "Checking estimate…" : "Review and create content"}</Button>}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent className="max-h-[calc(100dvh-2rem)] max-w-2xl overflow-y-auto">
          <AlertDialogHeader><AlertDialogTitle>Ready to create your content?</AlertDialogTitle><AlertDialogDescription>Confirm the assets and credit estimate below. Each asset uses the plan you reviewed.</AlertDialogDescription></AlertDialogHeader>
          {quote && <div className="space-y-3 text-sm">
            {quote.videos.map(video => <div key={video.id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3 font-semibold"><span>Video</span><span>{video.credits} credits</span></div><p className="mt-1 break-words">{video.title}</p><p className="mt-2 text-muted-foreground">Queued for production · {video.engines?.join(", ") || "See reviewed video plan"}</p></div>)}
            {quote.tiles.map(tile => <div key={tile.request_id} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3 font-semibold"><span>Social tile</span><span>{tile.quote.credits} credits</span></div><p className="mt-1 break-words">{items?.[tile.index]?.title}</p><p className="mt-2 text-muted-foreground">Image generation · {({ openai: "OpenAI GPT Image 2.6", ideogram: "Ideogram 4.5", recraft: "Recraft V4" } as Record<string, string>)[tile.quote.provider] || tile.quote.provider}</p></div>)}
            {quote.written.map(item => <div key={item.index} className="rounded-xl border border-border p-4"><div className="flex items-center justify-between gap-3 font-semibold"><span>Written post</span><span>Draft</span></div><p className="mt-1 break-words">{item.title}</p><p className="mt-2 text-muted-foreground">Prepared with OpenAI GPT-6.1 Terra; your reviewed text will be saved as a draft.</p></div>)}
            <div className="flex items-center justify-between gap-3 border-t border-border pt-3 font-semibold"><span>Estimated total</span><span>{quote.totalCredits} credits</span></div>
            <p className="text-muted-foreground">After confirmation, the assets are submitted together and finish independently. Check production status and review each result before publishing; nothing is published automatically.</p>
          </div>}
          <AlertDialogFooter><AlertDialogCancel disabled={submitting}>Keep reviewing</AlertDialogCancel><AlertDialogAction disabled={!quote || submitting} onClick={event => { event.preventDefault(); void confirmProduction(); }}>Confirm and create</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>}
  </main>;
}
