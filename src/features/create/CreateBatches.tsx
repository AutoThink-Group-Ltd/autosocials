import { getRenderPlayback } from "@/lib/media.functions";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Textarea } from "@/components/ui/textarea";
import { NumberStepper, StatusPill } from "@/workspace/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { BUILTIN_PREFIX, BUILTIN_VOICES } from "@/lib/integrations";
import { planBatch, updateVariant, deleteVariant, startRender, refreshRenders, sendToPublish, reviewVariant, downloadApproved } from "@/lib/creative.functions";
import { getBrandContext, scanWebsite, buildBrandProfile, postUploadSummary, labelBrandFiles } from "@/lib/brand-assets.functions";
import { startUpload, useUploads } from "@/workspace/uploads/uploadStore";
import { UploadBar, jobLabel } from "@/workspace/uploads/UploadTray";
import { type BrandContext } from "@/lib/brand-context";
import { MAX_BATCH_DAYS, NEW_BATCH_SIZES, VIDEO_DURATIONS, canShare, maxVideos, type ReviewState } from "@/lib/content-rules";
import { cn } from "@/lib/utils";

type Variant = { id: string; angle: string; hook: string; format: string; voiceover: string; caption: string; cta: string; version: number; position: number; planned_for: string | null; duration_s: number; size: string; review_state: string; beats: unknown; voice_id: string | null; batch_id: string };
type Job = { id: string; variant_id: string; status: string; error: string | null; storage_path: string | null; created_at: string };

const btn = "rounded-[10px] px-3 py-1.5 text-[13px] font-medium disabled:opacity-40";
const primary = cn(btn, "bg-ink text-inverse hover:bg-ink-hover");
const ghost = cn(btn, "border border-border-control bg-surface hover:bg-surface-subtle");
const SHELF: { id: ReviewState; label: string }[] = [
  { id: "draft", label: "Drafts" }, { id: "needs_revision", label: "Needs revision" }, { id: "rejected", label: "Rejected" }, { id: "approved", label: "Ready to share" },
];
const today = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const fmtDay = (d: string | null) => d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : "Unplanned";

