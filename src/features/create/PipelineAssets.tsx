import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  contentTrashKey,
  listContentTrash,
  setContentTrashed,
} from "@/lib/content-trash";
import { PipelineTrashAction } from "./PipelineTrash";
import { listLinkedInCarousels } from "@/lib/linkedin-carousel.functions";
import { getScheduleTileCaptions } from "@/lib/creation-schedule.functions";
import { getAssetVersionPlayback } from "@/lib/asset-versions.functions";
import {
  useAssetPublishingStatus,
  type AssetChannelStatus,
} from "@/features/schedule/useAssetPublishingStatus";
import { useScheduleDialog } from "@/features/schedule/ScheduleDialogHost";
import { ScheduleTilePreview } from "@/features/schedule/ScheduleTilePreview";
import { DeliverySummary } from "./DeliverySummary";
import { ComposerDrawer } from "@/components/publishing/ComposerDrawer";
import { listSupersededPostcardTiles } from "@/lib/postcard-tiles.functions";

type Stage = "ready" | "scheduled" | "published";
type Asset = {
  type: "tile" | "video" | "written" | "carousel";
  id: string;
  title: string;
  url?: string | undefined;
  renderId?: string;
  status?: string;
  approved?: boolean;
  batchId?: string;
  savedCaption?: { caption: string; platform: string } | undefined;
  superseded?: boolean;
};
export type PipelineCounts = Record<Stage, number>;

export function assetVisibleInStage(
  asset: Pick<Asset, "type" | "id" | "status" | "superseded">,
  stage: Stage,
  receipts: AssetChannelStatus[],
  trashIds: Set<string>,
): boolean {
  return (
    !(stage === "ready" && trashIds.has(`${asset.type}:${asset.id}`)) &&
    assetStages(asset, receipts).includes(stage)
  );
}

// Counts are assets, not deliveries. An asset can belong to multiple delivery stages.
export function assetStages(
  asset: Pick<Asset, "type" | "status" | "superseded">,
  receipts: AssetChannelStatus[],
): Stage[] {
  const scheduled =
    ["scheduled", "publishing", "awaiting_approval"].includes(
      asset.status ?? "",
    ) ||
    receipts.some(
      (r) =>
        ["scheduled", "publishing", "awaiting_approval"].includes(
          r.postStatus,
        ) && !["failed", "skipped", "published"].includes(r.status),
    );
  const published =
    ["published", "partially_published"].includes(asset.status ?? "") ||
    receipts.some((r) => r.status === "published");
  return [
    ...(!scheduled && !published && !asset.superseded ? ["ready" as const] : []),
    ...(scheduled ? ["scheduled" as const] : []),
    ...(published ? ["published" as const] : []),
  ];
}

