import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Circle, CircleAlert, Loader2, Trash2 } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getHomeOverview } from "@/lib/home-overview.functions";
import { trashHomeItems, retryHomePlanning } from "@/lib/home-actions.functions";
import type { HomeOverviewItem } from "@/lib/home-overview";
import { createModelVideo, getModelVideoRequest, quoteModelVideo, ModelCreateInput, type ModelCreateRequest } from "@/lib/model-create.functions";
import { retryFailedProduction, getRetryProductionQuote } from "@/lib/creative.functions";
import { getVideoStyle } from "@/lib/video-styles";
import { cn } from "@/lib/utils";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { BrandReviewHome } from "@/features/home/BrandReviewHome";
import { PersonalBrandReview } from "@/features/home/PersonalBrandReview";
import { HomeContent, fetchHomeWrittenPosts } from "@/features/home/HomeContent";
import { HomeChannelFeeds, HomeChannelFeedPane, SavedChannelFeedPane, type HomeChannel, type SavedChannel } from "@/features/home/HomeChannelFeeds";
import { supabase } from "@/integrations/supabase/client";
import { getAgencyClientDiscoveryProgress } from "@/lib/agency-client-discovery.functions";
import { startAutomaticBrandDiscovery } from "@/lib/brand-discovery.functions";
import { personalLinkedIn } from "@/lib/profile-dna";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50";
const primary = cn(button, "bg-ink text-inverse hover:bg-ink-hover");
const secondary = cn(button, "border border-border-control bg-surface hover:bg-surface-subtle");
const modelKey = (ws: string) => `as:models-video:${ws}`;
const attemptKey = (ws: string, batch: string) => `as:home-model-retry:${ws}:${batch}`;
const cardGrid = "grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))]";
const message = (cause: unknown) => cause instanceof Error ? cause.message : "This request could not be completed. Please try again.";
function storedRequest(key: string, ws: string): ModelCreateRequest | undefined {
  try {
    const parsed = ModelCreateInput.safeParse(JSON.parse(sessionStorage.getItem(key) ?? "null"));
    return parsed.success && parsed.data.workspace_id === ws ? parsed.data : undefined;
  } catch { return undefined; }
}

export function HomePage({ workOverview = false }: { workOverview?: boolean }) {
  const { currentWorkspace } = useWorkspace();
  return currentWorkspace ? <WorkspaceHome key={currentWorkspace.id} workOverview={workOverview} ws={currentWorkspace.id} name={currentWorkspace.name} /> : <main className="p-6"><h1 className="font-display text-3xl font-bold">Home</h1><p className="mt-3 text-muted-foreground">Choose a business to see your recent work.</p></main>;
}

