import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Copy, Download, ExternalLink, FileText, Film, Music, RefreshCw, Trash2, X, ZoomIn } from "lucide-react";
import type { Block } from "@/lib/sam.blocks";
import type { FilePreview } from "@/lib/studio.functions";
import { listPickableFiles, respondToConfirm } from "@/lib/studio.functions";
import { startRender } from "@/lib/creative.functions";
import { BrandedVideo } from "@/features/brand/BrandedVideo";
import { cn } from "@/lib/utils";
import { Markdown, headingsOf, slugify } from "./Markdown";
import { useStudio } from "./usePreviews";

type B<T extends Block["type"]> = Extract<Block, { type: T }>;
const isImage = (p: FilePreview) => p.kind === "image" || p.kind === "logo";
const poster = (p: FilePreview) => (isImage(p) ? p.url : p.thumbnail);

export function Section({ title, sub, children, actions }: { title: string; sub?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: "easeOut" }}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h3 className="font-display text-[16px] font-bold tracking-tight">{title}</h3>{sub && <p className="text-[12px] text-muted-foreground">{sub}</p>}</div>
        {actions}
      </div>
      {children}
    </motion.section>
  );
}

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const I = kind === "video" ? Film : kind === "audio" ? Music : FileText;
  return <I className={className} strokeWidth={1.5} />;
}

