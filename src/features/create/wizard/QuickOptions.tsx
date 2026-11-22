import { Camera, ChevronDown, Clapperboard, Film, Image, Layers3, PencilLine, Search, Sparkles, WandSparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BUILTIN_VOICES } from "@/lib/integrations";
import { getVideoModelOptions } from "@/lib/creative.functions";
import { MAX_ASSETS_PER_BATCH, NEW_BATCH_SIZES, VIDEO_DURATIONS } from "@/lib/content-rules";
import { getVideoStyle, type VideoStyleId } from "@/lib/video-styles";
import { MODEL_SHOWCASES, type ModelShowcase } from "@/lib/model-showcases";
import type { AssetSpec } from "@/lib/wizard";
import { cn } from "@/lib/utils";
import { field, primary } from "./shared";
import { CONTENT_RECIPES, recipeForStyle, recommendContentRecipe, type ContentRecipeId, type CreationState } from "@/lib/content-recipes";
import { ContentRecipeCards } from "./ContentRecipeCards";
import { AssetRequirements } from "./AssetRequirements";

const SIZES: Record<string, { label: string; hint: string; w: number; h: number }> = {
  "1080x1920": { label: "Vertical", hint: "9:16 · Reels, TikTok, Shorts", w: 9, h: 16 },
  "1080x1350": { label: "Portrait", hint: "4:5 · Feed posts", w: 4, h: 5 },
  "1080x1080": { label: "Square", hint: "1:1 · Feed posts", w: 1, h: 1 },
  "1920x1080": { label: "Landscape", hint: "16:9 · YouTube, web", w: 16, h: 9 },
};
const STEPS = ["Style", "Format", "Length", "Voice", "Captions", "Note", "Confirm"] as const;

type Props = {
  ws: string; onBack: () => void; specs: AssetSpec[]; setSpecs: (f: (s: AssetSpec[]) => AssetSpec[]) => void;
  voice: string; setVoice: (v: string) => void; planning: boolean; onConfirm: () => void; narrativeTitles: string[];
  skipInitialModelStep?: boolean; backLabel?: string; confirmationLabel?: string; confirmationDescription?: string; confirmationDisabled?: boolean;
  batchId?: string;
  recommendationContext?: string; suggestedStyleId?: string; standalone?: boolean;
};

