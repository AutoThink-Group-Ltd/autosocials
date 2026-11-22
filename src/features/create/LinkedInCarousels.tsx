import { useScheduleDialog } from "@/features/schedule/ScheduleDialogHost";
import { getCreativeDnaKit } from "@/lib/brand-dna.functions";
import { loadCanvasDna } from "./canvas-brand-dna";
import { DesignQuotation } from "./DesignQuotation";
import { carouselInProduction, carouselMentionsProduct, missingCarouselLogos } from "@/lib/linkedin-carousel";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Download,
  Sparkles,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { hexColour } from "@/lib/brand-palette";
import type { CarouselPlan } from "@/lib/linkedin-carousel";
import {
  getLinkedInCarousel,
  listLinkedInCarousels,
  planLinkedInCarousel,
  saveLinkedInCarousel,
  saveLinkedInCarouselSlide,
} from "@/lib/linkedin-carousel.functions";
import { exportCarouselPdf, renderCarouselSlide } from "./carousel-artwork";
import { DesignReferencePicker } from "./DesignReferencePicker";
import { useDesignLogo } from "./use-design-draft";
import { AssetBuildProgress, AssetWorkflow } from "./AssetWorkflow";
import { CreationContextCards } from "./CreationContextCards";
import { CarouselStoryboard, type CarouselBuildStep } from "./CarouselStoryboard";
import { PipelineTrashAction } from "./PipelineTrash";
import { useCarouselTrash } from "./use-carousel-trash";
import type { CreationContextMode } from "@/lib/creation-context-mode";
import { generateSocialTileImage, getSocialTileImage, checkSocialTileImage, quoteSocialTileImage } from "@/lib/social-tile-image.functions";

const primary =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-5 py-3 font-semibold text-inverse disabled:opacity-50";
const secondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-border-control px-4 py-2 font-semibold disabled:opacity-50";
const field =
  "mt-2 w-full rounded-xl border border-border-control bg-surface px-3 py-2 font-normal";

type Deck = {
  id: string;
  plan: CarouselPlan;
  version: string;
  slides: { id: string; url: string }[];
};

class ArtworkPending extends Error {}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const cancel = () => {
      window.clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function imageData(url: string): Promise<string> {
  if (url.startsWith("data:")) return url;
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("A slide could not be loaded. Please try again.");
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("A slide could not be read."));
    reader.onerror = () => reject(new Error("A slide could not be read."));
    reader.readAsDataURL(blob);
  });
}

