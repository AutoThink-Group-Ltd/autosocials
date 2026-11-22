import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, ChevronRight } from "lucide-react";
import { CreatePage } from "./CreatePage";
import { PipelineTrashAction, usePipelineTrash } from "./PipelineTrash";
import { listReturnedTilePlans, setTilePlanReturned } from "@/lib/pipeline-trash";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { savePersonalIdeaBatch } from "@/lib/personal-idea-batch.functions";
import { listLinkedInCarousels } from "@/lib/linkedin-carousel.functions";
import { useWorkspaceUiOptional } from "@/workspace/WorkspaceUi";
import { getPipelineRecords } from "@/lib/pipeline-records.functions";
import type { Narrative } from "@/lib/wizard";
import { parseBlocks, type Block } from "@/lib/sam.blocks";
import {
  isLinkedInCarouselIdea,
  type CarouselPlan,
} from "@/lib/linkedin-carousel";
import { findSocialTilePlan } from "@/workspace/live-view/social-tile-plan";
import { BlockRenderer } from "@/workspace/live-view/BlockRenderer";
import { CampaignCard } from "@/features/sam/CampaignCard";
import { LinkedInCarousels } from "./LinkedInCarousels";
import { assetStageLabels } from "./AssetWorkflow";
import {
  pipelineEntries,
  selectedNarrativeIdeas,
  type PipelineEntry,
  type PipelineBatch,
  type PipelineCanvas,
} from "./pipeline-plans";

export function usePipeline(workspaceId: string) {
  const getRecords = useServerFn(getPipelineRecords);
  const listCarousels = useServerFn(listLinkedInCarousels);
  return useQuery({
    queryKey: ["pipeline-plans", workspaceId],
    enabled: !!workspaceId,
    refetchInterval: (query) =>
      query.state.data?.entries.some((entry) => entry.active) ? 10000 : false,
    queryFn: async () => {
      const [canvases, batches, operations, carousels, canvasThreads] =
        await Promise.all([
          fetchAll<PipelineCanvas>((from, to) =>
            supabase
              .from("canvases")
              .select("id,title,blocks,version,updated_at,archived")
              .eq("workspace_id", workspaceId)
              .eq("module", "create")
              .order("id")
              .range(from, to),
          ),
          fetchAll<PipelineBatch>((from, to) =>
            supabase
              .from("creative_batches")
              .select("id,title,goal,stage,narratives,created_at,updated_at")
              .eq("workspace_id", workspaceId)
              .order("id")
              .range(from, to),
          ),
          getRecords({ data: { workspace_id: workspaceId } }),
          listCarousels({ data: { workspace_id: workspaceId } }),
          fetchAll<{ canvas_id: string | null; thread_id: string | null }>(
            (from, to) =>
              supabase
                .from("agent_messages")
                .select("canvas_id,thread_id")
                .eq("workspace_id", workspaceId)
                .eq("role", "assistant")
                .not("canvas_id", "is", null)
                .order("id")
                .range(from, to),
          ),
        ]);
      const returned = new Set(await listReturnedTilePlans(workspaceId));
      return {
        canvases,
        batches,
        operations,
        returnedTilePlans: [...returned],
        entries: [
          ...pipelineEntries(canvases, batches, operations, canvasThreads).map(entry =>
            returned.has(entry.id) && entry.kind === "canvas"
              ? { ...entry, hidden: entry.stage === "production" }
              : entry),
          ...carousels.map((deck): PipelineEntry => ({
            id: `carousel:${deck.id}`,
            sourceId: deck.id,
            title: deck.title,
            subtitle: deck.production ? "Carousel in progress" : "Saved carousel",
            updated: deck.updated_at,
            stage: deck.production ? "production" : "plans",
            kind: "carousel" as const,
            formats: ["carousel"],
            ...(deck.unreadable
              ? {}
              : {
                  usage: {
                    planned: 1,
                    created: Number(deck.complete),
                    scheduled: 0,
                    published: 0,
                  },
                }),
            active: false,
          })),
        ].sort((a, b) => b.updated.localeCompare(a.updated)),
      };
    },
  });
}

export function usePipelinePlanCounts(workspaceId: string) {
  const { data } = usePipeline(workspaceId);
  const trash = usePipelineTrash(workspaceId);
  const entries =
    trash.isLoading || trash.isError
      ? undefined
      : data?.entries.filter(
          (entry) => !entry.hidden && !trash.ids.includes(entry.id),
        );
  return {
    plans: entries?.filter((entry) => entry.stage === "plans").length,
    production: entries?.filter((entry) => entry.stage === "production").length,
  };
}

