import { StopSamButton } from "@/features/sam/StopSamButton";
import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { ArrowUpRight, Check, CheckCircle2, Clock3, LayoutGrid, Lightbulb, List, RotateCcw, Search, Trash2, XCircle } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { field, ghost, primary } from "./shared";

const SELECTION_LIMIT = 1;

export type NarrativeLibraryItem = {
  id: string;
  title: string;
  message: string;
  why: string;
  type: string;
  treatment?: string | null;
  status: "never_used" | "planned" | "in_production" | "built" | "failed" | "rejected" | "binned";
  created_at: string;
  asset_count: number;
  latest_variant_id?: string | null;
  latest_render_id?: string | null;
  source?: string;
};

type Props = {
  workspaceId: string;
  items: NarrativeLibraryItem[];
  busy?: boolean;
  generating?: boolean;
  resumeCount?: number;
  onResume?: () => void;
  retrying?: boolean;
  onClear: () => Promise<void>;
  onCreate: (item: NarrativeLibraryItem) => Promise<void>;
  onCreateSelected: (items: NarrativeLibraryItem[]) => Promise<void>;
  onReject: (item: NarrativeLibraryItem) => void;
  onRestore: (item: NarrativeLibraryItem) => void;
  onBin: (item: NarrativeLibraryItem) => void;
  onViewAsset: (item: NarrativeLibraryItem) => void;
};

const PAGE_SIZE = 8;

const STATUS_LABEL: Record<NarrativeLibraryItem["status"], string> = {
  never_used: "Never used",
  planned: "Planned",
  in_production: "In production",
  built: "Built",
  failed: "Build failed",
  rejected: "Rejected",
  binned: "Binned",
};
const STATUS_TONE: Record<NarrativeLibraryItem["status"], string> = {
  never_used: "border-border-control bg-surface text-ink",
  planned: "border-border-control bg-surface-subtle text-ink",
  in_production: "border-ink bg-ink text-inverse",
  built: "border-ink bg-ink text-inverse",
  failed: "border-destructive/30 bg-surface text-destructive",
  rejected: "border-border-control bg-surface-subtle text-muted-foreground",
  binned: "border-border-control bg-surface-subtle text-muted-foreground",
};
const dateLabel = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const typeLabel = (item: NarrativeLibraryItem) => item.type.trim() || "Explainer";
const ideaId = (item: NarrativeLibraryItem) => (item.id.split(":").at(-1) || item.id).slice(0, 8).toUpperCase();

function StatusBadge({ item }: { item: NarrativeLibraryItem }) {
  const Icon = item.status === "built" ? CheckCircle2 : item.status === "planned" || item.status === "in_production" ? Clock3 : item.status === "rejected" || item.status === "failed" ? XCircle : item.status === "binned" ? Trash2 : Lightbulb;
  return <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold", STATUS_TONE[item.status])}><Icon className="h-3 w-3" aria-hidden />{STATUS_LABEL[item.status]}</span>;
}

