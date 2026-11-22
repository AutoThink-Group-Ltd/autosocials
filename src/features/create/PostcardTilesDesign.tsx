import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PipelineTrashAction, usePipelineTrash } from "./PipelineTrash";
import { TileCopyPreview } from "./TileCopyPreview";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Check, Image, Sparkles } from "lucide-react";
import {
  generatePostcardTile,
  checkPostcardTile,
  quotePostcardTile,
  redesignPostcardTile,
} from "@/lib/postcard-tiles.functions";
import { SocialDesignEditor } from "./SocialDesignEditor";
import { useScheduleDialog } from "@/features/schedule/ScheduleDialogHost";
import { useAssetPublishingStatus } from "@/features/schedule/useAssetPublishingStatus";
import { AssetBuildProgress, AssetWorkflow } from "./AssetWorkflow";
import { tileRequestUuid } from "@/lib/social-tile-run";
import type { TilePlan } from "@/lib/social-tiles";
import { productionTileInput } from "./production-tile-input";

type Entry = {
  requestId: string;
  postId: string;
  fileId?: string;
  url?: string;
  status: string;
  message?: string;
};
type Checkpoint = {
  plan: TilePlan;
  entries: Omit<Entry, "url">[];
  draftsDone: boolean;
  compact?: boolean;
};
const primary =
  "rounded-xl bg-ink px-5 py-3 text-sm font-semibold text-inverse disabled:opacity-50";
const secondary =
  "rounded-xl border border-border-control px-4 py-2 text-sm font-semibold disabled:opacity-50";
export function PostcardTilesDesign({
  workspaceId,
  plan,
  onBack,
  storageKey,
}: {
  workspaceId: string;
  plan: TilePlan;
  onBack: () => void;
  storageKey?: string;
}) {
  if (plan.tiles.every(tile => tile.design)) return <SocialDesignEditor workspaceId={workspaceId} plan={plan} {...(storageKey ? { storageKey } : {})} onBack={onBack} />;
  return <PostcardTileBatch workspaceId={workspaceId} plan={plan} {...(storageKey ? { storageKey } : {})} onBack={onBack} />;
}

function canCreate(entry: Entry) {
  return ["not_started", "not_found", "limit_reached"].includes(entry.status);
}