/** Click, click, confirm: one big question per screen, Sam's picks preselected. Choices apply to every asset. */
export function QuickOptions({ ws, batchId, onBack, specs, setSpecs, voice, setVoice, planning, onConfirm, narrativeTitles, recommendationContext, suggestedStyleId, standalone = false, skipInitialModelStep = false, backLabel = "← Back to ideas", confirmationLabel, confirmationDescription, confirmationDisabled = false }: Props) {
  const firstStep = skipInitialModelStep ? 1 : 0;
  const [step, setStep] = useState(!skipInitialModelStep && batchId && recipeForStyle(specs[0]?.style_id) ? 6 : firstStep);
  const [recipeId, setRecipeId] = useState<ContentRecipeId | undefined>(() => recipeForStyle(specs[0]?.style_id)?.id);
  const [, setCreationReady] = useState<CreationState | null>(null);
  const prepareRef = useRef<(() => Promise<boolean>) | null>(null);
  const [preparing, setPreparing] = useState(false);
  const getModels = useServerFn(getVideoModelOptions);
  const { data: models, isPending: modelsLoading, isError: modelsError } = useQuery({ queryKey: ["video-model-options", ws], queryFn: () => getModels({ data: { workspace_id: ws } }) });
  const first = specs[0];
  const preparesAssets = !skipInitialModelStep && !!batchId && !!recipeId && narrativeTitles.length === 1;
  const recommendation = models ? recommendContentRecipe(recommendationContext ?? narrativeTitles.join(" "), suggestedStyleId, (style) => models.some((model) => model.id === style && model.availability !== "unavailable")) : undefined;
  const initializedOptions = useRef(false);
  useEffect(() => {
    if (initializedOptions.current || skipInitialModelStep || !first || !models) return;
    if (first.style_id) {
      initializedOptions.current = true;
      setRecipeId(recipeForStyle(first.style_id)?.id);
      setStep(6);
      return;
    }
    if (!recommendation) return;
    initializedOptions.current = true;
    setRecipeId(recommendation.id);
    setSpecs((current) => current.map((spec) => spec.style_id ? spec : { ...spec, style_id: recommendation.styleId }));
    setStep(0);
  }, [skipInitialModelStep, first, models, recommendation?.id, setSpecs]);
  const all = (patch: Partial<AssetSpec>) => { setCreationReady(null); setSpecs((s) => s.map((x) => ({ ...x, ...patch }))); };
  const pick = (patch: Partial<AssetSpec>) => { all(patch); setStep((n) => Math.min(n + 1, STEPS.length - 1)); };
  const caps = first?.captions ?? "clean";
  const assignedNarratives = new Set(specs.map((spec) => spec.narrative));
  const hasDuplicateNarratives = assignedNarratives.size !== specs.length;
  const nextUnusedNarrative = narrativeTitles.find((title) => !assignedNarratives.has(title));
  const big = (on: boolean) => cn("flex flex-col items-start gap-2 rounded-[18px] border-2 border-ink p-5 text-left transition-transform hover:-translate-y-0.5", on ? "bg-ink text-inverse" : "bg-surface hover:bg-surface-subtle");

  return (
    <section aria-label="Video creation options" className="flex min-h-[65vh] min-w-0 w-full flex-col bg-canvas">
        <div className="flex flex-wrap items-center gap-3 border-b-2 border-ink px-4 py-4 md:px-6">
          <button type="button" className="text-[13px] font-medium" disabled={planning} onClick={() => step === firstStep ? onBack() : setStep((n) => n - 1)}>{step === firstStep ? backLabel : "← Back"}</button>
          <ol className="flex flex-1 justify-center gap-1.5" aria-label="Progress">
            {STEPS.map((s, i) => i < firstStep ? null : (
              <li key={s}><button type="button" aria-label={s} aria-current={i === step ? "step" : undefined} onClick={() => setStep(i)}
                className={cn("h-2 rounded-full transition-all", i === step ? "w-8 bg-ink" : i < step ? "w-2 bg-ink" : "w-2 bg-border-control")} /></li>
            ))}
          </ol>
          <span className="text-[12px] text-muted-foreground">{step + 1 - firstStep} / {STEPS.length - firstStep}</span>
        </div>

        <div key={step} className="build-in flex-1 px-4 pb-8 pt-5 md:px-6">
          <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">Setting up {specs.length} video{specs.length === 1 ? "" : "s"} · {STEPS[step]}</p>
          {step === 0 && <>
            <Q t="What should this feel like?" d="Choose the finished content style. Sam handles the production details; nothing generates when you select a card." />
            {modelsLoading && <p className="py-8 text-sm text-muted-foreground">Checking available models…</p>}
            {modelsError && <p role="alert" className="py-8 text-sm text-muted-foreground">Models could not be loaded. Try opening video options again.</p>}
            {models && <>{recommendation && <div role="status" className="mb-4 rounded-xl border border-border-control bg-surface p-4 text-sm"><p className="font-semibold">Sam recommends {CONTENT_RECIPES.find((recipe) => recipe.id === recommendation.id)?.name}</p><p className="mt-1 text-muted-foreground">{recommendation.reason} You can choose another style.</p></div>}<ContentRecipeCards recommendedId={recommendation?.id} selectedId={recipeId} disabled={planning} available={(style) => models.some((m) => m.id === style && m.availability !== "unavailable")} onChoose={(id) => { const recipe = CONTENT_RECIPES.find((r) => r.id === id)!; setRecipeId(id); setCreationReady(null); all({ style_id: recipe.styleId }); setStep(6); }} /><details className="mt-5 rounded-xl border border-border-control p-4"><summary className="cursor-pointer text-sm font-semibold">Advanced · production models</summary><p className="mb-4 mt-2 text-xs text-muted-foreground">Specialist integrations are retained for future use. Start with a curated production route; configuration is not proof of a successful finished output.</p><VideoModelCatalogue models={models.filter((m) => ["brand-motion", "illustrated-explainer", "drawn-explainer", "reference-story"].includes(m.id))} selectedId={first?.style_id} disabled={planning} onChoose={(id) => { setRecipeId(recipeForStyle(id)?.id); setCreationReady(null); all({ style_id: id }); setStep(6); }} /></details></>}
            <p className="mt-4 text-xs text-muted-foreground">Real assets are used for your actual app, products and properties. Sam asks for anything essential and offers honest alternatives.</p>
          </>}

          {step === 1 && <>
            <Q t="What shape?" d="Where will this be posted?" />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {NEW_BATCH_SIZES.map((z) => { const m = SIZES[z]!; return (
                <button key={z} type="button" className={cn(big(first?.size === z), "items-center")} onClick={() => pick({ size: z })}>
                  <span className="grid h-28 place-items-center"><span className={cn("rounded-[6px] border-2", first?.size === z ? "border-inverse" : "border-ink")} style={{ width: m.w > m.h ? 104 : (104 * m.w) / m.h, height: m.w > m.h ? (104 * m.h) / m.w : 104 }} /></span>
                  <span className="font-display text-[20px] font-bold">{m.label}</span>
                  <span className="text-[12px] opacity-75">{m.hint}</span>
                </button>); })}
            </div>
          </>}

          {step === 2 && <>
            <Q t="How long?" d="Sam writes the voiceover to fit." />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {VIDEO_DURATIONS.map((d) => (
                <button key={d} type="button" className={cn(big(first?.duration === d), "items-center py-10")} onClick={() => pick({ duration: d })}>
                  <span className="font-display text-[56px] font-bold leading-none">{d}s</span>
                  <span className="text-[13px] opacity-75">{d === 15 ? "Quick hook, one idea" : d === 30 ? "Room to show and explain" : "A fuller story with time for detail"}</span>
                </button>
              ))}
            </div>
          </>}

          {step === 3 && <>
            <Q t="Who narrates?" d="Or let Sam choose the best fit." />
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <button type="button" className={big(voice === "")} onClick={() => { setCreationReady(null); setVoice(""); setStep(4); }}>
                <span className="font-display text-[20px] font-bold">Sam picks</span><span className="text-[12px] opacity-75">{standalone ? "Best match for this idea" : "Best match for the brand"}</span>
              </button>
              {BUILTIN_VOICES.map((v) => (
                <button key={v.name} type="button" className={big(voice === v.name)} onClick={() => { setCreationReady(null); setVoice(v.name); setStep(4); }}>
                  <span className="font-display text-[20px] font-bold">{v.name}</span><span className="text-[12px] capitalize opacity-75">{v.labels["gender"]} · {v.labels["descriptive"]}</span>
                </button>
              ))}
            </div>
          </>}

          {step === 4 && <>
            <Q t="Subtitles?" d="Clean lines at the bottom, phrase by phrase." />
            <div className="grid grid-cols-2 gap-3">
              {(["clean", "off"] as const).map((c) => (
                <button key={c} type="button" className={cn(big(caps === c), "items-center py-10")} onClick={() => pick({ captions: c })}>
                  <span className="rounded-[10px] bg-ink px-4 py-2 text-[15px] font-semibold text-inverse" style={{ visibility: c === "clean" ? "visible" : "hidden" }}>Grow your list, without the busywork.</span>
                  <span className="font-display text-[22px] font-bold">{c === "clean" ? "Clean subtitles" : "No subtitles"}</span>
                </button>
              ))}
            </div>
          </>}

          {step === 5 && <>
            <Q t="Anything to add?" d="Optional. For example: end on the free trial." />
            <textarea value={first?.note ?? ""} maxLength={300} rows={4} onChange={(e) => all({ note: e.target.value })} aria-label="Note for Sam" placeholder="Tell Sam anything…" className={cn(field, "w-full resize-none text-[16px]")} />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="h-11 rounded-[10px] border border-border-control px-5 text-[14px]" onClick={() => setStep(6)}>Skip</button>
              <button type="button" className={cn(primary, "h-11 px-6 text-[14px]")} onClick={() => setStep(6)}>Next →</button>
            </div>
          </>}

          {step === 6 && first && <>
            <Q t={skipInitialModelStep ? "Create your video" : "Prepare your asset"} d={confirmationDescription ?? "Sam will prepare one polished asset from this idea. Your choices are saved; rendering starts only after you review the plan and explicitly press Create."} />
            {preparesAssets && batchId && recipeId && <AssetRequirements key={`${batchId}:${recipeId}`} ws={ws} batchId={batchId} recipeId={recipeId} idea={first.narrative} standalone={standalone} settings={{ duration: first.duration, size: first.size, captions: first.captions ?? "clean", voice, ...(first.note ? { note: first.note } : {}) }} onReady={setCreationReady} onPrepare={(prepare) => { prepareRef.current = prepare; }} onLater={onBack} onAlternative={() => { setRecipeId("branded-motion"); all({ style_id: "brand-motion" }); }} />}
            {!skipInitialModelStep && <ol className="mb-4 grid gap-3" aria-label="Videos to make">{specs.map((spec, index) => {
              const availableNarratives = [...new Set(narrativeTitles)];
              return <li key={index} className="rounded-[16px] border-2 border-ink bg-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-3"><span className="rounded-full bg-ink px-3 py-1 text-[12px] font-semibold text-inverse">Video {index + 1}</span><span className="text-[13px] text-muted-foreground">{getVideoStyle(spec.style_id ?? "")?.name ?? "Choose a model"} · {spec.duration}s · {SIZES[spec.size]?.label ?? spec.size}</span></div>
                  {specs.length > 1 && <button type="button" onClick={() => setSpecs((current) => current.filter((_, i) => i !== index))} className="text-[13px] font-semibold underline underline-offset-2">Remove</button>}
                </div>
                <label className="mt-4 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground" htmlFor={`video-narrative-${index}`}>Narrative</label>
                <div className="relative mt-1">
                  <select id={`video-narrative-${index}`} aria-label={`Narrative for video ${index + 1}`} value={spec.narrative} onChange={(event) => {
                    const narrative = event.target.value;
                    setSpecs((current) => current.map((item, i) => i === index ? { ...item, narrative } : item));
                  }} className={cn(field, "w-full appearance-none bg-canvas pr-10 text-[16px] font-semibold")}>{availableNarratives.map((title) => <option key={title} value={title}>{title}</option>)}</select>
                  <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                </div>
              </li>;
            })}</ol>}
            {!batchId && !skipInitialModelStep && nextUnusedNarrative && specs.length < MAX_ASSETS_PER_BATCH && <button type="button" className="mb-4 rounded-[10px] border border-border-control px-4 py-2 text-[13px] font-semibold hover:bg-surface-subtle" onClick={() => setSpecs((current) => {
              const unused = narrativeTitles.find((title) => !current.some((item) => item.narrative === title));
              return unused && current[0] ? [...current, { ...current[0], narrative: unused }] : current;
            })}>+ Add another selected narrative</button>}
            {hasDuplicateNarratives && <p role="alert" className="mb-4 text-[13px] font-semibold">Each video needs a different narrative. Change a selection or remove a video to continue.</p>}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[["Model", getVideoStyle(first.style_id ?? "")?.name ?? "Choose", 0], ["Format", SIZES[first.size]?.label ?? first.size, 1], ["Length", `${first.duration}s`, 2], ["Voice", voice || "Sam picks", 3], ["Subtitles", caps === "clean" ? "Clean" : "None", 4]].map(([k, v, i]) => (
                <button key={k as string} type="button" disabled={skipInitialModelStep && i === 0} onClick={() => setStep(i as number)} className="rounded-[16px] border-2 border-ink bg-surface p-4 text-left hover:bg-surface-subtle">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</span>
                  <span className="mt-1 block font-display text-[22px] font-bold">{v}</span>
                </button>
              ))}
            </div>
            {first.note && <p className="mt-3 text-[13px] text-muted-foreground">Note: {first.note}</p>}
            <button type="button" className={cn(primary, "mt-6 h-14 w-full text-[17px] font-bold")} disabled={planning || preparing || confirmationDisabled || hasDuplicateNarratives || specs.some((spec) => !spec.style_id)} onClick={async () => { if (preparesAssets) { if (!prepareRef.current) return; setPreparing(true); try { if (!await prepareRef.current()) return; } finally { setPreparing(false); } } onConfirm(); }}>
              {preparing ? "Saving choices…" : planning ? (skipInitialModelStep ? "Starting video…" : "Sam is planning…") : confirmationLabel ?? `Plan ${specs.length} video${specs.length === 1 ? "" : "s"} →`}
            </button>
          </>}
        </div>
    </section>
  );
}

