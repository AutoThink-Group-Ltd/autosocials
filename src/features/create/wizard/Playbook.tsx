import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { getBrandFacts, saveBrandFacts, saveBuildPrompt } from "@/lib/creative.functions";
import { cn } from "@/lib/utils";
import { errMsg, field, ghost, primary, type Variant } from "./shared";

type Facts = { does: string[]; does_not: string[]; banned_claims: string[]; banned_colours: string[] };
const KEYS: [keyof Facts, string][] = [["does", "What it does"], ["does_not", "What it doesn't do"], ["banned_claims", "Never say"], ["banned_colours", "Banned colours"]];

/** The facts sheet every claim is checked against. Collapsed by default; editable. */
export function FactsPanel({ ws }: { ws: string }) {
  const get = useServerFn(getBrandFacts);
  const save = useServerFn(saveBrandFacts);
  const [facts, setFacts] = useState<Facts | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<Record<keyof Facts, string> | null>(null);
  useEffect(() => { get({ data: { workspace_id: ws, rebuild: false } }).then((f) => setFacts(f ?? null)).catch(() => setFacts(null)); }, [ws, get]);
  const edit = () => facts && setDraft(Object.fromEntries(KEYS.map(([k]) => [k, facts[k].join("\n")])) as Record<keyof Facts, string>);
  async function rebuild() {
    setBusy(true);
    try { setFacts(await get({ data: { workspace_id: ws, rebuild: true } })); setOpen(true); toast.success("Sam rewrote the facts sheet."); }
    catch (e) { toast.error(errMsg(e, "Couldn't build the facts sheet")); } finally { setBusy(false); }
  }
  async function store() {
    if (!draft) return;
    const f = Object.fromEntries(KEYS.map(([k]) => [k, draft[k].split("\n").map((s) => s.trim()).filter(Boolean)])) as Facts;
    setBusy(true);
    try { await save({ data: { workspace_id: ws, ...f } }); setFacts(f); setDraft(null); toast.success("Facts sheet saved."); }
    catch (e) { toast.error(errMsg(e, "Couldn't save")); } finally { setBusy(false); }
  }
  return (
    <section className="rounded-[14px] border-2 border-ink bg-surface">
      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5">
        <button type="button" className="font-display text-[15px] font-bold" onClick={() => setOpen((x) => !x)} aria-expanded={open}>
          Facts sheet {open ? "▾" : "▸"}
        </button>
        <span className="text-[12px] text-muted-foreground">{facts ? `${facts.does.length} facts · ${facts.banned_claims.length} banned claims. Every line Sam writes is checked against it.` : "Sam writes one the first time you plan."}</span>
        <div className="ml-auto flex gap-1.5">
          {facts && !draft && <button type="button" className={ghost} onClick={() => { setOpen(true); edit(); }}>Edit</button>}
          <button type="button" className={ghost} disabled={busy} onClick={() => void rebuild()}>{busy ? "Working…" : facts ? "Rewrite" : "Write it now"}</button>
        </div>
      </div>
      {open && facts && (
        <div className="grid gap-4 border-t border-border p-4 md:grid-cols-2">
          {KEYS.map(([k, label]) => (
            <div key={k}>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
              {draft
                ? <textarea rows={5} className={cn(field, "resize-y")} value={draft[k]} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} aria-label={label} />
                : <ul className="list-disc space-y-0.5 pl-4 text-[13px]">{facts[k].length ? facts[k].map((x, i) => <li key={i}>{x}</li>) : <li className="text-muted-foreground">None</li>}</ul>}
            </div>
          ))}
          {draft && <div className="flex gap-2 md:col-span-2"><button type="button" className={primary} disabled={busy} onClick={() => void store()}>Save facts</button><button type="button" className={ghost} onClick={() => setDraft(null)}>Cancel</button></div>}
        </div>
      )}
    </section>
  );
}

type V = Variant & { build_prompt?: string | null; build_prompt_issues?: unknown; build_report?: unknown };

/** Opens the asset's full playbook build prompt; readable, editable before production. */
export function BuildPromptButton({ v, onRefresh }: { v: V; onRefresh: () => Promise<void> }) {
  const save = useServerFn(saveBuildPrompt);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(v.build_prompt ?? "");
  const issues = Array.isArray(v.build_prompt_issues) ? (v.build_prompt_issues as string[]) : [];
  if (!v.build_prompt) return null;
  async function store() {
    try { await save({ data: { id: v.id, build_prompt: text } }); await onRefresh(); setEditing(false); toast.success("Build prompt saved."); }
    catch (e) { toast.error(errMsg(e, "Couldn't save")); }
  }
  return (
    <>
      <button type="button" className={ghost} onClick={() => setOpen(true)}>
        Full build prompt{issues.length ? <span className="ml-1 rounded-full bg-ink px-1.5 text-[10px] text-inverse">{issues.length}</span> : null}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader><SheetTitle>Build prompt</SheetTitle></SheetHeader>
          {issues.length > 0 && (
            <div className="mt-3 rounded-[10px] border-2 border-ink p-3 text-[12px]">
              <p className="font-semibold">Checks still flagging</p>
              <ul className="mt-1 list-disc pl-4">{issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
            </div>
          )}
          <div className="mt-3 flex gap-2">
            {editing ? <><button type="button" className={primary} onClick={() => void store()}>Save</button><button type="button" className={ghost} onClick={() => { setEditing(false); setText(v.build_prompt ?? ""); }}>Cancel</button></>
              : v.review_state !== "approved" && <button type="button" className={ghost} onClick={() => setEditing(true)}>Edit</button>}
          </div>
          {editing
            ? <textarea className={cn(field, "mt-3 h-[70vh] font-mono text-[12px]")} value={text} onChange={(e) => setText(e.target.value)} aria-label="Build prompt" />
            : <article className="prose prose-sm mt-4 max-w-none text-foreground [&_h1]:font-display [&_h2]:mt-5 [&_h2]:font-display [&_h2]:text-[16px] [&_table]:text-[12px] [&_td]:border [&_td]:border-border [&_td]:px-2 [&_th]:border [&_th]:border-border [&_th]:px-2">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{v.build_prompt}</ReactMarkdown>
              </article>}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** The reviewed plan the designer reported before building (report first, build second). */
export function BuildReportView({ report, qualityDetails }: { report: unknown; qualityDetails?: ReactNode }) {
  const r = report as { approved_plan?: string[]; review_notes?: string[] } | null;
  const hasPlan = Boolean(r?.approved_plan?.length);
  if (!hasPlan && !qualityDetails) return null;
  return (
    <details className="mt-auto rounded-[10px] border border-border-control bg-canvas p-3 text-sm leading-relaxed">
      <summary className="cursor-pointer font-semibold">{hasPlan ? `Sam's build plan · ${r!.approved_plan!.length} steps` : "Production details"}</summary>
      {hasPlan && <ol className="mt-3 list-decimal space-y-3 pl-5 marker:font-semibold marker:text-muted-foreground">
        {r!.approved_plan!.map((x, i) => <li key={i} className="pl-1">{x}</li>)}
      </ol>}
      {hasPlan && r!.review_notes?.length ? (
        <div className="mt-4 border-t border-border-control pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Review notes</p>
          <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
            {r!.review_notes!.map((note, i) => <li key={i} className="pl-1">{note}</li>)}
          </ul>
        </div>
      ) : null}
      {qualityDetails && <div className="mt-4 border-t border-border-control pt-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Quality & playback</p>
        {qualityDetails}
      </div>}
    </details>
  );
}
