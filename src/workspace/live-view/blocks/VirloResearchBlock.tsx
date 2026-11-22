import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getVirloResearchResult } from "@/lib/virlo.functions";
import type { Block } from "@/lib/sam.blocks";
import { ResultCards } from "@/features/virlo/VirloResearchPage";

type ResearchBlock = Extract<Block, { type: "virlo_research" }>;
export function VirloResearchBlock({ b, workspaceId }: { b: ResearchBlock; workspaceId?: string | null }) {
  const getResult = useServerFn(getVirloResearchResult);
  const result = useQuery({ queryKey: ["virlo-canvas-result", workspaceId, b.result_id],
    queryFn: () => getResult({ data: { workspace_id: workspaceId!, result_id: b.result_id } }),
    enabled: !!workspaceId, staleTime: 60_000, retry: false });
  return <section aria-label={b.title} className="space-y-4">
    <header><p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Research from Virlo</p><h3 className="mt-1 text-xl font-semibold text-ink">{b.title}</h3><p className="mt-1 text-xs text-text-secondary">Public source data. Open the original post or profile for context.</p></header>
    {result.isPending && <p className="text-sm text-text-secondary">Loading research…</p>}
    {result.isError && <p role="alert" className="text-sm text-warning">Research could not be loaded for this business.</p>}
    {result.data && workspaceId && <ResultCards result={{ ...result.data, title: b.title, page: 1 }} workspaceId={workspaceId} />}
  </section>;
}