const formatLabels = {
  video: "Video",
  tiles: "Social tiles",
  written: "Written post",
  carousel: "LinkedIn carousel",
};

function PlanMetadata({ entry }: { entry: PipelineEntry }) {
  const usage = entry.usage;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {entry.formats?.map((format) => (
        <span
          key={format}
          className="rounded-full bg-surface-subtle px-2 py-1 font-semibold text-ink"
        >
          {formatLabels[format]}
        </span>
      ))}
      {usage && usage.planned > 0 && (
        <>
          <span className="inline-flex items-center gap-1 font-medium text-ink">
            {usage.created >= usage.planned && (
              <Check className="size-4" aria-label="Creation complete" />
            )}
            {usage.created}/{usage.planned} created
          </span>
          {usage.scheduled > 0 && <span>{usage.scheduled} scheduled</span>}
          {usage.published > 0 && (
            <span>
              {usage.published}/{usage.planned} published
            </span>
          )}
        </>
      )}
    </span>
  );
}

export function PipelinePlans({
  workspaceId,
  workspaceName,
  stage,
  item,
  onItem,
  onNavigate,
}: {
  workspaceId: string;
  workspaceName: string;
  stage: "plans" | "production";
  item?: string | undefined;
  onItem: (id?: string) => void;
  onNavigate: (search: Record<string, string | number>) => void;
}) {
  const query = usePipeline(workspaceId);
  const trash = usePipelineTrash(workspaceId);
  const qc = useQueryClient();
  const ui = useWorkspaceUiOptional();
  const saveBatch = useServerFn(savePersonalIdeaBatch);
  const [starting, setStarting] = useState(false);
  const [selectionFormat, setSelectionFormat] = useState<
    "saved" | "video" | "tiles" | "written"
  >("saved");
  const [carousel, setCarousel] = useState<CarouselPlan | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openTilePlan, setOpenTilePlan] = useState<{ workspaceId: string; itemId: string }>();
  const entries = query.data?.entries.filter(
    (e) => e.stage === stage && !e.hidden && !trash.ids.includes(e.id),
  ) ?? [];
  const openTileId = openTilePlan?.workspaceId === workspaceId ? openTilePlan.itemId : undefined;
  const solePlan = stage === "plans" && !item && entries.length === 1 ? entries[0] : undefined;
  const soleCanvas = solePlan?.kind === "canvas"
    ? query.data?.canvases.find((saved) => saved.id === solePlan.sourceId)
    : undefined;
  const soleTileId = soleCanvas && findSocialTilePlan(parseBlocks(soleCanvas.blocks), soleCanvas.title)
    ? solePlan?.id
    : undefined;
  useEffect(() => {
    if (!openTileId && soleTileId) setOpenTilePlan({ workspaceId, itemId: soleTileId });
  }, [openTileId, soleTileId, workspaceId]);
  // Keep the batch mounted when a production refresh removes it from the Plans list.
  const inlineTileId = stage === "plans" && !item ? (openTileId ?? soleTileId) : undefined;
  const entry = query.data?.entries.find(
    (e) => e.id === (item ?? inlineTileId) && e.stage === stage && (stage !== "production" || !e.hidden) && (item || !trash.ids.includes(e.id)),
  );
  const inlineTiles = !!inlineTileId && !!entry;
  const canvas =
    entry?.kind === "canvas"
      ? query.data?.canvases.find((c) => c.id === entry.sourceId)
      : undefined;
  const blocks = parseBlocks(canvas?.blocks);
  useEffect(() => {
    if (!canvas || !ui) return;
    ui.setActiveCanvas({
      id: canvas.id,
      version: canvas.version,
      title: canvas.title,
    });
    return () => ui.setActiveCanvas(null);
  }, [
    canvas?.id,
    canvas?.version,
    canvas?.title,
    workspaceId,
    ui?.setActiveCanvas,
  ]);
  async function startSelection(ids: string[]) {
    if (starting) return;
    setStarting(true);
    try {
      const items = selectedNarrativeIdeas(
        query.data?.batches ?? [],
        ids,
        selectionFormat,
      );
      const result = await saveBatch({
        data: {
          workspace_id: workspaceId,
          request_id: crypto.randomUUID(),
          items,
        },
      });
      onNavigate({ ideaBatch: result.batchId });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not save the selection.",
      );
    } finally {
      setStarting(false);
    }
  }
  async function save(next: Block[]) {
    if (!canvas) return;
    const { data, error } = await supabase
      .from("canvases")
      .update({
        blocks: next as never,
        version: canvas.version + 1,
        updated_by: "user",
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId)
      .eq("id", canvas.id)
      .eq("version", canvas.version)
      .select("id");
    if (error || !data?.length)
      toast.error("This plan changed elsewhere. Reloaded the latest version.");
    await qc.invalidateQueries({ queryKey: ["pipeline-plans", workspaceId] });
  }
  async function useVariants(blockIndex: number, indexes: number[]) {
    if (!canvas) return;
    const block = blocks[blockIndex];
    if (
      block?.type !== "variants" ||
      !indexes.length ||
      indexes.some(
        (i) =>
          !block.items[i] ||
          isLinkedInCarouselIdea(block.title, block.items[i]!),
      )
    )
      return;
    try {
      const { data: message, error } = await supabase
        .from("agent_messages")
        .select("thread_id")
        .eq("workspace_id", workspaceId)
        .eq("canvas_id", canvas.id)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error || !message)
        throw new Error("Sam's source chat could not be found.");
      const available = (query.data?.batches ?? [])
        .filter((b) => b.goal === `sam-thread:${message.thread_id}`)
        .flatMap((b) =>
          (Array.isArray(b.narratives)
            ? (b.narratives as Narrative[])
            : []
          ).flatMap((n) =>
            n?.id &&
            n.libraryStatus !== "binned" &&
            n.libraryStatus !== "rejected"
              ? [{ id: `${b.id}:${n.id}`, title: n.title }]
              : [],
          ),
        );
      const ids = indexes.map(
        (i) =>
          available.find(
            (n) =>
              n.title ===
              block.items[i]!.hook.replace(/\s+/g, " ").trim().slice(0, 160),
          )?.id,
      );
      if (ids.some((id) => !id))
        throw new Error(
          "One of these hooks changed. Ask Sam to save the revised hook before using it.",
        );
      await startSelection(ids as string[]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not select these hooks.",
      );
    }
  }
  if (carousel)
    return (
      <LinkedInCarousels
        workspaceId={workspaceId}
        initialPlan={carousel}
        onBack={() => setCarousel(null)}
      />
    );
  if (query.isPending || trash.isLoading)
    return (
      <p role="status" className="p-6">
        Loading saved content…
      </p>
    );
  if (query.isError || trash.isError)
    return (
      <p role="alert" className="p-6">
        Saved content could not be loaded.{" "}
        <button
          className="underline"
          onClick={() => {
            void query.refetch();
            void trash.refetch();
          }}
        >
          Try again
        </button>
      </p>
    );
  if (item && !entry)
    return (
      <div className="p-6">
        <p>This item is unavailable in this stage.</p>
        <button className="mt-3 underline" onClick={() => onItem()}>
          Back to {stage === "plans" ? "plans" : "production"}
        </button>
      </div>
    );
  if (entry && trash.ids.includes(entry.id))
    return (
      <section className="space-y-3 p-6">
        <button type="button" className="underline" onClick={() => onItem()}>
          Back to {stage}
        </button>
        <h2 className="text-lg font-semibold">{entry.title} is in Trash</h2>
        <p>Restore this item from Settings &gt; Deleted Items.</p>
      </section>
    );
  if (entry?.stage === "production" && entry.kind !== "canvas") {
    return (
      <section className="space-y-4">
        {entry.kind !== "personal" && (
          <button
            type="button"
            className="text-sm font-semibold underline"
            onClick={() => onItem()}
          >
            Back to production
          </button>
        )}
        {entry.kind === "campaign" ? (
          <CampaignCard
            workspaceId={workspaceId}
            campaignId={entry.sourceId}
            previewGroup={Number(entry.id.split(":")[2] ?? 0)}
          />
        ) : (
          <CreatePage
            key={entry.id}
            workspaceId={workspaceId}
            workspaceName={workspaceName}
            search={
              entry.kind === "personal"
                ? { stage, ideaBatch: entry.sourceId }
                : { stage, wizard: "video", batch: entry.sourceId }
            }
            onBack={() => onItem()}
            onNavigate={(next) => onNavigate({ ...next })}
            onBatch={(id) => {
              if (id !== entry.sourceId)
                onNavigate({ wizard: "video", batch: id });
            }}
          />
        )}
      </section>
    );
  }
  if (entry)
    return (
      <main className="group relative mx-auto max-w-5xl space-y-5 p-6">
        {stage === "production" && entry.kind === "canvas" && canvas && findSocialTilePlan(blocks, canvas.title) && <div className="absolute bottom-2 right-2 z-20 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"><PipelineTrashAction title={entry.title} returnToPlan trashed={false} disabled={trash.isPending} onChange={async () => {
          await setTilePlanReturned(workspaceId, entry.id, true);
          await qc.invalidateQueries({ queryKey: ["pipeline-plans", workspaceId] });
          onNavigate({ stage: "plans", item: entry.id });
        }} /></div>}
        {stage === "plans" && entry.kind === "canvas" && canvas && findSocialTilePlan(blocks, canvas.title) && <div className="absolute bottom-2 right-2 z-20 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"><PipelineTrashAction title={entry.title} trashed={false} disabled={trash.isPending} onChange={async (next) => {
          await trash.setTrashed(entry.id, next);
          if (next) { setOpenTilePlan(undefined); onItem(); }
        }} /></div>}
        {!inlineTiles && <button type="button" className="text-sm font-semibold underline" onClick={() => onItem()}>
          ← Back to {stage === "plans" ? "plans" : "production"}
        </button>}
        <h1 className="font-display text-3xl font-bold">{entry.title}</h1>
        {canvas && (
          <BlockRenderer
            key={canvas.id}
            blocks={blocks}
            onChange={save}
            workspaceId={workspaceId}
            canvas={{ id: canvas.id, version: canvas.version, title: canvas.title }}
            tileProductionStarted={query.data?.operations?.some(op => op.kind === "tile-canvas" && op.signature === canvas.id) ?? false}
            tileReturnedToPlans={query.data?.returnedTilePlans?.includes(entry.id) ?? false}
            onTileProductionStart={async () => {
              if (query.data?.returnedTilePlans?.includes(entry.id)) await setTilePlanReturned(workspaceId, entry.id, false);
            }}
            onRefresh={() => {
              void qc.invalidateQueries({ queryKey: ["pipeline-plans", workspaceId] });
              void qc.invalidateQueries({ queryKey: ["pipeline-assets", workspaceId] });
            }}
            onUseVariants={useVariants}
            onOpenCarousel={(plan) =>
              setCarousel({
                ...plan,
                slides: plan.slides.map((slide) => ({
                  ...slide,
                  id: crypto.randomUUID(),
                })),
              })
            }
          />
        )}
        {entry.kind === "campaign" && (
          <CampaignCard workspaceId={workspaceId} campaignId={entry.sourceId} />
        )}
        {entry.kind === "carousel" && (
          <button
            className="rounded-xl bg-ink px-4 py-3 font-semibold text-inverse"
            onClick={() => onNavigate({ carousel: entry.sourceId })}
          >
            Resume carousel
          </button>
        )}
        {entry.kind === "personal" && (
          <button
            className="rounded-xl bg-ink px-4 py-3 font-semibold text-inverse"
            onClick={() => onNavigate({ ideaBatch: entry.sourceId })}
          >
            Open content review
          </button>
        )}
        {entry.kind === "batch" && (
          <button
            className="rounded-xl bg-ink px-4 py-3 font-semibold text-inverse"
            onClick={() =>
              onNavigate({ wizard: "video", batch: entry.sourceId })
            }
          >
            Continue in video studio
          </button>
        )}
        {entry.kind === "narrative" && (
          <>
            <p className="text-muted-foreground">
              {(() => {
                const batch = query.data?.batches.find(
                  (b) => b.id === entry.sourceId,
                );
                const n = Array.isArray(batch?.narratives)
                  ? ((batch.narratives as Narrative[]).find(
                      (value: Narrative) => value?.id === entry.narrativeId,
                    ) as Narrative | undefined)
                  : null;
                return n?.message || n?.why || "";
              })()}
            </p>
            <label className="block text-sm font-semibold">
              Format{" "}
              <select
                className="ml-2 rounded-lg border border-border-control bg-surface p-2"
                value={selectionFormat}
                onChange={(event) =>
                  setSelectionFormat(
                    event.target.value as typeof selectionFormat,
                  )
                }
              >
                <option value="saved">Use saved format</option>
                <option value="video">Video</option>
                <option value="tiles">Social tiles</option>
                <option value="written">Written post</option>
              </select>
            </label>
            <button
              className="rounded-xl bg-ink px-4 py-3 font-semibold text-inverse"
              disabled={starting}
              onClick={() =>
                void startSelection([`${entry.sourceId}:${entry.narrativeId}`])
              }
            >
              {starting ? "Saving…" : "Review this narrative"}
            </button>
          </>
        )}
      </main>
    );
  const chosen = entries.filter((entry) => selected.has(entry.id));
  const reviewKeys = chosen
    .filter((entry) => entry.kind === "narrative")
    .map((entry) => `${entry.sourceId}:${entry.narrativeId}`);
  const narratives = entries.filter((e) => e.kind === "narrative");
  return (
    <main className="mx-auto max-w-5xl space-y-5 p-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-display text-3xl font-bold">
          {assetStageLabels[stage]}
        </h1>
      </div>
      {stage === "plans" && entries.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              checked={chosen.length === entries.length}
              ref={(node) => {
                if (node)
                  node.indeterminate =
                    chosen.length > 0 && chosen.length < entries.length;
              }}
              disabled={trash.isPending}
              onChange={(event) =>
                setSelected(
                  new Set(event.target.checked ? entries.map((e) => e.id) : []),
                )
              }
            />
            Select all plans
          </label>
          {chosen.length > 0 && (
            <PipelineTrashAction
              key={workspaceId}
              bulk
              title={`${chosen.length} selected plan${chosen.length === 1 ? "" : "s"}`}
              trashed={false}
              disabled={trash.isPending}
              onChange={async () => {
                await trash.trashPlans(chosen.map((entry) => entry.id));
                setSelected(new Set());
              }}
            />
          )}
        </div>
      )}
      {reviewKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-semibold">
            Format{" "}
            <select
              className="ml-2 rounded-lg border border-border-control bg-surface p-2"
              value={selectionFormat}
              onChange={(event) =>
                setSelectionFormat(event.target.value as typeof selectionFormat)
              }
            >
              <option value="saved">Use saved format</option>
              <option value="video">Video</option>
              <option value="tiles">Social tiles</option>
              <option value="written">Written posts</option>
            </select>
          </label>
          <button
            className="rounded-xl bg-ink px-4 py-2 font-semibold text-inverse"
            disabled={starting || reviewKeys.length > 20}
            onClick={() => void startSelection(reviewKeys)}
          >
            {starting ? "Saving…" : "Review"} {reviewKeys.length} selected
            narrative
            {reviewKeys.length === 1 ? "" : "s"}
          </button>
        </div>
      )}
      {entries.length ? (
        <div className="grid gap-3">
          {entries.map((e) => (
            <article
              key={e.id}
              className="group relative flex items-center gap-3 rounded-xl border border-border bg-surface p-4 pr-12"
            >
              {stage === "plans" && (
                <input
                  aria-label={`Select ${e.title}`}
                  type="checkbox"
                  disabled={trash.isPending}
                  checked={selected.has(e.id)}
                  onChange={(event) =>
                    setSelected((previous) => {
                      const next = new Set(previous);
                      const key = e.id;
                      if (event.target.checked) next.add(key);
                      else next.delete(key);
                      return next;
                    })
                  }
                />
              )}
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left"
                onClick={() => e.kind === "carousel" ? onNavigate({ carousel: e.sourceId }) : onItem(e.id)}
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{e.title}</span>
                  <span className="block text-sm text-muted-foreground">
                    {e.subtitle}
                  </span>
                  <PlanMetadata entry={e} />
                </span>
                {(
                  <ChevronRight
                    aria-hidden="true"
                    className="size-4 shrink-0"
                  />
                )}
              </button>
              <div className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100"><PipelineTrashAction
                title={e.title}
                returnToPlan={stage === "production" && e.kind === "canvas" && e.formats?.includes("tiles") === true}
                trashed={false}
                disabled={trash.isPending}
                onChange={async (next) => {
                  if (stage === "production" && e.kind === "canvas" && e.formats?.includes("tiles")) {
                    await setTilePlanReturned(workspaceId, e.id, true);
                    await qc.invalidateQueries({ queryKey: ["pipeline-plans", workspaceId] });
                    return;
                  }
                  await trash.setTrashed(e.id, next);
                  if (next)
                    setSelected((previous) => {
                      const remaining = new Set(previous);
                      remaining.delete(e.id);
                      return remaining;
                    });
                }}
              /></div>
            </article>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
          Nothing here yet.
        </p>
      )}
      {narratives.length > 1 && (
        <p className="text-xs text-muted-foreground">
          Select narratives to review them together. Choose a format or use each
          saved format.
        </p>
      )}
    </main>
  );
}