export function LinkedInCarousels({
  workspaceId,
  onBack,
  deckId,
  campaignPost,
  initialPlan,
  onDeckOpened,
  onNew,
  assetView = false,
}: {
  workspaceId: string;
  onBack: () => void;
  deckId?: string;
  campaignPost?: string;
  initialPlan?: CarouselPlan;
  onDeckOpened?: (id: string) => void;
  onNew?: () => void;
  assetView?: boolean;
}) {
  const makePlan = useServerFn(planLinkedInCarousel);
  const dnaKit=useServerFn(getCreativeDnaKit);
  const savePlan = useServerFn(saveLinkedInCarousel);
  const saveSlide = useServerFn(saveLinkedInCarouselSlide);
  const getDeck = useServerFn(getLinkedInCarousel);
  const listDecks = useServerFn(listLinkedInCarousels);
  const generateImage = useServerFn(generateSocialTileImage);
  const getImage = useServerFn(getSocialTileImage);
  const checkImage = useServerFn(checkSocialTileImage);
  const quoteImage = useServerFn(quoteSocialTileImage);
  const queryClient = useQueryClient();
  const schedule = useScheduleDialog();
  const [brief, setBrief] = useState("");
  const [ideaOpen, setIdeaOpen] = useState(!!campaignPost);
  const [useDna, setUseDna] = useState(true);
  const [references, setReferences] = useState<string[]>([]);
  useEffect(() => {
    if (campaignPost) setBrief(sessionStorage.getItem(`as:campaign-carousel:${workspaceId}:${campaignPost}`) ?? "");
  }, [workspaceId, campaignPost]);
  const [plan, setPlan] = useState<CarouselPlan | null>(initialPlan ?? null);
  const brandLogo = useDesignLogo(plan && !plan.standalone ? workspaceId : "");
  const trash = useCarouselTrash(initialPlan ? "" : workspaceId, assetView);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [editing, setEditing] = useState(!!initialPlan);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [buildStep, setBuildStep] = useState<CarouselBuildStep | null>(null);
  const [notSubmitted, setNotSubmitted] = useState<string[]>([]);
  const [artworkApproval, setArtworkApproval] = useState<{ count: number; credits: number } | null>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (initialPlan) editorHeading.current?.focus();
  }, [initialPlan]);
  const busyRef = useRef(false);
  const productionAbort = useRef<AbortController | null>(null);
  const artworkTrigger = useRef<HTMLButtonElement>(null);
  const resolveArtworkApproval = useRef<((approved: boolean) => void) | null>(null);
  useEffect(() => () => {
    productionAbort.current?.abort();
    resolveArtworkApproval.current?.(false);
    resolveArtworkApproval.current = null;
  }, []);
  const history = useQuery({
    queryKey: ["linkedin-carousels", workspaceId],
    queryFn: () => listDecks({ data: { workspace_id: workspaceId } }),
    enabled: !initialPlan,
  });
  const palette = useQuery({
    queryKey: ["carousel-palette", workspaceId],
    enabled: !!plan && !plan.standalone,
    queryFn: async () => {
      const { data, error: queryError } = await supabase
        .from("brand_profiles")
        .select("profile")
        .eq("workspace_id", workspaceId)
        .maybeSingle();
      if (queryError) throw queryError;
      return (data?.profile ?? {}) as {
        palette?: { primary?: string; accent?: string; background?: string };
      };
    },
  });

  const open = async (id: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("open");
    setError("");
    setNotice("");
    try {
      const result = await getDeck({ data: { workspace_id: workspaceId, id } });
      setDeck(result);
      setPlan(result.plan);
      const inProduction = carouselInProduction(result.plan, result.slides.length);
      setEditing(!inProduction && result.slides.length === 0);
      setActive(inProduction ? Math.max(0, result.plan.slides.findIndex((slide) => !result.slides.some((image) => image.id === slide.id))) : 0);
      if (deckId !== id) onDeckOpened?.(id);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not open this carousel.",
      );
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };
  const binnedDeck = !!deckId && trash.includes(deckId);
  const readyToOpen = !trash.isLoading && !trash.isError && !binnedDeck;
  useEffect(() => {
    if (deckId && readyToOpen) void open(deckId);
  }, [deckId, workspaceId, readyToOpen]);

  const suggest = async (mode: CreationContextMode) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy("plan");
    setError("");
    try {
      const result = await makePlan({
        data: { workspace_id: workspaceId, brief: mode === "goals" ? "" : brief.trim(), reference_ids: mode === "standalone" ? [] : references, context_mode: mode },
      });
      const saved = await savePlan({ data: { workspace_id: workspaceId, id: crypto.randomUUID(), plan: result } });
      setPlan(saved.plan);
      setDeck(saved);
      onDeckOpened?.(saved.id);
      void queryClient.invalidateQueries({ queryKey: ["pipeline-plans", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["linkedin-carousels", workspaceId] });
      setEditing(true);
      setActive(0);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Sam couldn't prepare an idea. Please try again.",
      );
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };

  const move = (index: number, step: number) => {
    if (!plan || index + step < 0 || index + step >= plan.slides.length) return;
    setPlan((current) => {
      if (!current || index + step < 0 || index + step >= current.slides.length)
        return current;
      const slides = [...current.slides];
      const [slide] = slides.splice(index, 1);
      if (slide) slides.splice(index + step, 0, slide);
      return { ...current, slides };
    });
    setActive(index + step);
  };
  const updateSlide = (
    index: number,
    fieldName: "headline" | "supporting" | "direction",
    value: string,
  ) =>
    setPlan(
      (current) =>
        current && {
          ...current,
          slides: current.slides.map((slide, i) =>
            i === index ? { ...slide, [fieldName]: value } : slide,
          ),
        },
    );
  const finishArtworkApproval = (approved: boolean) => {
    const resolve = resolveArtworkApproval.current;
    if (!resolve) return;
    resolveArtworkApproval.current = null;
    setArtworkApproval(null);
    resolve(approved);
  };

  const startArtworkOperation = (trigger: HTMLButtonElement) => {
    const controller = new AbortController();
    productionAbort.current = controller;
    artworkTrigger.current = trigger;
    busyRef.current = true;
    setBusy("artwork-quote");
    setError("");
    setNotice("");
    return controller.signal;
  };

  const refreshCarouselLists = () => {
    for (const key of ["linkedin-carousels", "pipeline-assets", "pipeline-plans"]) {
      void queryClient.invalidateQueries({ queryKey: [key, workspaceId] });
    }
  };

  const endArtworkOperation = (signal: AbortSignal) => {
    if (signal.aborted) return;
    productionAbort.current = null;
    busyRef.current = false;
    setBusy("");
    setBuildStep(null);
    refreshCarouselLists();
  };

  const requestQuote = async (count: number, signal: AbortSignal) => {
    const quote = await quoteImage({ data: { workspace_id: workspaceId } });
    signal.throwIfAborted();
    const approved = await new Promise<boolean>((resolve) => {
      resolveArtworkApproval.current = resolve;
      setArtworkApproval({ count, credits: quote.credits * count });
    });
    return approved ? quote : null;
  };

  const persistPlan = async (current: Deck | null, next: CarouselPlan, signal: AbortSignal): Promise<Deck> => {
    signal.throwIfAborted();
    if (current && JSON.stringify(current.plan) === JSON.stringify(next)) return current;
    const saved = await savePlan({ data: {
      workspace_id: workspaceId, id: current?.id ?? crypto.randomUUID(),
      plan: next, ...(current ? { version: current.version } : {}),
    } });
    signal.throwIfAborted();
    setDeck(saved);
    setPlan(saved.plan);
    return saved;
  };

  const needsArtworkQuote = (slide: CarouselPlan["slides"][number]) =>
    !slide.artwork || (!slide.artwork.fileId && notSubmitted.includes(slide.artwork.requestId));

  const prepareArtwork = async (
    current: Deck | null,
    draft: CarouselPlan,
    index: number,
    quote: Awaited<ReturnType<typeof quoteImage>> | undefined,
    signal: AbortSignal,
    waitForArtwork = false,
  ) => {
    const slide = draft.slides[index]!;
    const requestId = slide.artwork && !slide.artwork.fileId ? slide.artwork.requestId : crypto.randomUUID();
    const withArtwork = (plan: CarouselPlan, fileId?: string): CarouselPlan => ({
      ...plan,
      slides: plan.slides.map((item) => item.id === slide.id
        ? { ...item, artwork: { requestId, ...(fileId ? { fileId } : {}) } }
        : item),
    });
    const check = () => checkImage({ data: { workspace_id: workspaceId, request_id: requestId } });
    signal.throwIfAborted();

    let result: Awaited<ReturnType<typeof checkImage>>;
    if (quote) {
      // Record the request before contacting the provider. A verified unsubmitted retry keeps its ID.
      current = await persistPlan(current, withArtwork(draft), signal);
      setNotSubmitted((ids) => ids.filter((id) => id !== requestId));
      const request = current.plan.slides[index]!;
      result = await generateImage({ data: {
        workspace_id: workspaceId, request_id: requestId,
        ...(current.plan.standalone ? { standalone: true as const } : {
          identity: { format: "carousel" as const, job_id: current.id, ...(current.plan.dnaVersionId ? { version_id: current.plan.dnaVersionId } : {}) },
        }),
        ...(request.design ? { design: request.design } : {}),
        expected_credits: quote.credits, expected_rate_id: quote.rateId,
        prompt: `Create illustrative artwork for ${request.headline}. ${request.direction}. No text, lettering, logos or watermarks.`,
      } });
      draft = current.plan;
    } else {
      if (!current || !slide.artwork) throw new Error("Save the carousel before checking artwork.");
      result = await check();
    }
    signal.throwIfAborted();

    if (result.status === "pending" && waitForArtwork) {
      setBuildStep({ index, phase: "waiting" });
      // Check the saved request for up to 90 seconds without submitting another one.
      for (let attempt = 0; attempt < 15 && result.status === "pending"; attempt++) {
        await pause(6000, signal);
        result = await check();
        signal.throwIfAborted();
      }
    }
    if (result.status === "pending") throw new ArtworkPending(`Slide ${index + 1} artwork is still processing. Check again to continue.`);
    if (result.status === "not_found") {
      setNotSubmitted((ids) => [...new Set([...ids, requestId])]);
      throw new Error("This request was not submitted. You can approve a retry using the same request ID.");
    }
    if (result.status !== "ready") throw new Error(result.message);

    return {
      deck: await persistPlan(current, withArtwork(draft, result.file_id), signal),
      artworkUrl: result.data_url,
    };
  };

  const artwork = async (index: number, trigger: HTMLButtonElement) => {
    if (!plan || busyRef.current) return;
    const signal = startArtworkOperation(trigger);
    try {
      const slide = plan.slides[index]!;
      const needsQuote = needsArtworkQuote(slide) || !!slide.artwork?.fileId;
      const quote = needsQuote ? await requestQuote(1, signal) : undefined;
      if (quote === null) return;
      setBusy("artwork");
      setBuildStep({ index, phase: quote ? "artwork" : "waiting" });
      await prepareArtwork(deck, plan, index, quote, signal);
    } catch (cause) {
      if (signal.aborted) return;
      if (cause instanceof ArtworkPending) setNotice(cause.message);
      else setError(cause instanceof Error ? cause.message : "Artwork status unavailable. Check again before another request.");
    } finally {
      endArtworkOperation(signal);
    }
  };

  const approveAndBuild = async (trigger: HTMLButtonElement, rebuildId?: string) => {
    if (!plan || busyRef.current || (!plan.standalone && palette.isLoading)) return;
    const rebuildIndex = rebuildId ? plan.slides.findIndex((slide) => slide.id === rebuildId) : -1;
    const rebuildSlide = plan.slides[rebuildIndex];
    if (rebuildId && (!deck || !rebuildSlide || (rebuildSlide.design?.treatment === "illustration" && !rebuildSlide.artwork?.fileId))) return;
    const signal = startArtworkOperation(trigger);
    let currentIndex: number | undefined;
    try {
      const toSubmit = new Set(plan.slides.flatMap((slide, index) =>
        !rebuildId && slide.design?.treatment === "illustration" && !slide.artwork?.fileId && needsArtworkQuote(slide) ? [index] : [],
      ));
      const quote = toSubmit.size ? await requestQuote(toSubmit.size, signal) : undefined;
      if (quote === null) return;
      signal.throwIfAborted();
      setEditing(false);
      setBusy("design");
      const unfinished = rebuildId ? rebuildIndex : plan.slides.findIndex((slide) => !deck?.slides.some((saved) => saved.id === slide.id));
      setActive(Math.max(0, unfinished));
      setBuildStep({ index: Math.max(0, unfinished), phase: "compose" });

      let current = rebuildId && deck ? deck : await persistPlan(deck, { ...plan, productionStarted: true }, signal);
      refreshCarouselLists();
      const dna = plan.standalone ? null : await loadCanvasDna(await dnaKit({
        data: { workspaceId, format: "carousel", jobId: current.id, ...(plan.dnaVersionId ? { versionId: plan.dnaVersionId } : {}) },
      }));
      if (!current.slides.length && !plan.standalone) {
        current = await persistPlan(current, {
          ...current.plan,
          ...(dna ? { dnaVersionId: dna.id } : {}),
          brandPrimary: dna?.ink ?? hexColour(palette.data?.palette?.primary) ?? hexColour(palette.data?.palette?.background) ?? undefined,
          brandAccent: dna?.accent ?? hexColour(palette.data?.palette?.accent) ?? undefined,
        }, signal);
      }
      const brand = {
        name: current.plan.brand, dna: dna ?? undefined,
        ...(current.plan.brandPrimary ? { primaryColor: current.plan.brandPrimary } : {}),
        ...(current.plan.brandAccent ? { accentColor: current.plan.brandAccent } : {}),
      };
      for (let index = 0; index < current.plan.slides.length; index++) {
        signal.throwIfAborted();
        let slide = current.plan.slides[index]!;
        if (rebuildId ? slide.id !== rebuildId : current.slides.some((image) => image.id === slide.id)) continue;
        currentIndex = index;
        setActive(index);
        let artworkUrl: string | undefined;
        if (slide.design?.treatment === "illustration" && !slide.artwork?.fileId) {
          setBuildStep({ index, phase: toSubmit.has(index) ? "artwork" : "waiting" });
          const prepared = await prepareArtwork(current, current.plan, index, toSubmit.has(index) ? quote : undefined, signal, true);
          current = prepared.deck;
          artworkUrl = prepared.artworkUrl;
          slide = current.plan.slides[index]!;
        } else if (slide.artwork?.fileId) {
          setBuildStep({ index, phase: "compose" });
          artworkUrl = (await getImage({ data: { workspace_id: workspaceId, file_id: slide.artwork.fileId } })).data_url;
        }
        signal.throwIfAborted();
        setBuildStep({ index, phase: "compose", ...(artworkUrl ? { artworkUrl } : {}) });
        const canvas = document.createElement("canvas");
        await renderCarouselSlide(canvas, slide, index, current.plan.slides.length, brand, artworkUrl,
          plan.standalone ? undefined : dna ? dna.logo ?? undefined : brandLogo);
        signal.throwIfAborted();
        const encoded = canvas.toDataURL("image/jpeg", 0.92);
        current = await saveSlide({ data: {
          workspace_id: workspaceId, id: current.id, slide_id: slide.id,
          version: current.version, image_base64: encoded.split(",")[1]!,
        } });
        signal.throwIfAborted();
        setDeck(current);
        setBuildStep({ index, phase: "saved" });
        if (window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches) await pause(320, signal);
      }
      if (!rebuildId) setActive(0);
    } catch (cause) {
      if (signal.aborted) return;
      if (cause instanceof ArtworkPending) setNotice(cause.message);
      else {
        const detail = cause instanceof Error ? cause.message : "Could not save the slide. Retry the remaining slides.";
        setError(currentIndex === undefined ? detail : `Slide ${currentIndex + 1} · ${detail}`);
      }
    } finally {
      endArtworkOperation(signal);
    }
  };

  const download = async () => {
    if (!deck || !plan || busyRef.current) return;
    busyRef.current = true;
    setBusy("download");
    setError("");
    try {
      const fresh = await getDeck({
        data: { workspace_id: workspaceId, id: deck.id },
      });
      if (fresh.version !== deck.version) {
        setDeck(fresh);
        setPlan(fresh.plan);
        setActive(0);
        throw new Error("This carousel was updated. Review the latest slides before downloading.");
      }
      const urls = fresh.plan.slides.map(
        (slide) => fresh.slides.find((image) => image.id === slide.id)?.url,
      );
      if (urls.some((url) => !url))
        throw new Error("Finish all slides before downloading.");
      const images = await Promise.all(urls.map((url) => imageData(url!)));
      await exportCarouselPdf(
        images,
        `${fresh.plan.title || "linkedin-carousel"}.pdf`,
        fresh.plan.slides[0]?.design?.aspect ?? "square",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The PDF could not be prepared. Please try again.",
      );
    } finally {
      busyRef.current = false;
      setBusy("");
    }
  };
  const completed =
    plan?.slides.filter((slide) =>
      deck?.slides.some((image) => image.id === slide.id),
    ).length ?? 0;
  const slide = plan?.slides[active];
  const canCreate =
    !!plan &&
    !!plan.title.trim() &&
    !!plan.promise.trim() &&
    plan.slides.length >= 2 &&
    plan.slides.length <= 6 &&
    plan.slides.every(
      (slide) =>
        (!slide.design || !!slide.design.medium.trim()) &&
        slide.headline.trim() &&
        slide.supporting.trim() &&
        slide.direction.trim(),
    );
  const building = busy === "design";
  const inProduction = !!plan && carouselInProduction(plan, completed);
  const visibleCarousels = trash.isLoading || trash.isError ? [] : (history.data ?? []).filter((item) => !trash.includes(item.id));
  const hasBinnedCarousels = (history.data ?? []).some((item) => trash.includes(item.id));
  const startAnother = () => {
    onNew?.();
    setPlan(null);
    setDeck(null);
    setBrief("");
    setIdeaOpen(false);
    setUseDna(true);
    setReferences([]);
    setNotice("");
    setError("");
    setActive(0);
  };

  return (
    <main className="@container mx-auto max-w-6xl space-y-4 px-4 py-4 sm:px-6">
      <AssetWorkflow stage={building || inProduction ? "production" : deck && !editing && completed > 0 ? "ready" : "plans"} />
      <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-2 text-sm font-semibold text-muted-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {initialPlan ? "Back to slide plan" : "Create assets"}
      </button>
      {!binnedDeck && deck && <PipelineTrashAction title={deck.plan.title} carousel trashed={false} disabled={!!busy || !readyToOpen} onChange={async () => {
        await trash.moveToBin(deck.id);
        if (assetView) onBack();
        else startAnother();
      }} />}
      </div>
      {!plan && <header>
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          Create with Sam
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold">
          LinkedIn Carousels
        </h1>
        <p className="mt-2 text-muted-foreground">
          Turn one idea into a story worth clicking through.
        </p>
      </header>}
      <AlertDialog open={artworkApproval !== null} onOpenChange={(open) => { if (!open) finishArtworkApproval(false); }}>
        <AlertDialogContent className="rounded-2xl border-border-control bg-surface"
          onCloseAutoFocus={(event) => { event.preventDefault(); artworkTrigger.current?.focus(); }}>
          <AlertDialogHeader>
            <span className="mx-auto mb-2 grid size-10 place-items-center rounded-xl bg-surface-subtle text-ink sm:mx-0">
              <Sparkles aria-hidden className="size-5" />
            </span>
            <AlertDialogTitle className="font-display text-xl font-bold">Generate carousel artwork?</AlertDialogTitle>
            <AlertDialogDescription>
              {artworkApproval && <>Generate {artworkApproval.count} {artworkApproval.count === 1 ? "illustration" : "illustrations"} for <strong className="text-ink">{artworkApproval.credits} credits total</strong>.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => finishArtworkApproval(true)}>Generate artwork</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error && (
        <p role="alert" className="rounded-xl border border-border-control p-4">
          {error}
          {deckId && !plan && <button type="button" className="ml-2 underline" onClick={() => void open(deckId)}>Try again</button>}
        </p>
      )}
      {notice && <p role="status" className="rounded-xl border border-border-control bg-surface-subtle p-3 text-sm">{notice}</p>}
      {deckId && !plan && !error && !binnedDeck && !trash.isError && <p role="status">Opening saved carousel…</p>}
      {trash.isError && <p role="alert" className="text-sm">Could not check Deleted Items. <button type="button" className="underline" onClick={() => void trash.retry()}>Try again</button></p>}
      {history.isError && !plan && <p role="alert" className="text-sm">Could not load your carousels. <button type="button" className="underline" onClick={() => void history.refetch()}>Try again</button></p>}
      {binnedDeck && <p role="status">This carousel is in the bin. <Link to="/app/settings/deleted-items" className="underline">Open Deleted Items</Link> to restore it.</p>}
      {!plan && !deckId && <CreationContextCards
        brief={brief} onBriefChange={setBrief} ideaOpen={ideaOpen} onIdeaOpenChange={setIdeaOpen}
        useDna={useDna} onUseDnaChange={setUseDna} onGenerate={(mode) => void suggest(mode)}
        busy={!!busy} submitLabel="Draft carousel"
        ideaOptions={useDna && <DesignReferencePicker workspaceId={workspaceId} value={references} onChange={setReferences} />}
      />}
      {busy === "plan" && <AssetBuildProgress label="Planning your carousel" />}
      {!binnedDeck && plan && slide && editing && (
        <fieldset disabled={!!busy} className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 ref={editorHeading} tabIndex={-1} className="text-2xl font-bold">Shape the story</h2>
              <p className="mt-1 text-sm text-muted-foreground">{plan.title}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={primary} disabled={!canCreate || (!plan.standalone && palette.isLoading)}
                onClick={(event) => void approveAndBuild(event.currentTarget)}>
                {busy === "artwork-quote" ? "Checking credits…" : "Approve and build carousel"}
              </button>
              {!initialPlan && <button type="button" className={secondary} onClick={startAnother}>Start again</button>}
            </div>
          </div>
          <div className="space-y-4">
            <CarouselStoryboard plan={plan} images={deck?.slides ?? []} active={active} onSelect={setActive}
              preview building={busy === "artwork"} step={buildStep} />
            <div className="mx-auto w-full max-w-3xl space-y-3">
              <details className="rounded-xl border border-border-control bg-surface px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold">Carousel settings</summary>
                {plan.slides.every((slide) => slide.design) && <label className="mt-4 block font-semibold">Slide format
                  <select className={field} value={plan.slides[0]?.design?.aspect ?? "square"} onChange={(event) => setPlan({ ...plan, slides: plan.slides.map((slide) => ({ ...slide, design: { ...slide.design!, aspect: event.target.value as "square" | "portrait" } })) })}>
                    <option value="square">Square</option><option value="portrait">Portrait</option>
                  </select>
                </label>}
                <label className="mt-4 block font-semibold">
                  Title
                  <input
                    className={field}
                    value={plan.title}
                    maxLength={120}
                    onChange={(event) =>
                      setPlan({ ...plan, title: event.target.value })
                    }
                  />
                </label>
                <label className="mt-4 block font-semibold">
                  Reader takeaway
                  <textarea
                    className={field}
                    rows={2}
                    value={plan.promise}
                    maxLength={240}
                    onChange={(event) =>
                      setPlan({ ...plan, promise: event.target.value })
                    }
                  />
                </label>
              </details>
              <details className="rounded-xl border border-border-control bg-surface px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold">Edit slide {active + 1}</summary>
            <article
              key={slide.id}
              className="rounded-2xl border border-border-control p-5"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-bold">
                  Slide {active + 1}{" "}
                  {active === 0
                    ? "· Cover"
                    : active === plan.slides.length - 1
                      ? "· Takeaway"
                      : ""}
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={secondary}
                    aria-label={`Move slide ${active + 1} up`}
                    disabled={active === 0}
                    onClick={() => move(active, -1)}
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className={secondary}
                    aria-label={`Move slide ${active + 1} down`}
                    disabled={active === plan.slides.length - 1}
                    onClick={() => move(active, 1)}
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <label className="mt-3 block text-sm font-semibold">
                Headline
                <input
                  className={field}
                  maxLength={80}
                  value={slide.headline}
                  onChange={(event) =>
                    updateSlide(active, "headline", event.target.value)
                  }
                />
              </label>
              <label className="mt-3 block text-sm font-semibold">
                Supporting copy
                <textarea
                  className={field}
                  rows={2}
                  maxLength={180}
                  value={slide.supporting}
                  onChange={(event) =>
                    updateSlide(active, "supporting", event.target.value)
                  }
                />
              </label>
              <details className="mt-3 rounded-lg border border-border p-3 text-sm"><summary className="cursor-pointer font-semibold">Design options</summary>
              {(slide.design || slide.quote) && <DesignQuotation workspaceId={workspaceId} quote={slide.quote} onChange={quote => setPlan(current => current && ({
                ...current, slides: current.slides.map(item => item.id === slide.id ? { ...item, quote, quoteNotice: undefined } : item),
              }))} />}
              {slide.quoteNotice && <p className="mt-2 text-sm text-muted-foreground">{slide.quoteNotice}</p>}
              {slide.design && <div className="mt-3 space-y-3">
                <label className="block text-sm font-semibold">Art direction<textarea className={field} maxLength={300} value={slide.design.medium} onChange={(event) => setPlan({ ...plan, slides: plan.slides.map((item, i) => i === active ? { ...item, design: { ...item.design!, medium: event.target.value } } : item) })} /></label>
                <label className="block text-sm font-semibold">Visual treatment<select className={field} value={slide.design.treatment} onChange={(event) => setPlan({ ...plan, slides: plan.slides.map((item, i) => i === active ? { ...item, design: { ...item.design!, treatment: event.target.value as "illustration" | "typography" } } : item) })}><option value="illustration">Illustration</option><option value="typography">Typography</option></select></label>
                <label className="block text-sm font-semibold">Typeface<select className={field} value={slide.design.typeface} onChange={(event) => setPlan({ ...plan, slides: plan.slides.map((item, i) => i === active ? { ...item, design: { ...item.design!, typeface: event.target.value as "sans" | "serif" | "condensed" } } : item) })}><option value="sans">Sans serif</option><option value="serif">Serif</option><option value="condensed">Condensed</option></select></label>
                <label className="block text-sm font-semibold">Accent colour<input type="color" className={field} value={slide.design.accent} onChange={(event) => setPlan({ ...plan, slides: plan.slides.map((item, i) => i === active ? { ...item, design: { ...item.design!, accent: event.target.value } } : item) })} /></label>
                <label className="block text-sm font-semibold">Emphasise text<input className={field} maxLength={100} value={slide.design.emphasis} onChange={(event) => setPlan({ ...plan, slides: plan.slides.map((item, i) => i === active ? { ...item, design: { ...item.design!, emphasis: event.target.value } } : item) })} /></label>
                <label className="block text-sm font-semibold">Composition<select className={field} value={slide.design.composition} onChange={(event) => setPlan({ ...plan, slides: plan.slides.map((item, i) => i === active ? { ...item, design: { ...item.design!, composition: event.target.value as "top" | "right" | "full" } } : item) })}><option value="top">Top</option><option value="right">Right</option><option value="full">Full</option></select></label>
                <button type="button" className={secondary} disabled={!!busy || slide.design.treatment !== "illustration"} onClick={(event) => void artwork(active, event.currentTarget)}>{slide.artwork?.fileId ? "Regenerate artwork" : slide.artwork ? notSubmitted.includes(slide.artwork.requestId) ? "Retry artwork request" : "Check artwork status" : "Generate artwork"}</button>
              </div>}
              {!!slide.logos?.filter((logo) => carouselMentionsProduct(slide, logo.name)).length && (
                <div className="mt-3 text-sm">
                  <p className="font-semibold">Product logos on this slide</p>
                  <ul className="mt-2 space-y-2">
                    {slide.logos.filter((logo) => carouselMentionsProduct(slide, logo.name)).map((logo) => (
                      <li key={logo.name} className="flex items-center gap-3">
                        <img src={logo.image} alt={`${logo.name} logo`} className="h-10 w-20 rounded bg-white object-contain p-1" />
                        <span>{logo.name} · <a className="underline" href={logo.sourceUrl} target="_blank" rel="noreferrer">Official source</a>{logo.description ? ` · ${logo.description}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {!!missingCarouselLogos(slide).length && <p className="mt-2 text-sm text-muted-foreground">
                Logo unavailable for {missingCarouselLogos(slide).join(", ")}.
              </p>}
              <label className="mt-3 block text-sm font-semibold">
                Design direction
                <textarea
                  className={field}
                  rows={2}
                  maxLength={240}
                  value={slide.direction}
                  onChange={(event) =>
                    updateSlide(active, "direction", event.target.value)
                  }
                />
              </label>
              </details>
            </article>
              </details>
            </div>
          </div>
        </fieldset>
      )}
      {!binnedDeck && plan && !editing && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">{plan.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{building ? "Building your carousel" : `${completed} of ${plan.slides.length} slides ready`}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={secondary}
                disabled={!!busy}
                onClick={() => setEditing(true)}
              >
                Edit outline
              </button>
              {completed < plan.slides.length && (
                <button
                  type="button"
                  className={secondary}
                  disabled={!!busy}
                  onClick={(event) => void approveAndBuild(event.currentTarget)}
                >
                  {busy === "artwork-quote" ? "Checking credits…" : notice ? "Check artwork and continue" : error ? "Retry remaining slides" : "Resume carousel build"}
                </button>
              )}
              {completed === plan.slides.length && slide && (slide.design?.treatment !== "illustration" || slide.artwork?.fileId) && (
                <button type="button" className={secondary} disabled={!!busy}
                  onClick={(event) => void approveAndBuild(event.currentTarget, slide.id)}>Rebuild this slide</button>
              )}
              <button
                type="button"
                className={primary}
                disabled={!!busy || completed !== plan.slides.length}
                onClick={download}
              >
                <Download className="h-4 w-4" />{" "}
                {busy === "download" ? "Preparing PDF…" : "Download PDF"}
              </button>
              {deck && completed === plan.slides.length && (
                <button type="button" className={secondary} onClick={() => schedule.scheduleSelection({ carouselIds: [deck.id] })}>
                  Schedule or publish
                </button>
              )}
            </div>
          </div>
          <CarouselStoryboard plan={plan} images={deck?.slides ?? []} active={active} onSelect={setActive}
            building={building} step={buildStep} />
          {!initialPlan && <button
            type="button"
            className={secondary}
            disabled={!!busy}
            onClick={startAnother}
          >
            Create another
          </button>}
        </section>
      )}
      {!plan && !deckId && (visibleCarousels.length > 0 || hasBinnedCarousels) && (
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-bold">Your carousels</h2>
            {hasBinnedCarousels && <Link to="/app/settings/deleted-items" className="text-sm font-semibold underline underline-offset-2">Deleted Items</Link>}
          </div>
          {visibleCarousels.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No active carousels.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {visibleCarousels.map((item) => (
              <article key={item.id} className="flex items-center gap-2 rounded-xl border border-border-control pr-2">
              <button
                type="button"
                disabled={!!busy}
                onClick={() => void open(item.id)}
                className="min-w-0 flex-1 rounded-xl p-4 text-left hover:bg-surface-subtle"
              >
                <span className="block font-semibold">{item.title}</span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  Open carousel
                </span>
              </button>
              <PipelineTrashAction title={item.title} carousel trashed={false} disabled={!!busy} onChange={() => trash.moveToBin(item.id)} />
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
