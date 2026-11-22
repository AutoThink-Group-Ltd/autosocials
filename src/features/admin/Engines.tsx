import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { engineIds, engineImageLink, getEngineOverview, listEngineGallery, type EngineId } from "@/lib/engines.functions";
import { generationPreview, generationStepPreview } from "@/lib/generation-tracker.functions";

const names: Record<EngineId, string> = { hyperframes: "HyperFrames", golpo: "Golpo.io", openai: "OpenAI image generation", higgsfield: "Higgsfield", ideogram: "Ideogram", recraft: "Recraft", heygen: "HeyGen", kie: "Kie" };
const assessment: Record<EngineId, string> = { hyperframes: "Tested · reliable", golpo: "Tested · reliable", openai: "Tested · reliable", higgsfield: "Set up · unreliable / needs testing", ideogram: "Set up · not yet tested", recraft: "Set up · not yet tested", heygen: "Reliability not assessed", kie: "Reliability not yet verified" };
const wrap = "space-y-6 p-6 text-foreground";
export function EnginesOverview() {
  const load = useServerFn(getEngineOverview);
  const q = useQuery({ queryKey: ["engines-overview"], queryFn: () => load() });
  return <section className={wrap}><header><p className="text-xs uppercase tracking-widest text-muted-foreground">Super Admin / Production</p><h1 className="mt-2 text-2xl font-bold">Engines</h1><p className="mt-2 text-sm text-muted-foreground">Configuration, recorded usage and galleries across all workspaces.</p></header>
    <p className="text-sm text-muted-foreground">Reliability reflects the current manual assessment. Availability reflects configuration and routing, not a live provider health check. Image fallbacks are used only when higher-priority routes are unavailable.</p>
    {q.isPending ? <p>Loading engines…</p> : q.isError ? <p role="alert">Engine usage is unavailable. Please try again.</p> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{q.data.map(e => <a href={`/app/admin/engines/${e.id}`} key={e.id} className="block rounded-2xl border border-border-control bg-canvas p-5 hover:bg-surface-subtle"><div className="flex flex-wrap items-start justify-between gap-3"><h2 className="text-lg font-semibold">{names[e.id]}</h2><span className={e.configured ? "rounded-full border border-success px-2.5 py-1 text-xs font-semibold text-success" : "rounded-full border border-destructive px-2.5 py-1 text-xs font-semibold text-destructive"}>{e.configured ? "Configured" : "Not configured"}</span></div><div className="mt-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reliability status</p><p className={e.id === "higgsfield" ? "mt-1 inline-flex rounded-lg bg-warning-surface px-3 py-1.5 text-sm font-bold text-warning" : ["hyperframes", "golpo", "openai"].includes(e.id) ? "mt-1 inline-flex rounded-lg border border-success px-3 py-1.5 text-sm font-bold text-success" : "mt-1 inline-flex rounded-lg bg-surface-subtle px-3 py-1.5 text-sm font-bold text-foreground"}>{assessment[e.id]}</p></div><div className="mt-3"><p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">User availability</p><p className="mt-1 text-sm font-medium">{e.exposure}</p></div><dl className="mt-5 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-muted-foreground">Recorded requests / steps</dt><dd className="font-semibold">{e.total.toLocaleString()}</dd></div><div><dt className="text-muted-foreground">Completed / failed</dt><dd className="font-semibold">{e.completed} / {e.failed}</dd></div><div className="col-span-2"><dt className="text-muted-foreground">Provider credits recorded</dt><dd className="font-semibold">{e.credits === null ? "Not reported" : `${e.credits.toLocaleString()} (${e.creditRecords} records)`}</dd></div></dl><p className="mt-4 text-xs text-muted-foreground">Open gallery →</p></a>)}</div>}
    <p className="text-xs text-muted-foreground">Counts use the video generation ledger and social-image operation history. Credits are provider-reported units where saved; missing values are not zero. Video costs and credits are not interchangeable. Earlier or unattributed content may be missing.</p></section>;
}
type Row = { id: string; renderId: string | null; title: string; model: string; createdAt: string; kind: "step" | "image" };
function GalleryCard({ row }: { row: Row }) {
  const imageLink = useServerFn(engineImageLink); const stepLink = useServerFn(generationStepPreview); const renderLink = useServerFn(generationPreview);
  const media = useQuery({
    queryKey: ["engine-gallery-media", row.kind, row.id, row.renderId],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: async () => {
      if (row.kind === "image") return { url: await imageLink({ data: { id: row.id } }), kind: "image" as const };
      try { return await stepLink({ data: { stepId: row.id } }); }
      catch {
        if (!row.renderId) throw new Error("Saved media is unavailable.");
        const render = await renderLink({ data: { renderJobId: row.renderId } });
        if (!render.url) throw new Error("Saved media is unavailable.");
        return { url: render.url, kind: "video" as const };
      }
    },
  });
  return <article className="overflow-hidden rounded-2xl border border-border-control bg-canvas">
    <div className="flex min-h-48 items-center justify-center bg-surface-subtle p-3">
      {media.data ? media.data.kind === "image"
        ? <img src={media.data.url} alt={row.title} loading="lazy" className="h-auto max-w-full" />
        : <video src={media.data.url} controls preload="metadata" aria-label={row.title} className="h-auto max-w-full" />
        : media.isError ? <div className="text-center"><p role="alert" className="text-sm text-destructive">Saved media is unavailable.</p><Button className="mt-2" variant="outline" onClick={() => void media.refetch()}>Try again</Button></div>
        : <p role="status" className="text-sm text-muted-foreground">Loading preview…</p>}
    </div>
    <div className="space-y-2 p-4"><h2 className="break-words font-semibold">{row.title}</h2><p className="text-xs text-muted-foreground">{row.model} · {new Date(row.createdAt).toLocaleString()}</p>{media.data && <a href={media.data.url} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-medium underline">Open original</a>}</div>
  </article>;
}
export function EngineGallery({ id }: { id: string }) {
  const valid = engineIds.includes(id as EngineId); const engineId = id as EngineId;
  const list = useServerFn(listEngineGallery); const [page, setPage] = useState(0); const [search, setSearch] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [filters, setFilters] = useState({ search: "", from: "", to: "" });
  const q = useQuery({ queryKey: ["engine-gallery", id, page, filters], enabled: valid, queryFn: () => list({ data: { id: engineId, page, search: filters.search, from: filters.from || undefined, to: filters.to || undefined } }) });
  function apply(e: FormEvent) { e.preventDefault(); setPage(0); setFilters({ search, from, to }); }
  if (!valid) return <section className={wrap}><p>Engine not found.</p><a className="underline" href="/app/admin/engines">Back to engines</a></section>;
  return <section className={wrap}><header><a href="/app/admin/engines" className="text-sm underline">← Engines</a><h1 className="mt-3 text-2xl font-bold">{names[engineId]} gallery</h1><p className="mt-2 text-sm text-muted-foreground">{assessment[engineId]} · Completed, saved content across workspaces.</p></header><form onSubmit={apply} className="grid gap-3 rounded-2xl border border-border-control bg-canvas p-4 sm:grid-cols-4"><label className="text-xs font-semibold">Search<Input value={search} onChange={e => setSearch(e.target.value)} placeholder={rowIsImage(engineId) ? "Image title" : "Model or recorded brief"} /></label><label className="text-xs font-semibold">From (UTC)<Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="text-xs font-semibold">To (UTC)<Input type="date" min={from || undefined} value={to} onChange={e => setTo(e.target.value)} /></label><Button className="self-end" type="submit">Apply filters</Button></form><p className="text-xs text-muted-foreground">Video entries are recorded engine steps; where an ingredient cannot be opened, the saved final render is shown. Older unattributed content may be missing.</p>{q.isPending ? <p>Loading gallery…</p> : q.isError ? <p role="alert">Gallery unavailable. Check access and try again.</p> : <><p className="text-sm text-muted-foreground">{q.data?.total ?? 0} items</p>{q.data?.rows.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{q.data.rows.map((r: Row) => <GalleryCard key={r.id} row={r} />)}</div> : <p className="rounded-2xl border border-dashed border-border-control p-10 text-center text-sm text-muted-foreground">No saved content found for these filters.</p>}<div className="flex gap-2"><Button variant="outline" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Button><Button variant="outline" disabled={(page + 1) * 24 >= (q.data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button></div></>}</section>;
}
function rowIsImage(id: EngineId) { return ["openai", "recraft", "ideogram"].includes(id); }

