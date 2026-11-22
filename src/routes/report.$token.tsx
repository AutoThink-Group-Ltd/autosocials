import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { SharedSocialReport } from "@/features/research/SharedSocialReport";
import { getPublicResearchShare } from "@/lib/research-share.functions";

export const Route = createFileRoute("/report/$token")({
  loader: ({ params }) => getPublicResearchShare({ data: { token: params.token } }),
  head: () => ({ meta: [
    { title: "Social Lens report — AutoSocials" },
    { name: "robots", content: "noindex, nofollow, noarchive" },
    { name: "referrer", content: "no-referrer" },
  ] }),
  component: PublicResearchReport,
});

function PublicResearchReport() {
  const { token } = Route.useParams();
  const initial = Route.useLoaderData();
  const report = useQuery({
    queryKey: ["public-research-report", token],
    queryFn: () => getPublicResearchShare({ data: { token } }),
    initialData: initial,
    staleTime: 30_000,
    refetchInterval: (query) => query.state.data?.trend_status === "pending" || query.state.data?.brief_status === "pending" || query.state.data?.visual?.status === "pending" ? 5000 : false,
  });
  if (!report.data) return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 text-center text-ink">
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-text-muted">AutoSocials · Social Lens</p>
        <h1 className="font-display text-3xl font-bold">This report link is no longer active</h1>
        <p className="mt-3 text-sm text-text-secondary">Ask the person who shared it for a new link.</p>
      </div>
    </main>
  );
  return <SharedSocialReport run={report.data.run} visual={report.data.visual} trends={report.data.trends} niche={report.data.niche} checkedAt={report.data.checked_at} trendStatus={report.data.trend_status} briefStatus={report.data.brief_status} />;
}