export function CreateBatches() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const qc = useQueryClient();
  const plan = useServerFn(planBatch);
  const refresh = useServerFn(refreshRenders);
  const send = useServerFn(sendToPublish);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [goal, setGoal] = useState("");
  const [days, setDays] = useState(3);
  const [startsOn, setStartsOn] = useState(today);
  const [shelf, setShelf] = useState<ReviewState>("draft");
  const [busy, setBusy] = useState(false);
  const { data: ctx } = useQuery({
    queryKey: ["brand-context", ws], enabled: !!ws,
    queryFn: () => getBrandContext({ data: { workspace_id: ws! } }),
  });
  const ready = !!ctx?.ready;

  const { data: batches = [] } = useQuery({
    queryKey: ["batches", ws], enabled: !!ws,
    queryFn: async () => (await supabase.from("creative_batches").select("id,title,goal,days,created_at").eq("workspace_id", ws!).order("created_at", { ascending: false })).data ?? [],
  });
  const active = batchId ?? batches[0]?.id ?? null;
  const { data: variants = [] } = useQuery({
    queryKey: ["variants", active], enabled: !!active,
    queryFn: async (): Promise<Variant[]> => (await supabase.from("creative_variants").select("*").eq("batch_id", active!).order("planned_for").order("position")).data ?? [],
  });
  const { data: jobs = [] } = useQuery({
    queryKey: ["renders", active, variants.length], enabled: variants.length > 0,
    queryFn: async (): Promise<Job[]> => (await supabase.from("render_jobs").select("id,variant_id,status,error,storage_path,created_at").in("variant_id", variants.map((v) => v.id)).order("created_at", { ascending: false })).data ?? [],
  });
  const inFlight = jobs.some((j) => ["queued", "preparing", "rendering"].includes(j.status));

  useEffect(() => {
    if (!inFlight || !ws) return;
    const t = setInterval(async () => {
      try { await refresh({ data: { workspace_id: ws } }); void qc.invalidateQueries({ queryKey: ["renders"] }); } catch { /* next tick */ }
    }, 10000);
    return () => clearInterval(t);
  }, [inFlight, ws, refresh, qc]);

  async function make() {
    if (!ws || !ready || goal.trim().length < 3) return;
    setBusy(true);
    try {
      const r = await plan({ data: { workspace_id: ws, goal, days, starts_on: startsOn } });
      setBatchId(r.batchId); setGoal(""); setShelf("draft");
      await qc.invalidateQueries({ queryKey: ["batches", ws] });
      toast.success("Sam planned your batch. Edit the cards, then render.");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't make the batch"); }
    finally { setBusy(false); }
  }

  const current = batches.find((b) => b.id === active);
  const shown = variants.filter((v) => v.review_state === shelf);
  const approved = variants.filter((v) => canShare(v.review_state));

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SamSuggestions ws={ws} ctx={ctx} onUse={(s) => setGoal(`${s.title}. ${s.why}`.slice(0, 400))} />
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h2 className="font-display text-[16px] font-bold">{batches.length ? "New batch" : "Create my first batch"}</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Sam plans up to {MAX_BATCH_DAYS} days of videos, mixing {VIDEO_DURATIONS.join("s and ")}s lengths. Nothing renders until you press Render.</p>
        <div className="relative mt-4">
          <Textarea id="batch-goal" value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} maxLength={400} aria-label="Batch goal"
            placeholder="What should these days of content achieve? e.g. Book more discovery calls from founders"
            className="pb-7 text-[16px]" />
          <span className="pointer-events-none absolute bottom-2.5 right-3.5 text-[11px] tabular-nums text-muted-foreground">{goal.length}/400</span>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <NumberStepper label="Days" value={days} onChange={setDays} min={1} max={MAX_BATCH_DAYS} />
          <label className="flex flex-col gap-1 text-[12px] font-medium text-muted-foreground">Starting
            <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="h-10 rounded-[10px] border border-border-control bg-canvas px-3 text-[14px] text-foreground" />
          </label>
          <span className="mb-2 inline-flex h-7 items-center rounded-full bg-ink px-3 text-[12px] font-semibold text-inverse tabular-nums">Up to {maxVideos(days)} videos</span>
          <button type="button" className={cn(primary, "ml-auto h-10 gap-2 px-5")} disabled={busy || !ready || goal.trim().length < 3} onClick={() => void make()}>
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-inverse border-t-transparent" aria-hidden />}
            {busy ? "Sam is planning…" : "Plan batch"}
          </button>
        </div>
        {!ready && (
          <p className="mt-3 text-[12px] text-muted-foreground">{ws ? "Sam will plan this as soon as she has your brand to work from — scan your website or add brand files above." : "Choose a business from the menu first — Sam plans one business at a time."}</p>
        )}
      </section>

      {batches.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {batches.map((b) => <button key={b.id} type="button" onClick={() => setBatchId(b.id)} className={cn(ghost, b.id === active && "border-ink")}>{b.title}</button>)}
        </div>
      )}

      {current && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-[18px] font-bold">{current.title}</h2>
              <p className="text-[13px] text-muted-foreground">{current.goal}</p>
            </div>
            <button type="button" className={primary} disabled={!approved.length || !ws}
              onClick={async () => {
                try {
                  const r = await send({ data: { workspace_id: ws!, variant_ids: approved.map((v) => v.id) } });
                  toast.success(`${r.created} sent to Publish as drafts${r.skipped ? ` (${r.skipped} already there)` : ""}. Confirm them there to schedule.`);
                } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send"); }
              }}>Send {approved.length || ""} ready to Publish</button>
          </div>
          <div role="tablist" className="flex flex-wrap gap-1 rounded-[12px] border border-border bg-surface p-1">
            {SHELF.map((t) => {
              const n = variants.filter((v) => v.review_state === t.id).length;
              return <button key={t.id} role="tab" aria-selected={shelf === t.id} type="button" onClick={() => setShelf(t.id)}
                className={cn("rounded-[9px] px-3 py-1.5 text-[13px] font-medium", shelf === t.id ? "bg-ink text-inverse" : "text-muted-foreground hover:bg-surface-subtle")}>{t.label} <span className="tabular-nums opacity-70">{n}</span></button>;
            })}
          </div>
          {shown.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((v) => <VariantCard key={v.id} v={v} job={jobs.find((j) => j.variant_id === v.id)} />)}
            </div>
          ) : <p className="rounded-[14px] border border-dashed border-border-control p-6 text-center text-[13px] text-muted-foreground">Nothing here yet.</p>}
        </section>
      )}
    </div>
  );
}