function Q({ t, d }: { t: string; d: string }) {
  return <div className="mb-5"><h2 className="font-display text-[30px] font-bold tracking-tight">{t}</h2><p className="mt-1 text-[14px] text-muted-foreground">{d}</p></div>;
}

type VideoModelOption = {
  id: VideoStyleId; name: string; engine: string; description: string; availability: string;
  family?: string; provider?: string; requiredInputs?: string[];
  output?: "video" | "image"; inputModes?: string[];
  verification?: { liveTestedAt?: string | null; implemented?: boolean } | null;
};

const providerLabel = (model: VideoModelOption) => {
  const provider = model.provider?.toLowerCase();
  if (provider === "kie" || model.id.startsWith("kie-")) return "Kie";
  if (provider === "heygen") return "HeyGen";
  if (provider === "higgsfield" || model.id.startsWith("higgsfield-") || (!provider && !["brand-motion", "illustrated-explainer", "drawn-explainer"].includes(model.id))) return "Higgsfield";
  return provider === "golpo" || model.id.includes("explainer") ? "Golpo" : "HyperFrames";
};
const familyLabel = (model: VideoModelOption) => model.family || (providerLabel(model) === "Higgsfield" ? model.engine.split("·")[0]!.trim() : providerLabel(model));
const INPUT_LABELS: Record<string, string> = { prompt: "written direction", image_input: "reference images", image_url: "a source image", first_frame_url: "an opening image", image_urls: "reference images", video_url: "source footage", video_urls: "reference footage", audio_url: "source audio", audio_urls: "reference audio", preset_id: "a preset", file_url: "a source document" };
const inputLabel = (input: string) => INPUT_LABELS[input.replace(/\?$/, "")] ?? input.replace(/\?$/, "").replaceAll("_", " ");
const modelGuidance = (model: VideoModelOption) => {
  const label = `${model.id} ${model.name}`.toLowerCase();
  if (model.id === "brand-motion") return { makes: "A finished branded motion video with text, graphics and your approved assets.", useful: "Brand stories where exact wording and visual identity matter." };
  if (model.provider === "golpo") return { makes: "An illustrated explanation of your idea.", useful: "Teaching a process or making a complex topic easier to follow." };
  if (model.output === "image") return { makes: /edit|restyle|upscale/.test(label) ? "An edited version of an existing image." : "A new still image for a video or post.", useful: "Preparing visual assets; this workflow does not produce a finished video on its own." };
  if (/motion-transfer|motion.control/.test(label)) return { makes: "A new clip that follows movement from your source footage.", useful: "Reusing a movement or camera action with a different visual subject." };
  if (/object-swap|restyle|video-edit|video-extend|extend/.test(label)) return { makes: /extend/.test(label) ? "A continuation of an existing clip." : "A changed version of existing footage.", useful: "Working from footage you already have permission to use." };
  if (/reference|multimodal/.test(label)) return { makes: "A new clip guided by your reference material.", useful: "Keeping a subject, setting or visual direction closer to supplied references." };
  if (/image-to-video|image to video|keyframe|first.last/.test(label)) return { makes: "A moving clip based on your supplied image or frames.", useful: "Animating an approved property photo, artwork or opening and closing frames." };
  return { makes: "A new video clip generated from written scene direction.", useful: "Exploring a visual idea when you do not have source footage." };
};
const TASKS = ["Compose a finished video", "Illustrated explainer", "Create or edit images", "Edit or extend footage", "Reference-led video", "Animate images or keyframes", "Generate video from text", "Other workflow"] as const;
type Task = typeof TASKS[number];
const workflowTask = (model: VideoModelOption): Task => {
  const id = model.id.toLowerCase(), name = `${model.name} ${model.engine}`.toLowerCase(), provider = providerLabel(model);
  if (provider === "HyperFrames") return "Compose a finished video";
  if (provider === "Golpo") return "Illustrated explainer";
  if (model.output === "image" || id.includes("image-generate") || id.includes("image-edit") || id.includes("image-preset")) return "Create or edit images";
  if (/video-edit|video-extend|restyle|motion-transfer|object-swap/.test(`${id} ${name}`)) return "Edit or extend footage";
  if (/reference|multimodal/.test(`${id} ${name}`)) return "Reference-led video";
  if (/image-to-video|keyframe|first-last|image reference/.test(`${id} ${name}`)) return "Animate images or keyframes";
  if (/text-to-video|text to video|camera-led/.test(`${id} ${name}`)) return "Generate video from text";
  return "Other workflow";
};
const inputKinds = (model: VideoModelOption) => {
  const inputs = (model.inputModes ?? []).map((input) => input.replace(/\?$/, "").toLowerCase());
  const kinds = new Set<string>();
  if (inputs.some((input) => ["prompt", "custom_script"].includes(input))) kinds.add("Text direction");
  if (inputs.some((input) => /image|frame|elements/.test(input))) kinds.add("Image or keyframe");
  if (inputs.some((input) => input.includes("video"))) kinds.add("Video footage");
  if (inputs.some((input) => input.includes("audio"))) kinds.add("Audio references");
  if (inputs.some((input) => ["file_url", "link_url", "document"].some((key) => input.includes(key)))) kinds.add("Documents or links");
  if (inputs.some((input) => ["html", "files", "custom_images", "custom_videos"].includes(input))) kinds.add("Brand assets");
  return [...kinds];
};

