import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertCircle, ArrowRight, Check, LoaderCircle, X } from "lucide-react";
import { getBrandDnaProgress } from "@/lib/brand-dna.functions";

export function BrandDnaProgressBanner({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { pathname } = useLocation();
  const onDnaPage = pathname === "/app/brand-dna";
  const progress = useServerFn(getBrandDnaProgress);
  const query = useQuery({
    queryKey: ["brand-dna-progress", workspaceId],
    queryFn: () => progress({ data: { workspaceId } }),
    enabled: !onDnaPage,
    refetchInterval: (state) =>
      state.state.data?.status === "building" ? 4_000 : false,
  });
  const run = query.data;
  const key = run && `brand-dna-banner:${workspaceId}:${run.id}:${run.status}`;
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (key && sessionStorage.getItem(key) === "dismissed") setDismissed(key);
  }, [key]);

  if (!run || onDnaPage || dismissed === key) return null;
  const building = run.status === "building";
  const ready = run.status === "ready";
  const Icon = building ? LoaderCircle : ready ? Check : AlertCircle;

  function dismiss() {
    if (!key) return;
    sessionStorage.setItem(key, "dismissed");
    setDismissed(key);
  }

  return (
    <aside
      aria-label="Brand DNA progress"
      className="relative border-b border-border bg-surface px-4 py-2.5 text-sm text-ink sm:px-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2">
        <div role="status" className="flex min-w-0 items-center gap-2.5">
          <Icon
            aria-hidden
            className={
              building ? "shrink-0 motion-safe:animate-spin" : "shrink-0"
            }
            size={17}
          />
          <div>
            <span className="font-semibold">
              {building
                ? "Building your Brand DNA"
                : ready
                  ? "Your Brand DNA is ready for review"
                  : "Your Brand DNA build needs attention"}
            </span>
            {building && (
              <span className="block text-xs text-text-secondary sm:ml-3 sm:inline">
                {run.phase}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/app/brand-dna"
            className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 font-medium hover:bg-surface-subtle"
          >
            View Brand DNA <ArrowRight aria-hidden size={14} />
          </Link>
          {!building && (
            <button
              type="button"
              aria-label="Dismiss Brand DNA notification"
              onClick={dismiss}
              className="rounded-md p-2 hover:bg-surface-subtle"
            >
              <X aria-hidden size={15} />
            </button>
          )}
        </div>
      </div>
      {building && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-0.5 bg-ink/40 motion-safe:animate-pulse"
        />
      )}
    </aside>
  );
}