function VariantCard({ v, job }: { v: Variant; job: Job | undefined }) {
  const { currentWorkspace } = useWorkspace();
  const qc = useQueryClient();
  const update = useServerFn(updateVariant);
  const remove = useServerFn(deleteVariant);
  const render = useServerFn(startRender);
  const review = useServerFn(reviewVariant);
  const download = useServerFn(downloadApproved);
  const [hook, setHook] = useState(v.hook);
  const [voice, setVoice] = useState(v.voiceover);
  const [url, setUrl] = useState<string | null>(null);
  const renderPlayback = useServerFn(getRenderPlayback);
  const [working, setWorking] = useState(false);
  const status = job?.status ?? "none";
  const done = status === "done";
  const busy = ["queued", "preparing", "rendering"].includes(status);
  const [w, h] = v.size.split("x").map(Number);

  useEffect(() => {
    if (!done || !job?.storage_path) return;
    if (job.storage_path.startsWith("autotoast:")) {
      void renderPlayback({ data: { workspace_id: currentWorkspace!.id, media_id: job.storage_path.slice(10) } }).then((r) => setUrl(r.url)).catch(() => setUrl(null));
      return;
    }
    void supabase.storage.from("brand-assets-private").createSignedUrl(job.storage_path, 3600).then(({ data }) => setUrl(data?.signedUrl ?? null));
  }, [done, job?.storage_path]);

  const refreshAll = () => Promise.all([qc.invalidateQueries({ queryKey: ["variants"] }), qc.invalidateQueries({ queryKey: ["renders"] })]);
  async function run(fn: () => Promise<unknown>, ok?: string) {
    setWorking(true);
    try { await fn(); await refreshAll(); if (ok) toast.success(ok); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
    finally { setWorking(false); }
  }
  const { data: batch } = useQuery({
    queryKey: ["batch-voice", v.batch_id],
    queryFn: async () => (await supabase.from("creative_batches").select("voice_id,voice_reason").eq("id", v.batch_id).maybeSingle()).data,
  });
  const samVoice = batch?.voice_id?.replace(BUILTIN_PREFIX, "") ?? null;
  const save = (patch: { hook?: string; voiceover?: string; duration_s?: 15 | 30 | 60; size?: (typeof NEW_BATCH_SIZES)[number]; voice_id?: string | null }) => run(() => update({ data: { id: v.id, ...patch } }));

  const label = status === "queued" ? "Waiting for a render slot…" : status === "preparing" ? "Recording voiceover…" : status === "rendering" ? "Rendering video…" : status === "failed" ? `Failed: ${job?.error ?? "unknown"}` : done ? "Rendered" : "Not rendered";
  return (
    <article className="flex flex-col overflow-hidden rounded-[14px] border border-border bg-surface">
      <div className="relative bg-surface-subtle" style={{ aspectRatio: `${w} / ${h}`, maxHeight: 360 }}>
        {url ? <video src={url} controls playsInline className="h-full w-full object-contain" /> : (
          <div className="flex h-full flex-col justify-between gap-2 overflow-hidden p-3 text-[13px]">
            <span className="w-fit rounded-full border border-border-control px-2 py-0.5 text-[11px] uppercase tracking-wide">Storyboard · not a video</span>
            <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">{(Array.isArray(v.beats) ? (v.beats as string[]) : []).map((b) => <li key={b}>{b}</li>)}</ol>
          </div>
        )}
      </div>
      <div className="space-y-2 p-3 text-[13px]">
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill>{fmtDay(v.planned_for)}</StatusPill>
          <select aria-label="Length" value={v.duration_s} disabled={busy} onChange={(e) => void save({ duration_s: Number(e.target.value) as 15 | 30 | 60 })} className="h-7 rounded-full border border-border-control bg-canvas px-2 text-[12px]">
            {VIDEO_DURATIONS.map((d) => <option key={d} value={d}>{d}s</option>)}
          </select>
          <select aria-label="Size" value={v.size} disabled={busy} onChange={(e) => void save({ size: e.target.value as (typeof NEW_BATCH_SIZES)[number] })} className="h-7 rounded-full border border-border-control bg-canvas px-2 text-[12px] tabular-nums">
            {[...new Set([...NEW_BATCH_SIZES, v.size])].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="ml-auto text-[11px] text-muted-foreground">v{v.version}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-muted-foreground">Voice:</span>
          <select aria-label="Voice" value={v.voice_id ?? ""} disabled={busy} onChange={(e) => void save({ voice_id: e.target.value || null })} className="h-7 rounded-full border border-border-control bg-canvas px-2 text-[12px]">
            <option value="">{samVoice ? `${samVoice}, picked by Sam` : "Brand voice"}</option>
            {BUILTIN_VOICES.map((b) => <option key={b.name} value={`${BUILTIN_PREFIX}${b.name}`}>{b.name} · {b.labels["descriptive"]}</option>)}
          </select>
        </div>
        {!v.voice_id && batch?.voice_reason && <p className="text-[11px] text-muted-foreground">{batch.voice_reason}</p>}
        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{v.angle}</p>
        <textarea value={hook} onChange={(e) => setHook(e.target.value)} onBlur={() => hook !== v.hook && void save({ hook })} rows={2}
          aria-label="Hook" className="w-full resize-none rounded-[10px] border border-border-control bg-canvas px-2.5 py-2 font-medium focus-visible:border-ink focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-ink/10" />
        <textarea value={voice} onChange={(e) => setVoice(e.target.value)} onBlur={() => voice !== v.voiceover && void save({ voiceover: voice })} rows={3}
          aria-label="Voiceover" placeholder="Voiceover script" className="w-full resize-none rounded-[10px] border border-border-control bg-canvas px-2.5 py-2 text-muted-foreground focus-visible:border-ink focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-ink/10" />
        <p className="text-muted-foreground" role="status">{label}</p>
        <div className="flex flex-wrap gap-2">
          {v.review_state !== "approved" && v.review_state !== "rejected" && (
            <button type="button" className={ghost} disabled={working || busy} onClick={() => void run(() => render({ data: { variant_id: v.id } }), "Added to the render queue.")}>
              {status === "failed" ? "Retry" : done ? "Re-render" : "Render"}
            </button>
          )}
          {done && v.review_state !== "approved" && <button type="button" className={primary} disabled={working} onClick={() => void run(() => review({ data: { id: v.id, state: "approved" } }), "Moved to Ready to share.")}>Approve</button>}
          {done && v.review_state === "draft" && <button type="button" className={ghost} disabled={working} onClick={() => void run(() => review({ data: { id: v.id, state: "needs_revision" } }))}>Request changes</button>}
          {v.review_state !== "rejected" && v.review_state !== "approved" && (done || status === "failed") && <button type="button" className={ghost} disabled={working} onClick={() => void run(() => review({ data: { id: v.id, state: "rejected" } }))}>Reject</button>}
          {(v.review_state === "rejected" || v.review_state === "approved") && <button type="button" className={ghost} disabled={working} onClick={() => void run(() => review({ data: { id: v.id, state: "draft" } }))}>Back to drafts</button>}
          {canShare(v.review_state) && <button type="button" className={ghost} disabled={working} onClick={() => void run(async () => { const r = await download({ data: { id: v.id } }); if (r.url) window.location.href = r.url; })}>Download</button>}
          {status === "none" && <button type="button" className={cn(ghost, "ml-auto")} disabled={working} onClick={() => void run(() => remove({ data: { id: v.id } }))}>Remove</button>}
        </div>
      </div>
    </article>
  );
}

type Suggestion = { title: string; why: string; format: "video" | "image"; sizes: string[]; length_seconds: number; uses: string[] };

function SamSuggestions({ ws, ctx, onUse }: { ws: string | undefined; ctx: BrandContext | undefined; onUse: (s: Suggestion) => void }) {
  const { data } = useQuery({
    queryKey: ["brand-profile-suggestions", ws], enabled: !!ws,
    queryFn: async () => (await supabase.from("brand_profiles").select("strength,suggestions").eq("workspace_id", ws!).maybeSingle()).data,
  });
  if (!ws) {
    return (
      <section className="rounded-[14px] border border-dashed border-border-control bg-surface p-4">
        <h2 className="font-display text-[16px] font-bold">Pick a business first</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">Sam plans one business at a time. Choose one from the menu, then give her its website, brand files or notes.</p>
      </section>
    );
  }
  if (ctx && !ctx.ready) return <NeedBrandContext ws={ws} ctx={ctx} />;
  const list = (data?.suggestions ?? []) as Suggestion[];
  if (ctx?.ready && !list.length) return <LearnMyBrand ws={ws} ctx={ctx} />;
  if (!data || !list.length) return null;
  return <SuggestionCarousel ws={ws} list={list} strength={data.strength} onUse={onUse} />;
}

function SuggestionCarousel({ ws, list, strength, onUse }: { ws: string; list: Suggestion[]; strength: number | null; onUse: (s: Suggestion) => void }) {
  const row = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => row.current?.scrollBy({ left: dir * 340, behavior: "smooth" });
  const arrow = "grid h-8 w-8 place-items-center rounded-full border-2 border-ink bg-surface text-[15px] font-bold hover:bg-surface-subtle";
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[16px] font-bold">Sam suggests</h2>
          <span className="text-[12px] text-muted-foreground">Brand readiness {strength ?? 0}/100 · {list.length} ideas</span>
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" aria-label="Previous ideas" className={arrow} onClick={() => scroll(-1)}>‹</button>
          <button type="button" aria-label="Next ideas" className={arrow} onClick={() => scroll(1)}>›</button>
        </div>
      </div>
      <div ref={row} className="-mx-1 mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2">
        {list.map((s) => (
          <article key={s.title} className="flex w-[320px] shrink-0 snap-start flex-col rounded-[14px] border-2 border-ink bg-surface p-4 text-[13px]">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{s.format === "video" ? `Video · ${s.length_seconds}s` : "Static image"}</p>
            <p className="mt-1 text-[14px] font-bold">{s.title}</p>
            <p className="mt-1 flex-1 text-muted-foreground">{s.why}</p>
            <div className="mt-3 flex flex-wrap gap-1">{s.sizes.map((z) => <span key={z} className="rounded-full border border-border-control px-2 py-0.5 text-[11px] tabular-nums">{z}</span>)}</div>
            <button type="button" className={cn(primary, "mt-4 w-full py-2.5 text-[14px] font-semibold")}
              onClick={() => { onUse(s); document.getElementById("batch-goal")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
              Plan this →
            </button>
          </article>
        ))}
        <UploadAssetsCard ws={ws} />
      </div>
    </section>
  );
}

/** Blank card at the end of the carousel: upload more brand files without leaving the page. Uploads run in the background queue. */
export function UploadAssetsCard({ ws }: { ws: string }) {
  const qc = useQueryClient();
  const label = useServerFn(labelBrandFiles);
  const build = useServerFn(buildBrandProfile);
  const summarise = useServerFn(postUploadSummary);
  const input = useRef<HTMLInputElement>(null);
  const job = useUploads().filter((j) => j.workspaceId === ws).at(-1);
  const busy = !!job && job.phase !== "done" && job.phase !== "error";

  function onFiles(files: File[]) {
    if (input.current) input.current.value = "";
    void startUpload(ws, files, async (w) => {
      const since = new Date(Date.now() - 60000).toISOString();
      for (let i = 0; i < 15; i++) { const r = await label({ data: { workspace_id: w } }); if (!r.labelled) break; }
      await build({ data: { workspace_id: w } });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["brand-context", w] }),
        qc.invalidateQueries({ queryKey: ["brand-profile-suggestions", w] }),
        summarise({ data: { workspace_id: w, since } }).catch(() => null),
      ]);
      await qc.invalidateQueries({ queryKey: ["sam-messages", w, "create"] });
      toast.success("Sam refreshed her ideas", { description: "She left you a note in her chat." });
    });
  }

  return (
    <article className="flex w-[320px] shrink-0 snap-start flex-col items-center justify-center rounded-[14px] border-2 border-dashed border-ink bg-canvas p-5 text-center text-[13px]">
      <div className={cn("grid h-12 w-12 place-items-center rounded-full border-2 border-ink text-[22px] font-bold", busy && "animate-bounce")}>↑</div>
      <p className="mt-3 text-[15px] font-bold">Add your own assets</p>
      <p className="mt-1 text-muted-foreground">Logos, photos, videos, podcasts, MD notes or a ZIP — keep browsing while it uploads.</p>
      <input ref={input} type="file" multiple className="hidden" onChange={(e) => onFiles(Array.from(e.target.files ?? []))} />
      {job && (
        <div className="mt-3 w-full text-left">
          <p className="mb-1 text-[12px] font-medium">{jobLabel(job)}</p>
          <UploadBar job={job} />
        </div>
      )}
      <button type="button" disabled={busy} className={cn(primary, "mt-4 w-full py-2.5 text-[14px] font-semibold")} onClick={() => input.current?.click()}>
        {busy ? "Uploading in background…" : "Upload assets"}
      </button>
       <Link to="/app/brand-assets" className="mt-2 text-[12px] font-medium underline underline-offset-2">Open brand assets</Link>
    </article>
  );
}