/** Shared catalogue keeps model selection and replanning consistent as the provider list grows. */
export function VideoModelCatalogue({ models, selectedId, disabled = false, onChoose, compact = false }: { models: readonly VideoModelOption[]; selectedId?: string | undefined; disabled?: boolean; onChoose: (id: VideoStyleId) => void; compact?: boolean }) {
  const catalogueRef = useRef<HTMLDivElement>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [provider, setProvider] = useState("All");
  const [task, setTask] = useState("All tasks");
  const [source, setSource] = useState("Any starting material");
  const [readiness, setReadiness] = useState("All readiness states");
  const providers = [...new Set(models.map(providerLabel))];
  const tasks = TASKS.filter((candidate) => models.some((model) => workflowTask(model) === candidate));
  const sources = ["Text direction", "Image or keyframe", "Video footage", "Audio references", "Documents or links", "Brand assets"].filter((candidate) => models.some((model) => inputKinds(model).includes(candidate)));
  const query = search.trim().toLowerCase();
  const filtered = models.filter((model) => (provider === "All" || providerLabel(model) === provider)
    && (task === "All tasks" || workflowTask(model) === task)
    && (source === "Any starting material" || inputKinds(model).includes(source))
    && (readiness === "All readiness states"
      || (readiness === "Render tested" && !!model.verification?.liveTestedAt)
      || (readiness === "Connected · untested" && model.availability !== "unavailable" && model.verification?.implemented !== false && !model.verification?.liveTestedAt)
      || (readiness === "Not connected" && model.availability === "unavailable"))
    && (!query || [model.name, model.engine, model.description, providerLabel(model), familyLabel(model), ...(model.requiredInputs ?? []).map(inputLabel), ...(model.inputModes ?? []).map(inputLabel)].join(" ").toLowerCase().includes(query)));
  const filteredIds = filtered.map((model) => model.id).join("|");
  const groups = new Map<string, VideoModelOption[]>();
  for (const model of filtered) {
    const key = providerLabel(model) === familyLabel(model) ? providerLabel(model) : `${providerLabel(model)} · ${familyLabel(model)}`;
    groups.set(key, [...(groups.get(key) ?? []), model]);
  }
  useEffect(() => {
    const root = catalogueRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset["modelPreview"];
        if (!id) continue;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.35) visible.set(id, entry.intersectionRatio);
        else visible.delete(id);
      }
      setActivePreviewId([...visible].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
    }, { threshold: [0, 0.35, 0.6, 1] });
    root.querySelectorAll("[data-model-preview]").forEach((node) => observer.observe(node));
    return () => { observer.disconnect(); setActivePreviewId(null); };
  }, [filteredIds]);
  return <div ref={catalogueRef} className="space-y-6" aria-label="Video model catalogue">
    <div className="space-y-3">
      <label className="relative block"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Search video models" placeholder="Search models, workflows or source material…" className={cn(field, "min-h-11 w-full pl-10")} /></label>
      <div className="space-y-3 rounded-xl border border-border-control bg-surface-subtle p-3">
        <div className="flex flex-wrap items-center gap-2" aria-label="Filter by provider"><span className="w-20 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Provider</span>{["All", ...providers].map((name) => <button key={name} type="button" aria-pressed={provider === name} onClick={() => setProvider(name)} className={cn("min-h-9 rounded-full border px-3 text-xs font-semibold", provider === name ? "border-ink bg-ink text-inverse" : "border-border-control bg-surface hover:border-ink")}>{name}</button>)}</div>
        <div className="grid gap-2 sm:grid-cols-3">
          <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">What to make<select aria-label="Filter by workflow type" value={task} onChange={(event) => setTask(event.target.value)} className={cn(field, "mt-1 min-h-10 w-full bg-surface text-xs font-medium normal-case tracking-normal text-ink")}><option>All tasks</option>{tasks.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Starting material<select aria-label="Filter by starting material" value={source} onChange={(event) => setSource(event.target.value)} className={cn(field, "mt-1 min-h-10 w-full bg-surface text-xs font-medium normal-case tracking-normal text-ink")}><option>Any starting material</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="block text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Integration status<select aria-label="Filter by integration status" value={readiness} onChange={(event) => setReadiness(event.target.value)} className={cn(field, "mt-1 min-h-10 w-full bg-surface text-xs font-medium normal-case tracking-normal text-ink")}><option>All readiness states</option><option>Connected · untested</option><option>Render tested</option><option>Not connected</option></select></label>
        </div>
        <div className="flex items-center gap-3"><span className="text-xs text-muted-foreground" aria-live="polite">Showing {filtered.length} of {models.length} workflows</span>{(provider !== "All" || task !== "All tasks" || source !== "Any starting material" || readiness !== "All readiness states" || search) && <button type="button" onClick={() => { setProvider("All"); setTask("All tasks"); setSource("Any starting material"); setReadiness("All readiness states"); setSearch(""); }} className="text-xs font-semibold underline underline-offset-2">Clear filters</button>}</div>
      </div>
    </div>
    {!filtered.length && <p className="rounded-xl border border-dashed border-border-control p-6 text-sm text-muted-foreground">No models match this search. Try another model name or source type.</p>}
    {[...groups].map(([group, options]) => <section key={group} className="space-y-3" aria-label={group}>
      <div className="flex items-center gap-3"><h3 className="text-sm font-bold">{group}</h3><span className="text-xs text-muted-foreground">{options.length} workflow{options.length === 1 ? "" : "s"}</span></div>
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3")}>
        {options.map((model) => {
          const selected = selectedId === model.id;
          const unavailable = model.availability === "unavailable";
          const status = model.verification?.implemented === false ? "Not integrated" : unavailable ? "Not connected" : model.verification?.liveTestedAt ? "Render tested" : "Configured · untested";
          const inputs = (model.requiredInputs ?? []).map(inputLabel);
          const guidance = modelGuidance(model);
          const showcase = providerLabel(model) === "Higgsfield" && model.output !== "image" ? MODEL_SHOWCASES[familyLabel(model)] : undefined;
          return <div key={model.id} className={cn("group flex flex-col overflow-hidden rounded-[18px] border-2 border-ink text-left", selected ? "bg-ink text-inverse" : "bg-surface")}>
            {showcase ? <ModelPreview id={model.id} showcase={showcase} active={activePreviewId === model.id} compact={compact} /> : <ModelVisual id={model.id} selected={selected} compact={compact} />}
            <button type="button" disabled={unavailable || disabled || model.verification?.implemented === false} aria-pressed={selected} onClick={() => onChoose(model.id)} className="flex flex-1 flex-col text-left transition-colors hover:bg-surface-subtle/10 disabled:cursor-not-allowed disabled:opacity-50" aria-label={`Choose ${model.name}`}>
            <span className="flex flex-1 flex-col gap-1 px-4 pb-4 pt-3">
              <span className="flex items-start justify-between gap-2"><span className={cn("font-display font-bold leading-tight", compact ? "text-base" : "text-[20px]")}>{model.name}</span>{selected && <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide opacity-70">Selected</span>}</span>
              <span className="text-xs font-semibold opacity-75">{model.engine}</span>
              <span className="mt-1 text-xs leading-snug"><span className="font-semibold">Makes: </span>{guidance.makes}</span>
              <span className="mt-1 text-xs leading-snug opacity-75"><span className="font-semibold">Useful for: </span>{guidance.useful}</span>
              {!!inputs.length && <span className="mt-2 text-xs leading-snug"><span className="font-semibold">Start with: </span>{inputs.join(", ")}</span>}
              <span className="mt-auto pt-3 text-[10px] font-bold uppercase tracking-wide opacity-70">{status}</span>
            </span>
            </button>
          </div>;
        })}
      </div>
    </section>)}
  </div>;
}

