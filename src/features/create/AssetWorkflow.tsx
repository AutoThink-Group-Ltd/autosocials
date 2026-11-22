import { createContext, useContext, useEffect } from "react";
import { pipelineStages, type PipelineStage } from "@/lib/create-pipeline";

export const assetStageLabels: Record<PipelineStage, string> = {
  plans: "Plans",
  production: "Production",
  ready: "Ready to Publish",
  scheduled: "Scheduled",
  published: "Posted",
};

export const AssetStageContext = createContext<
  ((stage: PipelineStage | null) => void) | null
>(null);

export function AssetWorkflow({
  stage,
  standalone = false,
}: {
  stage: PipelineStage;
  standalone?: boolean;
}) {
  const context = useContext(AssetStageContext);
  const report = standalone ? null : context;
  useEffect(() => {
    report?.(stage);
    return () => report?.(null);
  }, [report, stage]);
  if (report) return null;
  return (
    <ol
      aria-label="Asset progress"
      className="flex flex-wrap gap-1 rounded-xl border border-border bg-canvas p-1"
    >
      {pipelineStages.map((step) => (
        <li
          key={step}
          aria-current={stage === step ? "step" : undefined}
          className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold ${stage === step ? "bg-ink text-inverse" : "text-muted-foreground"}`}
        >
          {assetStageLabels[step]}
        </li>
      ))}
    </ol>
  );
}

export function AssetBuildProgress({
  label,
  detail,
}: {
  label: string;
  detail?: string;
}) {
  return (
    <section
      aria-label="Production progress"
      className="space-y-3 rounded-xl border border-border bg-surface-subtle p-5"
    >
      <p role="status" className="font-semibold">
        {label}
        {detail && (
          <span className="ml-2 font-normal text-muted-foreground">
            {detail}
          </span>
        )}
      </p>
      <div
        role="progressbar"
        aria-label={label}
        className="h-1.5 overflow-hidden rounded-full bg-ink/15"
      >
        <div className="build-progress-indeterminate h-full rounded-full bg-ink" />
      </div>
    </section>
  );
}