/** Routes the user to the one thing Sam is missing, and does the website scan in place. */
export function NeedBrandContext({ ws, ctx }: { ws: string | undefined; ctx: BrandContext }) {
  const qc = useQueryClient();
  const scan = useServerFn(scanWebsite);
  const build = useServerFn(buildBrandProfile);
  const [url, setUrl] = useState(ctx.website ?? "");
  const [scanning, setScanning] = useState(false);

  async function scanSite() {
    if (!ws || scanning) return;
    const target = /^https?:\/\//i.test(url) ? url : `https://${url.trim()}`;
    setScanning(true);
    try {
      await scan({ data: { workspace_id: ws, url: target } });
      await build({ data: { workspace_id: ws } });
      await qc.invalidateQueries({ queryKey: ["brand-context", ws] });
      await qc.invalidateQueries({ queryKey: ["brand-profile-suggestions", ws] });
      toast.success("Sam has read your site — she'll suggest what to make next.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't scan that site.");
    } finally {
      setScanning(false);
    }
  }

  return (
    <section className="rounded-[14px] border border-dashed border-border-control bg-surface p-5">
      <h2 className="font-display text-[16px] font-bold">Sam needs your brand first</h2>
      <p className="mt-1 max-w-2xl text-[13px] text-muted-foreground">
        She won't plan content out of thin air — that's how wrong claims get made. Give her one real source and she'll read it, learn it and tell you what to make.
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <form onSubmit={(e) => { e.preventDefault(); void scanSite(); }} className="flex flex-col rounded-[12px] border border-border p-3">
          <p className="text-[13px] font-semibold">Scan your website</p>
          <p className="mt-1 flex-1 text-[12px] text-muted-foreground">Fastest route — Sam reads the copy, colours and claims herself.</p>
          <input value={url} onChange={(e) => setUrl(e.target.value)} type="text" inputMode="url" aria-label="Website address" placeholder="yourbrand.com"
            className="mt-3 h-9 w-full rounded-[10px] border border-border-control bg-canvas px-2.5 text-[13px] focus-visible:border-ink focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-ink/10" />
          <button type="submit" className={cn(primary, "mt-2 h-9 justify-center")} disabled={!url.trim() || scanning}>
            {scanning ? "Reading your site…" : "Scan website"}
          </button>
        </form>
          <RouteCard title="Upload brand assets" body="Drop a ZIP, a whole folder, logos, product shots, videos or .md notes — Sam files and labels them." href="/app/brand-assets" cta="Open brand assets" />
        <RouteCard title="Paste brand notes" body="Product, audience, tone and approved claims, written in your own words." href="/app/dossier" cta="Open Dossier" />
      </div>
    </section>
  );
}