/** A single file as a studio tile: real preview, label, click to open full screen. */
export function FileTile({ id, group, aspect = "aspect-square", caption }: { id: string; group: string[]; aspect?: string; caption?: React.ReactNode }) {
  const { previews, loading, open } = useStudio();
  const p = previews.get(id);
  if (!p) return <div className={cn("animate-pulse rounded-[14px] bg-surface-subtle", aspect)} aria-label={loading ? "Loading preview" : "File unavailable"} />;
  const img = poster(p);
  return (
    <button type="button" onClick={() => open(group, id)} className="group block w-full text-left">
      <div className={cn("relative overflow-hidden rounded-[14px] border-2 border-ink/90 bg-surface-subtle transition-transform group-hover:-translate-y-0.5 group-hover:shadow-lg", aspect)}>
        {img ? <img src={img} alt={p.name} loading="lazy" referrerPolicy="no-referrer" className={cn("h-full w-full", p.kind === "logo" ? "object-contain p-5" : "object-cover")} />
          : p.text ? <span className="block h-full overflow-hidden whitespace-pre-line p-3 text-[10px] leading-snug text-muted-foreground [mask-image:linear-gradient(to_bottom,black_60%,transparent)]">{p.text.slice(0, 600)}</span>
          : <span className="flex h-full items-center justify-center"><KindIcon kind={p.kind} className="h-10 w-10 text-muted-foreground" /></span>}
        {(p.kind === "video" || p.kind === "audio") && <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/80 text-inverse backdrop-blur"><KindIcon kind={p.kind} className="h-5 w-5" /></span></span>}
        <span className="absolute right-2 top-2 rounded-full bg-canvas/90 p-1.5 opacity-0 transition-opacity group-hover:opacity-100"><ZoomIn className="h-3.5 w-3.5" /></span>
      </div>
      <p className="mt-1.5 truncate text-[12px] font-medium">{p.name}</p>
      {caption ?? <p className="truncate text-[11px] text-muted-foreground">{p.label ?? p.kind}{p.folder ? ` · ${p.folder}` : ""}</p>}
    </button>
  );
}

export function AssetsBlock({ b }: { b: B<"assets"> }) {
  const layout = b.layout ?? (b.file_ids.length === 1 ? "hero" : "grid");
  return (
    <Section title={b.title} sub={`${b.file_ids.length} file${b.file_ids.length === 1 ? "" : "s"} from your library`}>
      {layout === "hero" ? <div className="mx-auto max-w-xl"><FileTile id={b.file_ids[0]!} group={b.file_ids} aspect="aspect-[4/3]" /></div>
        : layout === "strip" ? <div className="flex snap-x gap-3 overflow-x-auto pb-2">{b.file_ids.map((id) => <div key={id} className="w-40 shrink-0 snap-start"><FileTile id={id} group={b.file_ids} /></div>)}</div>
        : <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">{b.file_ids.map((id) => <FileTile key={id} id={id} group={b.file_ids} />)}</div>}
    </Section>
  );
}

export function DocumentBlock({ b }: { b: B<"document"> }) {
  const { previews, loading } = useStudio();
  const file = b.file_id ? previews.get(b.file_id) : undefined;
  const md = b.markdown ?? file?.text ?? "";
  const toc = useMemo(() => headingsOf(md).filter((h) => h.depth <= 2), [md]);
  if (!md) return <Section title={b.title}><div className="h-40 animate-pulse rounded-[16px] bg-surface-subtle" aria-label={loading ? "Loading document" : "No readable text"} /></Section>;
  return (
    <motion.article initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="overflow-hidden rounded-[18px] border border-border bg-surface shadow-sm">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-surface-subtle px-5 py-3">
        <div className="min-w-0"><p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{file ? `${file.folder ? `${file.folder} / ` : ""}${file.name}` : "Written by Sam"}</p><h3 className="truncate font-display text-[15px] font-bold">{b.title}</h3></div>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="Copy text" onClick={() => { void navigator.clipboard.writeText(md); toast.success("Copied"); }} className="rounded-[10px] p-2 hover:bg-canvas"><Copy className="h-4 w-4" /></button>
          {file && <a href="/app/brand-assets" aria-label="Open in Brand Assets" className="rounded-[10px] p-2 hover:bg-canvas"><ExternalLink className="h-4 w-4" /></a>}
        </div>
      </header>
      <div className={cn("grid gap-8 px-6 py-6 md:px-10 md:py-8", toc.length > 3 && "lg:grid-cols-[180px_1fr]")}>
        {toc.length > 3 && (
          <nav aria-label="Contents" className="hidden lg:block"><div className="sticky top-4 space-y-1 text-[12px]">
            <p className="mb-2 font-semibold uppercase tracking-wider text-muted-foreground">Contents</p>
            {toc.map((h) => <a key={h.text} href={`#${slugify(h.text)}`} className={cn("block truncate text-muted-foreground hover:text-foreground", h.depth === 2 && "pl-3")}>{h.text}</a>)}
          </div></nav>
        )}
        <div className="max-w-[68ch]"><Markdown source={md} /></div>
      </div>
    </motion.article>
  );
}

export function ShotListBlock({ b, onChange }: { b: B<"shotlist">; onChange: (b: B<"shotlist">) => void }) {
  const [swapAt, setSwapAt] = useState<number | null>(null);
  const ids = b.items.map((i) => i.file_id);
  const move = (i: number, d: number) => { const items = [...b.items]; const [x] = items.splice(i, 1); items.splice(i + d, 0, x!); onChange({ ...b, items }); };
  return (
    <Section title={b.title} sub="Sam's picks for this video — remove, swap or reorder before anything is made">
      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {b.items.map((it, i) => (
          <li key={`${it.file_id}-${i}`} className="rounded-[16px] border border-border bg-surface p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider">
              <span className="rounded-full bg-ink px-2 py-0.5 text-inverse">{String(i + 1).padStart(2, "0")} · {it.role}</span>
              {it.at && <span className="tabular-nums text-muted-foreground">{it.at}</span>}
            </div>
            <FileTile id={it.file_id} group={ids} aspect="aspect-[4/3]" caption={<p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{it.why}</p>} />
            <div className="mt-2 flex gap-1">
              <button type="button" aria-label="Move earlier" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-[8px] p-1.5 hover:bg-surface-subtle disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button type="button" aria-label="Move later" disabled={i === b.items.length - 1} onClick={() => move(i, 1)} className="rounded-[8px] p-1.5 hover:bg-surface-subtle disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button type="button" onClick={() => setSwapAt(i)} className="ml-auto inline-flex items-center gap-1 rounded-[8px] px-2 py-1 text-[12px] font-medium hover:bg-surface-subtle"><RefreshCw className="h-3.5 w-3.5" /> Swap</button>
              <button type="button" aria-label="Remove" onClick={() => onChange({ ...b, items: b.items.filter((_, n) => n !== i) })} className="rounded-[8px] p-1.5 text-muted-foreground hover:bg-surface-subtle hover:text-foreground"><Trash2 className="h-4 w-4" /></button>
            </div>
          </li>
        ))}
      </ol>
      {swapAt !== null && <SwapPicker onClose={() => setSwapAt(null)} onPick={(file_id) => { onChange({ ...b, items: b.items.map((x, n) => (n === swapAt ? { ...x, file_id, why: "Swapped in by you" } : x)) }); setSwapAt(null); }} />}
    </Section>
  );
}

export function SwapPicker({ onPick, onClose }: { onPick: (id: string) => void; onClose: () => void }) {
  const { workspaceId } = useStudio();
  const list = useServerFn(listPickableFiles);
  const [q, setQ] = useState("");
  const { data = [] } = useQuery({ queryKey: ["pickable", workspaceId], enabled: !!workspaceId, queryFn: () => list({ data: { workspace_id: workspaceId! } }) });
  const rows = data.filter((r) => `${r.name} ${r.ai_label ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div role="dialog" aria-label="Pick a file" className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-[18px] bg-canvas p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2"><input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your library…" className="flex-1 rounded-[10px] border border-border-control bg-surface px-3 py-2 text-[14px] outline-none focus:border-ink" /><button type="button" aria-label="Close" onClick={onClose} className="p-2"><X className="h-4 w-4" /></button></div>
        <ul className="min-h-0 flex-1 divide-y divide-border overflow-y-auto">
          {rows.map((r) => <li key={r.id}><button type="button" onClick={() => onPick(r.id)} className="flex w-full items-center gap-3 px-2 py-2 text-left text-[14px] hover:bg-surface-subtle"><KindIcon kind={r.kind} className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{r.name}</span><span className="ml-auto shrink-0 text-[12px] text-muted-foreground">{r.ai_label ?? r.kind}</span></button></li>)}
          {!rows.length && <li className="p-4 text-center text-[13px] text-muted-foreground">No matching files.</li>}
        </ul>
      </div>
    </div>
  );
}

export function ConfirmBlock({ b, index, canvas, onDecided }: { b: B<"confirm">; index: number; canvas: { id: string; version: number } | null; onDecided: () => void }) {
  const respond = useServerFn(respondToConfirm);
  const render = useServerFn(startRender);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const status = b.status ?? "pending";
  async function decide(decision: "approved" | "changes" | "cancelled") {
    if (!canvas) return;
    setBusy(decision);
    try {
      const r = await respond({ data: { canvas_id: canvas.id, version: canvas.version, index, decision, note: note || undefined } });
      if (decision === "approved" && r.action === "render_variants" && r.variant_ids.length) {
        let ok = 0;
        for (const id of r.variant_ids) { try { await render({ data: { variant_id: id, origin: "sam" } }); ok++; } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't start a render"); } }
        if (ok) toast.success(`${ok} video${ok === 1 ? "" : "s"} sent to render`);
      } else if (decision === "approved" && r.action === "clear_narratives") {
        try { sessionStorage.removeItem(`as:selected-narratives:${r.workspace_id}`); } catch { /* Optional browser storage. */ }
        await Promise.all([qc.invalidateQueries({ queryKey: ["narrative-library", r.workspace_id] }), qc.invalidateQueries({ queryKey: ["batches", r.workspace_id] })]);
        toast.success(`${r.cleared} idea${r.cleared === 1 ? "" : "s"} moved to the bin. Existing videos are safe.`);
      } else toast.success(decision === "approved" ? "Approved — Sam will carry on" : decision === "changes" ? "Sent to Sam" : "Cancelled");
      onDecided();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't save your answer"); } finally { setBusy(null); }
  }
  return (
    <motion.section initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className={cn("overflow-hidden rounded-[18px] border-2", status === "pending" ? "border-ink shadow-[0_8px_30px_-12px_hsl(var(--ink)/0.35)]" : "border-border opacity-90")}>
      <header className="flex items-center justify-between bg-ink px-5 py-3 text-inverse">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">Needs your approval</p><h3 className="font-display text-[17px] font-bold">{b.title}</h3></div>
        {status !== "pending" && <span className="rounded-full bg-inverse/15 px-3 py-1 text-[12px] font-semibold">{{ approved: "Approved", changes: "Changes requested", cancelled: "Cancelled" }[status]}</span>}
      </header>
      <dl className="grid gap-px bg-border sm:grid-cols-2">
        {b.fields.map((f) => <div key={f.label} className="bg-surface px-5 py-3"><dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{f.label}</dt><dd className="mt-0.5 text-[14px] font-medium">{f.value}</dd></div>)}
      </dl>
      {status === "pending" && (
        <div className="space-y-3 bg-canvas p-4">
          {asking && <textarea autoFocus value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What should Sam change?" className="w-full rounded-[12px] border border-border-control bg-surface p-3 text-[14px] outline-none focus:border-ink" />}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || !canvas} onClick={() => void decide("approved")} className="inline-flex items-center gap-2 rounded-[12px] bg-ink px-5 py-2.5 text-[14px] font-semibold text-inverse hover:bg-ink-hover disabled:opacity-50"><Check className="h-4 w-4" />{busy === "approved" ? "Approving…" : "Approve"}</button>
            <button type="button" disabled={!!busy} onClick={() => (asking && note.trim() ? void decide("changes") : setAsking(true))} className="rounded-[12px] border-2 border-ink px-4 py-2 text-[14px] font-semibold hover:bg-surface-subtle disabled:opacity-50">{asking && note.trim() ? "Send to Sam" : "Change something"}</button>
            <button type="button" disabled={!!busy} onClick={() => void decide("cancelled")} className="rounded-[12px] px-4 py-2 text-[14px] text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}
    </motion.section>
  );
}

const textOn = (hex: string) => {
  const h = hex.replace("#", ""); const f = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(f, 16); if (Number.isNaN(n)) return "#000";
  return ((n >> 16) * 299 + ((n >> 8) & 255) * 587 + (n & 255) * 114) / 1000 > 140 ? "#111" : "#fff";
};

export function PaletteBlock({ b }: { b: B<"palette"> }) {
  return (
    <Section title={b.title} sub="Click a colour to copy it">
      <div className="flex h-44 overflow-hidden rounded-[18px] border border-border">
        {b.colours.map((c) => (
          // Brand colours are user data, rendered as inline swatches by design.
          <button key={c.hex} type="button" onClick={() => { void navigator.clipboard.writeText(c.hex); toast.success(`Copied ${c.hex}`); }}
            className="group flex flex-1 flex-col justify-end p-3 text-left transition-[flex] hover:flex-[1.6]" style={{ background: c.hex, color: textOn(c.hex) }}>
            <span className="text-[13px] font-semibold">{c.name}</span><span className="font-mono text-[12px] opacity-80">{c.hex.toUpperCase()}</span>
          </button>
        ))}
      </div>
    </Section>
  );
}

export function TypeSpecimenBlock({ b }: { b: B<"type_specimen"> }) {
  useEffect(() => {
    const fams = b.fonts.map((f) => f.name.trim()).filter(Boolean);
    if (!fams.length) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = `https://fonts.googleapis.com/css2?${fams.map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;700`).join("&")}&display=swap`;
    document.head.appendChild(link);
    return () => { link.remove(); };
  }, [b.fonts]);
  return (
    <Section title={b.title}>
      <div className="grid gap-4 md:grid-cols-2">
        {b.fonts.map((f) => (
          <div key={f.name} className="rounded-[18px] border border-border bg-surface p-6">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{f.role ?? "Typeface"} · {f.name}</p>
            <p className="mt-3 text-[56px] leading-none" style={{ fontFamily: `"${f.name}", var(--font-display, sans-serif)` }}>Aa</p>
            <p className="mt-3 text-[20px] leading-snug" style={{ fontFamily: `"${f.name}", sans-serif` }}>{f.sample ?? "The quick brown fox jumps over the lazy dog"}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function StoryboardBlock({ b }: { b: B<"storyboard"> }) {
  const ids = b.frames.map((f) => f.file_id).filter(Boolean) as string[];
  return (
    <Section title={b.title} sub={`${b.frames.length} frames`}>
      <div className="flex snap-x gap-4 overflow-x-auto pb-3">
        {b.frames.map((f, i) => (
          <div key={i} className="w-44 shrink-0 snap-start">
            <div className="mb-1.5 flex justify-between text-[11px] font-semibold"><span>Frame {i + 1}</span><span className="tabular-nums text-muted-foreground">{f.at}</span></div>
            {f.file_id ? <FileTile id={f.file_id} group={ids} aspect="aspect-[9/16]" caption={<span />} />
              : <div className="flex aspect-[9/16] items-center justify-center rounded-[14px] border-2 border-dashed border-border-control p-3 text-center text-[12px] text-muted-foreground">Motion graphic</div>}
            <p className="mt-2 text-[13px] font-medium leading-snug">{f.caption}</p>
            {f.vo && <p className="mt-1 border-l-2 border-ink pl-2 text-[12px] italic text-muted-foreground">“{f.vo}”</p>}
          </div>
        ))}
      </div>
    </Section>
  );
}

export function CompareBlock({ b }: { b: B<"compare"> }) {
  const { previews } = useStudio();
  const [pos, setPos] = useState(50);
  const l = previews.get(b.left_file_id), r = previews.get(b.right_file_id);
  const ls = l && poster(l), rs = r && poster(r);
  return (
    <Section title={b.title} sub="Drag to compare">
      <div className="relative aspect-video select-none overflow-hidden rounded-[18px] border-2 border-ink bg-surface-subtle">
        {rs && <img src={rs} alt={r!.name} className="absolute inset-0 h-full w-full object-contain" />}
        {ls && <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}><img src={ls} alt={l!.name} className="h-full w-full object-contain" /></div>}
        <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-ink" style={{ left: `${pos}%` }} />
        <span className="absolute left-3 top-3 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-inverse">{b.left_label ?? "Before"}</span>
        <span className="absolute right-3 top-3 rounded-full bg-ink px-2 py-0.5 text-[11px] font-semibold text-inverse">{b.right_label ?? "After"}</span>
        <input type="range" min={0} max={100} value={pos} onChange={(e) => setPos(Number(e.target.value))} aria-label="Compare position" className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0" />
      </div>
    </Section>
  );
}

/** Full-screen viewer: images with zoom, branded video, audio with transcript, documents as pages. */
export function Lightbox({ ids, at, onClose }: { ids: string[]; at: string; onClose: () => void }) {
  const { previews } = useStudio();
  const [i, setI] = useState(Math.max(0, ids.indexOf(at)));
  const [zoom, setZoom] = useState(false);
  const p = previews.get(ids[i]!);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") { setI((x) => Math.min(ids.length - 1, x + 1)); setZoom(false); }
      if (e.key === "ArrowLeft") { setI((x) => Math.max(0, x - 1)); setZoom(false); }
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  }, [ids.length, onClose]);
  if (!p) return null;
  return (
    <div role="dialog" aria-label={p.name} className="fixed inset-0 z-50 flex flex-col bg-ink/95 text-inverse backdrop-blur" onClick={onClose}>
      <header className="flex items-center gap-3 px-5 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="min-w-0 flex-1"><p className="truncate font-display text-[15px] font-bold">{p.name}</p><p className="truncate text-[12px] opacity-70">{p.label ?? p.kind}{p.folder ? ` · ${p.folder}` : ""} · {i + 1} of {ids.length}</p></div>
        {p.download && <a href={p.download} target="_blank" rel="noreferrer" aria-label="Download" className="rounded-full p-2 hover:bg-inverse/10"><Download className="h-5 w-5" /></a>}
        <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 hover:bg-inverse/10"><X className="h-5 w-5" /></button>
      </header>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-14 pb-6" onClick={(e) => e.stopPropagation()}>
        {i > 0 && <button type="button" aria-label="Previous" onClick={() => { setI(i - 1); setZoom(false); }} className="absolute left-3 rounded-full bg-inverse/10 p-2 hover:bg-inverse/20"><ChevronLeft className="h-6 w-6" /></button>}
        {isImage(p) && p.url ? (
          <div className={cn("max-h-full max-w-full", zoom ? "overflow-auto" : "")}>
            <img src={p.url} alt={p.name} onClick={() => setZoom(!zoom)} className={cn("rounded-[12px] transition-transform", zoom ? "max-w-none cursor-zoom-out" : "max-h-[78vh] max-w-full cursor-zoom-in object-contain", p.kind === "logo" && "bg-canvas p-8")} />
          </div>
        ) : p.kind === "video" && p.playback ? (
          <div className="w-full max-w-4xl"><BrandedVideo src={p.playback} thumbnail={p.thumbnail} downloadUrl={p.download} name={p.name} /></div>
        ) : p.kind === "audio" && p.playback ? (
          <div className="w-full max-w-2xl space-y-4"><audio src={p.playback} controls autoPlay className="w-full" />{p.text && <div className="max-h-[50vh] overflow-y-auto rounded-[14px] bg-inverse/5 p-5 text-[14px] leading-relaxed">{p.text}</div>}</div>
        ) : p.text ? (
          <div className="h-full w-full max-w-3xl overflow-y-auto rounded-[16px] bg-canvas px-8 py-8 text-foreground md:px-12"><Markdown source={p.text} /></div>
        ) : (
          <div className="text-center"><KindIcon kind={p.kind} className="mx-auto h-14 w-14 opacity-60" /><p className="mt-3 text-[14px] opacity-80">{p.summary ?? "No preview for this file."}</p></div>
        )}
        {i < ids.length - 1 && <button type="button" aria-label="Next" onClick={() => { setI(i + 1); setZoom(false); }} className="absolute right-3 rounded-full bg-inverse/10 p-2 hover:bg-inverse/20"><ChevronRight className="h-6 w-6" /></button>}
      </div>
      {p.summary && <p className="mx-auto mb-5 max-w-2xl px-5 text-center text-[13px] opacity-75" onClick={(e) => e.stopPropagation()}>Sam: {p.summary}</p>}
    </div>
  );
}
