import { lazy, Suspense, useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowLeft,
  Clapperboard,
  FileText,
  GalleryHorizontalEnd,
  Images,
} from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { CreatePage } from "@/features/create/CreatePage";
import { AssetStageContext, assetStageLabels as stageNames } from "@/features/create/AssetWorkflow";
import { CampaignCard } from "@/features/sam/CampaignCard";
import {
  PipelineAssets,
  usePipelineAssetCounts,
} from "@/features/create/PipelineAssets";
import {
  PipelinePlans,
  usePipelinePlanCounts,
} from "@/features/create/PipelinePlans";
import {
  createSearch,
  pipelineStages,
  pipelineFormats,
  type CreateSearch,
  type PipelineStage,
} from "@/lib/create-pipeline";

const CarouselEditor = lazy(() =>
  import("@/features/create/LinkedInCarousels").then((module) => ({
    default: module.LinkedInCarousels,
  })),
);
const formatNames = {
  video: "Video",
  tiles: "Social Tiles",
  written: "Written Posts",
  carousel: "LinkedIn Carousels",
};
const icons = {
  video: Clapperboard,
  tiles: Images,
  written: FileText,
  carousel: GalleryHorizontalEnd,
};

export const Route = createFileRoute("/app/create")({
  validateSearch: createSearch,
  head: () => ({
    meta: [
      { title: "Create Assets — AutoSocials" },
      {
        name: "description",
        content: "Plan, produce and publish content with Sam.",
      },
    ],
  }),
  component: CreateRoute,
});

function CreateRoute() {
  const { currentWorkspace } = useWorkspace();
  if (!currentWorkspace)
    return <p className="p-6">Choose a workspace to see its content.</p>;
  return (
    <Pipeline
      key={currentWorkspace.id}
      ws={currentWorkspace.id}
      name={currentWorkspace.name}
    />
  );
}