function RouteCard({ title, body, href, cta }: { title: string; body: string; href: string; cta: string }) {
  return (
    <div className="flex flex-col rounded-[12px] border border-border p-3">
      <p className="text-[13px] font-semibold">{title}</p>
      <p className="mt-1 flex-1 text-[12px] text-muted-foreground">{body}</p>
      <a href={href} className={cn(ghost, "mt-3 self-start")}>{cta}</a>
    </div>
  );
}

/** Files or notes are saved but Sam hasn't read them yet. */
export function LearnMyBrand({ ws, ctx }: { ws: string | undefined; ctx: BrandContext }) {
  const qc = useQueryClient();
  const build = useServerFn(buildBrandProfile);
  const [reading, setReading] = useState(false);
  const seen = [ctx.files ? `${ctx.files} file${ctx.files === 1 ? "" : "s"}` : "", ctx.docs ? `${ctx.docs} note${ctx.docs === 1 ? "" : "s"}` : ""].filter(Boolean).join(" and ");
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-[14px] border border-border bg-surface p-4">
      <div className="flex-1">
        <h2 className="font-display text-[16px] font-bold">Sam is ready to learn your brand</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">She can see {seen}. Let her read it, then she'll suggest what to make and in which formats.</p>
      </div>
      <button type="button" className={primary} disabled={reading || !ws}
        onClick={async () => {
          if (!ws) return;
          setReading(true);
          try {
            await build({ data: { workspace_id: ws } });
            await qc.invalidateQueries({ queryKey: ["brand-profile-suggestions", ws] });
            toast.success("Sam has learned your brand — here's what she suggests.");
          } catch (e) { toast.error(e instanceof Error ? e.message : "Sam couldn't read it just now."); }
          finally { setReading(false); }
        }}>
        {reading ? "Reading…" : "Learn my brand"}
      </button>
    </section>
  );
}