async function canvasTileRequestId(key: string, index: number) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${key}:${index}`));
  return tileRequestUuid(new Uint8Array(digest));
}

export function PostcardTileBatch({ workspaceId, plan, onBack, storageKey, compact = false, restoreProduction = false, returnedToPlans = false, canvasId, onProductionChange, onProductionStart }: { workspaceId: string; plan: TilePlan; onBack?: () => void; storageKey?: string; compact?: boolean; restoreProduction?: boolean; returnedToPlans?: boolean; canvasId?: string; onProductionChange?: (() => void) | undefined; onProductionStart?: (() => Promise<void>) | undefined }) {
  const generate = useServerFn(generatePostcardTile),
    check = useServerFn(checkPostcardTile), quote = useServerFn(quotePostcardTile), redesign = useServerFn(redesignPostcardTile);
  const { scheduleSelection } = useScheduleDialog();
  const tileInput = (tile: TilePlan["tiles"][number], index: number) => ({
    workspace_id: workspaceId,
    ...(plan.standalone ? { standalone: true as const } : {}),
    ...(compact ? productionTileInput(tile, index) : { headline: tile.headline, supporting: tile.supporting, direction: tile.direction || "" }),
  });
  const quotes = useQuery({ queryKey: ["social-tile-credit-quotes", workspaceId, plan.tiles, compact, plan.standalone], retry: false, queryFn: () => Promise.all(plan.tiles.map((tile, index) => quote({ data: tileInput(tile, index) }))) });
  const key = storageKey ?? `as:postcard-tile-run:${workspaceId}`;
  const [entries, setEntries] = useState<Entry[]>([]);
  const original = JSON.stringify(plan);
  const tileCount = plan.tiles.length;
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const saved = JSON.parse(
          sessionStorage.getItem(key) ?? "null",
        ) as Checkpoint | null;
        if (
          saved &&
          JSON.stringify(saved.plan) === original &&
          Array.isArray(saved.entries) &&
          saved.entries.length === tileCount &&
          saved.entries.every(
            (entry) =>
              typeof entry.requestId === "string" &&
              typeof entry.postId === "string",
          )
        ) {
          setEntries(saved.entries);
          return;
        }
      } catch {
        /* Start with fresh identifiers. */
      }
      const requestIds = compact
        ? await Promise.all(Array.from({ length: tileCount }, (_, i) => canvasTileRequestId(key, i)))
        : Array.from({ length: tileCount }, () => crypto.randomUUID());
      if (active) setEntries(requestIds.map((requestId) => ({
        requestId, postId: crypto.randomUUID(), status: "not_started",
      })));
    }
    void restore().catch(() => {
      if (active) setError("Could not open the tile plan. Try reopening it.");
    });
    return () => { active = false; };
  }, [key, original, compact, tileCount]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [showProgress, setShowProgress] = useState(false);
  const [checkedRemote, setCheckedRemote] = useState(false);
  const triedRestore = useRef(false);
  const [activity, setActivity] = useState<"designing" | "checking" | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [selected, setSelected] = useState(() => plan.tiles.map(() => true));
  const running = useRef(false);
  const trash = usePipelineTrash(canvasId ? workspaceId : "");
  const tileTrashKey = (entry: Entry) => `production-item:canvas:${canvasId}:tile:${entry.requestId}`;
  const isVisible = (entry?: Entry) => !canvasId || !entry || !trash.ids.includes(tileTrashKey(entry));
  const waitingForTrash = !!canvasId && (trash.isLoading || trash.isError || trash.isPending);
  const canApprove = (entry: Entry, index: number) => isVisible(entry) && !!selected[index] && canCreate(entry);
  const fileIds = compact ? entries.flatMap((entry) => isVisible(entry) && entry.status === "ready" && entry.fileId ? [entry.fileId] : []) : [];
  const publishing = useAssetPublishingStatus(workspaceId, fileIds);
  const persist = (next: Entry[]) => {
    const stored: Checkpoint = {
      plan,
      entries: next.map(({ url: _url, ...entry }) => entry),
      draftsDone: false,
      ...(compact ? { compact: true } : {}),
    };
    sessionStorage.setItem(key, JSON.stringify(stored));
  };
  const [creditBlock, setCreditBlock] = useState<{ reason: string; message: string; tile: number } | null>(null);
  const [redesignDraft, setRedesignDraft] = useState<{ index: number; headline: string; supporting: string } | null>(null);
  const redesignOne = async () => {
    if (!redesignDraft) return;
    const { index, headline, supporting } = redesignDraft;
    const entry = entries[index], price = quotes.data?.[index], tile = plan.tiles[index];
    if (running.current || !entry?.fileId || !price || !tile) return;
    running.current = true;
    setBusy(true);
    setActivity("designing");
    setActiveIndex(index);
    setError("");
    setNotice("");
    try {
      const input = { ...tileInput(tile, index), headline: headline.trim(), supporting: supporting.trim() };
      const currentPrice = await quote({ data: input });
      if (currentPrice.credits !== price.credits || currentPrice.provider !== price.provider || currentPrice.rateId !== price.rateId) {
        setError("The redesign price changed. Refresh the credit quote and try again.");
        void quotes.refetch();
        return;
      }
      const result = await redesign({ data: {
        ...input, original_request_id: entry.requestId, expected_file_id: entry.fileId,
        expected_provider: price.provider, expected_credits: price.credits, expected_rate_id: price.rateId,
      } });
      if (result.status === "ready") {
        const next = entries.map((item, i) => i === index ? { ...item, fileId: result.file_id, url: result.data_url, status: "ready" } : item);
        persist(next);
        setEntries(next);
        setRedesignDraft(null);
        setNotice(`Tile ${index + 1} has been redesigned.`);
      } else if ("creditIssue" in result && result.creditIssue && "message" in result) {
        setCreditBlock({ reason: result.creditIssue, message: result.message, tile: index + 1 });
      } else {
        setError("The redesign needs a status check. Select Redesign again to check the same request.");
      }
    } catch {
      setError("Could not complete the redesign. Check the tile status before trying again.");
    } finally {
      onProductionChange?.();
      running.current = false;
      setBusy(false);
      setActiveIndex(null);
    }
  };
  const creditDialog = (
    <Dialog open={creditBlock !== null} onOpenChange={(open) => { if (!open) setCreditBlock(null); }}>
      {creditBlock && (
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{creditBlock.reason === "insufficient" ? "Not enough content credits" : creditBlock.reason === "payment_pending" ? "Upgrade payment pending" : "Content credits need attention"}</DialogTitle>
            <DialogDescription>
              Tile {creditBlock.tile} couldn’t start. {creditBlock.message} Any remaining tiles in this batch haven’t been submitted.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={secondary} onClick={() => setCreditBlock(null)}>Close</button>
            <a className={primary} href="/app/billing">{creditBlock.reason === "insufficient" ? "View upgrade options" : "View billing"}</a>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
  const run = async (statusOnly: boolean) => {
    if (running.current || entries.length !== tileCount) return;
    if (!statusOnly && (waitingForTrash || !quotes.data || quotes.isError || quotes.isFetching)) return;
    running.current = true;
    if (!compact) setShowProgress(true);
    setBusy(true);
    setActivity(statusOnly ? "checking" : "designing");
    setError("");
    setNotice("");
    const next = entries.map((entry) => ({ ...entry }));
    try {
      // Keep request IDs before any paid call; subsequent checks never create a project.
      persist(next);
      if (compact && !statusOnly) await onProductionStart?.();
      for (let i = 0; i < next.length; i++) {
        const entry = next[i]!,
          idea = plan.tiles[i]!;
        if (!isVisible(entry)) continue;
        if (!statusOnly && !canApprove(entry, i)) continue;
        if (compact && statusOnly && entry.url && entry.status === "ready") continue;
        if (!statusOnly) {
          next[i] = {
            ...entry,
            status: "pending",
            message: "Sam is creating your design…",
          };
          persist(next);
          setEntries([...next]);
        }
        setActiveIndex(i);
        let result = statusOnly
          ? await check({
              data: { workspace_id: workspaceId, request_id: entry.requestId },
            }).catch((cause: unknown) => {
              if (!compact) throw cause;
              return { status: "reconciliation_required" as const, message: "Could not check this tile. Check its status before trying again." };
            })
          : await generate({
              data: {
                ...tileInput(idea, i),
                request_id: entry.requestId,
                expected_provider: quotes.data![i]!.provider,
                expected_credits: quotes.data![i]!.credits,
                expected_rate_id: quotes.data![i]!.rateId,
              },
            });
        // A pending response is the same request, not permission to create another.
        // Wait for it to resolve before moving to the next approved tile.
        if (compact && !statusOnly && result.status === "pending") {
          for (let attempt = 0; attempt < 12 && result.status === "pending"; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
            result = await check({ data: { workspace_id: workspaceId, request_id: entry.requestId } });
          }
        }
        if (result.status === "ready")
          next[i] = {
            requestId: entry.requestId,
            postId: entry.postId,
            status: "ready",
            fileId: result.file_id,
            ...("data_url" in result ? { url: result.data_url } : {}),
          };
        else if (result.status === "not_found")
          next[i] = {
            ...entry,
            status: "not_found",
            message: "Not yet submitted.",
          };
        else
          next[i] = {
            ...entry,
            status: result.status,
            message: result.message,
          };
        persist(next);
        setEntries([...next]);
        if (!statusOnly && result.status !== "ready") {
          if ("creditIssue" in result && result.creditIssue && "message" in result) {
            setCreditBlock({ reason: result.creditIssue, message: result.message, tile: i + 1 });
          }
          break;
        }
      }
      setEntries([...next]);
      if (statusOnly) setCheckedRemote(true);
      if (next.filter((entry, i) => selected[i] && isVisible(entry)).every((entry) => entry.status === "ready"))
        setNotice(
          "Your designs are ready for review and saved privately in Brand assets.",
        );
      else if (!compact)
        setNotice("Production paused. Check the active design before approving any remaining tiles.");
    } catch (cause) {
      setEntries([...next]);
      const message = cause instanceof Error ? cause.message : "";
      setError(
        /^(Postcards is not connected|The tile rendering service is not connected|The image allowance could not be checked)/.test(
          message,
        )
          ? message
          : "Could not confirm the request status. Check the same request before trying again.",
      );
    } finally {
      if (compact) onProductionChange?.();
      running.current = false;
      setBusy(false);
      setActiveIndex(null);
    }
  };
  const anyStarted = entries.some(
    (entry) => entry.status !== "not_started" && entry.status !== "not_found",
  );
  useEffect(() => {
    if (!compact || !restoreProduction || triedRestore.current || running.current ||
        entries.length !== tileCount || entries.every(entry => entry.status === "ready" && entry.url)) return;
    triedRestore.current = true;
    void run(true);
    // Restoring an existing production run is a one-time read for this canvas revision.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compact, restoreProduction, tileCount, entries.length]);
  const needsStatusCheck = entries.some((entry, i) =>
    isVisible(entry) && selected[i] && entry.status !== "ready" && !canCreate(entry),
  );
  if (compact) {
    const visibleCount = plan.tiles.filter((_, i) => isVisible(entries[i])).length;
    const selectedEntries = entries.filter((entry, i) => isVisible(entry) && selected[i]);
    const toCreate = entries.filter(canApprove).length;
    const ready = entries.filter((entry) => isVisible(entry) && entry.status === "ready").length;
    const loaded = entries.length === tileCount;
    const credits = quotes.data?.reduce((sum, item, i) => {
      const entry = entries[i];
      return sum + (entry && canApprove(entry, i) ? item.credits : 0);
    }, 0);
    const approvalCount = loaded ? toCreate : tileCount;
    const approvalLabel = `Approve and design ${approvalCount} tile${approvalCount === 1 ? "" : "s"}`;
    const allReady = visibleCount > 0 && ready === visibleCount && fileIds.length === visibleCount;
    const needsRemoteStatus = restoreProduction && !checkedRemote && !anyStarted;
    const receipts = (id: string) => publishing.data?.[id] ?? [];
    const posted = (id: string) => receipts(id).some((receipt) => receipt.status === "published");
    const scheduled = (id: string) => receipts(id).some((receipt) =>
      ["scheduled", "publishing"].includes(receipt.postStatus) && !["failed", "skipped", "published"].includes(receipt.status),
    );
    const postedAll = allReady && fileIds.every(posted);
    const scheduledAll = allReady && fileIds.every((id) => posted(id) || scheduled(id));
    const progressLabel = `${ready} of ${visibleCount} designs ready`;
    const creditLabel = `${toCreate} tile${toCreate === 1 ? "" : "s"} · ${credits ?? 0} credits`;
    return (
      <section className="@container space-y-4" aria-label="Social tile sketches">
        {creditDialog}
        <Dialog open={redesignDraft !== null} onOpenChange={(open) => { if (!open && !busy) setRedesignDraft(null); }}>
          {redesignDraft && <DialogContent>
            <DialogHeader><DialogTitle>Redesign tile {redesignDraft.index + 1}</DialogTitle><DialogDescription>Review the copy before creating a new design. {quotes.data?.[redesignDraft.index]?.credits ?? 0} credits.</DialogDescription></DialogHeader>
            <label className="space-y-1 text-sm">Headline<input className="w-full rounded-lg border border-border-control bg-canvas p-2" maxLength={80} value={redesignDraft.headline} onChange={(event) => setRedesignDraft({ ...redesignDraft, headline: event.target.value })} /></label>
            <label className="space-y-1 text-sm">Supporting line<textarea className="w-full rounded-lg border border-border-control bg-canvas p-2" maxLength={70} value={redesignDraft.supporting} onChange={(event) => setRedesignDraft({ ...redesignDraft, supporting: event.target.value })} /></label>
            <button type="button" className={primary} disabled={busy || !redesignDraft.headline.trim()} onClick={() => void redesignOne()}>{busy ? "Designing…" : "Approve and redesign"}</button>
          </DialogContent>}
        </Dialog>
        <AssetWorkflow stage={returnedToPlans && !busy ? "plans" : postedAll ? "published" : scheduledAll ? "scheduled" : allReady ? "ready" : anyStarted || restoreProduction ? "production" : "plans"} />
        {busy && activeIndex !== null && <AssetBuildProgress label={activity === "checking" ? "Checking tile status" : `Designing tile ${activeIndex + 1} of ${tileCount}`} detail={`${ready} of ${tileCount} ready`} />}
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>{selectedEntries.length} selected</span>
          <button type="button" className={secondary} disabled={busy || !loaded} onClick={() => setSelected(plan.tiles.map(() => true))}>Select all tiles</button>
          <button type="button" className={secondary} disabled={busy || !selectedEntries.length} onClick={() => setSelected(plan.tiles.map(() => false))}>Clear selection</button>
          {canvasId && selectedEntries.length > 0 && (
            <PipelineTrashAction bulk tile title={`${selectedEntries.length} selected tile${selectedEntries.length === 1 ? "" : "s"}`} trashed={false} disabled={busy || waitingForTrash} onChange={() => trash.trashPlans(selectedEntries.map(tileTrashKey))} />
          )}
        </div>
        {visibleCount === 0 && <p className="text-sm text-muted-foreground">Restore trashed tiles from Settings → Deleted Items.</p>}
        <ol aria-label="Tile previews" className="grid gap-4 @md:grid-cols-2 @3xl:grid-cols-3">
          {plan.tiles.map((tile, i) => {
            const entry = entries[i];
            if (!isVisible(entry)) return null;
            const headline = tile.quote?.text ?? tile.headline;
            return (
              <li key={i} className="group/tile min-w-0">
                <div className="mb-2 flex items-baseline justify-between gap-2 text-xs font-semibold text-muted-foreground">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={selected[i]} disabled={busy || !loaded} aria-label={`Select tile ${i + 1}: ${headline}`} onChange={(event) => {
                      const checked = event.target.checked;
                      setSelected(current => current.map((value, index) => index === i ? checked : value));
                    }} />
                    <span aria-label={`Tile ${i + 1}`}>{i + 1}</span>
                  </label>
                  {busy && i === activeIndex ? (
                    <span>{activity === "checking" ? "Checking…" : "In production…"}</span>
                  ) : entry?.status === "limit_reached" ? (
                    <span title={entry.message}>Needs attention</span>
                  ) : entry && !canCreate(entry) && (
                    <span>{entry.status === "ready" ? "Ready" : "Check status"}</span>
                  )}
                </div>
                <div className="relative">
                  {entry?.url ? (
                    <img src={entry.url} alt={headline} className="aspect-square w-full rounded-xl object-contain" />
                  ) : (
                    <TileCopyPreview tile={productionTileInput(tile, i)} />
                  )}
                  {entry?.status === "ready" && entry.fileId && quotes.data?.[i] && (
                    <button type="button" className="absolute bottom-2 left-2 z-10 rounded-lg bg-canvas px-3 py-2 text-xs font-semibold opacity-0 transition-opacity group-hover/tile:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-100" disabled={busy || quotes.isFetching} onClick={() => { const input = productionTileInput(tile, i); setRedesignDraft({ index: i, headline: input.headline, supporting: input.supporting }); }}>
                      Redesign · {quotes.data[i]!.credits} credits
                    </button>
                  )}
                  {canvasId && entry && (
                    <div className="absolute bottom-2 right-2 z-10 rounded-lg bg-canvas opacity-0 transition-opacity group-hover/tile:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                      <PipelineTrashAction tile title={headline} trashed={false} disabled={busy || waitingForTrash} onChange={() => trash.setTrashed(tileTrashKey(entry), true)} />
                    </div>
                  )}
                  {busy && activity === "designing" && i === activeIndex && !entry?.url && (
                    <div role="status" aria-label={`Designing tile ${i + 1}`} className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-ink/90 p-5 text-center text-inverse">
                      <Sparkles aria-hidden className="size-8 motion-safe:animate-pulse" />
                      <span className="mt-4 font-semibold">Designing tile {i + 1} of {tileCount}</span>
                      <span className="mt-2 text-sm">{headline}</span>
                      <span aria-hidden className="mt-5 h-1.5 w-32 overflow-hidden rounded-full bg-inverse/25"><span className="build-progress-indeterminate block h-full bg-inverse" /></span>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
        <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-canvas px-4 py-3">
          <p className="text-sm" role="status">
            {quotes.isPending && !anyStarted
              ? "Checking credits…"
              : !busy && loaded && toCreate > 0 && quotes.data ? creditLabel : progressLabel}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {quotes.isError && toCreate > 0 && <button type="button" className={secondary} onClick={() => void quotes.refetch()}>Retry credit check</button>}
            {(needsRemoteStatus || (anyStarted && entries.some(entry => isVisible(entry) && !canCreate(entry) && !entry.url))) && <button type="button" className={secondary} disabled={busy || !loaded} onClick={() => void run(true)}>{ready === tileCount ? "Load designs" : "Check design status"}</button>}
            {approvalCount > 0 && !needsRemoteStatus && (
              <button type="button" className={primary} disabled={busy || waitingForTrash || !loaded || !quotes.data || quotes.isError || quotes.isFetching} onClick={() => void run(false)}>
                {busy && activity === "designing" ? "Producing designs…" : approvalLabel}
              </button>
            )}
            {allReady && !scheduledAll && <button type="button" className={primary} disabled={busy || publishing.isPending || publishing.isError} onClick={() => scheduleSelection({ tileIds: fileIds.filter((id) => !posted(id) && !scheduled(id)) })}>Schedule or publish</button>}
            {allReady && publishing.isError && <button type="button" className={secondary} onClick={() => void publishing.refetch()}>Check publishing status</button>}
          </div>
        </div>
        {error && <p role="alert" className="text-destructive">{error}</p>}
        {quotes.isError && toCreate > 0 && <p role="alert">Could not check credits. Try the credit check again.</p>}
        {canvasId && trash.isError && <p role="alert">Could not load trashed tiles. <button type="button" className="underline" onClick={() => void trash.refetch()}>Try again</button></p>}
        {!busy && needsStatusCheck && <p role="status">A design is still processing or needs checking. Approval covers only selected tiles that are ready to start.</p>}
        {notice && <p role="status">{notice}</p>}
      </section>
    );
  }
  if (entries.length !== tileCount) return <p role={error ? "alert" : "status"}>{error || "Opening designs…"}</p>;
  return (
    <section className="space-y-5" aria-label="Design selected social tiles">
      {creditDialog}
      {showProgress && activity && (
        <section aria-label="Design creation progress" className="build-in relative overflow-hidden rounded-[20px] bg-surface-subtle px-6 py-10 md:px-12 md:py-14">
          <div aria-hidden className="build-orbit pointer-events-none absolute -right-16 -top-24 size-72 rounded-full border-2 border-dashed border-ink/15" />
          <div aria-hidden className="build-orbit pointer-events-none absolute -bottom-24 -left-20 size-64 rounded-full border-2 border-ink/10" style={{ animationDirection: "reverse" }} />
          <div className="relative z-10 grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_220px]">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground"><span className="grid size-8 place-items-center rounded-full bg-ink text-inverse"><Sparkles className="size-4" /></span> AutoSocials Studio</div>
              <h2 role="status" className="mt-6 font-display text-[clamp(30px,4vw,46px)] font-bold leading-[1.08] tracking-tight">{busy ? (activity === "checking" ? "Checking your designs" : "Your designs are taking shape") : error || !entries.filter((_, i) => selected[i]).every(entry => entry.status === "ready") ? "Your designs need attention" : "Your design session is complete"}{busy && <span className="build-wave inline-block" aria-hidden>…</span>}</h2>
              <p className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground">{busy ? (activity === "checking" ? "Sam is checking the latest status of your saved requests." : "Sam is creating your selected designs one at a time using your brand assets.") : error || !entries.filter((_, i) => selected[i]).every(entry => entry.status === "ready") ? "Some designs need a status check before you continue. No new request will be submitted automatically." : "Review the status of each selected design below."}</p>
              <p className="mt-5 text-sm font-semibold tabular-nums">{entries.filter((entry, i) => selected[i] && entry.status === "ready").length} of {selected.filter(Boolean).length} selected designs ready</p>
              {activeIndex !== null && <p className="mt-2 text-sm text-muted-foreground">{activity === "checking" ? "Checking" : "Creating"}: <span className="font-semibold text-foreground">{plan.tiles[activeIndex]?.headline}</span></p>}
              {busy && <div role="progressbar" aria-label={activity === "checking" ? "Checking design status" : "Creating designs"} aria-valuetext="In progress" className="mt-5 h-1.5 max-w-md overflow-hidden rounded-full bg-ink/15"><div className="build-progress-indeterminate h-full rounded-full bg-ink" /></div>}
            </div>
            <div aria-hidden className="relative mx-auto aspect-square w-44 md:w-52">
              <div className="build-orbit absolute -inset-5 rounded-full border-2 border-dashed border-ink/25" />
              <div className="build-orbit absolute -inset-2 rounded-full border-2 border-ink/40" style={{ animationDirection: "reverse", borderTopColor: "transparent" }} />
              <div className="absolute inset-0 overflow-hidden rounded-[18px] border-2 border-ink bg-ink p-3 shadow-xl"><div className="flex h-full flex-col rounded-[10px] border border-inverse/30 bg-surface p-3"><div className="flex justify-between"><Image className="size-5" /><span className="text-[10px] font-bold">AS / STUDIO</span></div><div className="flex flex-1 flex-col justify-center gap-2">{[0, 1, 2].map((i) => <div key={i} className="build-rise rounded-[7px] border border-ink bg-surface-subtle p-2" style={{ animationDelay: `${i * 0.3}s` }}><div className="h-1 overflow-hidden rounded-full bg-ink/15"><div className="build-draw h-full bg-ink" style={{ animationDelay: `${i * 0.3}s` }} /></div><div className="mt-2 h-1 w-2/3 rounded-full bg-ink/30" /></div>)}</div><div className="h-2 w-1/2 rounded-full bg-ink" /></div></div>
            </div>
          </div>
          <ol className="relative z-10 mt-10 grid gap-3 sm:grid-cols-2">{plan.tiles.map((tile, i) => selected[i] && <li key={entries[i]!.requestId} className="rounded-xl border border-border-control bg-surface p-4"><p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Design {i + 1}</p><p className="mt-1 font-semibold">{tile.headline}</p><p className="mt-2 text-sm text-muted-foreground">{entries[i]!.status === "ready" ? "Ready and saved" : activeIndex === i && busy ? (activity === "checking" ? "Checking this request" : "Creating with your brand and creative direction") : entries[i]!.message ?? (entries[i]!.status === "not_started" || entries[i]!.status === "not_found" ? busy ? "Waiting to be created" : "Not started" : "Needs a status check")}</p></li>)}</ol>
          {!busy && error && <p role="alert" className="relative z-10 mt-4 text-destructive">{error}</p>}
          {!busy && <button type="button" className={primary + " relative z-10 mt-6"} onClick={() => setShowProgress(false)}>Close and review</button>}
        </section>
      )}
      <div>
        <h2 className="font-display text-2xl font-bold">
          Design your selected tiles
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Sam will design each selected narrative using your brand assets.
          Designs are saved as 1000 × 1000 images for review and use AI credits.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-control bg-surface-subtle px-4 py-3">
        <span className="text-sm font-semibold" role="status">{selected.filter(Boolean).length} of {plan.tiles.length} selected</span>
        <div className="flex gap-4 text-sm font-semibold">
          <button type="button" disabled={busy} className="underline underline-offset-4 disabled:opacity-50" onClick={() => setSelected(plan.tiles.map(() => true))}>Select all</button>
          <button type="button" disabled={busy} className="underline underline-offset-4 disabled:opacity-50" onClick={() => setSelected(plan.tiles.map(() => false))}>Clear selection</button>
        </div>
      </div>
      {quotes.isPending ? <p role="status">Checking credit prices…</p> : quotes.isError ? <p role="alert">Credit prices are unavailable. No designs can start until pricing is checked. <button type="button" className="underline" onClick={() => void quotes.refetch()}>Try again</button></p> : <p className="text-sm font-semibold">Selected designs: {quotes.data.reduce((sum, item, i) => sum + (selected[i] && ["not_started", "not_found", "limit_reached"].includes(entries[i]!.status) ? item.credits : 0), 0)} credits</p>}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          className={primary}
          disabled={
            busy ||
            !quotes.data || quotes.isError || quotes.isFetching ||
            !entries.some(
              (entry, i) =>
                selected[i] && (entry.status === "not_started" || entry.status === "not_found" || entry.status === "limit_reached"),
            )
          }
          onClick={() => void run(false)}
        >
          {busy ? "Working…" : "Create designs"}
        </button>
        <button
          type="button"
          className={secondary}
          disabled={busy || !anyStarted}
          onClick={() => void run(true)}
        >
          Check design status
        </button>
        <button
          type="button"
          className={secondary}
          disabled={busy}
          onClick={() => {
            try {
              if (!anyStarted) sessionStorage.removeItem(key);
              onBack?.();
            } catch {
              setError("Could not safely return to the narratives.");
            }
          }}
        >
          Back to narratives
        </button>
      </div>
      {needsStatusCheck && <p className="text-sm text-muted-foreground">Some selected designs need a status check and will be skipped. Other selected designs can still be created.</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {plan.tiles.map((tile, i) => (
          <article
            key={entries[i]!.requestId}
            className={`rounded-xl border bg-surface ${selected[i] ? "border-ink" : "border-border-control"}`}
          >
            <label className={`block space-y-3 p-4 ${busy ? "cursor-wait" : "cursor-pointer"}`}>
              <span className="flex items-start gap-3">
              <input
                type="checkbox"
                aria-label={`Select ${tile.headline}`}
                className="peer sr-only"
                checked={selected[i]}
                disabled={busy}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setSelected((current) => current.map((value, index) => index === i ? checked : value));
                }}
              />
              <span aria-hidden className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border-control bg-surface text-transparent peer-checked:border-ink peer-checked:bg-ink peer-checked:text-inverse peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-50"><Check className="size-4" strokeWidth={2.5} /></span>
              <span className="font-semibold">{tile.headline}</span>
              </span>
            <span className="block text-sm text-muted-foreground">{tile.supporting}</span>
            {quotes.data?.[i] && <span className="block text-sm font-semibold">{quotes.data[i]!.credits} credits</span>}
            {tile.direction && <span className="block text-sm">{tile.direction}</span>}
            {busy && activity === "designing" && selected[i] && !entries[i]!.url && (activeIndex === i || entries[i]!.status === "not_started" || entries[i]!.status === "not_found" || entries[i]!.status === "limit_reached") && (
              <span role="status" aria-label={activeIndex === i ? `Creating design: ${tile.headline}` : `Waiting to create: ${tile.headline}`} className="relative flex aspect-square w-full flex-col items-center justify-center overflow-hidden rounded-lg border border-border-control bg-surface-subtle p-6 text-center">
                <span aria-hidden className="build-orbit absolute size-40 rounded-full border-2 border-dashed border-ink/20" />
                <span aria-hidden className="relative grid size-14 place-items-center rounded-full bg-ink text-inverse"><Sparkles className="size-6 motion-safe:animate-pulse" /></span>
                <span className="relative mt-5 font-semibold">{activeIndex === i ? "Sam is creating this design" : "Waiting for Sam"}</span>
                <span className="relative mt-2 text-sm text-muted-foreground">{activeIndex === i ? "Creating with your brand and creative direction" : "Designs are created one at a time"}</span>
                {activeIndex === i && <span aria-hidden className="relative mt-5 h-1.5 w-32 overflow-hidden rounded-full bg-ink/15"><span className="build-progress-indeterminate block h-full rounded-full bg-ink" /></span>}
              </span>
            )}
            {entries[i]!.url && (
              <img
                src={entries[i]!.url}
                alt={`Designed tile: ${tile.headline}`}
                className="aspect-square w-full rounded-lg object-contain"
              />
            )}
            <span className="block text-sm text-muted-foreground">
              {entries[i]!.message ??
                (entries[i]!.status === "ready"
                  ? entries[i]!.url
                    ? "Ready"
                    : "Saved. Check status to load preview."
                  : "Not yet designed")}
            </span>
            </label>
          </article>
        ))}
      </div>
    </section>
  );
}
