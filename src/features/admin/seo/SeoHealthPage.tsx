import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Mail, Radar, RefreshCw, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { pingSearchEngines, runSeoAuditNow, sendSeoEmailNow } from "@/lib/seo-health.functions";
import type { DiscoveryCheck, PageReport, Severity } from "@/lib/seo-audit";
import { cn } from "@/lib/utils";

type Audit = { id: string; created_at: string; score: number; counts: Record<Severity, number>; pages: PageReport[]; discovery: DiscoveryCheck[]; emailed_at: string | null };
const btn = "inline-flex items-center gap-2 rounded-[10px] px-3 py-2 text-[13px] font-semibold disabled:opacity-40";
const SEV: Record<Severity, string> = { critical: "bg-destructive text-destructive-foreground", high: "bg-warning-surface text-warning", medium: "bg-ink text-inverse", low: "bg-surface-subtle text-foreground" };
type Filter = "all" | "critical" | "orphans" | "thin" | "duplicates" | "schema";
const FILTERS: { id: Filter; label: string; test: (p: PageReport) => boolean }[] = [
  { id: "all", label: "All pages", test: () => true },
  { id: "critical", label: "Critical", test: (p) => p.issues.some((i) => i.severity === "critical") },
  { id: "orphans", label: "Orphans", test: (p) => p.issues.some((i) => i.message.startsWith("Orphan")) },
  { id: "thin", label: "Thin content", test: (p) => p.issues.some((i) => i.message.includes("words before")) },
  { id: "duplicates", label: "Duplicate metadata", test: (p) => p.issues.some((i) => i.message.includes("shared with")) },
  { id: "schema", label: "Missing schema", test: (p) => p.issues.some((i) => i.message.includes("structured data")) },
];