function ModelPreview({ id, showcase, active, compact }: { id: string; showcase: ModelShowcase; active: boolean; compact: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active && !paused && !reducedMotion && !failed) void video.play().catch(() => setPaused(true));
    else video.pause();
  }, [active, paused, reducedMotion, failed]);
  const playing = active && !paused && !reducedMotion && !failed;
  return <div data-model-preview={id} className="relative border-b-2 border-ink bg-canvas text-ink" style={{ height: compact ? 152 : 190 }}>
    {!failed && <video ref={videoRef} src={active || paused ? showcase.video : undefined} poster={showcase.poster} muted={muted} loop playsInline preload="none" onError={() => setFailed(true)} className="size-full object-cover" aria-label="Official Higgsfield model example" />}
    {failed && <img src={showcase.poster} alt="Official Higgsfield example thumbnail" className="size-full object-cover" />}
    <span className="absolute left-2 top-2 rounded bg-ink/85 px-2 py-1 text-[10px] font-semibold text-inverse">Representative model example</span>
    <div className="absolute bottom-2 left-2 right-2 flex items-center gap-2">
      {!failed && <button type="button" onClick={() => { setReducedMotion(false); setPaused(playing); }} className="rounded bg-ink/85 px-2 py-1 text-xs font-semibold text-inverse">{playing ? "Pause" : "Play"}</button>}
      {!failed && <button type="button" onClick={() => setMuted((value) => !value)} className="rounded bg-ink/85 px-2 py-1 text-xs font-semibold text-inverse">{muted ? "Unmute" : "Mute"}</button>}
      <a href={showcase.source} target="_blank" rel="noopener noreferrer" className="ml-auto rounded bg-ink/85 px-2 py-1 text-xs font-semibold text-inverse underline">Higgsfield example ↗</a>
    </div>
  </div>;
}

