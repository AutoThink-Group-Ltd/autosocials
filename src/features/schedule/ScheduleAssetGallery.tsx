import { ComposerDrawer } from "@/components/publishing/ComposerDrawer";
import { ScheduleCarouselPreviewDialog } from "./ScheduleCarouselPreview";
import { ScheduleTilePreview, type ScheduleTile } from "./ScheduleTilePreview";
import { getScheduleTileCaptions } from "@/lib/creation-schedule.functions";
import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { listLinkedInCarousels } from "@/lib/linkedin-carousel.functions";
import { getAssetVersionPlayback } from "@/lib/asset-versions.functions";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAssetPublishingStatus, channelStatusLabel } from "./useAssetPublishingStatus";
import { useScheduleDialog } from "./ScheduleDialogHost";

type GalleryAsset = ScheduleTile & { type: "tile" | "video" | "written" | "carousel"; renderId?: string; approved?: boolean; status?: string };
const PAGE = 40;
const galleryTabs = ["Scheduled", "Published", "Not scheduled"] as const;

function VideoPreview({ asset }: { asset: GalleryAsset }) {
  const playback = useServerFn(getAssetVersionPlayback);
  const media = useQuery({ queryKey: ["schedule-gallery-video", asset.id, asset.renderId], queryFn: () => playback({ data: { id: asset.id, render_id: asset.renderId! } }), enabled: !!asset.renderId, staleTime: 15 * 60_000 });
  return media.data?.url ? <video src={media.data.url} muted playsInline preload="metadata" className="h-full w-full object-contain" aria-label={`Preview ${asset.title}`} /> : <span className="p-2 text-xs text-muted-foreground">{media.isError ? "Video unavailable" : "Loading video…"}</span>;
}