export default function SeoHealthPage() {
  const qc = useQueryClient();
  const run = useServerFn(runSeoAuditNow), send = useServerFn(sendSeoEmailNow), ping = useServerFn(pingSearchEngines);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const { data: audit, isFetched } = useQuery({
    queryKey: ["seo-audit"],
    queryFn: async () => ((await supabase.from("seo_audits").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle()).data ?? null) as unknown as Audit | null,
  });
  const { data: pings = [] } = useQuery({
    queryKey: ["indexnow-log"],
    queryFn: async () => (await supabase.from("indexnow_log").select("created_at,submitted,status,ok").order("created_at", { ascending: false }).limit(3)).data ?? [],
  });
  const act = async (key: string, fn: () => Promise<unknown>, ok: (r: any) => string) => {
    setBusy(key);
    try { const r = await fn(); toast.success(ok(r)); await qc.invalidateQueries({ queryKey: ["seo-audit"] }); await qc.invalidateQueries({ queryKey: ["indexnow-log"] }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setBusy(null); }
  };
  const rows = useMemo(() => (audit?.pages ?? []).filter(FILTERS.find((f) => f.id === filter)!.test), [audit, filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[28px] font-bold tracking-tight">SEO health</h1>
          <p className="text-[14px] text-muted-foreground">Live autosocials.com checked against the SEO + GEO Production Blueprint v3. A report email goes out every Monday at 8am.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={cn(btn, "border border-border-control bg-surface")} disabled={!!busy} onClick={() => void act("run", () => run(), (r) => `Checked. Score ${r.score}/100.`)}><RefreshCw className={cn("h-4 w-4", busy === "run" && "animate-spin")} />{busy === "run" ? "Checking…" : "Run check"}</button>
          <button type="button" className={cn(btn, "border border-border-control bg-surface")} disabled={!!busy} onClick={() => void act("ping", () => ping(), (r) => `Sent ${r.submitted} pages to search engines.`)}><Radar className="h-4 w-4" />{busy === "ping" ? "Pinging…" : "Ping search engines"}</button>
          <button type="button" className={cn(btn, "bg-ink text-inverse")} disabled={!!busy} onClick={() => void act("send", () => send({ data: { fresh: true } }), () => "Report emailed to you.")}><Mail className="h-4 w-4" />{busy === "send" ? "Sending…" : "Send me this now"}</button>
        </div>
      </header>

      {isFetched && !audit && <p className="rounded-[16px] border-2 border-dashed border-border-control p-10 text-center text-[14px] text-muted-foreground">No check yet. Press Run check.</p>}
      {audit && (
        <>
          <section className="grid gap-4 md:grid-cols-[220px_1fr]">
            <div className="grid place-items-center rounded-[20px] border-2 border-ink bg-surface p-6">
              <div className="grid h-36 w-36 place-items-center rounded-full border-[10px] border-ink">
                <p className="font-display text-[44px] font-black leading-none tabular-nums">{audit.score}<span className="text-[16px] text-muted-foreground">/100</span></p>
              </div>
              <p className="mt-3 text-[12px] text-muted-foreground">{new Date(audit.created_at).toLocaleString("en-GB")}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {(["critical", "high", "medium", "low"] as Severity[]).map((s) => (
                <div key={s} className="rounded-[16px] border-2 border-ink bg-surface p-4">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", SEV[s])}>{s}</span>
                  <p className="mt-3 font-display text-[34px] font-bold tabular-nums">{audit.counts[s] ?? 0}</p>
                </div>
              ))}
              <div className="col-span-2 rounded-[16px] border border-border bg-surface p-4 md:col-span-4">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-muted-foreground">Discovery files</p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {audit.discovery.map((d) => (
                    <li key={d.name} className="flex items-start gap-2 text-[13px]">
                      <span className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full", d.ok ? "bg-ink text-inverse" : "bg-destructive text-destructive-foreground")}>{d.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}</span>
                      <span><a href={d.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">{d.name}</a><span className="block text-muted-foreground">{d.note}</span></span>
                    </li>
                  ))}
                </ul>
                {pings[0] && <p className="mt-3 text-[12px] text-muted-foreground">Last search-engine ping: {new Date(pings[0].created_at).toLocaleString("en-GB")} · {pings[0].submitted} pages · {pings[0].ok ? "accepted" : `failed (${pings[0].status})`}</p>}
              </div>
            </div>
          </section>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={cn("rounded-full px-3 py-1.5 text-[12px] font-semibold", filter === f.id ? "bg-ink text-inverse" : "border border-border-control bg-surface")}>
                {f.label} <span className="tabular-nums opacity-70">{(audit.pages ?? []).filter(f.test).length}</span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto rounded-[16px] border-2 border-ink bg-surface">
            <table className="w-full text-left text-[12px]">
              <thead className="border-b-2 border-ink bg-surface-subtle text-[11px] uppercase tracking-wide text-muted-foreground">
                <tr>{["Page", "Status", "Title / description", "Words", "H1", "Schema", "Image", "Sitemap", "Links in", "Issues & fix"].map((h) => <th key={h} className="px-3 py-2 font-bold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((p) => (
                  <tr key={p.path} className="align-top">
                    <td className="px-3 py-2 font-mono"><a href={`https://autosocials.com${p.path}`} target="_blank" rel="noreferrer" className="hover:underline">{p.path}</a>{p.noindex && <span className="ml-1 rounded bg-surface-subtle px-1 text-[10px]">noindex</span>}</td>
                    <td className="px-3 py-2 tabular-nums">{p.status}</td>
                    <td className="max-w-[260px] px-3 py-2"><p className="truncate font-semibold" title={p.title}>{p.title || "—"}</p><p className="truncate text-muted-foreground" title={p.description}>{p.description || "—"}</p></td>
                    <td className="px-3 py-2 tabular-nums">{p.words}</td>
                    <td className="px-3 py-2 tabular-nums">{p.h1}</td>
                    <td className="px-3 py-2">{p.schema.join(", ") || "—"}</td>
                    <td className="px-3 py-2">{p.ogImage ? "Yes" : "—"}</td>
                    <td className="px-3 py-2">{p.inSitemap ? "Yes" : "No"}</td>
                    <td className="px-3 py-2 tabular-nums">{p.linksIn}</td>
                    <td className="min-w-[260px] px-3 py-2">
                      {p.issues.length ? p.issues.map((i, n) => (
                        <p key={n} className="mb-1"><span className={cn("mr-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase", SEV[i.severity])}>{i.severity}</span><b>{i.message}.</b> <span className="text-muted-foreground">{i.fix}</span></p>
                      )) : <span className="font-semibold">All good</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] text-muted-foreground">Being in the sitemap doesn't mean a page is indexed. Check indexing in Search Console.</p>
        </>
      )}
    </div>
  );
}