function ModelVisual({ id, selected, compact = false }: { id: VideoStyleId; selected: boolean; compact?: boolean }) {
  const icon = id === "brand-motion" ? <Clapperboard className="size-12" strokeWidth={1.2} />
    : id.includes("explainer") ? <PencilLine className="size-12" strokeWidth={1.2} />
    : id.includes("image") || id.includes("visual") || id.includes("look") ? <Image className="size-12" strokeWidth={1.2} />
    : id.includes("reference") || id.includes("keyframe") || id === "first-to-last" ? <Layers3 className="size-12" strokeWidth={1.2} />
    : id.includes("remix") || id.includes("restyle") || id === "directed-recut" ? <WandSparkles className="size-12" strokeWidth={1.2} />
    : id === "camera-story" ? <Camera className="size-12" strokeWidth={1.2} /> : <Film className="size-12" strokeWidth={1.2} />;
  return <span aria-hidden="true" className={cn("relative grid w-full place-items-center overflow-hidden border-b-2 border-ink", compact ? "h-28" : "h-36", selected ? "bg-surface-subtle text-ink" : "bg-canvas text-ink")}>
    <span className="absolute -right-8 -top-12 size-40 rounded-full border-2 border-current opacity-15" />
    <span className="absolute -bottom-20 -left-9 size-36 rounded-full border-2 border-current opacity-15" />
    <span className="absolute left-5 top-5 flex gap-1"><span className="size-2 rounded-full bg-current opacity-30" /><span className="size-2 rounded-full bg-current opacity-30" /><span className="size-2 rounded-full bg-current opacity-30" /></span>
    <span className="grid size-20 place-items-center rounded-2xl border-2 border-current shadow-[6px_6px_0_currentColor] transition-transform group-hover:-rotate-3 group-hover:scale-105">{icon}</span>
    <Sparkles className="absolute bottom-5 right-6 size-5 opacity-50" />
  </span>;
}