function Pipeline({ ws, name }: { ws: string; name: string }) {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const stage: PipelineStage = search.stage ?? (search.production ? "production" : "plans");
  const [assetStage, showAssetStage] = useState<PipelineStage | null>(null);
  const activeStage = assetStage ?? stage;
  const stageKey = `as:pipeline-stage:${ws}`;
  const plans = usePipelinePlanCounts(ws);
  const assets = usePipelineAssetCounts(ws);
  const counts = {
    ...plans,
    ...(!assets.isLoading && !assets.isError
      ? assets.counts
      : { ready: undefined, scheduled: undefined, published: undefined }),
  };
  const listing = createSearch({ stage, format: search.format });
  const origin = createSearch({
    ...listing,
    item: stage !== "ready" && search.item === `carousel:${search.carousel}` ? undefined : search.item,
  });
  const detail = !!(
    search.start ||
    search.wizard ||
    search.ideaBatch ||
    search.carousel ||
    search.production
  );
  function go(next: CreateSearch, replace = false) {
    void navigate({ search: next, replace });
  }
  function open(next: Record<string, unknown>) {
    go(createSearch({ ...origin, ...next }));
  }
  useEffect(() => {
    if (search.stage) {
      localStorage.setItem(stageKey, search.stage);
      return;
    }
    const last = localStorage.getItem(stageKey);
    const restored =
      !detail && !search.item && pipelineStages.includes(last as PipelineStage)
        ? (last as PipelineStage)
        : stage;
    void navigate({ search: { ...search, stage: restored }, replace: true });
  }, [search, detail, stage, stageKey, navigate]);
  const back = () => go(origin);
  return (
    <AssetStageContext.Provider value={showAssetStage}>
    <main className="h-full min-h-0 overflow-y-auto bg-canvas">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-5 sm:px-7 md:py-8">
        <header>
          <p className="text-sm text-muted-foreground">{name}</p>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            Create Assets
          </h1>
        </header>
        {!detail && !search.item && (
          <div
            aria-label="Start a new asset"
            className="grid grid-cols-2 gap-2 md:grid-cols-4"
          >
            {pipelineFormats.map((format) => {
              const Icon = icons[format];
              return (
                <button
                  key={format}
                  type="button"
                  onClick={() =>
                    open(
                      format === "carousel"
                        ? { carousel: "new" }
                        : format === "written"
                          ? { wizard: "written" }
                          : { start: format },
                    )
                  }
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-4 text-left text-sm font-semibold transition hover:border-ink focus-visible:outline-ink"
                >
                  <Icon className="size-5 shrink-0" />
                  {formatNames[format]}
                </button>
              );
            })}
          </div>
        )}
        <nav
          aria-label="Content stages"
          className="sticky top-0 z-20 flex flex-wrap gap-1 border-b border-border bg-canvas pb-1"
        >
          {pipelineStages.map((s) => (
            <button
              key={s}
              type="button"
              aria-current={activeStage === s ? (detail || search.item ? "step" : "page") : undefined}
              onClick={() =>
                go(createSearch({ stage: s, format: search.format }))
              }
              className={`shrink-0 rounded-lg px-3 py-2.5 text-sm font-semibold ${activeStage === s ? "bg-ink text-inverse" : "text-muted-foreground hover:bg-surface-subtle"}`}
            >
              {stageNames[s]}
              {counts[s] != null && (
                <span className="ml-1.5 tabular-nums opacity-75">
                  {counts[s]}
                </span>
              )}
            </button>
          ))}
        </nav>
        {(search.production || search.wizard === "video") && (
          <button
            type="button"
            onClick={back}
            className="flex items-center gap-1 text-sm font-semibold underline underline-offset-2"
          >
            <ArrowLeft className="size-4" /> Back to{" "}
            {search.item ? "item" : stageNames[stage].toLowerCase()}
          </button>
        )}
        {search.production ? (
          <CampaignCard
            key={search.production}
            campaignId={search.production}
            workspaceId={ws}
            previewGroup={search.group ?? 0}
          />
        ) : search.carousel ? (
          <Suspense fallback={<p role="status">Opening carousel…</p>}>
            <CarouselEditor
              key={search.carousel}
              workspaceId={ws}
              {...(search.campaignPost
                ? { campaignPost: search.campaignPost }
                : {})}
              {...(search.carousel === "new"
                ? {}
                : { deckId: search.carousel })}
              onBack={back}
              assetView={stage === "ready" && search.carousel !== "new"}
              onDeckOpened={(id) => go({ ...search, stage: "plans", carousel: id }, true)}
              onNew={() => open({ carousel: "new" })}
            />
          </Suspense>
        ) : search.start || search.wizard || search.ideaBatch ? (
          <CreatePage
            key={search.ideaBatch ?? search.start ?? search.wizard}
            workspaceId={ws}
            workspaceName={name}
            search={search}
            onBack={back}
            onNavigate={open}
            onBatch={(id) => go(createSearch({ ...search, start: undefined, wizard: "video", batch: id }), true)}
          />
        ) : stage === "plans" || stage === "production" ? (
          <PipelinePlans
            key={stage}
            stage={stage}
            workspaceName={name}
            workspaceId={ws}
            item={search.item}
            onItem={(id) => go(createSearch({ ...listing, item: id }))}
            onNavigate={open}
          />
        ) : (
          <>
            {!search.item && (
              <label className="flex items-center gap-2 text-sm font-medium">
                Format
                <select
                  className="rounded-lg border border-border bg-surface p-2"
                  value={search.format ?? ""}
                  onChange={(e) =>
                    go(createSearch({ stage, format: e.target.value }))
                  }
                >
                  <option value="">All formats</option>
                  {pipelineFormats.map((f) => (
                    <option key={f} value={f}>
                      {formatNames[f]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <PipelineAssets
              stage={stage}
              workspaceId={ws}
              onStageChange={(nextStage, id) => go({ stage: nextStage, item: id }, true)}
              {...(search.item ? { item: search.item } : {})}
              {...(search.format ? { format: search.format } : {})}
              onItem={(id) => go(createSearch({ ...listing, item: id }))}
            />
          </>
        )}
      </div>
    </main>
    </AssetStageContext.Provider>
  );
}
