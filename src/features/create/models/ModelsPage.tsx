import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Sparkles, X } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { getVideoModelOptions, refreshRenders } from "@/lib/creative.functions";
import { createModelVideo, draftModelPrompt, getModelVideoRequest, quoteModelVideo } from "@/lib/model-create.functions";
import { getRenderPlayback } from "@/lib/media.functions";
import { NEW_BATCH_SIZES } from "@/lib/content-rules";
import type { AssetSpec } from "@/lib/wizard";
import { getVideoStyle, type VideoStyleId } from "@/lib/video-styles";
import { startUpload } from "@/workspace/uploads/uploadStore";
import { cn } from "@/lib/utils";
import { QuickOptions, VideoModelCatalogue } from "../wizard/QuickOptions";
import { BuildAnimation } from "../wizard/BuildAnimation";
import { field, primary } from "../wizard/shared";

type Attachment = { key: string; name: string; id?: string; status: "uploading" | "saved" | "error"; error?: string };
type CreationRequest = { workspace_id: string; request_id: string; prompt: string; file_ids: string[]; style_id: VideoStyleId; duration: 15 | 30 | 60; size: typeof NEW_BATCH_SIZES[number]; voice?: string; captions: "clean" | "off"; note: string };
type SavedVideo = { batch_id: string; variant_id: string; preview?: true };
const errorMessage = (cause: unknown) => cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
const storageKey = (ws: string) => `as:models-video:${ws}`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Workspace key prevents a pending draft/upload from entering another business's form. */
export function ModelsPage() {
  const { currentWorkspace } = useWorkspace();
  return currentWorkspace ? <WorkspaceModels key={currentWorkspace.id} ws={currentWorkspace.id} /> : <p className="p-6">Choose a business to explore video models.</p>;
}

