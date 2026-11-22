import { getCreativeDnaKit } from "@/lib/brand-dna.functions";
import { loadCanvasDna } from "./canvas-brand-dna";
import { renderSocialDesign } from "./render-social-design";
import { useEffect, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { hexColour } from "@/lib/brand-palette";
import { listPickableFiles } from "@/lib/studio.functions";
import { planSocialTiles } from "@/lib/social-tiles.functions";
import {
  getSocialTileImage,
  generateSocialTileImage,
  checkSocialTileImage,
  quoteSocialTileImage,
} from "@/lib/social-tile-image.functions";
import {
  saveSocialTiles,
  createSocialTileDrafts,
} from "@/lib/social-tile-storage.functions";
import { tilePlanSchema, type TilePlan } from "@/lib/social-tiles";
import { drawSocialTile, loadTileImage } from "./social-tile-canvas";
import { PostcardTileBatch, PostcardTilesDesign } from "./PostcardTilesDesign";
import { AssetBuildProgress, AssetWorkflow } from "./AssetWorkflow";
import { HomeSocialTiles } from "@/features/home/HomeSocialTiles";
import { DesignReferencePicker } from "./DesignReferencePicker";
import { defaultSocialDesign, withDesignReferences } from "@/lib/social-design";
import { CreationContextCards } from "./CreationContextCards";
import { MAX_SOCIAL_TILES_PER_PLAN } from "@/lib/content-rules";
import type { CreationContextMode } from "@/lib/creation-context-mode";

type ImageState = {
  fileId: string;
  image: HTMLImageElement;
  label: string;
} | null;
type SaveInput = {
  id: string;
  headline: string;
  mime: "image/jpeg";
  image_base64: string;
};
const button =
  "rounded-xl bg-ink px-5 py-3 font-semibold text-inverse disabled:opacity-50";
const secondary =
  "rounded-lg border border-border-control px-4 py-2 font-semibold disabled:opacity-50";
const field =
  "mt-1 w-full rounded-lg border border-border-control bg-surface p-2 font-normal";
// A remount while Sam is still responding must not start a second paid call.
const pendingIdeas = new Map<string, { runId: string; plan: Promise<TilePlan> }>();
const TILE_STYLES = [
  { id: "editorial", name: "Brand editorial", direction: "Brand-guided editorial design with clean layout" },
  { id: "typography", name: "Bold typography", direction: "Typography-led poster with a strong readable headline" },
  { id: "illustration", name: "Illustrated", direction: "Illustrated artwork with expressive brand-guided graphics" },
] as const;

function squareTileSketches(plan: TilePlan, styleId: (typeof TILE_STYLES)[number]["id"] | null, referenceIds: string[]): TilePlan {
  const style = TILE_STYLES.find(item => item.id === styleId);
  return {
    ...plan,
    tiles: plan.tiles.map(tile => {
      const direction = [style?.direction, tile.direction].filter(Boolean).join(". ").slice(0, 220);
      const planned = tile.design ?? defaultSocialDesign(direction);
      const treatment = style?.id === "typography" || style?.id === "illustration" ? style.id : planned.treatment;
      const design = withDesignReferences({ ...planned, aspect: "square", treatment }, planned.referenceIds ?? referenceIds);
      return { ...tile, direction, design };
    }),
  };
}

export function SocialTiles({ initialBrief = "", initialPlan, initialStorageKey, onBackToCreate, onReviewPlan, historyOnly = false, autoGenerate = true, requestedCount: initialCount = 1, initialEntry = "narratives", initialReferenceIds = [] }: { initialReferenceIds?: string[]; initialBrief?: string; initialPlan?: TilePlan; initialStorageKey?: string; onBackToCreate?: () => void; onReviewPlan?: (plan: TilePlan, brief: string, id: string) => Promise<void>; historyOnly?: boolean; autoGenerate?: boolean; requestedCount?: number; initialEntry?: "narratives" | "styles" }) {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const dnaKit = useServerFn(getCreativeDnaKit);
  const createPlan = useServerFn(planSocialTiles),
    getImage = useServerFn(getSocialTileImage),
    generateImage = useServerFn(generateSocialTileImage),
    checkImage = useServerFn(checkSocialTileImage),
    quoteImage = useServerFn(quoteSocialTileImage);
  const save = useServerFn(saveSocialTiles),
    createDrafts = useServerFn(createSocialTileDrafts),
    listFiles = useServerFn(listPickableFiles);
  const [brief, setBrief] = useState(initialBrief),
    [plan, setPlan] = useState<TilePlan | null>(initialPlan ?? null);
  const [ideaOpen, setIdeaOpen] = useState(!!initialBrief);
  const [useDna, setUseDna] = useState(true);
  const [requestedCount, setRequestedCount] = useState(initialCount);
  const [ideas, setIdeas] = useState<TilePlan | null>(null);
  const [ideaRun, setIdeaRun] = useState<string>();
  const [reviewMode, setReviewMode] = useState(!!initialPlan);
  const [referenceIds, setReferenceIds] = useState(initialReferenceIds);
  const [postcardMode, setPostcardMode] = useState(!!initialPlan);
  const [entryTab, setEntryTab] = useState<"narratives" | "styles">(initialEntry);
  const [tileStyle, setTileStyle] = useState<(typeof TILE_STYLES)[number]["id"] | null>(null);
  useEffect(() => {
    if (!ws) return;
    const saved = sessionStorage.getItem(`as:tile-entry-style:${ws}`);
    setTileStyle(TILE_STYLES.find((style) => style.id === saved)?.id ?? null);
  }, [ws]);
  const imageQuote = useQuery({ queryKey: ["social-background-credit-quote", ws], enabled: !!ws && !!plan && !postcardMode, retry: false, queryFn: () => quoteImage({ data: { workspace_id: ws! } }) });
  const [previousPlan, setPreviousPlan] = useState<TilePlan | null>(null);
  const [runKey, setRunKey] = useState<string | undefined>(initialStorageKey);
  const [archivedRuns, setArchivedRuns] = useState<{ key: string; plan: TilePlan; compact: boolean }[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const autoStarted = useRef(false);
  const [background, setBackground] = useState("#252525"),
    [accent, setAccent] = useState("#737373");
  const [images, setImages] = useState<ImageState[]>(Array(5).fill(null));
  const [logo, setLogo] = useState<ImageState>(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [imageStates, setImageStates] = useState<string[]>(Array(5).fill(""));
  const [saveInput, setSaveInput] = useState<SaveInput[] | null>(null);
  const [saved, setSaved] = useState(false),
    [draftsDone, setDraftsDone] = useState(false);
  const requestIds = useRef<string[]>([]),
    postIds = useRef<string[]>([]);
  const [generationStarted, setGenerationStarted] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [allowIncomplete, setAllowIncomplete] = useState(false);
  const [restoredFinals, setRestoredFinals] = useState<string[]>([]);
  useEffect(() => {
    if (!ws) return;
    if (initialPlan) { setHydrated(true); return; }
    try {
      const prefix = `as:postcard-tile-archive:${ws}:`;
      const archived = Object.keys(sessionStorage).filter((key) => key.startsWith(prefix)).flatMap((key) => {
        try {
          const checkpoint = JSON.parse(sessionStorage.getItem(key) ?? "null");
          const parsed = tilePlanSchema.safeParse(checkpoint?.plan);
          return parsed.success ? [{ key, plan: parsed.data, compact: checkpoint?.compact === true }] : [];
        } catch { return []; }
      });
      setArchivedRuns(archived);
      const postcard = sessionStorage.getItem(`as:postcard-tile-run:${ws}`);
      if (postcard) {
        const parsed = tilePlanSchema.safeParse(
          (JSON.parse(postcard) as { plan?: unknown }).plan,
        );
        if (parsed.success) {
          setPreviousPlan(parsed.data);
          setHydrated(true);
          return;
        }
      }
      const raw = sessionStorage.getItem(`as:social-tile-run:${ws}`);
      if (!raw) {
        setHydrated(true);
        return;
      }
      const value = JSON.parse(raw) as {
        plan?: unknown;
        requestIds?: unknown;
        postIds?: unknown;
        background?: unknown;
        accent?: unknown;
        savedIds?: unknown;
        saved?: unknown;
        draftsDone?: unknown;
      };
      const parsed = tilePlanSchema.safeParse(value.plan);
      const ids = (v: unknown): v is string[] =>
        Array.isArray(v) &&
        v.length >= 1 &&
        v.length <= 5 &&
        v.every((x) => typeof x === "string" && /^[0-9a-f-]{36}$/i.test(x));
      if (
        !parsed.success ||
        !ids(value.requestIds) ||
        !ids(value.postIds) ||
        value.requestIds.length !== parsed.data.tiles.length ||
        value.postIds.length !== parsed.data.tiles.length
      ) {
        setHydrated(true);
        return;
      }
      requestIds.current = value.requestIds;
      postIds.current = value.postIds;
      setPlan(parsed.data);
      setBackground(hexColour(value.background) ?? "#252525");
      setAccent(hexColour(value.accent) ?? "#737373");
      setGenerationStarted(true);
      setRecovery(true);
      setImages(Array(parsed.data.tiles.length).fill(null));
      setImageStates(
        Array(parsed.data.tiles.length).fill("Check the saved request status."),
      );
      setNotice(
        "A previous image request was restored. Check its status before starting a new set.",
      );
      if (
        ids(value.savedIds) &&
        value.savedIds.length === parsed.data.tiles.length &&
        value.saved === true
      ) {
        const savedIds = value.savedIds;
        setSaveInput(
          savedIds.map((id, i) => ({
            id,
            headline: parsed.data.tiles[i]!.headline,
            mime: "image/jpeg",
            image_base64: "",
          })),
        );
        setSaved(true);
        setDraftsDone(value.draftsDone === true);
        setGenerationStarted(false);
        setRecovery(false);
        setNotice(
          "Your saved tiles were restored. You can prepare or open their publishing drafts.",
        );
        void Promise.all(
          savedIds.map((file_id) =>
            getImage({ data: { workspace_id: ws, file_id } }),
          ),
        )
          .then((items) =>
            setRestoredFinals(items.map((item) => item.data_url)),
          )
          .catch(() =>
            setError(
              "Saved tile previews could not be loaded. The saved assets remain in Brand assets.",
            ),
          );
      } else if (
        ids(value.savedIds) &&
        value.savedIds.length === parsed.data.tiles.length
      ) {
        setNotice(
          "A save was interrupted. Check Brand assets before starting a new set; some tiles may already be saved.",
        );
      }
    } catch {
      /* A malformed checkpoint cannot start work. */
    } finally {
      setHydrated(true);
    }
  }, [ws, getImage]);
  const files = useQuery({
    queryKey: ["social-tile-files", ws],
    enabled: !!ws,
    queryFn: () => listFiles({ data: { workspace_id: ws! } }),
  });
  const palette = useQuery({
    queryKey: ["social-tile-palette", ws],
    enabled: !!ws,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brand_profiles")
        .select("profile")
        .eq("workspace_id", ws!)
        .maybeSingle();
      if (error) throw error;
      return (data?.profile ?? {}) as {
        palette?: { primary?: string; accent?: string; background?: string };
      };
    },
  });
  useEffect(() => {
    if (!palette.data) return;
    setBackground(
      hexColour(palette.data.palette?.background) ??
        hexColour(palette.data.palette?.primary) ??
        "#252525",
    );
    setAccent(
      hexColour(palette.data.palette?.accent) ??
        hexColour(palette.data.palette?.primary) ??
        "#737373",
    );
  }, [palette.data]);
  const visualFiles = (files.data ?? []).filter(
    (f) => f.kind === "image" || f.kind === "logo",
  );
  const make = async (refresh = false, mode?: CreationContextMode) => {
    if (!ws || busy) return;
    const selectedReferences = mode === "standalone" ? [] : referenceIds;
    const requestBrief = mode === "goals" ? "" : brief;
    setBusy("plan");
    setError("");
    setNotice("");
    try {
      const key = `as:social-tile-ideas-fresh:${ws}`;
      let result: TilePlan | undefined;
      let runId: string | undefined;
      if (!refresh) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(key) ?? "null") as {
            brief?: unknown;
            mode?: CreationContextMode;
            plan?: unknown;
            referenceIds?: unknown;
            runId?: unknown;
          } | null;
          const parsed = tilePlanSchema.safeParse(cached?.plan);
          if (
            cached?.brief === requestBrief &&
            cached.mode === mode &&
            JSON.stringify(cached?.referenceIds ?? []) === JSON.stringify(selectedReferences) &&
            parsed.success &&
            parsed.data.tiles.length === requestedCount
          ) {
            result = parsed.data;
            if (typeof cached?.runId === "string" && /^[0-9a-f-]{36}$/i.test(cached.runId)) runId = cached.runId;
          }
        } catch {
          /* A malformed cache is ignored. */
        }
      }
      if (!result) {
        const requestKey = JSON.stringify([ws, requestBrief, requestedCount, selectedReferences, mode]);
        let request = pendingIdeas.get(requestKey);
        if (!request) {
          request = {
            runId: crypto.randomUUID(),
            plan: createPlan({ data: { workspace_id: ws, brief: requestBrief, count: requestedCount, previous_titles: mode === "standalone" ? [] : [...(previousPlan?.tiles ?? []), ...archivedRuns.flatMap((run) => run.plan.tiles)].map((tile) => tile.headline).slice(0, 100), ...(selectedReferences.length ? { reference_ids: selectedReferences } : {}), ...(mode ? { context_mode: mode } : {}) } }),
          };
          pendingIdeas.set(requestKey, request);
        }
        try {
          result = await request.plan;
          runId = request.runId;
        } finally {
          if (pendingIdeas.get(requestKey) === request)
            pendingIdeas.delete(requestKey);
        }
      }
      runId ??= crypto.randomUUID();
      try {
        sessionStorage.setItem(key, JSON.stringify({ brief: requestBrief, mode, referenceIds: selectedReferences, plan: result, runId }));
      } catch {
        /* Ideas remain usable for this visit. */
      }
      if (onReviewPlan) {
        await onReviewPlan(squareTileSketches(result, result.standalone ? null : tileStyle, selectedReferences), requestBrief, runId);
        return;
      }
      setIdeas(result);
      setIdeaRun(runId);
      setPlan(null);
      setImages(Array(result.tiles.length).fill(null));
      setImageStates(Array(result.tiles.length).fill(""));
      setSaveInput(null);
      setSaved(false);
      setDraftsDone(false);
      setGenerationStarted(false);
      setRecovery(false);
      setAllowIncomplete(false);
      requestIds.current = [];
      postIds.current = [];
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not prepare tiles.");
    } finally {
      setBusy("");
    }
  };
  useEffect(() => {
    if (!hydrated || !ws || plan || ideas || entryTab === "styles" || autoStarted.current || historyOnly || !autoGenerate) return;
    autoStarted.current = true;
    void make();
    // Request a first set once after restoring any existing work.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, ws, entryTab]);
  const selectFile = async (fileId: string, index: number | "logo") => {
    if (!ws) return;
    if (!fileId) {
      if (index === "logo") setLogo(null);
      else setImages((old) => old.map((v, i) => (i === index ? null : v)));
      return;
    }
    setBusy("image");
    setError("");
    try {
      const result = await getImage({
        data: { workspace_id: ws, file_id: fileId },
      });
      const item = {
        fileId,
        image: await loadTileImage(result.data_url),
        label: visualFiles.find((f) => f.id === fileId)?.name ?? "Brand image",
      };
      if (index === "logo") setLogo(item);
      else setImages((old) => old.map((v, i) => (i === index ? item : v)));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not load the brand image.",
      );
    } finally {
      setBusy("");
    }
  };
  const generate = async () => {
    if (!ws || !plan || !imageQuote.data || imageQuote.isError || imageQuote.isFetching) return;
    setBusy("generate");
    setError("");
    setNotice("");
    try {
      // Persist request IDs before any paid call so a refresh can recover them.
      sessionStorage.setItem(
        `as:social-tile-run:${ws}`,
        JSON.stringify({
          plan,
          requestIds: requestIds.current,
          postIds: postIds.current,
          background,
          accent,
        }),
      );
      setGenerationStarted(true);
    } catch {
      setError(
        "Could not retain request IDs safely, so image generation was not started.",
      );
      setBusy("");
      return;
    }
    const outcomes = await Promise.all(
      plan.tiles.map(async (tile, i) => {
        try {
          const response = await generateImage({
            data: {
              workspace_id: ws,
              request_id: requestIds.current[i],
              ...(plan.standalone ? { standalone: true as const } : { identity: {format:"tile" as const,job_id:requestIds.current[i]!} }),
              expected_credits: imageQuote.data!.credits,
              expected_rate_id: imageQuote.data!.rateId,
              prompt: `Create an illustrative photographic background for a social media tile for ${plan.brand}. Topic: ${tile.headline}. Supporting direction: ${tile.supporting}. Visual direction: ${tile.direction ?? ""}. No text, lettering, logos or watermarks. Avoid portraying invented claims as documented fact.`,
            },
          });
          if (response.status === "ready")
            return {
              image: {
                fileId: response.file_id,
                image: await loadTileImage(response.data_url),
                label: "AI-generated illustration",
              },
              message: "Ready",
            };
          return {
            image: null,
            message:
              response.status === "pending"
                ? "Still processing. Check status again."
                : response.message,
          };
        } catch {
          return {
            image: null,
            message:
              "Status could not be checked. Check the same request again before starting another.",
          };
        }
      }),
    );
    setImages((old) => old.map((v, i) => outcomes[i]?.image ?? v));
    setImageStates(outcomes.map((v) => v.message));
    setBusy("");
    if (outcomes.every((v) => v.image))
      setNotice(
        "Illustrative backgrounds are ready. Review each design before saving.",
      );
    else
      setError(
        "Some backgrounds are not ready. Check their status before starting a new set; the same request IDs will be used.",
      );
  };
  const checkGeneration = async () => {
    if (!ws || !plan) return;
    setBusy("check");
    setError("");
    const outcomes = await Promise.all(
      requestIds.current.map(async (request_id) => {
        try {
          const result = await checkImage({
            data: { workspace_id: ws, request_id },
          });
          if (result.status === "ready")
            return {
              image: {
                fileId: result.file_id,
                image: await loadTileImage(result.data_url),
                label: "AI-generated illustration",
              },
              message: "Ready",
            };
          if (result.status === "not_found")
            return {
              image: null,
              message:
                "Not submitted. Start a new set if you want to create it.",
            };
          if (result.status === "pending")
            return {
              image: null,
              message: "Still processing. Check again later.",
            };
          return { image: null, message: result.message };
        } catch {
          return {
            image: null,
            message:
              "Status unavailable. Check again before starting another request.",
          };
        }
      }),
    );
    setImages((old) => old.map((value, i) => outcomes[i]?.image ?? value));
    setImageStates(outcomes.map((value) => value.message));
    setRecovery(false);
    setBusy("");
    if (outcomes.every((value) => value.image))
      setNotice("Illustrative backgrounds are ready to review.");
    else
      setError(
        "Some image requests are incomplete. Their status is shown on each tile.",
      );
  };
  const drawPinned = async (canvas: HTMLCanvasElement, index: number) => {
    if (!ws || !plan) throw new Error("Workspace unavailable.");
    const jobId = requestIds.current[index];
    if (!jobId) throw new Error("This tile needs a saved creation request before export.");
    const dna = plan.standalone ? null : await loadCanvasDna(await dnaKit({data:{workspaceId:ws,format:"tile",jobId}}));
    if (!dna) { drawSocialTile(canvas,plan,index,plan.standalone ? "#252525" : background,plan.standalone ? "#737373" : accent,images[index]?.image,plan.standalone ? undefined : logo?.image); return; }
    const tile=plan.tiles[index]!;
    await renderSocialDesign(canvas,{dna,headline:tile.headline,supporting:tile.supporting,design:tile.design ?? defaultSocialDesign(tile.direction ?? ""),...(tile.quote?{quote:tile.quote}:{}),...(images[index]?.image.src?{artworkUrl:images[index]!.image.src}:{}),brand:plan.brand});
  };
  const saveAll = async () => {
    if (!ws || !plan) return;
    setBusy("save");
    setError("");
    setNotice("");
    try {
      let payload = saveInput;
      if (!payload) {
        payload = await Promise.all(plan.tiles.map(async (tile, i) => {
          const canvas = document.createElement("canvas");
          await drawPinned(canvas, i);
          const encoded = canvas.toDataURL("image/jpeg", 0.9).split(",")[1];
          if (!encoded) throw new Error("The image could not be encoded.");
          return {
            id: crypto.randomUUID(),
            headline: tile.headline,
            mime: "image/jpeg" as const,
            image_base64: encoded,
          };
        }));
        setSaveInput(payload);
      }
      // Keep each body below the deployment request-size limit; stable IDs make retries safe.
      // Retain identifiers before writing, so an interrupted save is detectable.
      sessionStorage.setItem(
        `as:social-tile-run:${ws}`,
        JSON.stringify({
          plan,
          requestIds: requestIds.current,
          postIds: postIds.current,
          background,
          accent,
          savedIds: payload.map((item) => item.id),
          saved: false,
        }),
      );
      const results = await Promise.all(
        payload.map((tile) =>
          save({ data: { workspace_id: ws, tiles: [tile] } }),
        ),
      );
      const failures = results.flatMap((r) => r.results).filter((r) => !r.ok);
      if (failures.length) {
        setError(
          `${failures.length} tile(s) could not be saved. Retry to safely finish the same set.`,
        );
        return;
      }
      setSaved(true);
      sessionStorage.setItem(
        `as:social-tile-run:${ws}`,
        JSON.stringify({
          plan,
          requestIds: requestIds.current,
          postIds: postIds.current,
          background,
          accent,
          savedIds: payload.map((item) => item.id),
          saved: true,
        }),
      );
      setNotice(
        "Your tiles are saved in Brand assets. You can now prepare publishing drafts.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not save tiles. Retry the same set.",
      );
    } finally {
      setBusy("");
    }
  };
  const draftAll = async () => {
    if (!ws || !plan || !saveInput) return;
    setBusy("drafts");
    setError("");
    setNotice("");
    try {
      const result = await createDrafts({
        data: {
          workspace_id: ws,
          tiles: saveInput.map((tile, i) => ({
            file_id: tile.id,
            post_id: postIds.current[i]!,
            caption: [plan.tiles[i]!.headline, plan.tiles[i]!.supporting]
              .filter(Boolean)
              .join("\n\n"),
          })),
        },
      });
      const failures = result.results.filter((r) => !r.ok);
      if (failures.length) {
        setError(
          `${failures.length} draft(s) could not be prepared. Retry to safely finish the same set.`,
        );
        return;
      }
      setDraftsDone(true);
      sessionStorage.setItem(
        `as:social-tile-run:${ws}`,
        JSON.stringify({
          plan,
          requestIds: requestIds.current,
          postIds: postIds.current,
          background,
          accent,
          savedIds: saveInput.map((item) => item.id),
          saved: true,
          draftsDone: true,
        }),
      );
      setNotice(
        "Your drafts are in Publish. Choose accounts and dates there, then approve scheduling.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not prepare drafts. Retry the same set.",
      );
    } finally {
      setBusy("");
    }
  };
  const download = async (index: number) => {
    if (!plan) return;
    try {
      if (restoredFinals[index]) {
        const link = document.createElement("a");
        link.download = `social-tile-${index + 1}.jpg`;
        link.href = restoredFinals[index]!;
        link.click();
        return;
      }
      const canvas = document.createElement("canvas");
      await drawPinned(canvas,index);
      const link = document.createElement("a");
      link.download = `social-tile-${index + 1}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      setError("Could not export this image.");
    }
  };
  const reviewPlan = ideas ?? (reviewMode ? plan : null);
  if (reviewPlan && ws && entryTab === "narratives") {
    const sketch = squareTileSketches(reviewPlan, ideas && !reviewPlan.standalone ? tileStyle : null, reviewPlan.standalone ? [] : referenceIds);
    const key = ideas
      ? `as:postcard-tile-archive:${ws}:${ideaRun}:${tileStyle ?? "brand"}`
      : runKey ?? `as:postcard-tile-run:${ws}`;
    return (
      <section className="mx-auto max-w-5xl space-y-5 p-5 md:p-8">
        <button type="button" className="text-sm font-semibold underline" onClick={() => {
          if (initialPlan && onBackToCreate) { onBackToCreate(); return; }
          setIdeas(null);
          setPlan(null);
          setPostcardMode(false);
          setReviewMode(false);
        }}>← Back to {initialPlan ? "Create" : "tile brief"}</button>
        <h1 className="font-display text-3xl font-bold">Social tiles</h1>
        <PostcardTileBatch key={key} compact workspaceId={ws} plan={sketch} storageKey={key} />
      </section>
    );
  }
  if (plan && postcardMode && ws)
    return (
      <section className="mx-auto max-w-5xl space-y-6 p-5 md:p-8">
        <PostcardTilesDesign
          workspaceId={ws}
          plan={plan}
          {...(runKey ? { storageKey: runKey } : {})}
          onBack={() => {
            if (initialPlan && onBackToCreate) { onBackToCreate(); return; }
            setPlan(null);
            setPostcardMode(false);
          }}
        />
      </section>
    );
  return (
    <section className="mx-auto max-w-5xl space-y-6 p-5 md:p-8">
      <AssetWorkflow stage={plan && saved ? "ready" : plan ? "production" : "plans"} />
      {onBackToCreate && <button type="button" className="text-sm font-semibold underline" onClick={onBackToCreate}>← Back to Create</button>}
      <div>
        <h1 className="font-display text-3xl font-bold">Create social tiles</h1>
        <p className="mt-2 text-muted-foreground">
          Review your tile copy before creating artwork.
        </p>
      </div>
      {!plan && <div role="tablist" aria-label="Start creating with" className="flex gap-2 border-b border-border pb-3">
        <button type="button" role="tab" aria-selected={entryTab === "narratives"} className={entryTab === "narratives" ? button : secondary} onClick={() => setEntryTab("narratives")}>Narratives</button>
        <button type="button" role="tab" aria-selected={entryTab === "styles"} className={entryTab === "styles" ? button : secondary} onClick={() => setEntryTab("styles")}>Styles</button>
      </div>}
      {!plan && entryTab === "styles" && <section aria-label="Choose a social tile style" className="space-y-4"><div><h2 className="font-display text-2xl font-bold">Choose a visual style</h2><p className="mt-1 text-sm text-muted-foreground">Sam chooses the image provider. You'll see the price before creating.</p></div><div className="grid gap-3 md:grid-cols-3">{TILE_STYLES.map((style) => <button type="button" key={style.id} aria-pressed={tileStyle === style.id} className="rounded-xl border border-border-control bg-surface p-5 text-left aria-pressed:border-ink aria-pressed:ring-2 aria-pressed:ring-ink" onClick={() => { setTileStyle(style.id); if (ws) sessionStorage.setItem(`as:tile-entry-style:${ws}`, style.id); setNotice(`Style selected: ${style.name}. Choose your narratives to continue.`); setEntryTab("narratives"); }}><span aria-hidden className="mb-4 grid h-32 place-items-center rounded-lg bg-ink p-4 text-center font-display text-xl font-bold text-inverse">{style.id === "editorial" ? "YOUR STORY" : style.id === "typography" ? "MAKE IT BOLD." : "✦ ✳ ✦"}</span><span className="block font-display text-xl font-bold">{style.name}</span><span className="mt-2 block text-sm text-muted-foreground">{style.direction}</span></button>)}</div></section>}
      {!plan && entryTab === "narratives" && tileStyle && <p className="rounded-xl border border-border-control bg-surface-subtle p-3 text-sm">Style selected: {TILE_STYLES.find((style) => style.id === tileStyle)?.name}. <button type="button" className="underline" onClick={() => setEntryTab("styles")}>Change style</button></p>}
      {(plan || entryTab === "narratives") && <>
      {ws && (previousPlan || archivedRuns.length > 0) && (
        <details className="rounded-xl border border-border-control p-4">
          <summary className="cursor-pointer font-semibold">Previous requests</summary>
          <div className="mt-4 flex flex-wrap gap-3">
            {previousPlan && <button type="button" className={secondary} onClick={() => {
              setRunKey(undefined);
              setReviewMode(false);
              setPlan(previousPlan);
              setPostcardMode(true);
            }}>Review: {previousPlan.tiles[0]?.headline ?? "Previous request"}</button>}
            {archivedRuns.map((run) => <button key={run.key} type="button" className={secondary} onClick={() => { setRunKey(run.key); setPlan(run.plan); setPostcardMode(true); setReviewMode(run.compact); }}>Review: {run.plan.tiles[0]?.headline ?? "Previous request"}</button>)}
          </div>
        </details>
      )}
      {ws && <details className="rounded-xl border border-border-control p-4"><summary className="cursor-pointer font-semibold">Past completed designs</summary><div className="mt-4"><HomeSocialTiles workspaceId={ws} showCompleted /></div></details>}
      {!plan ? <CreationContextCards
        brief={brief} onBriefChange={setBrief} ideaOpen={ideaOpen} onIdeaOpenChange={setIdeaOpen}
        useDna={useDna} onUseDnaChange={setUseDna} onGenerate={(mode) => void make(true, mode)}
        busy={!!busy} disabled={!ws || recovery} submitLabel="Draft tile copy"
        ideaOptions={useDna && ws && <DesignReferencePicker workspaceId={ws} value={referenceIds} onChange={setReferenceIds} />}
      >
        <label className="text-sm font-semibold">Number of tiles <select value={requestedCount} disabled={!!busy} onChange={(event) => setRequestedCount(Number(event.target.value))} className="ml-2 rounded-lg border border-border-control bg-surface p-2">
          {Array.from({ length: MAX_SOCIAL_TILES_PER_PLAN }, (_, i) => <option key={i + 1}>{i + 1}</option>)}
        </select></label>
      </CreationContextCards> : <button type="button" disabled={!!busy || recovery} onClick={() => { setPlan(null); setIdeaOpen(false); setUseDna(true); }} className={button}>Start a new set</button>}
      {busy === "plan" && (
        <div role="status" className="flex items-center gap-3 rounded-xl border border-border-control bg-surface-subtle p-4 text-sm">
          <Sparkles aria-hidden className="size-5 animate-pulse" />
          <span>Sam is drafting your tile copy<span className="build-wave inline-block" aria-hidden>…</span></span>
        </div>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      </>}
      {plan && (
        <>
          <div className="flex flex-wrap gap-5">
            <label className="flex items-center gap-2">
              Background{" "}
              <input
                disabled={!!saveInput || !!busy}
                type="color"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2">
              Accent{" "}
              <input
                disabled={!!saveInput || !!busy}
                type="color"
                value={accent}
                onChange={(e) => setAccent(e.target.value)}
              />
            </label>
          </div>
          <label className="block max-w-md text-sm font-semibold">
            Brand logo
            <select
              disabled={!!saveInput || !!busy}
              value={logo?.fileId ?? ""}
              onChange={(e) => void selectFile(e.target.value, "logo")}
              className={field}
            >
              <option value="">Use brand name</option>
              {visualFiles
                .filter((f) => f.kind === "logo")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
            </select>
          </label>
          <div className="space-y-2">
            <button
              type="button"
              disabled={!!saveInput || !!busy || (!generationStarted && (!imageQuote.data || imageQuote.isFetching || imageQuote.isError))}
              onClick={() =>
                void (generationStarted ? checkGeneration() : generate())
              }
              className={secondary}
            >
              {busy === "generate" || busy === "check"
                ? "Creating backgrounds…"
                : generationStarted
                  ? "Check AI background status"
                  : `Create ${plan.tiles.length} AI background${plan.tiles.length === 1 ? "" : "s"}`}
            </button>
            <p className="text-sm text-muted-foreground">
              {imageQuote.data ? `${imageQuote.data.credits} credits per image · ${imageQuote.data.credits * plan.tiles.length} credits total. ` : "Checking credit price. "}Generates up to five illustrations using the connected AI service.
              Images are saved privately.
            </p>
            {imageQuote.isError && <p role="alert">Credit price unavailable. <button type="button" className="underline" onClick={() => void imageQuote.refetch()}>Try again</button></p>}
            {generationStarted &&
              imageStates.some((state) => state !== "Ready") &&
              !recovery && (
                <button
                  type="button"
                  disabled={!!busy || !!saveInput}
                  className={secondary}
                  onClick={() => setAllowIncomplete(true)}
                >
                  Continue with available imagery
                </button>
              )}
          </div>
          <div className="grid gap-5 md:grid-cols-2">
            {plan.tiles.map((tile, index) => (
              <article
                key={index}
                className="space-y-3 rounded-xl border border-border p-4"
              >
                {restoredFinals[index] ? (
                  <img
                    src={restoredFinals[index]}
                    alt={`Saved tile ${index + 1}: ${tile.headline}`}
                    className="aspect-square w-full rounded-lg"
                  />
                ) : (
                  <TilePreview
                    plan={plan}
                    index={index}
                    background={background}
                    accent={accent}
                    image={images[index]?.image}
                    logo={plan.standalone ? undefined : logo?.image}
                  />
                )}
                <label className="block text-sm font-semibold">
                  Headline
                  <input
                    disabled={!!saveInput || !!busy}
                    value={tile.headline}
                    maxLength={80}
                    onChange={(e) =>
                      setPlan({
                        ...plan,
                        tiles: plan.tiles.map((t, i) =>
                          i === index ? { ...t, headline: e.target.value } : t,
                        ),
                      })
                    }
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Supporting text
                  <input
                    disabled={!!saveInput || !!busy}
                    value={tile.supporting}
                    maxLength={120}
                    onChange={(e) =>
                      setPlan({
                        ...plan,
                        tiles: plan.tiles.map((t, i) =>
                          i === index
                            ? { ...t, supporting: e.target.value }
                            : t,
                        ),
                      })
                    }
                    className={field}
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Image
                  <select
                    disabled={!!saveInput || !!busy}
                    value={
                      visualFiles.some((f) => f.id === images[index]?.fileId)
                        ? images[index]?.fileId
                        : ""
                    }
                    onChange={(e) => void selectFile(e.target.value, index)}
                    className={field}
                  >
                    <option value="">
                      {images[index] ? images[index]?.label : "No image"}
                    </option>
                    {visualFiles
                      .filter((f) => f.kind === "image")
                      .map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.name}
                        </option>
                      ))}
                  </select>
                </label>
                {images[index] && (
                  <button
                    type="button"
                    disabled={!!saveInput || !!busy}
                    className="text-sm underline disabled:opacity-50"
                    onClick={() => void selectFile("", index)}
                  >
                    Remove image
                  </button>
                )}
                {imageStates[index] && (
                  <p className="text-xs text-muted-foreground">
                    {imageStates[index]}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => download(index)}
                  className={secondary}
                >
                  Download PNG
                </button>
              </article>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              disabled={
                !!busy ||
                saved ||
                recovery ||
                (generationStarted &&
                  !allowIncomplete &&
                  imageStates.some((state) => state !== "Ready")) ||
                plan.tiles.some((t) => !t.headline.trim())
              }
              onClick={() => void saveAll()}
              className={button}
            >
              {busy === "save"
                ? "Saving…"
                : saveInput && !saved
                  ? "Retry saving tiles"
                  : saved
                    ? "Tiles saved"
                    : "Save tiles"}
            </button>
            <button
              type="button"
              disabled={!!busy || !saved || draftsDone}
              onClick={() => void draftAll()}
              className={secondary}
            >
              {busy === "drafts"
                ? "Preparing drafts…"
                : draftsDone
                  ? "Drafts prepared"
                  : "Send to Publish"}
            </button>
            {draftsDone && (
              <a href="/app/schedule" className={secondary}>
                Open Publish
              </a>
            )}
          </div>
          {saveInput && !saved && (
            <p className="text-sm text-muted-foreground">
              This set is locked while saving so a retry uses the same images.
              Start a new set to make changes.
            </p>
          )}
        </>
      )}
    </section>
  );
}
function TilePreview({
  plan,
  index,
  background,
  accent,
  image,
  logo,
}: {
  plan: TilePlan;
  index: number;
  background: string;
  accent: string;
  image: HTMLImageElement | undefined;
  logo: HTMLImageElement | undefined;
}) {
  return (
    <canvas
      ref={(canvas) => {
        if (canvas)
          drawSocialTile(canvas, plan, index, background, accent, image, logo);
      }}
      aria-label={`Tile ${index + 1}: ${plan.tiles[index]?.headline ?? ""}`}
      className="aspect-square w-full rounded-lg"
    />
  );
}