// Sources arrive newest first, so the first completed render is retained when no primary is selected.
export function deduplicateAssets<T extends { type: string; id: string }>(
  assets: T[],
): T[] {
  const seen = new Set<string>();
  return assets.filter((asset) => {
    const key = `${asset.type}:${asset.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function isEligibleVideoRender(
  renderId: string,
  primaryRenderId: string | null,
): boolean {
  return !primaryRenderId || primaryRenderId === renderId;
}

export function pipelineIsLoading(
  assetsPending: boolean,
  assets: Array<{ type: string }>,
  historyPending: boolean,
): boolean {
  return (
    assetsPending ||
    (assets.length > 0 && historyPending)
  );
}

export function videoReviewSearch(id: string, batchId: string) {
  return {
    stage: "ready" as const,
    item: `video:${id}`,
    wizard: "video" as const,
    batch: batchId,
  };
}

export function usePipelineAssetLibrary(workspaceId: string) {
  const lookupCaptions = useServerFn(getScheduleTileCaptions);
  const listSuperseded = useServerFn(listSupersededPostcardTiles);
  const listCarousels = useServerFn(listLinkedInCarousels);
  const carousels = useQuery({
    queryKey: ["linkedin-carousels", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listCarousels({ data: { workspace_id: workspaceId } }),
  });
  const assets = useQuery({
    queryKey: ["pipeline-assets", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      // Page every source independently so the stage counts describe the full workspace.
      const fetchPages = async <T,>(
        page: (
          from: number,
          to: number,
        ) => PromiseLike<{ data: T[] | null; error: unknown }>,
      ) => {
        const all: T[] = [];
        for (let from = 0; ; from += 1000) {
          const result = await page(from, from + 999);
          if (result.error) throw result.error;
          const rows = result.data ?? [];
          all.push(...rows);
          if (rows.length < 1000) return all;
        }
      };
      const [tiles, videos, written, superseded] = await Promise.all([
        fetchPages((from, to) =>
          supabase
            .from("brand_files")
            .select("id,name,storage_path")
            .eq("workspace_id", workspaceId)
            .eq("source", "social_tile")
            .order("created_at", { ascending: false })
            .range(from, to),
        ),
        fetchPages((from, to) =>
          supabase
            .from("render_jobs")
            .select(
              "id,variant_id,brief_snapshot,creative_variants!render_jobs_variant_id_fkey(batch_id,hook,narrative,review_state,primary_render_id)",
            )
            .eq("workspace_id", workspaceId)
            .eq("status", "done")
            .not("storage_path", "is", null)
            .order("created_at", { ascending: false })
            .range(from, to),
        ),
        fetchPages((from, to) =>
          supabase
            .from("posts")
            .select("id,caption,status,created_via,post_media(id)")
            .eq("workspace_id", workspaceId)
            .in("status", [
              "draft",
              "scheduled",
              "published",
              "partially_published",
              "failed",
              "needs_attention",
              "awaiting_approval",
              "publishing",
            ])
            .is("variant_id", null)
            .or(
              "created_via.like.personal-idea-batch:%,created_via.eq.written_posts,created_via.is.null",
            )
            .order("created_at", { ascending: false })
            .range(from, to),
        ),
        listSuperseded({ data: { workspace_id: workspaceId } }),
      ]);
      const supersededIds = new Set(superseded);
      const validTiles = tiles.filter((t) =>
        t.storage_path.startsWith(`${workspaceId}/`),
      );
      const [captions, signed] = await Promise.all([
        Promise.all(
          Array.from({ length: Math.ceil(validTiles.length / 220) }, (_, i) =>
            lookupCaptions({
              data: {
                workspace_id: workspaceId,
                tile_ids: validTiles
                  .slice(i * 220, (i + 1) * 220)
                  .map((t) => t.id),
              },
            }),
          ),
        ).then((parts) => Object.assign({}, ...parts)),
        validTiles.length
          ? supabase.storage.from("brand-assets-private").createSignedUrls(
              validTiles.map((t) => t.storage_path),
              3600,
            )
          : null,
      ]);
      const urls = new Map(
        (signed?.data ?? []).map((row) => [row.path, row.signedUrl]),
      );
      const result: Asset[] = validTiles.map((t) => ({
        type: "tile",
        id: t.id,
        title: t.name.replace(/\.[^.]+$/, ""),
        url: urls.get(t.storage_path) ?? undefined,
        savedCaption: captions[t.id],
        superseded: supersededIds.has(t.id),
      }));
      for (const row of videos) {
        const variant = row.creative_variants as unknown as {
          batch_id: string;
          hook: string;
          narrative: string;
          review_state: string;
          primary_render_id: string | null;
        } | null;
        if (
          !variant ||
          !isEligibleVideoRender(row.id, variant.primary_render_id)
        )
          continue;
        const snapshot = row.brief_snapshot as { hook?: string } | null;
        result.push({
          type: "video",
          id: row.variant_id,
          renderId: row.id,
          batchId: variant.batch_id,
          approved:
            variant.review_state === "approved" &&
            variant.primary_render_id === row.id,
          title: snapshot?.hook || variant.hook || variant.narrative || "Video",
        });
      }
      for (const row of written)
        if (row.caption?.trim() && !row.post_media.length)
          result.push({
            type: "written",
            id: row.id,
            title: row.caption,
            status: row.status,
          });
      return deduplicateAssets(result);
    },
  });
  const rows = useMemo<Asset[]>(
    () => [
      ...(assets.data ?? []),
      ...(carousels.data ?? [])
        .filter((deck) => deck.complete)
        .map((deck) => ({
          type: "carousel" as const,
          id: deck.id,
          title: deck.title,
          url: deck.coverUrl ?? undefined,
        })),
    ],
    [assets.data, carousels.data],
  );
  return { rows, assets, carousels };
}

export function usePipelineAssetCounts(workspaceId: string) {
  const { rows, assets, carousels } = usePipelineAssetLibrary(workspaceId);
  const kinds = ["tile", "video", "written", "carousel"] as const;
  const trashQueries = useQueries({
    queries: kinds.map((kind) => ({
      queryKey: contentTrashKey(workspaceId, kind),
      enabled: !!workspaceId,
      queryFn: () => listContentTrash(workspaceId, kind),
    })),
  });
  const trashIds = new Set(
    trashQueries.flatMap((query, index) =>
      (query.data ?? []).map((id) => `${kinds[index]}:${id}`),
    ),
  );
  const history = useAssetPublishingStatus(
    workspaceId,
    rows.filter((a) => a.type === "tile").map((a) => a.id),
    rows.filter((a) => a.type === "video").map((a) => a.id),
    rows.filter((a) => a.type === "written").map((a) => a.id),
    rows.filter((a) => a.type === "carousel").map((a) => a.id),
  );
  const counts: PipelineCounts = { ready: 0, scheduled: 0, published: 0 };
  for (const asset of rows)
    for (const stage of assetStages(asset, history.data?.[asset.id] ?? []))
      if (stage !== "ready" || !trashIds.has(`${asset.type}:${asset.id}`))
        counts[stage]++;
  return {
    assets: { ...assets, data: rows },
    history,
    counts,
    trashIds,
    refetchTrash: () =>
      Promise.all(trashQueries.map((query) => query.refetch())),
    isLoading:
      carousels.isPending ||
      trashQueries.some((query) => query.isPending) ||
      pipelineIsLoading(assets.isPending, rows, history.isPending),
    isError:
      assets.isError ||
      carousels.isError ||
      history.isError ||
      trashQueries.some((query) => query.isError),
    refetchCarousels: carousels.refetch,
    unreadableCarousels: (carousels.data ?? []).filter(
      (deck) => deck.unreadable,
    ).length,
  };
}

function Video({ asset }: { asset: Asset }) {
  const playback = useServerFn(getAssetVersionPlayback);
  const media = useQuery({
    queryKey: ["schedule-gallery-video", asset.id, asset.renderId],
    queryFn: () =>
      playback({ data: { id: asset.id, render_id: asset.renderId! } }),
    enabled: !!asset.renderId,
  });
  return media.data?.url ? (
    <video
      controls
      src={media.data.url}
      className="max-h-80 max-w-full"
      aria-label={`Preview ${asset.title}`}
    />
  ) : (
    <p>Video preview unavailable</p>
  );
}

export function PipelineAssets({
  onStageChange,
  workspaceId,
  stage,
  item,
  format,
  onItem,
  onCounts,
}: {
  workspaceId: string;
  stage: Stage;
  item?: string | undefined;
  format?: "video" | "tiles" | "written" | "carousel" | undefined;
  onItem: (id?: string) => void;
  onStageChange?: (stage: Stage, item: string) => void;
  onCounts?: ((counts: PipelineCounts) => void) | undefined;
}) {
  const data = usePipelineAssetCounts(workspaceId);
  const { scheduleSelection } = useScheduleDialog();
  const queryClient = useQueryClient();

  const [preview, setPreview] = useState<Asset | null>(null);
  const [selection, setSelection] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const countsCallback = useRef(onCounts);
  countsCallback.current = onCounts;
  useEffect(() => {
    if (!data.isLoading && !data.isError) countsCallback.current?.(data.counts);
  }, [
    data.counts.ready,
    data.counts.scheduled,
    data.counts.published,
    data.isLoading,
    data.isError,
  ]);
  const shown = (data.assets.data ?? []).filter((asset) => {
    return (
      assetVisibleInStage(asset, stage, data.history.data?.[asset.id] ?? [], data.trashIds) &&
      (!format || asset.type === (format === "tiles" ? "tile" : format))
    );
  });
  const focused = item
    ? shown.find((asset) => `${asset.type}:${asset.id}` === item)
    : undefined;
  const savedAsset =
    item && !focused
      ? data.assets.data?.find((asset) => `${asset.type}:${asset.id}` === item)
      : undefined;
  const currentStage =
    savedAsset &&
    assetStages(savedAsset, data.history.data?.[savedAsset.id] ?? [])[0];
  useEffect(() => {
    if (
      item &&
      currentStage &&
      currentStage !== stage &&
      !data.isLoading &&
      !data.isError
    )
      onStageChange?.(currentStage, item);
  }, [item, stage, currentStage, data.isLoading, data.isError, onStageChange]);
  const refresh = () => {
    void queryClient.invalidateQueries({
      queryKey: ["pipeline-assets", workspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["asset-publishing-status", workspaceId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["publish-planner", workspaceId],
    });
  };
  const visible = item ? (focused ? [focused] : []) : shown;
  const eligible = stage === "ready" ? visible.filter(asset => asset.type !== "video" || asset.approved) : [];
  const selected = eligible.filter(asset => selection.includes(`${asset.type}:${asset.id}`));
  const schedule = (assets: Asset[]) => {
    scheduleSelection({
      tileIds: assets.filter(asset => asset.type === "tile").map(asset => asset.id),
      videoIds: assets.filter(asset => asset.type === "video").map(asset => asset.id),
      writtenIds: assets.filter(asset => asset.type === "written").map(asset => asset.id),
      carouselIds: assets.filter(asset => asset.type === "carousel").map(asset => asset.id),
      knownPreviouslyPublished: assets.some(asset => asset.type === "written" && asset.status !== "draft"),
    });
  };
  if (data.isLoading)
    return <p role="status">Loading assets and publishing history…</p>;
  if (data.isError)
    return (
      <p role="alert">
        Could not load assets or publishing history.{" "}
        <button
          type="button"
          className="underline"
          onClick={() => {
            void data.assets.refetch();
            void data.history.refetch();
            void data.refetchCarousels();
            void data.refetchTrash();
          }}
        >
          Try again
        </button>
      </p>
    );
  return (
    <section aria-label={`${stage} assets`} className="space-y-3">
      {data.unreadableCarousels > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          {data.unreadableCarousels} carousel
          {data.unreadableCarousels === 1 ? "" : "s"} could not be read and may
          be missing from this list.
        </p>
      )}
      {item && (
        <button
          type="button"
          className="text-sm underline"
          onClick={() => onItem(undefined)}
        >
          Back to {stage}
        </button>
      )}
      {item && !focused && (
        <p className="text-sm text-muted-foreground">
          This item is not in this stage.
        </p>
      )}
      {!item && !shown.length && (
        <p className="text-sm text-muted-foreground">
          No assets in this stage yet.
        </p>
      )}
      {!item && eligible.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.length === eligible.length} onChange={event =>
              setSelection(event.target.checked ? eligible.map(asset => `${asset.type}:${asset.id}`) : [])
            } />
            Select all shown
          </label>
          <button type="button" disabled={!selected.length || selected.length > 20} className="rounded-lg border border-border-control bg-background px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => schedule(selected)}>
            Add to schedule
          </button>
          {selected.length > 0 && <span className="text-sm text-muted-foreground">{selected.length} selected{selected.length > 20 ? " · Up to 20 per schedule" : ""}</span>}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((asset) => {
          const receipts = data.history.data?.[asset.id] ?? [];
          const key = `${asset.type}:${asset.id}`;
          return (
            <article
              key={key}
              className="space-y-2 rounded-xl border border-border-control bg-background p-4"
            >
              {!item && eligible.includes(asset) && <input
                type="checkbox"
                aria-label={`Select ${asset.title}`}
                checked={selection.includes(key)}
                className="mr-2 align-middle"
                onChange={event => {
                  const checked = event.target.checked;
                  setSelection(current => checked ? [...current, key] : current.filter(value => value !== key));
                }}
              />}
              <button
                type="button"
                className="line-clamp-2 text-left font-semibold"
                onClick={() => onItem(key)}
              >
                {asset.title}
              </button>
              <p className="text-xs text-muted-foreground">
                {asset.type === "tile"
                  ? "Social tile"
                  : asset.type === "video"
                    ? "Video"
                    : asset.type === "written"
                      ? "Written post"
                      : "LinkedIn carousel PDF"}
              </p>
              {asset.url && (
                <img
                  src={asset.url}
                  alt=""
                  className="max-h-40 w-full object-contain"
                />
              )}
              <DeliverySummary
                receipts={receipts}
                stage={stage}
                onManage={setEditing}
              />
              <div className="flex flex-wrap gap-2 pt-1">
                {stage === "ready" && (
                  <PipelineTrashAction
                    readyAsset
                    title={asset.title}
                    trashed={false}
                    onChange={async (next) => {
                      const key = contentTrashKey(workspaceId, asset.type);
                      await setContentTrashed(workspaceId, asset.type, asset.id, next);
                      await queryClient.cancelQueries({ queryKey: key });
                      queryClient.setQueryData<string[]>(key, (ids = []) =>
                        next ? [...new Set([...ids, asset.id])] : ids.filter((id) => id !== asset.id),
                      );
                      if (next && item) onItem(undefined);
                    }}
                  />
                )}
                {asset.type === "carousel" ? (
                  <Link
                    to="/app/create"
                    search={{ stage, item: key, carousel: asset.id }}
                    className="text-sm font-semibold underline"
                  >
                    Open carousel
                  </Link>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="text-sm underline"
                        onClick={() => setPreview(asset)}
                      >
                        Preview
                      </button>
                      {stage === "ready" &&
                        asset.type === "video" &&
                        !asset.approved &&
                        (asset.batchId ? (
                          <Link
                            to="/app/create"
                            search={videoReviewSearch(asset.id, asset.batchId)}
                            className="text-sm font-semibold underline"
                          >
                            Review video
                          </Link>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Review and approve this video before scheduling.
                          </p>
                        ))}
                    </>
                  )}
                {eligible.includes(asset) && (
                  <button type="button" className="text-sm font-semibold underline" onClick={() => schedule([asset])}>
                    Schedule or publish
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      {preview?.type === "tile" && (
        <ScheduleTilePreview
          workspaceId={workspaceId}
          tile={preview}
          publishingHistory={data.history.data?.[preview.id]}
          onClose={() => setPreview(null)}
        />
      )}
      {preview && preview.type !== "tile" && (
        <div
          role="dialog"
          aria-label={`Preview ${preview.title}`}
          className="rounded-xl border bg-background p-4"
        >
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="float-right underline"
          >
            Close
          </button>
          {preview.type === "video" ? (
            <Video asset={preview} />
          ) : (
            <p className="whitespace-pre-wrap">{preview.title}</p>
          )}
        </div>
      )}
      {editing && (
        <ComposerDrawer
          key={editing}
          open
          postId={editing}
          onOpenChange={(open) => {
            if (!open) {
              setEditing(null);
              refresh();
            }
          }}
        />
      )}
    </section>
  );
}