/** A workspace's saved ideas, with the same lifecycle actions in both views. */
export function NarrativeLibrary({ workspaceId, items, busy = false, generating = false, resumeCount = 0, onResume, retrying = false, onClear, onCreate, onCreateSelected, onReject, onRestore, onBin, onViewAsset }: Props) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [type, setType] = useState("all");
  const [sort, setSort] = useState("newest");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [binning, setBinning] = useState<NarrativeLibraryItem | null>(null);
  const [confirmFreshStart, setConfirmFreshStart] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const locked = busy || submitting;
  const selectionKey = `as:selected-narratives:${workspaceId}`;
  useEffect(() => {
    try { setSelectedIds(new Set((JSON.parse(sessionStorage.getItem(selectionKey) ?? "[]") as string[]).slice(0, SELECTION_LIMIT))); }
    catch { setSelectedIds(new Set()); }
  }, [selectionKey]);
  const rememberSelection = (next: Set<string>) => {
    try { sessionStorage.setItem(selectionKey, JSON.stringify([...next])); } catch { /* Browser storage is optional. */ }
    return next;
  };
  useEffect(() => { setPage(0); }, [items.length]);
  const eligible = (item: NarrativeLibraryItem) => item.status !== "rejected" && item.status !== "binned";
  const selectedItems = items.filter((item) => selectedIds.has(item.id) && eligible(item));
  const types = useMemo(() => [...new Set(items.map(typeLabel))].sort((a, b) => a.localeCompare(b)), [items]);
  const activeCount = items.filter((item) => item.status !== "binned" && item.status !== "rejected").length;
  const unusedCount = items.filter((item) => item.status === "never_used").length;
  const builtCount = items.filter((item) => item.status === "built").length;
  const term = query.trim().toLowerCase();
  const filtered = useMemo(() => items.filter((item) => {
    if (item.status === "binned" || (status === "all" ? item.status === "rejected" : item.status !== status)) return false;
    if (type !== "all" && typeLabel(item) !== type) return false;
    return !term || [item.title, item.message, item.why, item.treatment, item.type, item.id, item.source].filter(Boolean).join(" ").toLowerCase().includes(term);
  }).sort((a, b) => {
    if (sort === "title") return a.title.localeCompare(b.title);
    if (sort === "most_used") return b.asset_count - a.asset_count || b.created_at.localeCompare(a.created_at);
    return sort === "oldest" ? a.created_at.localeCompare(b.created_at) : b.created_at.localeCompare(a.created_at);
  }), [items, status, type, term, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const hasFilters = !!term || status !== "all" || type !== "all";
  const clearFilters = () => { setQuery(""); setStatus("all"); setType("all"); setPage(0); };
  const pager = (placement: string) => <nav aria-label={`${placement} idea pages`} className="flex items-center gap-2 text-[12px]">
    <button type="button" className={ghost} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Previous</button>
    <span className="min-w-20 text-center text-muted-foreground tabular-nums">{currentPage + 1} / {pageCount}</span>
    <button type="button" className={ghost} disabled={currentPage >= pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next →</button>
  </nav>;
  const toggleSelected = (id: string) => setSelectedIds((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id);
    else {
      if (items.filter((item) => next.has(item.id) && eligible(item)).length >= SELECTION_LIMIT) return previous;
      next.add(id);
    }
    return rememberSelection(next);
  });
  async function generateVideos(chosen: NarrativeLibraryItem[]) {
    if (!chosen.length || locked) return;
    setSubmitting(true);
    try {
      if (chosen.length === 1) await onCreate(chosen[0]!);
      else await onCreateSelected(chosen);
      // Production can unmount this view before React applies a state update.
      const remaining = new Set(selectedIds);
      chosen.forEach((item) => remaining.delete(item.id));
      rememberSelection(remaining);
      setSelectedIds(remaining);
    } catch { /* The Create page shows the actionable error. */ }
    finally { setSubmitting(false); }
  }
  const selectionControl = (item: NarrativeLibraryItem) => eligible(item) ? (
    <button type="button" aria-pressed={selectedIds.has(item.id)} aria-label={`${selectedIds.has(item.id) ? "Deselect" : "Select"} ${item.title}`} disabled={locked || (!selectedIds.has(item.id) && selectedItems.length >= SELECTION_LIMIT)} onClick={() => toggleSelected(item.id)}
      className="inline-flex items-center gap-2 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50"><span aria-hidden className={cn("flex size-6 items-center justify-center rounded-full border", selectedIds.has(item.id) ? "border-ink bg-ink text-inverse" : "border-border-control bg-surface text-transparent")}><Check className="size-4" strokeWidth={2.5} /></span>{selectedIds.has(item.id) ? "Selected" : "Select idea"}</button>
  ) : null;
  const selectCard = (event: MouseEvent, item: NarrativeLibraryItem) => {
    if (!eligible(item) || locked || (event.target as HTMLElement).closest("button, a, input, select, textarea, summary, details, [role='button']")) return;
    toggleSelected(item.id);
  };
  const toggleDetails = (id: string) => setExpanded((previous) => {
    const next = new Set(previous);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const actions = (item: NarrativeLibraryItem, compact = false) => (
    <div className={cn("flex flex-wrap items-center gap-2", compact && "min-w-64")}>
      {item.asset_count > 0 && <button type="button" disabled={locked} className={ghost} onClick={() => onViewAsset(item)}>View asset{item.asset_count === 1 ? "" : "s"} <span className="tabular-nums text-muted-foreground">{item.asset_count}</span></button>}
      {item.status !== "binned" && (
        <>
          {item.status === "rejected" ? <button type="button" disabled={locked} className={cn(ghost, "text-muted-foreground")} onClick={() => onRestore(item)}><RotateCcw className="h-3.5 w-3.5" aria-hidden />Restore</button>
            : <button type="button" disabled={locked} className={cn(ghost, "text-muted-foreground")} onClick={() => onReject(item)}><XCircle className="h-3.5 w-3.5" aria-hidden />Dismiss</button>}
          <button type="button" disabled={locked} aria-label={`Bin ${item.title}`} title="Move idea to bin" className="ml-auto rounded-[8px] p-2 text-muted-foreground transition-colors hover:bg-surface-subtle hover:text-destructive disabled:opacity-40" onClick={() => setBinning(item)}><Trash2 className="h-4 w-4" aria-hidden /></button>
        </>
      )}
    </div>
  );

  return (
    <section className="space-y-4" aria-labelledby="narrative-library-heading" aria-busy={locked || generating}>
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Sam's idea stream</p>
          <h2 id="narrative-library-heading" className="mt-1 font-display text-[24px] font-bold tracking-tight">Choose your narratives</h2>
          <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">Choose a story, then pair it with a video or social tile style.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-muted-foreground">
          {generating && <StopSamButton workspaceId={workspaceId} background />}
          <span>{activeCount} saved · {unusedCount} unused · {builtCount} built</span>
          {items.some((item) => item.status !== "binned") && <button type="button" className="rounded-[10px] border border-ink px-3 py-2 font-semibold text-ink hover:bg-surface-subtle disabled:opacity-50" disabled={locked} onClick={() => setConfirmFreshStart(true)}>Clear narratives</button>}
        </div>
      </header>

      {(selectedItems.length > 0 || resumeCount > 0) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-border-control bg-surface-subtle px-4 py-3">
        <div><p className="text-[14px] font-semibold" role="status">{selectedItems.length > 0 ? `${selectedItems.length} narrative${selectedItems.length === 1 ? "" : "s"} selected` : `${resumeCount} asset${resumeCount === 1 ? "" : "s"} ready to set up`}</p><p className="mt-0.5 text-[12px] text-muted-foreground">{selectedItems.length > 0 ? "Choose a style and review the details next." : "Your narratives are saved. Continue where you left off."}</p></div>
        <div className="flex items-center gap-3">
          <button type="button" disabled={locked} className={primary} onClick={() => selectedItems.length > 0 ? void generateVideos(selectedItems.slice(0, 4)) : onResume?.()}>{submitting ? "Preparing…" : selectedItems.length > 0 ? selectedItems.length > 4 ? "Set up first 4 ideas" : `Set up ${selectedItems.length} idea${selectedItems.length === 1 ? "" : "s"}` : retrying ? "Review options and try again" : `Set up ${resumeCount} asset${resumeCount === 1 ? "" : "s"}`}<ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></button>
        </div>
      </div>}

      <div className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border-control bg-canvas p-3">
        <label className="relative min-w-48 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search ideas, messages or IDs" aria-label="Search narratives" className={cn(field, "bg-surface pl-9")} /></label>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(0); }} aria-label="Filter narratives by status" className={cn(field, "w-auto min-w-36 bg-surface")}><option value="all">All active statuses</option>{Object.entries(STATUS_LABEL).filter(([value]) => value !== "binned").map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={type} onChange={(event) => { setType(event.target.value); setPage(0); }} aria-label="Filter narratives by type" className={cn(field, "w-auto min-w-32 bg-surface")}><option value="all">All types</option>{types.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <select value={sort} onChange={(event) => { setSort(event.target.value); setPage(0); }} aria-label="Sort narratives" className={cn(field, "w-auto bg-surface")}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="most_used">Most used</option></select>
        <div className="inline-flex rounded-[10px] border border-border-control bg-surface p-0.5" role="group" aria-label="Narrative library view"><button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={cn("rounded-[8px] p-2", view === "grid" ? "bg-ink text-inverse" : "hover:bg-surface-subtle")}><LayoutGrid className="h-4 w-4" aria-hidden /></button><button type="button" aria-label="Table view" aria-pressed={view === "table"} onClick={() => setView("table")} className={cn("rounded-[8px] p-2", view === "table" ? "bg-ink text-inverse" : "hover:bg-surface-subtle")}><List className="h-4 w-4" aria-hidden /></button></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border-control bg-surface-subtle px-4 py-3 text-[12px]">
        <span className="font-semibold" role="status">{selectedItems.length} selected · one idea at a time</span>
        <div className="flex gap-4 font-semibold"><button type="button" disabled={locked || selectedItems.length === 0} className="underline underline-offset-4 disabled:opacity-50" onClick={() => setSelectedIds(rememberSelection(new Set()))}>Clear selection</button></div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-[12px] text-muted-foreground"><p role="status">{filtered.length ? `${currentPage * PAGE_SIZE + 1}–${currentPage * PAGE_SIZE + visible.length} of ` : ""}{filtered.length} idea{filtered.length === 1 ? "" : "s"}{hasFilters ? " match your filters" : " in your stream"}</p><div className="flex flex-wrap items-center gap-3">{hasFilters && <button type="button" onClick={clearFilters} className="font-medium text-ink underline underline-offset-2">Clear filters</button>}{pager("Top")}</div></div>

      {!filtered.length ? (
        <div className="flex min-h-56 flex-col items-center justify-center rounded-[16px] border border-dashed border-border-control bg-canvas p-8 text-center">
          <Lightbulb className="h-8 w-8 text-muted-foreground" aria-hidden />
          <h3 className="mt-4 font-display text-[18px] font-bold">{hasFilters ? "No ideas match these filters" : "Your next idea starts here"}</h3>
          <p className="mt-1 max-w-md text-[13px] text-muted-foreground">{hasFilters ? "Try another search or status to find a saved narrative." : "Ask Sam for narratives or add your own brief. Your ideas will stay here so you can return to them anytime."}</p>
          {hasFilters && <button type="button" onClick={clearFilters} className={cn(ghost, "mt-4")}>Show active ideas</button>}
        </div>
      ) : view === "grid" ? (
        <div className="grid items-stretch gap-4 p-1" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
          {visible.map((item) => <article key={item.id} onClick={(event) => selectCard(event, item)} className={cn("flex min-w-0 flex-col overflow-hidden rounded-[16px] border bg-surface transition-all hover:shadow-md", eligible(item) && !locked && (selectedIds.has(item.id) || selectedItems.length < SELECTION_LIMIT) && "cursor-pointer hover:border-ink", selectedIds.has(item.id) ? "border-ink bg-surface-subtle ring-2 ring-ink" : "border-border-control")}>
            <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3", selectedIds.has(item.id) ? "bg-surface-subtle" : "bg-canvas")}><StatusBadge item={item} /><span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground" title={item.id}>Idea {ideaId(item)}</span></div>
            <div className="flex flex-1 flex-col p-4">
              {eligible(item) && <div className="mb-3">{selectionControl(item)}</div>}
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{typeLabel(item)}</p>
              <h3 className="mt-2 font-display text-[19px] font-bold leading-snug tracking-tight">{item.title || "Untitled narrative"}</h3>
              {item.message && <p className="mt-2 whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground">{item.message}</p>}
              {(item.treatment || item.why) && <div className="mt-3"><button type="button" aria-expanded={expanded.has(item.id)} onClick={() => toggleDetails(item.id)} className="text-[12px] font-medium underline underline-offset-4">{expanded.has(item.id) ? "Hide idea details" : "Why it matters & story angle"}</button>{expanded.has(item.id) && <div className="mt-2 space-y-2 rounded-[10px] bg-canvas p-3 text-[12px] leading-relaxed">{item.why && <p><span className="font-semibold">Why it matters: </span>{item.why}</p>}{item.treatment && <p><span className="font-semibold">Story angle: </span>{item.treatment}</p>}</div>}</div>}
              <p className="mt-auto pt-4 text-[11px] text-muted-foreground">Saved {dateLabel(item.created_at)}{item.source ? ` · ${item.source === "user" ? "Your idea" : item.source === "sam_chat" ? "Sam chat" : "Sam"}` : ""}</p>
              <div className="mt-3 border-t border-border pt-3">{actions(item)}</div>
            </div>
          </article>)}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-border-control bg-surface"><table className="w-full min-w-[900px] text-left text-[13px]"><thead className="border-b border-border bg-canvas text-[11px] uppercase tracking-wide text-muted-foreground"><tr><th scope="col" className="w-[40%] px-4 py-3 font-semibold">Narrative</th><th scope="col" className="px-4 py-3 font-semibold">Status</th><th scope="col" className="px-4 py-3 font-semibold">Type / Saved</th><th scope="col" className="px-4 py-3 font-semibold">Actions</th></tr></thead><tbody className="divide-y divide-border">{visible.map((item) => <tr key={item.id} className={cn("align-top hover:bg-canvas", selectedIds.has(item.id) && "bg-surface-subtle")}><td className="px-4 py-4">{eligible(item) && <div className="mb-3">{selectionControl(item)}</div>}<p className="text-[10px] uppercase tracking-wide text-muted-foreground" title={item.id}>Idea {ideaId(item)}</p><h3 className="mt-1 font-semibold leading-snug">{item.title || "Untitled narrative"}</h3>{item.message && <p className="mt-1 line-clamp-2 max-w-xl text-[12px] leading-relaxed text-muted-foreground">{item.message}</p>}{(item.why || item.treatment) && <details className="mt-2 max-w-xl text-[12px]"><summary className="w-fit cursor-pointer font-medium underline underline-offset-4">Idea details</summary><div className="mt-2 space-y-2 leading-relaxed">{item.why && <p><b>Why it matters: </b>{item.why}</p>}{item.treatment && <p><b>Story angle: </b>{item.treatment}</p>}</div></details>}</td><td className="whitespace-nowrap px-4 py-4"><StatusBadge item={item} />{item.asset_count > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{item.asset_count} related asset{item.asset_count === 1 ? "" : "s"}</p>}</td><td className="px-4 py-4"><p className="font-medium">{typeLabel(item)}</p><p className="mt-1 whitespace-nowrap text-[11px] text-muted-foreground">{dateLabel(item.created_at)}</p></td><td className="px-4 py-4">{actions(item, true)}</td></tr>)}</tbody></table></div>
      )}
      {filtered.length > PAGE_SIZE && <div className="flex justify-end">{pager("Bottom")}</div>}

      <AlertDialog open={!!binning} onOpenChange={(open) => { if (!open) setBinning(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Move this narrative to the bin?</AlertDialogTitle><AlertDialogDescription>“{binning?.title}” will leave your active ideas. You can restore it from Settings → Deleted Items. Related assets stay in your creations.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep idea</AlertDialogCancel><AlertDialogAction disabled={locked} onClick={() => { if (binning) onBin(binning); setBinning(null); }} className="bg-ink text-inverse hover:bg-ink-hover">Move to bin</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={confirmFreshStart} onOpenChange={setConfirmFreshStart}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Clear this client's narratives?</AlertDialogTitle><AlertDialogDescription>All saved narratives for this client, including planned and dismissed ideas, will move to the bin. Existing videos and assets stay in your creations. Generate from Goals to refill the library. You can restore binned ideas from Settings → Deleted Items.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep narratives</AlertDialogCancel><AlertDialogAction disabled={locked} onClick={() => { setSelectedIds(rememberSelection(new Set())); void onClear(); }} className="bg-ink text-inverse hover:bg-ink-hover">Clear narratives</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