function WorkspaceModels({ ws }: { ws: string }) {
  const qc = useQueryClient();
  const getModels = useServerFn(getVideoModelOptions);
  const draft = useServerFn(draftModelPrompt);
  const create = useServerFn(createModelVideo);
  const quoteModel = useServerFn(quoteModelVideo);
  const inspectRequest = useServerFn(getModelVideoRequest);
  const refresh = useServerFn(refreshRenders);
  const playback = useServerFn(getRenderPlayback);
  const [stage, setStage] = useState<"models" | "prompt" | "media" | "options">("models");
  const [style, setStyle] = useState<VideoStyleId>();
  const [prompt, setPrompt] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const attachmentRef = useRef<Attachment[]>([]);
  const [specs, setSpecs] = useState<AssetSpec[]>([]);
  const [voice, setVoice] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<SavedVideo | null>(null);
  const [pendingRequest, setPendingRequest] = useState<CreationRequest | null>(null);
  const [checkingRequest, setCheckingRequest] = useState(false);
  const [requestStatus, setRequestStatus] = useState<string | null>(null);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const [recovered, setRecovered] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const alive = useRef(false);
  const submitting = useRef(false);
  const inspecting = useRef(false);
  const requestId = useRef<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const draftVersion = useRef(0);
  const updateAttachments = (items: Attachment[]) => { attachmentRef.current = items; setAttachments(items); draftVersion.current++; };
  useEffect(() => {
    alive.current = true;
    try {
      const raw = sessionStorage.getItem(storageKey(ws));
      const item = raw ? JSON.parse(raw) : null;
      if (item && uuid.test(item.batch_id) && uuid.test(item.variant_id)) setSaved(item);
      const pending = JSON.parse(sessionStorage.getItem(`${storageKey(ws)}:pending`) ?? "null");
      if (pending?.workspace_id === ws && uuid.test(pending.request_id) && typeof pending.prompt === "string") { setPendingRequest(pending); requestId.current = pending.request_id; }
    } catch { /* Storage may be disabled; rendering remains available in Sam's creations. */ }
    setRecovered(true);
    return () => { alive.current = false; draftVersion.current++; };
  }, [ws]);
  const models = useQuery({ queryKey: ["video-model-options", ws], queryFn: () => getModels({ data: { workspace_id: ws } }) });
  const quoteStyle = pendingRequest?.style_id ?? style;
  const quoteDuration = pendingRequest?.duration ?? specs[0]?.duration;
  const creditQuote = useQuery({ queryKey: ["model-credit-quote", ws, quoteStyle, quoteDuration], enabled: !!quoteStyle && !!quoteDuration && (stage === "options" || !!pendingRequest), retry: false, queryFn: () => quoteModel({ data: { workspace_id: ws, style_id: quoteStyle!, duration: quoteDuration! } }) });
  const library = useQuery({
    queryKey: ["models-library", ws], enabled: libraryOpen,
    queryFn: async () => {
      const result = await supabase.from("brand_files").select("id,name").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100);
      if (result.error) throw result.error;
      return result.data;
    },
  });
  const job = useQuery({
    queryKey: ["models-render", ws, saved?.variant_id], enabled: !!saved && !saved.preview,
    queryFn: async () => {
      await refresh({ data: { workspace_id: ws } }).catch(() => undefined);
      const result = await supabase.from("render_jobs").select("id,status,phase,error,storage_path,created_at,started_at,progress")
        .eq("workspace_id", ws).eq("variant_id", saved!.variant_id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (result.error) throw result.error;
      if (!result.data) throw new Error("The saved video has no production job yet. Refresh its status before starting another video.");
      return result.data;
    },
    refetchInterval: (query) => !query.state.data || ["queued", "preparing", "rendering"].includes(query.state.data.status) ? 8000 : false,
  });
  const video = useQuery({
    queryKey: ["models-playback", ws, job.data?.id, job.data?.storage_path],
    enabled: job.data?.status === "done" && !!job.data.storage_path, staleTime: 45 * 60_000,
    queryFn: async () => {
      const path = job.data!.storage_path!;
      if (path.startsWith("autotoast:")) return (await playback({ data: { workspace_id: ws, media_id: path.slice(10) } })).url;
      const result = await supabase.storage.from("brand-assets-private").createSignedUrl(path, 3600);
      if (result.error) throw result.error;
      return result.data.signedUrl;
    },
  });
  const fileIds = [...new Set(attachments.flatMap((item) => item.status === "saved" && item.id ? [item.id] : []))];
  const blocked = attachments.some((item) => item.status !== "saved");
  const title = prompt.trim().slice(0, 80) || "Your video";

  async function addFiles(files: File[]) {
    if (!files.length || busy || drafting) return;
    if (attachmentRef.current.length + files.length > 20) { setError("Attach up to 20 files. Remove an attachment before adding more."); return; }
    // ZIPs expand into multiple assets; this form deliberately selects individual files.
    if (files.some((file) => /\.zip$/i.test(file.name))) { setError("Choose individual documents, images or videos here, up to 20 files."); return; }
    const items: Attachment[] = files.map((file) => ({ key: crypto.randomUUID(), name: file.name, status: "uploading" }));
    updateAttachments([...attachmentRef.current, ...items]); setError(null);
    try {
      const result = await startUpload(ws, files);
      if (!alive.current) return;
      const ids = result.files.flatMap((item) => item.fileId ? [item.fileId] : []);
      const owned = ids.length ? await supabase.from("brand_files").select("id").eq("workspace_id", ws).in("id", ids) : { data: [], error: null };
      if (!alive.current) return;
      if (owned.error) throw owned.error;
      const own = new Set((owned.data ?? []).map((item) => item.id));
      updateAttachments(attachmentRef.current.map((item) => {
        const index = items.findIndex((entry) => entry.key === item.key);
        if (index < 0) return item;
        const outcome = result.files[index];
        return outcome?.fileId && own.has(outcome.fileId) ? { ...item, id: outcome.fileId, status: "saved" } : { ...item, status: "error", error: outcome?.error ?? result.errors[0] ?? "File could not be saved. Remove it and try again." };
      }));
      void qc.invalidateQueries({ queryKey: ["models-library", ws] });
    } catch (cause) {
      if (!alive.current) return;
      updateAttachments(attachmentRef.current.map((item) => items.some((entry) => entry.key === item.key) ? { ...item, status: "error", error: errorMessage(cause) } : item));
    }
  }
  async function askSam() {
    if (!style || drafting || blocked || (!prompt.trim() && !fileIds.length)) return;
    const version = draftVersion.current;
    setDrafting(true); setError(null);
    try {
      const result = await draft({ data: { workspace_id: ws, prompt: prompt.trim(), file_ids: fileIds, style_id: style } });
      if (alive.current && draftVersion.current === version) { setPrompt(result.prompt); draftVersion.current++; }
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { if (alive.current) setDrafting(false); }
  }
  async function createVideo(resume?: CreationRequest) {
    if (submitting.current || saved || !recovered || (!resume && (!style || prompt.trim().length < 3 || blocked || drafting))) return;
    if (!creditQuote.data || creditQuote.isError || creditQuote.isFetching) { setError("The credit price is unavailable. Check pricing before creating."); return; }
    const spec = specs[0];
    if (!resume && (!spec || !(NEW_BATCH_SIZES as readonly string[]).includes(spec.size))) return;
    submitting.current = true; setBusy(true); setError(null);
    requestId.current ??= crypto.randomUUID();
    const data: CreationRequest = resume ?? { workspace_id: ws, request_id: requestId.current, prompt: prompt.trim(), file_ids: fileIds, style_id: style!, duration: spec!.duration, size: spec!.size as typeof NEW_BATCH_SIZES[number], ...(voice ? { voice } : {}), captions: spec!.captions ?? "clean", note: spec!.note ?? "" };
    setPendingRequest(data);
    try { sessionStorage.setItem(`${storageKey(ws)}:pending`, JSON.stringify(data)); } catch { /* Recovery storage is optional. */ }
    try {
      const result = await create({ data: { ...data, preview_only: true, expected_credits: creditQuote.data.credits, expected_rate_id: creditQuote.data.rateId } });
      // Save acceptance even if navigation happened while the server was accepting it.
      try { sessionStorage.setItem(storageKey(ws), JSON.stringify(result)); sessionStorage.removeItem(`${storageKey(ws)}:pending`); } catch { /* Optional recovery. */ }
      if (!alive.current) return;
      setSaved(result); setPendingRequest(null);
      void qc.invalidateQueries({ queryKey: ["batches", ws] });
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { submitting.current = false; if (alive.current) setBusy(false); }
  }
  async function checkSavedRequest(action: "check" | "revise" | "retry") {
    if (!pendingRequest || inspecting.current || submitting.current) return;
    inspecting.current = true;
    setCheckingRequest(true); setError(null); setRequestStatus(null);
    try {
      const result = await inspectRequest({ data: { workspace_id: ws, request_id: pendingRequest.request_id } });
      if (!alive.current) return;
      setPendingBatchId(result.batch_id ?? null);
      if (result.state === "queued" || result.state === "preview") {
        if (!result.batch_id || !result.variant_id) throw new Error("The saved production request is missing its video reference. Check Sam’s creations before trying again.");
        const accepted: SavedVideo = { batch_id: result.batch_id, variant_id: result.variant_id, ...(result.state === "preview" ? { preview: true as const } : {}) };
        try { sessionStorage.setItem(storageKey(ws), JSON.stringify(accepted)); sessionStorage.removeItem(`${storageKey(ws)}:pending`); } catch { /* Optional recovery storage. */ }
        setSaved(accepted); setPendingRequest(null);
      } else if (result.state === "preparing") {
        setRequestStatus("Your saved request is still preparing. Keep this request attached and check again shortly. A second creation has not been started.");
      } else if (action === "retry") {
        // Only an explicit Retry can submit the saved setup. Keep an unclaimed
        // request's identity so a delayed original cannot create another video.
        const retry = { ...pendingRequest, request_id: result.state === "failed" ? crypto.randomUUID() : pendingRequest.request_id };
        requestId.current = retry.request_id;
        await createVideo(retry);
      } else if (action === "revise") {
        setPrompt(pendingRequest.prompt); setStyle(pendingRequest.style_id); setVoice(pendingRequest.voice ?? "");
        setSpecs([{ narrative: pendingRequest.prompt.slice(0, 80), duration: pendingRequest.duration, size: pendingRequest.size, style_id: pendingRequest.style_id, captions: pendingRequest.captions, note: pendingRequest.note }]);
        updateAttachments(pendingRequest.file_ids.map((id, index) => ({ key: crypto.randomUUID(), id, name: attachmentRef.current.find((item) => item.id === id)?.name ?? `Attached file ${index + 1}`, status: "saved" })));
        // An unobserved original request may still arrive: keep its identity until the server has recorded a terminal failure.
        requestId.current = result.state === "failed" ? null : pendingRequest.request_id;
        // Keep an unclaimed request persisted: navigation must not lose its identity while the original may still arrive.
        if (result.state === "failed") { try { sessionStorage.removeItem(`${storageKey(ws)}:pending`); } catch { /* Optional recovery storage. */ } }
        setPendingRequest(null); setRequestStatus(null); setStage("prompt");
      } else {
        setRequestStatus(result.state === "failed" ? "The server confirmed this request failed and has no active render. Retry with your saved settings, or choose Revise setup to make changes." : "No saved production request was found. Retry with your saved settings, or choose Revise setup to make changes. Its request ID will be retained for a safe retry.");
      }
    } catch (cause) { if (alive.current) setError(errorMessage(cause)); }
    finally { inspecting.current = false; if (alive.current) setCheckingRequest(false); }
  }
  async function createAnotherVideo() {
    if (!saved || checkingRequest) return;
    if (job.data?.status !== "done") {
      setCheckingRequest(true); setError(null); setRequestStatus(null);
      try {
        const result = await inspectRequest({ data: { workspace_id: ws, request_id: saved.batch_id } });
        if (!alive.current) return;
        if (result.state !== "failed") {
          setRequestStatus("This request still needs its production history checked. Keep it attached and inspect the saved video before creating again.");
          void job.refetch();
          return;
        }
      } catch (cause) { if (alive.current) setError(errorMessage(cause)); return; }
      finally { if (alive.current) setCheckingRequest(false); }
    }
    try { sessionStorage.removeItem(storageKey(ws)); } catch { /* Optional recovery. */ }
    setSaved(null); requestId.current = null; setRequestStatus(null); setStage("models");
  }
  const uploadArea = <div className="space-y-4">
    <div className="grid min-h-52 place-items-center rounded-[22px] border-2 border-dashed border-border-control bg-surface-subtle p-6 text-center" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files)); }}>
      <div><Upload className="mx-auto mb-3 size-8" aria-hidden /><p className="text-lg font-semibold">Drop your files here, or paste with Ctrl+V</p><p className="mt-2 text-sm text-muted-foreground">Markdown, documents, images, audio and video · up to 20 files</p><button type="button" disabled={busy || drafting} onClick={() => picker.current?.click()} className={cn(primary, "mt-5 min-h-11 px-6")}>Upload files</button></div>
    </div>
    <input ref={picker} type="file" multiple className="sr-only" aria-label="Upload reference files" onChange={(event) => { void addFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} />
    <div className="flex justify-between gap-3 text-sm"><span>{attachments.length} / 20 attached</span><button type="button" disabled={busy || drafting} className="underline" onClick={() => setLibraryOpen((value) => !value)}>{libraryOpen ? "Close library" : "Choose from Brand Assets"}</button></div>
    {libraryOpen && <div className="max-h-64 space-y-2 overflow-auto rounded-xl border border-border-control p-4" aria-label="Brand Assets library">{library.isPending && <p>Loading library…</p>}{library.isError && <p role="alert">Library could not be loaded. <button type="button" onClick={() => void library.refetch()} className="underline">Try again</button></p>}{library.data?.map((file) => <button key={file.id} type="button" disabled={busy || drafting || attachments.length >= 20 || fileIds.includes(file.id)} className="block w-full rounded-lg border border-border-control p-3 text-left disabled:opacity-50" onClick={() => updateAttachments([...attachmentRef.current, { key: crypto.randomUUID(), name: file.name, id: file.id, status: "saved" }])}>{file.name}{fileIds.includes(file.id) ? " · Attached" : " · Add"}</button>)}{library.data?.length === 0 && <p>No saved files yet.</p>}</div>}
    <ul className="space-y-2" aria-label="Attached files">{attachments.map((item) => <li key={item.key} className="flex items-center justify-between gap-3 rounded-xl border border-border-control bg-surface p-3"><div className="min-w-0"><p className="truncate font-medium">{item.name}</p><p className="text-xs text-muted-foreground" role={item.status === "error" ? "alert" : "status"}>{item.status === "saved" ? "Saved privately in Brand Assets" : item.status === "uploading" ? "Uploading…" : item.error}</p></div><button type="button" disabled={busy || drafting} aria-label={`Remove ${item.name}`} onClick={() => updateAttachments(attachmentRef.current.filter((entry) => entry.key !== item.key))} className="rounded-lg p-2"><X size={18} aria-hidden /></button></li>)}</ul>
    <p className="text-xs text-muted-foreground">Removing an attachment keeps the saved file in Brand Assets.</p>
  </div>;
  return <main className="mx-auto min-h-0 w-full max-w-7xl flex-1 space-y-6 overflow-y-auto p-4 text-ink md:p-8" onPaste={(event) => { if (!busy && !pendingRequest && (stage === "prompt" || stage === "media") && event.clipboardData.files.length) { event.preventDefault(); void addFiles(Array.from(event.clipboardData.files)); } }}>
    <header><p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Manual creation</p><h1 className="mt-2 font-display text-4xl font-bold">Models</h1><p className="mt-2 text-muted-foreground">Choose a video model, bring your own direction, and create one video.</p></header>
    {error && <div role="alert" className="flex justify-between gap-3 rounded-xl border border-warning bg-warning-surface p-4"><p>{error}</p><button type="button" aria-label="Dismiss error" onClick={() => setError(null)}><X size={18} /></button></div>}
    {busy ? <section aria-label="Preparing storyboard"><BuildAnimation beats={["Saving your direction", "Preparing the scenes", "Checking the preview"]} status="preparing" aspect="16 / 9" /><p role="status" className="mt-4 text-sm text-muted-foreground">Preparing your storyboard for review.</p></section> : saved?.preview ? <section className="space-y-3 rounded-xl border border-border p-5">
      <h2 className="font-display text-xl font-bold">Storyboard ready</h2>
      <div className="flex flex-wrap items-center gap-3">
        <a className={primary} href={`/app/create?stage=plans&wizard=video&batch=${saved.batch_id}`}>Review storyboard</a>
        <button type="button" className="p-2 text-sm underline" onClick={() => {
          try { sessionStorage.removeItem(storageKey(ws)); } catch { /* The draft stays in Plans. */ }
          requestId.current = null;
          setSaved(null);
          setStage("models");
        }}>Start another video</button>
      </div>
    </section> : saved ? <section className="space-y-5 rounded-[22px] border-2 border-ink bg-surface p-5 md:p-8" aria-label="Your video production">
      <h2 className="font-display text-3xl font-bold">{job.data?.status === "done" ? "Your video was exported" : job.data?.status === "failed" ? "Video creation failed" : "Creating your video"}</h2>
      {job.isError ? <p role="alert">Production status is unavailable. Your saved request is still attached here. Refresh its status before creating another video.</p> : job.data?.status === "failed" ? <p role="alert">{job.data.error || "The production service could not finish this video."}</p> : job.data?.status !== "done" && <BuildAnimation beats={["Preparing your direction", "Building your video", "Finishing the render"]} status={job.data?.status ?? "queued"} phase={job.data?.phase} aspect="16 / 9" createdAt={job.data?.created_at} startedAt={job.data?.started_at ?? undefined} reported={job.data?.progress} />}
      <button type="button" disabled={job.isFetching} className="rounded-xl border border-border-control px-4 py-3 font-semibold" onClick={() => void job.refetch()}>{job.isFetching ? "Checking status…" : "Refresh video status"}</button>
      {video.data && <video controls playsInline preload="metadata" src={video.data} aria-label="Your finished video" className="max-h-[70vh] w-full rounded-xl bg-canvas" />}
      {job.data?.status === "done" && !job.data.storage_path && <p role="alert">Production finished, but the playback file is unavailable. Open the editing tools to inspect the saved video.</p>}
      {video.isError && <p role="alert">Playback could not be loaded. <button type="button" className="underline" onClick={() => void video.refetch()}>Reload playback</button></p>}
      <div className="flex flex-wrap gap-4"><a href="/app/create" className="underline" onClick={() => { try { sessionStorage.setItem(`as:create-batch:${ws}`, saved.batch_id); } catch { /* Optional selection. */ } }}>Open editing tools →</a><a href="/app/sam-creations" className="underline">Sam’s creations →</a></div>
      {requestStatus && <p role="status">{requestStatus}</p>}{["done", "failed"].includes(job.data?.status ?? "") && <button type="button" disabled={checkingRequest} className={cn(primary, "min-h-11 px-5")} onClick={() => void createAnotherVideo()}>{checkingRequest ? "Checking saved request…" : "Create another video"}</button>}
    </section> : pendingRequest ? <section className="space-y-4 rounded-xl border-2 border-ink p-6"><h2 className="font-display text-2xl font-bold">Resume your saved creation</h2><p>A creation request was started. Check its saved status before making changes. Checking never starts a video. Retry uses your saved prompt and settings to start production when safe.</p><p className="text-sm text-muted-foreground">{pendingRequest.prompt.slice(0, 180)}</p><p>{creditQuote.data ? `Retry costs ${creditQuote.data.credits} credits.` : "Credit price unavailable; retry is disabled."}</p><div className="flex flex-wrap gap-3"><button type="button" disabled={checkingRequest || !creditQuote.data || creditQuote.isFetching || creditQuote.isError} className={cn(primary, "min-h-11 px-5")} onClick={() => void checkSavedRequest("retry")}>Retry</button><button type="button" disabled={checkingRequest} className="min-h-11 rounded-xl border border-border-control px-5 font-semibold" onClick={() => void checkSavedRequest("check")}>{checkingRequest ? "Checking saved request…" : "Check saved request"}</button><button type="button" disabled={checkingRequest} className="min-h-11 rounded-xl border border-border-control px-5 font-semibold" onClick={() => void checkSavedRequest("revise")}>Revise setup</button></div>{requestStatus && <p role="status">{requestStatus}</p>}<div className="flex flex-wrap gap-4"><a href="/app/create" className="underline" onClick={() => { if (pendingBatchId) { try { sessionStorage.setItem(`as:create-batch:${ws}`, pendingBatchId); } catch { /* Optional selection. */ } } }}>Open editing tools →</a><a href="/app/sam-creations" className="underline">Check Sam’s creations →</a></div></section> : stage === "models" ? <section className="space-y-5"><h2 className="font-display text-3xl font-bold">Choose your video model</h2>{models.isPending && <p role="status">Checking available models…</p>}{models.isError && <p role="alert">Models could not be loaded. <button type="button" className="underline" onClick={() => void models.refetch()}>Try again</button></p>}{models.data && <><p className="text-sm text-muted-foreground">For a finished asset with guided media requests and audio choices, <a href="/app/create" className="font-semibold underline">start with a content style</a>. This manual library keeps existing model workflows available.</p><VideoModelCatalogue models={models.data.filter((model) => ["brand-motion", "illustrated-explainer", "drawn-explainer", "cinematic-scene", "reference-story"].includes(model.id))} selectedId={style} onChoose={(id) => { setStyle(id); setStage("prompt"); setError(null); }} /><details className="rounded-xl border border-border-control p-4"><summary className="cursor-pointer font-semibold">Advanced · retained model integrations</summary><p className="my-3 text-xs text-muted-foreground">Specialist routes are retained for existing work. Configuration is not proof of output quality, working pricing or suitable inputs; production checks still apply.</p><VideoModelCatalogue models={models.data.filter((model) => model.output !== "image" && !["brand-motion", "illustrated-explainer", "drawn-explainer", "cinematic-scene", "reference-story"].includes(model.id))} selectedId={style} onChoose={(id) => { setStyle(id); setStage("prompt"); setError(null); }} /></details></>}</section> : stage === "options" ? <QuickOptions ws={ws} specs={specs} setSpecs={setSpecs} voice={voice} setVoice={setVoice} narrativeTitles={[title]} skipInitialModelStep backLabel="← Back to media" confirmationLabel="Prepare storyboard" confirmationDescription={creditQuote.data ? "Prepare the storyboard for approval. Production starts after you review it." : "Credit price unavailable for these settings. Choose a priced model and duration."} planning={busy} confirmationDisabled={!creditQuote.data || creditQuote.isFetching || creditQuote.isError} onBack={() => setStage("media")} onConfirm={() => void createVideo()} /> : <section className="space-y-6 rounded-[22px] border-2 border-ink bg-surface p-5 md:p-8">
      <button type="button" disabled={busy || drafting} onClick={() => setStage(stage === "prompt" ? "models" : "prompt")} className="text-sm font-semibold">← Back to {stage === "prompt" ? "models" : "prompt"}</button>
      <div><p className="text-sm font-semibold text-muted-foreground">{getVideoStyle(style ?? "")?.name}</p><h2 className="mt-2 font-display text-3xl font-bold">{stage === "prompt" ? "What do you want to make?" : "Add your media"}</h2><p className="mt-2 text-muted-foreground">{stage === "prompt" ? "Write your direction or attach a brief. Ask Sam to help draft it, then edit it before continuing." : "Add any source images, footage or documents this model needs. Your prompt attachments are included below."}</p></div>
      {stage === "prompt" && <><label className="block space-y-2"><span className="font-semibold">Your video prompt</span><textarea value={prompt} maxLength={5000} rows={9} disabled={drafting || busy} onChange={(event) => { setPrompt(event.target.value); draftVersion.current++; }} placeholder="Describe the scene, story, look and exact words you want…" className={cn(field, "min-h-64 w-full text-lg")} /></label><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{prompt.length} / 5,000 characters · minimum 3</p><button type="button" disabled={drafting || blocked || (!prompt.trim() && !fileIds.length)} onClick={() => void askSam()} className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink px-5 font-semibold disabled:opacity-50"><Sparkles size={17} aria-hidden />{drafting ? "Sam is drafting…" : "Ask Sam to draft my prompt"}</button></div><p className="text-xs text-muted-foreground">Sam’s draft appears in the editable prompt above. Drafting does not create a video.</p></>}
      {uploadArea}
      <div className="flex justify-end"><button type="button" disabled={blocked || drafting || prompt.trim().length < 3 || !recovered} className={cn(primary, "min-h-14 px-8 text-lg disabled:opacity-50")} onClick={() => { if (stage === "prompt") setStage("media"); else { setSpecs([{ narrative: title, duration: specs[0]?.duration ?? 30, size: specs[0]?.size ?? "1080x1920", style_id: style, captions: specs[0]?.captions ?? "clean", note: specs[0]?.note ?? "" }]); setStage("options"); } }}>Next →</button></div>
    </section>}
  </main>;
}
