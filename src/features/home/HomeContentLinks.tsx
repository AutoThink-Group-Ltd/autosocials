import { lazy, Suspense, useState } from "react";
import { usePipelineAssetCounts } from "@/features/create/PipelineAssets";
import { usePipelinePlanCounts } from "@/features/create/PipelinePlans";

const ContentManager = lazy(() =>
  import("./HomeContent").then((module) => ({ default: module.HomeContent })),
);
const formats = [
  ["video", "Video"],
  ["tiles", "Social Tiles"],
  ["written", "Written Posts"],
  ["carousel", "LinkedIn Carousels"],
] as const;

export function HomeContentLinks({
  workspaceId,
  showWorkLink = true,
}: {
  workspaceId: string;
  showWorkLink?: boolean;
}) {
  const assets = usePipelineAssetCounts(workspaceId);
  const plans = usePipelinePlanCounts(workspaceId);
  const [manage, setManage] = useState(false);
  const counts = assets.isLoading || assets.isError ? undefined : assets.counts;
  const stages = [
    ["Plans", "plans", plans.plans],
    ["In production", "production", plans.production],
    ["Ready to publish", "ready", counts?.ready],
    ["Scheduled", "scheduled", counts?.scheduled],
    ["Published", "published", counts?.published],
  ] as const;
  return (
    <section aria-label="Content" className="min-w-0 max-w-full space-y-5">
      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
        {stages.map(([label, stage, count]) => (
          <a
            key={stage}
            href={`/app/create?stage=${stage}`}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-border bg-card px-3 py-2 text-sm font-semibold hover:bg-surface-subtle"
          >
            {label}{" "}
            {count != null && <span className="tabular-nums">({count})</span>}
          </a>
        ))}
      </div>
      <div>
        <h3 className="mb-2 font-semibold">Browse ready assets by format</h3>
        <div className="flex gap-2 overflow-x-auto py-1">
          {formats.map(([format, title]) => (
            <a
              key={format}
              href={`/app/create?stage=ready&format=${format}`}
              className="shrink-0 whitespace-nowrap rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-subtle"
            >
              {title}
            </a>
          ))}
        </div>
      </div>
      <details onToggle={(event) => setManage(event.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-semibold">
          Bulk actions
        </summary>
        {manage && (
          <>
            {showWorkLink && (
              <a
                href="/app/home?view=work"
                className="my-3 mr-4 inline-block text-sm underline"
              >
                Manage work in progress
              </a>
            )}
            <a
              href="/app/sam-creations?folders=1"
              className="my-3 inline-block text-sm underline"
            >
              Manage video folders
            </a>
            <Suspense fallback={<p role="status">Loading assets…</p>}>
              <ContentManager key={workspaceId} workspaceId={workspaceId} />
            </Suspense>
          </>
        )}
      </details>
    </section>
  );
}