function WorkspaceHome({ ws, name, workOverview }: { ws: string; name: string; workOverview: boolean }) {
  const { currentWorkspace } = useWorkspace();
  const [homeTab, setHomeTab] = useState<"content" | "work" | null>(null);
  const [feedAccount, setFeedAccount] = useState<HomeChannel | null>(null);
  const [savedFeed, setSavedFeed] = useState<SavedChannel | null>(null);
  const finishedAssets = useQuery({ queryKey: ["home-has-finished-assets", ws], queryFn: async () => {
    const [tiles, videos, written] = await Promise.all([
      supabase.from("brand_files").select("id").eq("workspace_id", ws).eq("source", "social_tile").limit(1),
      supabase.from("render_jobs").select("id").eq("workspace_id", ws).eq("status", "done").not("storage_path", "is", null).limit(1),
      fetchHomeWrittenPosts(ws),
    ]);
    if (tiles.error || videos.error) throw new Error("Could not check your finished assets.");
    return !!(tiles.data?.length || videos.data?.length || written.length);
  } });
  const [brandRetrying, setBrandRetrying] = useState(false);
  const getBrandProgress = useServerFn(getAgencyClientDiscoveryProgress);
  const startBrandReview = useServerFn(startAutomaticBrandDiscovery);
  const brandProgress = useQuery({
    queryKey: ["agency-client-discovery-progress", ws],
    queryFn: () => getBrandProgress({ data: { workspace_id: ws } }),
    refetchInterval: (query) => brandRetrying || ["queued", "running"].includes(query.state.data?.status ?? "") ? 3000 : false,
  });
  const navigate = useNavigate();
  function openSocialTiles() {
    try {
      sessionStorage.setItem(`as:social-tiles:${ws}`, JSON.stringify({ brief: "" }));
      void navigate({ to: "/app/create", search: { wizard: "tiles" } });
    } catch {
      setError("Could not open social tiles. Please try again.");
    }
  }
  const getOverview = useServerFn(getHomeOverview);
  const inspect = useServerFn(getModelVideoRequest);
  const create = useServerFn(createModelVideo);
  const retryRender = useServerFn(retryFailedProduction);
  const getRetryQuote = useServerFn(getRetryProductionQuote);
  const getModelQuote = useServerFn(quoteModelVideo);
  const moveToTrash = useServerFn(trashHomeItems);
  const retryPlanning = useServerFn(retryHomePlanning);
  const lock = useRef(false);
  const alive = useRef(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [legacyRequest, setLegacyRequest] = useState<ModelCreateRequest>();
  const [attempts, setAttempts] = useState<Record<string, ModelCreateRequest>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmRetry, setConfirmRetry] = useState<{ items: HomeOverviewItem[]; skipped: number; bulk: boolean } | null>(null);
  const [confirmTrash, setConfirmTrash] = useState<HomeOverviewItem[] | null>(null);
  useEffect(() => {
    alive.current = true;
    setLegacyRequest(storedRequest(`${modelKey(ws)}:pending`, ws));
    return () => { alive.current = false; };
  }, [ws]);
  const overview = useQuery({
    queryKey: ["home-overview", ws, "home"],
    queryFn: () => getOverview({ data: { workspace_id: ws, view: "home" } }),
    refetchInterval: (query) => query.state.data?.some((item) => Object.values(item.stages).includes("active")) ? 8000 : false,
  });
  const items = overview.data ?? [];
  const visibleItems = items.filter((item) => item.stages.video !== "complete");
  useEffect(() => {
    const ids = new Set((overview.data ?? []).map((item) => item.id));
    setSelected((current) => new Set([...current].filter((id) => ids.has(id))));
  }, [overview.data]);
  useEffect(() => {
    const saved: Record<string, ModelCreateRequest> = {};
    for (const item of overview.data ?? []) {
      const request = storedRequest(attemptKey(ws, item.batch_id), ws);
      if (request) saved[item.batch_id] = request;
    }
    setAttempts(saved);
  }, [overview.data, ws]);
  const attention = visibleItems.filter((item) => item.action === "reconcile");
  const progressing = visibleItems.filter((item) => !attention.includes(item) && Object.values(item.stages).includes("active"));
  const recent = visibleItems.filter((item) => !attention.includes(item) && !progressing.includes(item));
  function retrySetup(item: HomeOverviewItem) {
    return item.resume_request ?? (item.can_resume_model === true && legacyRequest?.request_id === item.batch_id ? legacyRequest : undefined);
  }
  function openItem(item: HomeOverviewItem) {
    if (item.action !== "reconcile" && item.source === "models" && (!item.variant_id || item.render_id)) {
      try {
        if (item.variant_id && item.render_id) sessionStorage.setItem(modelKey(ws), JSON.stringify({ batch_id: item.batch_id, variant_id: item.variant_id }));
        else if (item.resume_request) { sessionStorage.removeItem(modelKey(ws)); sessionStorage.setItem(`${modelKey(ws)}:pending`, JSON.stringify(item.resume_request)); }
      } catch { /* Saved server work remains available when browser storage is disabled. */ }
      void navigate({ to: "/app/models" });
    } else {
      try { sessionStorage.setItem(`as:create-batch:${ws}`, item.batch_id); } catch { /* Optional editor selection. */ }
      void navigate({ to: "/app/create", search: { wizard: "video" } });
    }
  }
  function subsequentAttempt(item: HomeOverviewItem) {
    return (item.can_resume_model === true || !!item.resume_request) && attempts[item.batch_id]?.request_id !== item.batch_id ? attempts[item.batch_id] : undefined;
  }
  function retryKind(item: HomeOverviewItem): "model" | "render" | "planning" | undefined {
    if (Object.values(item.stages).includes("active") || !Object.values(item.stages).includes("failed") || item.action === "reconcile") return undefined;
    if (item.action === "retry_planning") return "planning";
    if (item.action === "retry_render" && item.variant_id && item.render_id) return "render";
    if (!subsequentAttempt(item) && item.source === "models" && retrySetup(item) && (item.action === "retry_model" || (!item.variant_id && item.action === "resume" && item.stages.storyboard === "failed"))) return "model";
    return undefined;
  }
  const retryQuotes = useQuery({ queryKey: ["home-retry-quotes", ws, confirmRetry?.items.map((item) => item.id).join(":")], enabled: !!confirmRetry, retry: false, queryFn: () => Promise.all(confirmRetry!.items.map(async (item) => {
    const kind = retryKind(item);
    if (kind === "render") return { kind, value: await getRetryQuote({ data: { variant_id: item.variant_id!, render_id: item.render_id! } }) } as const;
    if (kind === "model") { const setup = storedRequest(attemptKey(ws, item.batch_id), ws) ?? retrySetup(item); if (!setup) throw new Error("Saved setup unavailable"); return { kind, value: await getModelQuote({ data: { workspace_id: ws, style_id: setup.style_id, duration: setup.duration } }) } as const; }
    if (kind === "planning") return { kind, value: null } as const;
    throw new Error("Retry is unavailable");
  })) });
  function trashReason(item: HomeOverviewItem) {
    if (Object.values(item.stages).includes("active")) return "Work in progress cannot be moved to Trash.";
    if (item.action === "reconcile") return "Inspect this provider request before moving it to Trash.";
    return item.can_trash ? undefined : item.trash_reason || "This item cannot be moved to Trash yet.";
  }
  const selectedItems = visibleItems.filter((item) => selected.has(item.id));
  const retryable = selectedItems.filter((item) => !!retryKind(item));
  const trashable = selectedItems.filter((item) => !trashReason(item));
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  async function performModelRetry(item: HomeOverviewItem, quote: { credits: number; rateId: string }): Promise<"queued" | "recovered" | "protected"> {
    const setup = retrySetup(item);
    if (!setup) return "protected";
    // Persist each attempt before submission so an uncertain response keeps its UUID.
    const candidate = storedRequest(attemptKey(ws, item.batch_id), ws) ?? setup;
    const status = await inspect({ data: { workspace_id: ws, request_id: candidate.request_id } });
    if (!alive.current) return "protected";
    if (status.state === "queued") {
      if (!status.batch_id || !status.variant_id) throw new Error("The saved video is missing its production reference. Open its saved work before retrying.");
      try { sessionStorage.setItem(modelKey(ws), JSON.stringify({ batch_id: status.batch_id, variant_id: status.variant_id })); } catch { /* Optional browser recovery. */ }
      return "recovered";
    }
    if (status.state === "preparing") return "protected";
    const request = { ...candidate, request_id: status.state === "failed" ? crypto.randomUUID() : candidate.request_id };
    try {
      sessionStorage.setItem(attemptKey(ws, item.batch_id), JSON.stringify(request));
      sessionStorage.setItem(`${modelKey(ws)}:pending`, JSON.stringify(request));
    } catch { /* Server ownership and atomic admission still apply. */ }
    setAttempts((current) => ({ ...current, [item.batch_id]: request }));
    const accepted = await create({ data: { ...request, expected_credits: quote.credits, expected_rate_id: quote.rateId } });
    try { sessionStorage.setItem(modelKey(ws), JSON.stringify(accepted)); sessionStorage.removeItem(`${modelKey(ws)}:pending`); } catch { /* Optional browser recovery. */ }
    return "queued";
  }
  async function performPlanningRetry(item: HomeOverviewItem): Promise<"planning" | "recovered"> {
    const result = await retryPlanning({ data: { workspace_id: ws, job_id: item.id } });
    if (result.status === "completed") return "recovered";
    if (result.status === "queued" || result.status === "running") return "planning";
    throw new Error(result.error || "Storyboard planning could not be queued. Open the saved work to inspect it.");
  }
  async function runRetries(work: HomeOverviewItem[], skipped = 0, bulk = false) {
    if (lock.current || !work.length || !retryQuotes.data || retryQuotes.isFetching || retryQuotes.isError) return;
    const approved = retryQuotes.data;
    lock.current = true; setBusy(work[0]!.id); setError(null); setNotice(null); setConfirmRetry(null);
    const completed: string[] = [], failures: string[] = [];
    let queued = 0, planning = 0, recovered = 0, protectedCount = skipped;
    try {
      for (const [index, item] of work.entries()) {
        if (!alive.current) break;
        setBusy(item.id);
        const kind = retryKind(item);
        if (!kind) { protectedCount++; continue; }
        try {
          const q = approved[index];
          if (!q || q.kind !== kind) throw new Error("Retry quote changed. Review again.");
          const result = q.kind === "model" ? await performModelRetry(item, q.value) : q.kind === "planning"
            ? await performPlanningRetry(item)
            : (await retryRender({ data: { variant_id: item.variant_id!, render_id: item.render_id!, confirmed: true, expected_version: q.value.creditVersion, expected_credits: q.value.creditCost, expected_lines: q.value.creditLines, expected_completed_step_ids: q.value.completedStepIds } }), "queued" as const);
          if (result === "protected") { protectedCount++; continue; }
          completed.push(item.id);
          if (result === "recovered") recovered++; else if (result === "planning") planning++; else queued++;
        } catch (cause) { failures.push(`${item.title}: ${message(cause)}`); }
      }
      if (!alive.current) return;
      setSelected((current) => new Set([...current].filter((id) => !completed.includes(id))));
      if (failures.length) setError(failures.join(" "));
      if (!bulk && work.length === 1 && !failures.length) {
        setNotice(recovered ? "This video is already queued or finished. No duplicate was started." : protectedCount ? "This request is still preparing or checking provider work. No second video was started. Open the saved work to inspect it." : planning ? "Storyboard planning is queued again. No video render was started." : "Your video is queued. Production continues if you leave Home.");
      } else {
        setNotice(`${queued + planning} retried; ${recovered} already active or finished; ${protectedCount} skipped; ${failures.length} failed.${failures.length ? " Failed and skipped items remain selected." : ""}`);
      }
    } finally {
      lock.current = false;
      if (alive.current) { setBusy(null); void overview.refetch(); }
    }
  }
  async function changeTrash(work: HomeOverviewItem[]) {
    if (lock.current || !work.length) return;
    lock.current = true; setBusy(work[0]!.id); setError(null); setNotice(null); setConfirmTrash(null);
    try {
      const updated: string[] = [], failures: string[] = [];
      for (let offset = 0; offset < work.length && alive.current; offset += 20) {
        const chunk = work.slice(offset, offset + 20);
        try {
          const result = await moveToTrash({ data: { workspace_id: ws, item_ids: chunk.map((item) => item.id) } });
          updated.push(...result.updated_ids);
          failures.push(...(result.errors ?? []).map((failure) => `${chunk.find((item) => item.id === failure.id)?.title || "Saved work"}: ${failure.message}`));
        } catch (cause) { failures.push(`${chunk.map((item) => item.title).join(", ")}: ${message(cause)}`); }
      }
      if (!alive.current) return;
      setSelected((current) => new Set([...current].filter((id) => !updated.includes(id))));
      setNotice(`${updated.length} item${updated.length === 1 ? "" : "s"} moved to Trash.`);
      if (failures.length) setError(failures.join(" "));
    } catch (cause) { if (alive.current) setError(message(cause)); }
    finally { lock.current = false; if (alive.current) { setBusy(null); void overview.refetch(); } }
  }
  function card(item: HomeOverviewItem) {
    const setup = retrySetup(item);
    const subsequent = subsequentAttempt(item);
    const promptOnly = item.source === "models" && !item.variant_id && !setup;
    const kind = retryKind(item);
    const blockedTrash = trashReason(item);
    return <article key={item.id} aria-label={item.title} className="flex min-w-0 flex-col rounded-[20px] border border-border-control bg-surface p-5 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3"><label className="inline-flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" aria-label={`Select ${item.title}`} checked={selected.has(item.id)} disabled={!!busy} onChange={() => toggle(item.id)} className="size-4 accent-ink" />Select</label>{<button type="button" aria-label={`Move ${item.title} to Trash`} title={blockedTrash || "Move to Trash; restore it later"} disabled={!!busy || !!blockedTrash} className="rounded-lg p-2 hover:bg-surface-subtle disabled:opacity-40" onClick={() => setConfirmTrash([item])}><Trash2 className="size-4" aria-hidden /></button>}</div>
      <div className="min-w-0"><p className="text-xs font-semibold text-muted-foreground">{item.model_name ?? (setup ? getVideoStyle(setup.style_id)?.name : undefined) ?? (item.source === "models" ? "Models video" : "Create Assets")}</p><h3 className="mt-2 line-clamp-3 font-display text-xl font-bold leading-snug">{item.title}</h3></div>
      <p className={cn("mt-4 text-sm font-semibold", Object.values(item.stages).includes("failed") ? "text-warning" : "text-text-secondary")}>{subsequent ? "Previous attempt" : item.status}</p>
      <ol className="my-5 grid gap-2" aria-label="Video stages">{(["narrative", "storyboard", "video"] as const).map((stage) => {
        const state = item.stages[stage], label = stage[0]!.toUpperCase() + stage.slice(1);
        const stateLabel = state === "complete" ? "Complete" : state === "active" ? "In progress" : state === "failed" ? "Failed" : "Not started";
        const Icon = state === "complete" ? Check : state === "active" ? Loader2 : state === "failed" ? CircleAlert : Circle;
        return <li key={stage} className="flex items-center gap-3 text-sm" aria-label={`${label}: ${stateLabel}`}><Icon aria-hidden className={cn("size-4 shrink-0", state === "complete" ? "text-success" : state === "failed" ? "text-warning" : "text-muted-foreground", state === "active" && "animate-spin")} /><span className="font-medium">{label}</span><span className="ml-auto text-xs text-muted-foreground">{stateLabel}</span></li>;
      })}</ol>
      {item.error && <p className="mb-4 line-clamp-3 text-sm text-muted-foreground">{item.error}</p>}
      {<div className="mt-auto flex flex-wrap gap-2">
        {subsequent && <button type="button" className={primary} disabled={!!busy} onClick={() => { try { sessionStorage.removeItem(modelKey(ws)); sessionStorage.setItem(`${modelKey(ws)}:pending`, JSON.stringify(subsequent)); } catch { /* The request remains saved on the server. */ } void navigate({ to: "/app/models" }); }}>View retry</button>}
        {kind && <button type="button" className={primary} disabled={!!busy} onClick={() => setConfirmRetry({ items: [item], skipped: 0, bulk: false })}>{busy === item.id ? <><Loader2 className="size-4 animate-spin" aria-hidden />Retrying…</> : "Retry"}</button>}
        {!subsequent && !promptOnly && <button type="button" className={kind ? secondary : primary} disabled={!!busy} onClick={() => openItem(item)}>{item.action === "view" ? "View video" : item.action === "reconcile" ? "Inspect saved work" : "Resume"}</button>}
        {!subsequent && promptOnly && <details className="w-full rounded-xl border border-border-control p-3"><summary className="cursor-pointer text-sm font-semibold">Review saved prompt</summary><p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{item.saved_prompt || "The original model settings are unavailable. Choose a video model to set up a new request."}</p><Link to="/app/models" className={cn(secondary, "mt-4")}>Choose video model</Link></details>}
      </div>}
    </article>;
  }
  const toolbar = <HomeChannelFeeds workspaceId={ws} profiles={brandProgress.data?.socialPosts ?? []} selected={savedFeed} onOpenSaved={(profile) => { setFeedAccount(null); setSavedFeed(profile); }} onOpen={(account) => { setSavedFeed(null); setFeedAccount(account); }} />;
  if (savedFeed) return <SavedChannelFeedPane workspaceId={ws} profile={brandProgress.data?.socialPosts.find(profile => profile.platform === savedFeed.platform && profile.handle === savedFeed.handle) ?? savedFeed} onClose={() => setSavedFeed(null)} toolbar={toolbar} refreshing={brandRetrying} onRefresh={() => { setBrandRetrying(true); void startBrandReview({ data: { workspace_id: ws, refresh_social: true } }).then(() => { window.setTimeout(() => { setBrandRetrying(false); void brandProgress.refetch(); }, 55000); }).catch(() => { setBrandRetrying(false); toast.error("Could not refresh social posts."); }); }} />;
  if (feedAccount) return <HomeChannelFeedPane account={feedAccount} onClose={() => setFeedAccount(null)} toolbar={toolbar} />;
  if (!workOverview) return <main className="mx-auto min-h-0 w-full max-w-4xl flex-1 space-y-6 overflow-y-auto p-4 text-ink md:p-6">
    <div className="flex justify-end">{toolbar}</div>
    {(brandProgress.isPending || finishedAssets.isPending) ? <p role="status" className="py-12 text-muted-foreground">Loading your brand review…</p> : brandProgress.isError ? <div role="alert" className="rounded-xl border border-warning p-5">Couldn’t load your brand review. <button type="button" className="underline" onClick={() => void brandProgress.refetch()}>Try again</button></div> : currentWorkspace?.workspace_kind === "personal" ? <PersonalBrandReview profileUrl={personalLinkedIn(currentWorkspace.social_profiles)} hasContent={!!finishedAssets.data} workspaceId={ws} channels={brandProgress.data!.socialPosts} onDiscoveryUpdated={() => void brandProgress.refetch()} /> : <BrandReviewHome profileUrl={personalLinkedIn(currentWorkspace?.social_profiles)} showCompanyGoals={currentWorkspace?.workspace_kind !== "lead" || !!currentWorkspace.website || !!brandProgress.data?.socialPosts.some(channel => channel.platform === "linkedin" && /\/company\//i.test(channel.url ?? "")) || !personalLinkedIn(currentWorkspace.social_profiles)} hasContent={!!finishedAssets.data} workspaceId={ws} name={name} website={currentWorkspace?.website ?? null} review={brandProgress.data!} retrying={brandRetrying} onRefresh={() => { setBrandRetrying(true); void startBrandReview({ data: { workspace_id: ws, refresh_social: true } }).then(() => { window.setTimeout(() => void brandProgress.refetch(), 3000); return brandProgress.refetch(); }).catch(() => setError("Could not refresh social posts.")).finally(() => setBrandRetrying(false)); }} />}

    {error && <p role="alert" className="rounded-xl border border-warning p-4 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-border-control bg-surface-subtle p-4 text-sm">{notice}</p>}
  </main>;
  return <main className="mx-auto min-h-0 w-full max-w-4xl flex-1 space-y-6 overflow-y-auto p-4 text-ink md:p-6">
    <header className="space-y-5"><div><p className="text-sm font-semibold text-muted-foreground">{name}</p><h1 className="mt-2 font-display text-4xl font-bold">Home</h1><p className="mt-3 max-w-2xl text-muted-foreground">Pick up where you left off. See what is ready, what is being made, and what needs attention.</p></div><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex flex-wrap gap-2"><a href="/app/create?wizard=video" className={secondary}>Create a video</a><button type="button" className={secondary} onClick={openSocialTiles}>Create social tiles</button></div><div className="flex items-center gap-2">{toolbar}<a href="/app/home" className={secondary}>{currentWorkspace?.workspace_kind === "personal" ? "Personal brand review" : "Brand story"}</a></div></div></header>
    {error && <p role="alert" className="rounded-xl border border-warning bg-warning-surface p-4 text-sm">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-border-control bg-surface-subtle p-4 text-sm">{notice}</p>}
    {<><div role="tablist" aria-label="Home sections" className="flex gap-2 border-b border-border-control"><button role="tab" type="button" aria-selected={(homeTab ?? (finishedAssets.data ? "content" : "work")) === "content"} onClick={() => setHomeTab("content")} className="px-4 py-3 text-sm font-semibold aria-selected:border-b-2 aria-selected:border-ink">Content</button><button role="tab" type="button" aria-selected={(homeTab ?? (finishedAssets.data ? "content" : "work")) === "work"} onClick={() => setHomeTab("work")} className="px-4 py-3 text-sm font-semibold aria-selected:border-b-2 aria-selected:border-ink">Work in progress</button></div>{(homeTab ?? (finishedAssets.data ? "content" : "work")) === "content" && <HomeContentLinks workspaceId={ws} showWorkLink={false} />}</>}
    <div hidden={(homeTab ?? (finishedAssets.data ? "content" : "work")) === "content"} className="space-y-6">
    {visibleItems.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border-control bg-surface-subtle p-3" aria-label="Selected work actions"><label className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold"><input type="checkbox" aria-label="Select all shown work" checked={selectedItems.length === visibleItems.length} disabled={!!busy} onChange={(event) => setSelected(event.target.checked ? new Set(visibleItems.map((item) => item.id)) : new Set())} className="size-4 accent-ink" />Select all</label><button type="button" disabled={!!busy || !selectedItems.length} className="text-sm underline disabled:opacity-40" onClick={() => setSelected(new Set())}>Clear selection</button><span className="text-xs text-muted-foreground">{selectedItems.length} selected{selectedItems.length ? ` · ${retryable.length} can retry` : ""}</span><div className="flex flex-wrap gap-2">{<><button type="button" className={secondary} disabled={!!busy || !retryable.length} onClick={() => setConfirmRetry({ items: retryable, skipped: selectedItems.length - retryable.length, bulk: true })}>Retry selected</button><button type="button" className={secondary} disabled={!!busy || !trashable.length} onClick={() => setConfirmTrash(trashable)}>Move selected to Trash</button></>}</div></div>}
    {overview.isPending ? <p role="status" className="py-12 text-muted-foreground">Loading your recent work…</p> : overview.isError ? <div role="alert" className="rounded-xl border border-warning p-5"><p>Your recent work could not be loaded.</p><button type="button" className={cn(secondary, "mt-3")} onClick={() => void overview.refetch()}>Try again</button></div> : !visibleItems.length && (items.length > 0 || finishedAssets.data) ? null : !visibleItems.length ? <section className="rounded-[20px] border border-dashed border-border-control bg-surface p-8"><h2 className="font-display text-2xl font-bold">Your next creation starts here</h2><p className="mt-3 max-w-xl text-muted-foreground">Start with Sam in Create Assets. Your progress will appear here.</p></section> : <>
      {attention.length > 0 && <section aria-label="Needs attention"><h2 className="mb-4 font-display text-2xl font-bold">Needs attention</h2><div className={cardGrid}>{attention.map(card)}</div></section>}
      {progressing.length > 0 && <section aria-label="In progress"><h2 className="mb-4 font-display text-2xl font-bold">In progress</h2><div className={cardGrid}>{progressing.map(card)}</div></section>}
      {recent.length > 0 && <section aria-label="Recent work"><h2 className="mb-4 font-display text-2xl font-bold">Recent work</h2><div className={cardGrid}>{recent.map(card)}</div></section>}
    </>}
    </div>
    <footer className="border-t border-border pt-5 text-sm"><Link to="/app/sam-creations" className="font-semibold underline underline-offset-4">Browse your creations →</Link></footer>
    <AlertDialog open={!!confirmRetry} onOpenChange={(open) => { if (!open) setConfirmRetry(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{confirmRetry?.bulk ? `Retry ${confirmRetry.items.length} selected items?` : "Retry this failed video?"}</AlertDialogTitle><AlertDialogDescription>{retryQuotes.isPending ? "Checking credit costs for selected items…" : retryQuotes.isError ? "A safe retry quote is unavailable. Check the original production before retrying." : `Retry costs ${retryQuotes.data.reduce((sum, quote) => sum + (quote.value ? (quote.kind === "render" ? quote.value.creditCost : quote.value.credits) : 0), 0)} credits. Completed work is reused where supported.`}</AlertDialogDescription></AlertDialogHeader><ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm">{confirmRetry?.items.map((item) => <li key={item.id}>{item.title}</li>)}</ul>{!!confirmRetry?.skipped && <p className="text-sm text-muted-foreground">{confirmRetry.skipped} selected item{confirmRetry.skipped === 1 ? " cannot" : "s cannot"} be retried and will be skipped.</p>}<AlertDialogFooter><AlertDialogCancel>Keep failed attempt</AlertDialogCancel><AlertDialogAction disabled={!!busy || !retryQuotes.data || retryQuotes.isFetching || retryQuotes.isError} onClick={() => { if (confirmRetry) void runRetries(confirmRetry.items, confirmRetry.skipped, confirmRetry.bulk); }}>Confirm retry</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    <AlertDialog open={!!confirmTrash} onOpenChange={(open) => { if (!open) setConfirmTrash(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Move {confirmTrash?.length ?? 0} item{confirmTrash?.length === 1 ? "" : "s"} to Trash?</AlertDialogTitle><AlertDialogDescription>You can restore these items from Trash. Their saved work and production history will be kept.</AlertDialogDescription></AlertDialogHeader><ul className="max-h-48 list-disc space-y-1 overflow-y-auto pl-5 text-sm">{confirmTrash?.map((item) => <li key={item.id}>{item.title}</li>)}</ul><AlertDialogFooter><AlertDialogCancel>Keep items</AlertDialogCancel><AlertDialogAction disabled={!!busy} onClick={() => { if (confirmTrash) void changeTrash(confirmTrash); }}>Move to Trash</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>;
}
