import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Radar } from "lucide-react";
import { toast } from "sonner";
import { getSeoPlan, updateSeoBatch, updateSeoPage, type SeoPlanBatch, type SeoPlanPage as PlanPage } from "@/lib/seo-plan.functions";
import { pingSearchEngines } from "@/lib/seo-health.functions";
import { SITE_URL } from "@/lib/seo-routes";
import { cn } from "@/lib/utils";

type PageStatus = PlanPage["status"];
type BatchStatus = SeoPlanBatch["status"];
const label = (status: string) => status === "in_progress" ? "In progress" : status[0]!.toUpperCase() + status.slice(1);
const effectiveStatus = (batch: SeoPlanBatch, pages: PlanPage[]): BatchStatus => {
  const own = pages.filter(page => page.batch_id === batch.id);
  return own.length > 0 && own.every(page => page.status === "live") ? "done" : batch.status === "done" ? "in_progress" : batch.status;
};

export default function SeoPlanPage() {
  const qc = useQueryClient();
  const read = useServerFn(getSeoPlan), savePage = useServerFn(updateSeoPage), saveBatch = useServerFn(updateSeoBatch), ping = useServerFn(pingSearchEngines);
  const query = useQuery({ queryKey: ["seo-plan"], queryFn: () => read() });
  const { pages = [], batches = [] } = query.data ?? {};
  const [tab, setTab] = useState<"pages" | "batches">("pages");
  const [search, setSearch] = useState("");
  const [cluster, setCluster] = useState("");
  const [status, setStatus] = useState<"all" | PageStatus>("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const clusters = useMemo(() => [...new Map(batches.map(batch => [batch.cluster_slug, batch.cluster_name])).entries()], [batches]);
  const batchStates = useMemo(() => new Map(batches.map(batch => [batch.id, effectiveStatus(batch, pages)])), [batches, pages]);
  const live = pages.filter(page => page.status === "live").length;
  const inProgress = pages.filter(page => page.status === "in_progress").length;
  const done = batches.filter(batch => batchStates.get(batch.id) === "done").length;
  const active = batches.filter(batch => batchStates.get(batch.id) === "in_progress").length;
  const term = search.trim().toLowerCase();
  const filteredPages = pages.filter(page => (!cluster || page.cluster_slug === cluster) && (status === "all" || page.status === status) && (showCompleted || page.status !== "live") && (!term || `${page.path} ${page.title}`.toLowerCase().includes(term)));
  const filteredBatches = batches.filter(batch => (!cluster || batch.cluster_slug === cluster) && (showCompleted || batchStates.get(batch.id) !== "done") && (!term || `${batch.name} ${batch.angle} ${pages.filter(page => page.batch_id === batch.id).map(page => `${page.path} ${page.title}`).join(" ")}`.toLowerCase().includes(term)));
  const hidden = tab === "pages" ? pages.filter(page => page.status === "live" && (!cluster || page.cluster_slug === cluster)).length : batches.filter(batch => batchStates.get(batch.id) === "done" && (!cluster || batch.cluster_slug === cluster)).length;

  async function update(kind: "page" | "batch", id: string, value: PageStatus | BatchStatus) {
    setBusy(id);
    try {
      if (kind === "page") await savePage({ data: { id, status: value as PageStatus } });
      else await saveBatch({ data: { id, status: value as BatchStatus } });
      await qc.invalidateQueries({ queryKey: ["seo-plan"] });
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save status"); }
    finally { setBusy(null); }
  }

  async function copyPrompt(batch: SeoPlanBatch) {
    const own = pages.filter(page => page.batch_id === batch.id);
    const list = own.map(page => `- ${page.path} — "${page.title}" (keyword: ${page.target_keyword ?? ""})`).join("\n");
    try {
      await navigator.clipboard.writeText(`${batch.prompt}\n${list}\n\nFinally update the Superadmin SEO Plan: mark these pages live after publication and verify this batch is done.`);
      setCopied(batch.id);
      window.setTimeout(() => setCopied(current => current === batch.id ? null : current), 2000);
    } catch { toast.error("Could not copy the prompt"); }
  }

  return <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h1 className="font-display text-[28px] font-bold tracking-tight">SEO plan</h1><p className="text-sm text-muted-foreground">500-page North Star · AutoSocials content and AI discovery</p></div><button type="button" disabled={busy !== null} onClick={async () => { setBusy("ping"); try { const result = await ping(); toast.success(`Submitted ${result.submitted} public URLs to IndexNow.`); } catch (error) { toast.error(error instanceof Error ? error.message : "IndexNow failed"); } finally { setBusy(null); } }} className="inline-flex items-center gap-2 rounded-lg border border-border-control bg-surface px-3 py-2 text-sm font-medium disabled:opacity-50"><Radar className="size-4" />{busy === "ping" ? "Submitting…" : "Ping search engines"}</button></header>
    {query.isPending && <p className="py-12 text-center text-muted-foreground">Loading SEO plan…</p>}
    {query.isError && <p role="alert" className="rounded-xl border border-destructive p-4 text-destructive">Could not load the SEO plan: {query.error.message}</p>}
    {query.data && <>
      <section className="rounded-2xl border-2 border-ink bg-surface p-5"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">North Star</p><p className="font-display text-4xl font-bold tabular-nums">{live} <span className="text-xl text-muted-foreground">/ 500 pages live</span></p></div><div className="grid grid-cols-3 gap-5 text-sm"><div><p className="text-muted-foreground">In progress</p><b>{inProgress}</b></div><div><p className="text-muted-foreground">Batches done</p><b>{done}/{batches.length}</b></div><div><p className="text-muted-foreground">Batches active</p><b>{active}</b></div></div></div><div className="mt-5 h-2 overflow-hidden rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-ink" style={{ width: `${Math.max(live / 5, 1)}%` }} /></div></section>
      <section aria-label="Clusters" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{clusters.map(([slug, name]) => { const own = pages.filter(page => page.cluster_slug === slug); const count = own.filter(page => page.status === "live").length; return <button key={slug} type="button" aria-pressed={cluster === slug} onClick={() => setCluster(current => current === slug ? "" : slug)} className={cn("rounded-xl border p-3 text-left hover:border-ink", cluster === slug ? "border-ink bg-surface-subtle" : "border-border-control bg-surface")}><span className="text-sm font-semibold">{name}</span><span className="mt-1 block text-xs text-muted-foreground">{count}/{own.length} live</span><span className="mt-2 block h-1 rounded-full bg-surface-subtle"><span className="block h-1 rounded-full bg-ink" style={{ width: `${own.length ? count / own.length * 100 : 0}%` }} /></span></button>; })}</section>
      <div className="flex gap-2 border-b border-border-control">{(["pages", "batches"] as const).map(value => <button key={value} type="button" onClick={() => setTab(value)} aria-selected={tab === value} role="tab" className={cn("px-4 py-2 text-sm font-semibold", tab === value ? "border-b-2 border-ink text-ink" : "text-muted-foreground")}>{value === "pages" ? "Pages" : "Batches"} ({value === "pages" ? pages.length : batches.length})</button>)}</div>
      <div className="flex flex-wrap items-center gap-3"><input aria-label="Search paths or titles" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search paths or titles" className="min-w-52 flex-1 rounded-lg border border-border-control bg-surface px-3 py-2 text-sm" /><select aria-label="Cluster" value={cluster} onChange={event => setCluster(event.target.value)} className="rounded-lg border border-border-control bg-surface px-3 py-2 text-sm"><option value="">All clusters</option>{clusters.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select>{tab === "pages" && <select aria-label="Page status" value={status} onChange={event => setStatus(event.target.value as typeof status)} className="rounded-lg border border-border-control bg-surface px-3 py-2 text-sm"><option value="all">All statuses</option><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="live">Live</option></select>}<label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showCompleted} onChange={event => setShowCompleted(event.target.checked)} /> Show completed</label></div>
      {!showCompleted && hidden > 0 && <p className="text-xs text-muted-foreground">{hidden} {tab === "pages" ? "live pages" : "done batches"} hidden</p>}
      {tab === "pages" ? <div className="overflow-x-auto rounded-xl border border-border-control bg-surface"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-surface-subtle text-xs uppercase text-muted-foreground"><tr>{["Path", "Title", "Cluster", "Keyword", "Status"].map(head => <th key={head} className="p-3">{head}</th>)}</tr></thead><tbody>{filteredPages.slice(0, 300).map(page => <tr key={page.id} className={cn("border-t border-border-control", page.status === "live" && "bg-success/10")}><td className="p-3 font-mono text-xs"><a href={`${SITE_URL}${page.path}`} target="_blank" rel="noopener noreferrer" className="hover:underline">{page.path}</a></td><td className="p-3">{page.title}</td><td className="p-3">{clusters.find(([slug]) => slug === page.cluster_slug)?.[1]}</td><td className="p-3 text-xs text-muted-foreground">{page.target_keyword}</td><td className="p-3"><select aria-label={`Status for ${page.title}`} value={page.status} disabled={busy === page.id} onChange={event => void update("page", page.id, event.target.value as PageStatus)} className="rounded border border-border-control bg-surface px-2 py-1 text-xs"><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="live">Live</option></select></td></tr>)}</tbody></table>{filteredPages.length > 300 && <p className="border-t border-border-control p-3 text-xs text-muted-foreground">Showing first 300 of {filteredPages.length} — narrow with filters</p>}</div> : <div className="grid gap-3 lg:grid-cols-2">{filteredBatches.map(batch => { const own = pages.filter(page => page.batch_id === batch.id); const count = own.filter(page => page.status === "live").length; const state = batchStates.get(batch.id)!; return <article key={batch.id} className={cn("rounded-xl border border-border-control bg-surface p-4", state === "done" && "bg-success/10")}><p className="text-xs font-bold uppercase text-muted-foreground">{batch.cluster_name}</p><h2 className="mt-1 font-semibold">{batch.name}</h2><p className="mt-2 text-xs text-muted-foreground">{own.length} pages · {count} live</p><div className="mt-2 h-1.5 rounded-full bg-surface-subtle"><div className="h-full rounded-full bg-ink" style={{ width: `${own.length ? count / own.length * 100 : 0}%` }} /></div><div className="mt-4 flex flex-wrap items-center justify-between gap-2"><select aria-label={`Status for ${batch.name}`} value={state} disabled={busy === batch.id || state === "done"} onChange={event => void update("batch", batch.id, event.target.value as BatchStatus)} className="rounded border border-border-control bg-surface px-2 py-1 text-xs"><option value="planned">Planned</option><option value="in_progress">In progress</option><option value="done">Done</option></select><button type="button" onClick={() => void copyPrompt(batch)} className="inline-flex items-center gap-2 rounded-lg border border-border-control bg-surface px-3 py-2 text-xs font-semibold"><Copy className="size-3.5" />{copied === batch.id ? "Copied to clipboard" : "Copy build prompt"}</button></div></article>; })}</div>}
      {tab === "pages" && filteredPages.length === 0 && <p className="text-sm text-muted-foreground">No pages match these filters.</p>}
      {tab === "batches" && filteredBatches.length === 0 && <p className="text-sm text-muted-foreground">No batches match these filters.</p>}
    </>}
  </div>;
}
