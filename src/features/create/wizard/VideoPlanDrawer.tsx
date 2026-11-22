import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertCircle, ArrowDown, ArrowUpRight, CheckCircle2, Clapperboard, FileText, ImageIcon, Loader2, RefreshCw, Video } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { getVideoPlan } from "@/lib/video-plan.functions";
import type { VideoPlan, VideoPlanReference, VideoPlanStep } from "@/lib/video-plan";
import { cn } from "@/lib/utils";
import { ghost } from "./shared";

const label = (value: string) => value.replaceAll("_", " ");
const active = (status: string) => ["queued", "pending", "running", "rendering", "processing", "building", "submitted"].includes(status);
const eyebrow = "text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground";
const card = "rounded-2xl border border-border-control bg-surface";

export function VideoPlanDrawer({ variantId, renderId, status, phase, qualityDetails, prominent = false }: {
  variantId: string; renderId?: string; status?: string; phase?: string | null; qualityDetails?: ReactNode; prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return <Sheet open={open} onOpenChange={setOpen}>
    <SheetTrigger asChild>
      <button type="button" className={cn(ghost, "justify-between gap-4", prominent ? "min-h-12 px-5" : "mt-auto w-full py-2.5")}>
        <span className="flex items-center gap-2"><Clapperboard className="h-4 w-4" />View Plan</span><ArrowUpRight className="h-4 w-4" />
      </button>
    </SheetTrigger>
    <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden border-l-2 border-ink bg-canvas p-0 sm:max-w-[760px] xl:max-w-[900px]">
      <SheetHeader className="shrink-0 border-b border-border-control px-6 py-5 text-left sm:px-9">
        <p className={eyebrow}>Inside the studio</p>
        <SheetTitle className="font-display text-[28px] font-bold tracking-tight">The video plan</SheetTitle>
        <SheetDescription>The saved creative brief, provider steps and reference assets for this version.</SheetDescription>
      </SheetHeader>
      {open && <PlanContent variantId={variantId} renderId={renderId} status={status} phase={phase} qualityDetails={qualityDetails} />}
    </SheetContent>
  </Sheet>;
}

function PlanContent({ variantId, renderId, status, phase, qualityDetails }: {
  variantId: string; renderId?: string; status?: string; phase?: string | null; qualityDetails?: ReactNode;
}) {
  const fetchPlan = useServerFn(getVideoPlan);
  const query = useQuery({
    queryKey: ["video-plan", variantId, renderId ?? null, status ?? null, phase ?? null],
    queryFn: () => fetchPlan({ data: { variant_id: variantId, ...(renderId ? { render_id: renderId } : {}) } }),
    staleTime: 0,
    retry: 1,
    refetchInterval: (q) => active(q.state.data?.status ?? status ?? "") ? 10_000 : false,
    refetchOnWindowFocus: false,
  });
  return <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-6 sm:px-9 sm:py-8">
    {query.isPending ? <div role="status" className="flex items-center gap-3 py-12 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />Opening the saved plan…</div>
      : query.isError ? <div role="alert" className={cn(card, "space-y-3 p-5")}><AlertCircle className="h-6 w-6 text-destructive" /><h3 className="font-semibold">The plan couldn't be loaded</h3><p className="text-sm text-muted-foreground">Your video is unaffected. Try loading these details again.</p><button type="button" className={ghost} onClick={() => void query.refetch()}><RefreshCw className="h-4 w-4" />Reload plan</button></div>
        : <PlanDetails plan={query.data} qualityDetails={qualityDetails} />}
  </div>;
}

function Prose({ text, empty }: { text: string; empty: string }) {
  return text.trim() ? <div className="space-y-4 text-[14px] leading-7">{text.split(/\n\s*\n/).filter(Boolean).map((paragraph, i) => <p key={i} className="whitespace-pre-wrap break-words">{paragraph}</p>)}</div> : <p className="text-sm leading-relaxed text-muted-foreground">{empty}</p>;
}

function PlanDetails({ plan, qualityDetails }: { plan: VideoPlan; qualityDetails?: ReactNode }) {
  const references = plan.steps.flatMap((step) => step.references);
  const uniqueReferences = [...new Map(references.map((ref) => [ref.id, ref])).values()];
  const referenceCount = uniqueReferences.length;
  const imageCount = uniqueReferences.filter((ref) => ref.kind.toLowerCase().includes("image")).length;
  const videoCount = uniqueReferences.filter((ref) => ref.kind.toLowerCase().includes("video")).length;
  const saved = plan.status === "done";
  return <div className="space-y-9">
    <section>
      <div className="mb-4 flex flex-wrap gap-2">
        {[`${plan.duration}s`, plan.size, `Version ${plan.version}`, label(plan.status)].map((value, i) => <span key={`${i}-${value}`} className={cn("rounded-full border border-border-control px-3 py-1 text-[11px] font-semibold", i === 3 ? "bg-ink text-inverse" : "bg-surface")}>{value}</span>)}
      </div>
      <h2 className="font-display text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">{plan.title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{plan.snapshot ? "From the frozen production snapshot for this render." : "The saved plan for this asset. No render snapshot is attached yet."}</p>
      {plan.phase && <p className="mt-2 text-xs text-muted-foreground">Current phase: {label(plan.phase)}</p>}
      {plan.error && <p role="status" className="mt-4 break-words rounded-xl border border-destructive/30 bg-surface p-4 text-sm text-destructive">{plan.error}</p>}
    </section>

    <section aria-labelledby="plan-process">
      <div className="mb-4 flex items-center justify-between"><h3 id="plan-process" className={eyebrow}>How this becomes a video</h3><span className="text-[11px] text-muted-foreground">Recorded progress</span></div>
      <div className={cn(card, "divide-y divide-border-control overflow-hidden")}>
        <ProcessRow number="01" title="Saved references" detail={referenceCount ? `${referenceCount} selected reference${referenceCount === 1 ? "" : "s"} · ${imageCount} image${imageCount === 1 ? "" : "s"} · ${videoCount} video${videoCount === 1 ? "" : "s"}. See each provider step below for its inputs.` : "No reference files are recorded for these provider steps."} />
        <ProcessRow number="02" title="Chosen provider" detail={plan.steps.length ? plan.steps.map((step) => `${step.provider} · ${step.model} — ${label(step.status)}`).join(" / ") : "No provider step is recorded yet."} />
        <ProcessRow number="03" title="Saved video" detail={saved ? "The render is marked complete. Watch the saved video on its asset card." : plan.status === "failed" ? "This attempt has not completed successfully. Its saved plan remains available." : "The finished video will be available on its asset card once production completes."} complete={saved} />
      </div>
    </section>

    <section className="space-y-4" aria-labelledby="plan-providers">
      <h3 id="plan-providers" className={eyebrow}>Production steps · {plan.steps.length}</h3>
      {plan.steps.length ? plan.steps.map((step, i) => <ProviderStep key={step.id} step={step} index={i} />) : <p className="text-sm text-muted-foreground">No saved provider prompt or settings are available for this version.</p>}
    </section>

    <section className="space-y-4" aria-labelledby="plan-script">
      <div><p className={eyebrow}>Creative source</p><h3 id="plan-script" className="mt-1 font-display text-[21px] font-bold">The full script</h3></div>
      <div className={cn(card, "p-5 sm:p-6")}><Prose text={plan.script} empty="No source script was saved for this version." /></div>
      <div className="rounded-xl border border-border-control p-4">
        <h4 className="text-sm font-semibold">{plan.audioMode === "silent" ? "Silent video · source for editing only" : plan.audioMode === "provider" ? "Audio handled by the video provider" : "Composed audio & voiceover"}</h4>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{plan.audioMode === "silent" ? "No voiceover is requested for this render. Any voiceover text below is source material for editing; it does not mean speech is included in the video. Voiceover and logo/overlay editing notes are post-production instructions, not a separate audio track or logo overlay added by this silent generation." : "The text below is the saved voiceover direction. Playback is the check of what the finished video actually contains."}</p>
        <div className="mt-3"><Prose text={plan.voiceover} empty="No separate voiceover text is saved." /></div>
      </div>
      {plan.editingInstructions && <div className={cn(card, "p-5")}><h4 className="mb-3 text-sm font-semibold">Editing instructions</h4><Prose text={plan.editingInstructions} empty="No editing instructions were saved." /></div>}
      {plan.buildPrompt && <details className={cn(card, "p-5")}><summary className="cursor-pointer text-sm font-semibold">Complete saved creative brief</summary><article className="prose prose-sm mt-5 max-w-none break-words text-foreground [&_h1]:font-display [&_h2]:font-display [&_h3]:font-display [&_td]:border [&_td]:border-border-control [&_td]:p-2 [&_th]:border [&_th]:border-border-control [&_th]:p-2 [&_table]:block [&_table]:overflow-x-auto"><ReactMarkdown remarkPlugins={[remarkGfm]}>{plan.buildPrompt}</ReactMarkdown></article></details>}
    </section>

    <section aria-labelledby="plan-storyboard">
      <h3 id="plan-storyboard" className="font-display text-[21px] font-bold">Storyboard & structure</h3>
      {plan.storyboard?.length ? <><p className="mb-4 mt-2 text-sm text-muted-foreground">The timed scenes saved in the creative brief. These are planned scenes; watch the saved video to check the result.</p><ol className="space-y-3">{plan.storyboard.map((scene, i) => <li key={i} className={cn(card, "p-5")}><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-semibold">{i + 1}. {scene.name}</h4><span className="rounded-full border border-border-control bg-canvas px-2.5 py-1 font-mono text-[11px]">{scene.time}</span></div><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{scene.action}</p>{scene.fileIds.length > 0 && <p className="mt-3 break-words text-xs text-muted-foreground">Saved asset references: {scene.fileIds.map((id) => uniqueReferences.find((ref) => ref.id === id)?.name ?? id).join(", ")}</p>}</li>)}</ol></>
        : plan.beats.length ? <><p className="mb-4 mt-2 text-sm text-muted-foreground">Saved story beats. No timed storyboard was saved. These describe the creative structure; they do not verify the timing of the finished video.</p><ol className="space-y-3">{plan.beats.map((beat, i) => <li key={i} className={cn(card, "flex gap-4 p-4")}><span className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</span><p className="whitespace-pre-wrap text-sm leading-relaxed">{beat}</p></li>)}</ol></>
        : <div className={cn(card, "mt-4 p-5")}><p className="font-semibold">No timed storyboard was saved</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{plan.steps.length === 1 ? "This is a single-pass film generated from the saved production prompt and its selected references. The provider interprets the direction across the film; a shot-by-shot timeline is not recorded." : "The saved prompts and provider steps describe this production. No separate shot-by-shot timeline is recorded."}</p></div>}
    </section>

    {(plan.direction.length > 0 || plan.buildPlan.length > 0 || plan.reviewNotes.length > 0) && <details className={cn(card, "p-5")}>
      <summary className="cursor-pointer text-sm font-semibold">Direction & build report</summary>
      <div className="mt-5 space-y-5 text-sm leading-relaxed">
        {plan.direction.length > 0 && <dl className="space-y-3">{plan.direction.map((item, i) => <div key={i}><dt className={eyebrow}>{item.label}</dt><dd className="mt-1 whitespace-pre-wrap">{item.value}</dd></div>)}</dl>}
        {plan.buildPlan.length > 0 && <div><h4 className="mb-3 font-semibold">Saved build plan</h4><ol className="list-decimal space-y-3 pl-5">{plan.buildPlan.map((item, i) => <li key={i}>{item}</li>)}</ol></div>}
        {plan.reviewNotes.length > 0 && <div><h4 className="mb-3 font-semibold">Review notes</h4><ul className="list-disc space-y-2 pl-5 text-muted-foreground">{plan.reviewNotes.map((item, i) => <li key={i}>{item}</li>)}</ul></div>}
      </div>
    </details>}
    {qualityDetails && <section className="space-y-3"><h3 className={eyebrow}>Quality & playback</h3>{qualityDetails}</section>}
    <p className="border-t border-border-control pt-5 text-xs leading-relaxed text-muted-foreground">This is a read-only view of saved production records. Opening it does not generate a video or submit a new provider request.</p>
  </div>;
}

function ProcessRow({ number, title, detail, complete }: { number: string; title: string; detail: string; complete?: boolean }) {
  return <div className="flex items-start gap-4 p-4 sm:p-5"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border-control bg-canvas font-mono text-[11px]">{complete ? <CheckCircle2 className="h-4 w-4" /> : number}</span><div className="min-w-0"><h4 className="text-sm font-semibold">{title}</h4><p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{detail}</p></div></div>;
}

function ProviderStep({ step, index }: { step: VideoPlanStep; index: number }) {
  return <article className={cn(card, "overflow-hidden")}>
    <header className="border-b border-border-control bg-surface-subtle px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><p className={eyebrow}>Step {String(index + 1).padStart(2, "0")} · {label(step.role)}</p><span className="rounded-full border border-border-control bg-canvas px-2.5 py-1 text-[10px] font-semibold">{label(step.status)}</span></div>
      <h4 className="mt-2 font-display text-[20px] font-bold">{step.label}</h4><p className="mt-1 break-words text-xs text-muted-foreground">{step.provider} / {step.model}</p>
    </header>
    <div className="space-y-6 p-5 sm:p-6">
      <div><h5 className={eyebrow}>Selected provider references · {step.references.length}</h5><p className="mb-3 mt-2 text-xs leading-relaxed text-muted-foreground">In saved input order. These are the references selected for this step, rather than a receipt of the provider's resolved request.</p>
        {step.references.length > 0 ? <ol className="grid grid-cols-2 gap-3 sm:grid-cols-3">{step.references.map((ref, i) => <ReferenceTile key={`${ref.id}-${i}`} reference={ref} index={i} />)}</ol> : <p className="rounded-xl bg-canvas p-4 text-xs text-muted-foreground">No reference assets are recorded for this step.</p>}
        {!step.references.some((ref) => ref.kind.toLowerCase().includes("video")) && <p className="mt-3 text-xs text-muted-foreground">No video references are recorded for this step.</p>}
      </div>
      <ArrowDown aria-hidden className="mx-auto h-4 w-4 text-muted-foreground" />
      <div><h5 className="mb-3 flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4" />Saved production prompt</h5><Prose text={step.prompt} empty="A production prompt was not saved for this step." /></div>
      <div className="border-t border-border-control pt-5"><h5 className={eyebrow}>{step.settingsSource === "resolved_request" ? "Resolved request settings" : "Recorded settings"}</h5><dl className="mt-3 grid grid-cols-2 gap-3">{step.settings.map((setting, i) => <div key={i} className="min-w-0 rounded-lg bg-canvas p-3"><dt className="text-[11px] text-muted-foreground">{setting.label}</dt><dd className="mt-1 break-words text-xs font-semibold">{setting.value}</dd></div>)}</dl>{!step.settings.length && <p className="mt-3 text-xs text-muted-foreground">No additional settings are recorded.</p>}
        <p className="mt-3 text-xs text-muted-foreground">{step.accepted ? "Provider request recorded as accepted." : "Provider acceptance is not recorded for this step."}</p>
        {step.cost && <p className="mt-3 text-xs"><b>{step.cost.kind.toLowerCase().includes("estimat") ? "Estimated cost" : `Recorded cost · ${label(step.cost.kind)}`}</b> · {step.cost.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} {step.cost.currency.toUpperCase()}{step.cost.kind.toLowerCase().includes("estimat") ? " · estimate, not a final billed amount" : ""}</p>}
        {step.dependsOn.length > 0 && <p className="mt-2 break-words text-xs text-muted-foreground">Depends on: {step.dependsOn.join(", ")}</p>}
      </div>
    </div>
  </article>;
}

function ReferenceTile({ reference, index }: { reference: VideoPlanReference; index: number }) {
  const [failed, setFailed] = useState(false);
  const isVideo = reference.kind.toLowerCase().includes("video");
  const isImage = reference.kind.toLowerCase().includes("image");
  return <li className="min-w-0 overflow-hidden rounded-xl border border-border-control bg-canvas">
    <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-subtle">
      {reference.url && reference.available && !failed && (isVideo || isImage) ? isVideo
        ? <video controls preload="none" src={reference.url} aria-label={reference.name} className="h-full w-full object-contain" onError={() => setFailed(true)} />
        : <img src={reference.url} alt={reference.name} loading="lazy" className="h-full w-full object-contain" onError={() => setFailed(true)} />
        : <div className="flex flex-col items-center gap-2 p-3 text-center text-muted-foreground">{isVideo ? <Video className="h-5 w-5" /> : <ImageIcon className="h-5 w-5" />}<span className="text-[10px]">{!reference.available || failed ? "Reference unavailable" : "Preview unavailable"}</span></div>}
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-canvas px-2 py-0.5 text-[10px] font-bold">{index + 1}</span>
    </div>
    <div className="space-y-1 p-3"><p className="break-words text-xs font-semibold">{reference.name}</p><p className="text-[10px] text-muted-foreground">{label(reference.role)} · {label(reference.kind)}</p>{reference.description && <p className="text-[11px] leading-relaxed text-muted-foreground">{reference.description}</p>}</div>
  </li>;
}