export function ScheduleAssetGallery({ workspaceId, selected, trashedKeys }: { workspaceId: string; selected: string[]; trashedKeys?: ReadonlySet<string> }) {
  const [tab, setTab] = useState<(typeof galleryTabs)[number]>("Scheduled");
  const [previewing, setPreviewing] = useState<GalleryAsset | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { addToSchedule } = useScheduleDialog();
  const lookupCaptions = useServerFn(getScheduleTileCaptions);
  const listCarousels = useServerFn(listLinkedInCarousels);
  const carousels = useQuery({ queryKey: ["linkedin-carousels", workspaceId], enabled: !!workspaceId, queryFn: () => listCarousels({ data: { workspace_id: workspaceId } }) });
  const gallery = useInfiniteQuery({
    queryKey: ["schedule-asset-gallery", workspaceId], initialPageParam: 0,
    getNextPageParam: (last, pages) => last.more ? pages.length * PAGE : undefined,
    queryFn: async ({ pageParam }) => {
      const end = pageParam + PAGE - 1;
      const [tiles, videos, written] = await Promise.all([
        supabase.from("brand_files").select("id,name,storage_path").eq("workspace_id", workspaceId).eq("source", "social_tile").order("created_at", { ascending: false }).range(pageParam, end),
        supabase.from("render_jobs").select("id,variant_id,brief_snapshot,creative_variants!render_jobs_variant_id_fkey(hook,narrative,review_state,primary_render_id)").eq("workspace_id", workspaceId).eq("status", "done").not("storage_path", "is", null).order("created_at", { ascending: false }).range(pageParam, end),
        supabase.from("posts").select("id,caption,status,created_via,post_media(id)").eq("workspace_id", workspaceId).in("status", ["draft", "scheduled", "published", "partially_published"]).is("variant_id", null).or("created_via.like.personal-idea-batch:%,created_via.eq.written_posts,created_via.is.null").order("created_at", { ascending: false }).range(pageParam, end),
      ]);
      if (tiles.error || videos.error || written.error) throw new Error("Could not load the asset gallery.");
      const validTiles = (tiles.data ?? []).filter(t => t.storage_path.startsWith(`${workspaceId}/`));
      const captions = validTiles.length ? await lookupCaptions({ data: { workspace_id: workspaceId, tile_ids: validTiles.map(t => t.id) } }) : {};
      const signed = validTiles.length ? await supabase.storage.from("brand-assets-private").createSignedUrls(validTiles.map(t => t.storage_path), 3600) : null;
      const urls = new Map((signed?.data ?? []).map(row => [row.path, row.signedUrl]));
      const items: GalleryAsset[] = validTiles.map(t => ({ type: "tile", id: t.id, title: t.name.replace(/\.[^.]+$/, ""), url: urls.get(t.storage_path) ?? undefined, savedCaption: captions[t.id] }));
      for (const row of videos.data ?? []) {
        const variant = row.creative_variants as unknown as { hook: string; narrative: string; review_state: string; primary_render_id: string | null } | null;
        if (!variant || (variant.primary_render_id && variant.primary_render_id !== row.id)) continue;
        const snapshot = row.brief_snapshot as { hook?: string } | null;
        items.push({ type: "video", id: row.variant_id, renderId: row.id, title: snapshot?.hook || variant.hook || variant.narrative || "Video", approved: variant.review_state === "approved" && variant.primary_render_id === row.id });
      }
      for (const row of written.data ?? []) if (row.caption?.trim() && !row.post_media.length && (row.created_via === null || row.created_via === "written_posts" || row.created_via.startsWith("personal-idea-batch:"))) items.push({ type: "written", id: row.id, title: row.caption, status: row.status });
      return { items, more: [tiles.data, videos.data, written.data].some(rows => (rows?.length ?? 0) === PAGE) };
    },
  });
  const unique = new Map<string, GalleryAsset>();
  for (const asset of gallery.data?.pages.flatMap(page => page.items) ?? []) { const key = `${asset.type}:${asset.id}`; if (!trashedKeys?.has(key) && !unique.has(key)) unique.set(key, asset); }
  for (const deck of carousels.data ?? []) {
    const key = `carousel:${deck.id}`;
    if (deck.complete && !deck.unreadable && !trashedKeys?.has(key)) unique.set(key, { type: "carousel", id: deck.id, title: deck.title, url: deck.coverUrl ?? undefined });
  }
  const assets = [...unique.values()];
  const history = useAssetPublishingStatus(workspaceId, assets.filter(a => a.type === "tile").map(a => a.id), assets.filter(a => a.type === "video").map(a => a.id), assets.filter(a => a.type === "written").map(a => a.id), assets.filter(a => a.type === "carousel").map(a => a.id));
  const isPublished = (asset: GalleryAsset) => ["published", "partially_published"].includes(asset.status ?? "") || (history.data?.[asset.id] ?? []).some(row => row.status === "published");
  function statusOf(asset: GalleryAsset) {
    const rows = history.data?.[asset.id] ?? [];
    if (asset.status === "scheduled" || rows.some(row => row.postStatus === "scheduled")) return "Scheduled";
    if (isPublished(asset)) return "Published";
    if (rows.some(row => row.postStatus === "publishing" || row.postStatus === "awaiting_approval")) return "In progress";
    return "Not scheduled";
  }
  const shown = assets.filter(asset => statusOf(asset) === tab);
  const add = (asset: GalleryAsset) => {
    addToSchedule(asset.type === "tile" ? { tileIds: [asset.id] } : asset.type === "video" ? { videoIds: [asset.id] } : asset.type === "carousel" ? { carouselIds: [asset.id] } : { writtenIds: [asset.id], knownPreviouslyPublished: asset.status !== "draft" });
  };
  return <section className="min-h-0 flex-1 space-y-3 overflow-y-auto rounded-xl bg-surface-subtle p-4" aria-label="Asset gallery">
    <div role="tablist" aria-label="Asset publishing status" className="flex rounded-lg bg-surface-subtle p-1">{galleryTabs.map(value => <button key={value} role="tab" aria-selected={tab === value} onClick={() => setTab(value)} type="button" className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold ${tab === value ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{value}</button>)}</div>
    {(gallery.isPending || carousels.isPending || (assets.length > 0 && history.isPending)) && <p role="status" className="text-sm text-muted-foreground">Loading content and publishing history…</p>}
    {(gallery.isError || carousels.isError || history.isError) && <p role="alert" className="text-sm text-destructive">Could not load content or publishing history. <button type="button" className="underline" onClick={() => { void gallery.refetch(); void carousels.refetch(); void history.refetch(); }}>Try again</button></p>}
    {!gallery.isPending && !gallery.isError && (!assets.length || !history.isPending) && !history.isError && <div className="grid grid-cols-2 gap-3">{shown.map(asset => {
      const key = `${asset.type}:${asset.id}`; const checked = selected.includes(key);
      const scheduled = new Map((history.data?.[asset.id] ?? [])
        .filter(row => row.postStatus === "scheduled")
        .map(row => [row.postId, row.date] as const));
      if (asset.status === "scheduled" && !scheduled.has(asset.id)) scheduled.set(asset.id, null);
      const occurrences = [...scheduled].sort((a, b) => (a[1] ?? "").localeCompare(b[1] ?? ""));
      const openAsset = () => {
        if (occurrences.length) setEditingId(occurrences[0][0]);
        else setPreviewing(asset);
      };
      return <article key={key} className="flex h-full flex-col overflow-hidden rounded-xl border border-border-control bg-background text-sm"><div className="relative flex aspect-square items-center justify-center overflow-hidden bg-surface-subtle">{asset.type === "video" ? <VideoPreview asset={asset} /> : asset.url ? <button type="button" className="h-full w-full" aria-label={`Preview ${asset.title}`} onClick={openAsset}><img src={asset.url} alt="" className="h-full w-full object-contain" /></button> : asset.type === "written" ? <p className="line-clamp-6 whitespace-pre-wrap p-3 text-xs">{asset.title}</p> : <span className="text-xs text-muted-foreground">Image unavailable</span>}<button type="button" onClick={openAsset} aria-label={`Expand ${asset.title}`} title="Expand preview" className="absolute right-2 top-2 rounded-lg border border-border-control bg-background p-2 text-ink shadow-sm"><Maximize2 className="size-4" /></button></div><div className="flex flex-1 flex-col gap-2 p-3"><button type="button" className="line-clamp-2 text-left font-semibold" onClick={openAsset}>{asset.title}</button><p className="text-xs text-muted-foreground">{asset.type === "tile" ? "Social tile" : asset.type === "video" ? "Video" : asset.type === "carousel" ? "LinkedIn carousel" : "Written post"} · <strong className="font-semibold text-foreground">{tab}</strong></p>{asset.type === "tile" && <><p className="line-clamp-2 text-xs text-muted-foreground">{asset.savedCaption?.caption ?? "No saved caption"}</p><button type="button" className="self-start text-xs font-semibold underline" onClick={openAsset}>View caption</button></>}
        {(history.data?.[asset.id] ?? []).filter(row => row.status !== "failed").map((row, index) =>
          scheduled.size > 1 && scheduled.has(row.postId)
            ? <button key={index} type="button" className="text-left text-xs text-muted-foreground underline" onClick={() => setEditingId(row.postId)}>{channelStatusLabel(row)}</button>
            : <p key={index} className="text-xs text-muted-foreground">{channelStatusLabel(row)}</p>
        )}
        {!scheduled.size && (asset.type !== "video" || asset.approved) && <button type="button" disabled={checked} onClick={() => add(asset)} className="mt-auto w-full rounded-lg border border-border-control px-2 py-2 text-xs font-semibold disabled:opacity-50">{checked ? "In schedule" : "Add to schedule"}</button>}
      </div></article>;
    })}{!shown.length && <p className="col-span-full rounded-lg border border-dashed p-4 text-sm text-muted-foreground">No posts in the {tab.toLowerCase()} tab among the loaded items.</p>}</div>}
    {gallery.hasNextPage && <button type="button" disabled={gallery.isFetchingNextPage} onClick={() => void gallery.fetchNextPage()} className="rounded-lg border border-border-control px-3 py-2 text-sm font-semibold">{gallery.isFetchingNextPage ? "Loading…" : "Load more content"}</button>}
    {editingId && <ComposerDrawer key={editingId} open postId={editingId} onOpenChange={open => {
      if (open) return;
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ["asset-publishing-status", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["publish-planner", workspaceId] });
      void gallery.refetch();
    }} />}
    {previewing?.type === "tile" && <ScheduleTilePreview workspaceId={workspaceId} tile={previewing} publishingHistory={history.isSuccess ? history.data[previewing.id] ?? [] : undefined} onClose={() => setPreviewing(null)} />}
    {previewing?.type === "carousel" && <ScheduleCarouselPreviewDialog workspaceId={workspaceId} carouselId={previewing.id} title={previewing.title} onClose={() => setPreviewing(null)} />}
    {(previewing?.type === "video" || previewing?.type === "written") && <Dialog open onOpenChange={open => { if (!open) setPreviewing(null); }}>
      <DialogContent className="flex max-h-[92dvh] w-[min(95vw,900px)] max-w-none flex-col overflow-hidden">
        <DialogTitle className="pr-8">{previewing.type === "written" ? "Written post" : previewing.title}</DialogTitle>
        <DialogDescription>Preview your content before adding it to the schedule.</DialogDescription>
        <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-surface-subtle p-3">
          {previewing.type === "video" ? <VideoReview asset={previewing} onReady={() => {}} /> : <p className="w-full whitespace-pre-wrap p-3 text-sm leading-relaxed">{previewing.title}</p>}
        </div>
      </DialogContent>
    </Dialog>}


  </section>;
}
export function VideoReview({ asset, onReady }: { asset: GalleryAsset; onReady: (ready: boolean) => void }) {
  const playback = useServerFn(getAssetVersionPlayback);
  const media = useQuery({ queryKey: ["schedule-gallery-video", asset.id, asset.renderId], queryFn: () => playback({ data: { id: asset.id, render_id: asset.renderId! } }), enabled: !!asset.renderId });
  return media.data?.url ? <video controls playsInline src={media.data.url} onLoadedMetadata={() => onReady(true)} onError={() => onReady(false)} className="max-h-[50vh] max-w-full" aria-label={`Review ${asset.title}`} /> : <p className="p-4 text-inverse">{media.isError ? "Video preview unavailable" : "Loading video…"}</p>;
}
