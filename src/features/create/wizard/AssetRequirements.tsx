import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Download, Upload, Clock3 } from "lucide-react";
import { getAssetCreation, recommendAssetCreation, saveAssetCreation } from "@/lib/asset-creation.functions";
import { CONTENT_RECIPES, agentAssetBrief, creationRequirements, type ContentRecipeId, type CreationState } from "@/lib/content-recipes";
import { startUpload } from "@/workspace/uploads/uploadStore";
import { cn } from "@/lib/utils";
import { field, ghost, primary } from "./shared";
import { AssetSourceOptions } from "./AssetSourceOptions";
import { AssetLibraryGallery } from "./AssetLibraryGallery";

const developerDemoPrompt = "Please produce a short demo video of this app that we can use to create a UGC-style reaction video. Show the main feature working from start to finish, with clear, readable screens and a few seconds on each important step. Export an MP4 at the highest practical quality. Use demo data only and do not include customer information, passwords, API keys, or other confidential details.";

export function AssetRequirements({ ws, batchId, recipeId, idea, settings, onReady, onLater, onAlternative, onPrepare, standalone = false }: { ws: string; batchId: string; recipeId: ContentRecipeId; idea: string; settings: Pick<CreationState, "duration" | "size" | "captions" | "voice" | "note">; onReady: (state: CreationState | null) => void; onLater: () => void; onAlternative: () => void; onPrepare?: (prepare: (() => Promise<boolean>) | null) => void; standalone?: boolean }) {
  const get = useServerFn(getAssetCreation), save = useServerFn(saveAssetCreation), recommend = useServerFn(recommendAssetCreation);
  const query = useQuery({ queryKey: ["asset-creation", ws, batchId], queryFn: () => get({ data: { workspace_id: ws, batch_id: batchId } }) });
  const [files, setFiles] = useState<string[]>([]), [music, setMusic] = useState(""), [rights, setRights] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null), loaded = useRef(""), userChanged = useRef(false);
  const suggestions = useQuery({ queryKey: ["asset-recommendations", ws, batchId, recipeId], queryFn: () => recommend({ data: { workspace_id: ws, batch_id: batchId, recipe_id: recipeId } }), enabled: !standalone && recipeId !== "illustrated-explainer" && !!query.data && query.data.state?.recipe_id !== recipeId, retry: false, staleTime: Infinity });
  useEffect(() => { if (!standalone && suggestions.data && !userChanged.current) setFiles(suggestions.data.file_ids); }, [standalone, suggestions.data]);
  const available = query.data?.files ?? [];
  useEffect(() => {
    if (!query.data || loaded.current === `${batchId}:${recipeId}`) return;
    loaded.current = `${batchId}:${recipeId}`;
    const state = query.data.state;
    if (state?.recipe_id === recipeId) { const own = new Set(query.data.files.map((file) => file.id)); setFiles(recipeId === "illustrated-explainer" ? [] : state.file_ids.filter((id) => own.has(id))); setMusic(state.music_file_id && own.has(state.music_file_id) ? state.music_file_id : ""); setRights(state.music_rights_confirmed ?? false); onReady(state.status === "ready_to_create" ? state : null); }
    else onReady(null);
  }, [query.data, batchId, recipeId, onReady]);
  const needs = creationRequirements(recipeId, available, files, idea);
  const brief = agentAssetBrief({ business: standalone ? "This project" : query.data?.business ?? "Your business", idea, recipeId, needs });
  function change(fn: () => void) { userChanged.current = true; fn(); onReady(null); setNotice(null); }
  async function persist(deferred = false, alternative = false) {
    if (busy) return false;
    if (!deferred && !alternative && (query.isPending || suggestions.isFetching)) { setError("Sam is still choosing assets. Please wait a moment."); return false; }
    setBusy(true); setError(null);
    try {
      const result = await save({ data: { workspace_id: ws, batch_id: batchId, recipe_id: recipeId, file_ids: recipeId === "illustrated-explainer" && !alternative ? [] : files, deferred, ...settings, size: settings.size as "1080x1920", ...(alternative ? { alternative: "graphics" as const } : {}), ...(music ? { music_file_id: music, music_rights_confirmed: rights } : {}) } });
      onReady(result.state.status === "ready_to_create" ? result.state : null);
      setNotice(deferred ? "Saved. Sam will keep this idea waiting for your assets." : result.state.missing_inputs.length ? "Your choices are saved. Please resolve the requested media or choose the graphics alternative." : "Your choices are saved. Sam can prepare this asset.");
      if (deferred) onLater(); else if (alternative) onAlternative();
      return result.state.status === "ready_to_create";
    } catch (e) { setError(e instanceof Error ? e.message : "Your choices could not be saved."); return false; }
    finally { setBusy(false); }
  }
  useEffect(() => { if (!onPrepare) return; onPrepare(() => persist()); return () => onPrepare(null); });
  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setError(null); onReady(null);
    try { const result = await startUpload(ws, Array.from(list), async () => { await query.refetch(); }); await query.refetch(); const accepted = result.files.filter((file) => file.fileId && !file.error); if (recipeId === "reaction-demo" && accepted.length) change(() => setFiles((current) => [...new Set([...current, ...accepted.map((file) => file.fileId!)])].slice(0, 20))); setNotice(`${accepted.length} file${accepted.length === 1 ? "" : "s"} imported or matched to existing assets.${recipeId === "reaction-demo" && accepted.length ? " Review the selected media below, then save your choices." : " Select the media for this idea below, then save your choices."}`); if (result.errors.length) setError(result.errors.join(" ")); }
    catch (e) { setError(e instanceof Error ? e.message : "The upload could not be completed."); }
    finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([brief], { type: "text/markdown" })); const a = document.createElement("a"); a.href = url; a.download = "autosocials-asset-brief.md"; a.click(); URL.revokeObjectURL(url);
  }
  if (query.isPending) return <p role="status" className="my-5 text-sm text-muted-foreground">Checking your saved idea and available brand assets…</p>;
  if (query.isError) return <div role="alert" className="my-5 rounded-xl border border-border-control p-4"><p>Your saved requirements could not be loaded.</p><button type="button" className={cn(ghost, "mt-2")} onClick={() => void query.refetch()}>Try again</button></div>;
  return <section aria-label="Assets for this idea" className="my-5 space-y-4 rounded-2xl border border-border-control bg-surface p-5">
    <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{CONTENT_RECIPES.find((r) => r.id === recipeId)?.name}</p><h3 className="mt-1 font-display text-xl font-bold">Let’s gather what this idea needs</h3><p className="mt-2 text-sm text-muted-foreground">{recipeId === "illustrated-explainer" ? "Sam will direct Golpo to draw this film from the approved script. Product photos are not sent to Golpo." : "Sam keeps your choices with this idea. Uploads and saving never start video generation."}</p></div>
    {needs.length > 0 ? <div className="rounded-xl bg-surface-subtle p-4"><h4 className="font-semibold">Could you provide these?</h4><ul className="mt-2 list-disc pl-5 text-sm">{needs.map((need) => <li key={need}>{need}</li>)}</ul><p className="mt-2 text-sm text-muted-foreground">Real assets keep your app, products and properties accurate. Without them, I can change this to a branded graphics-led idea; I won’t invent your interface or product appearance.</p><button type="button" className={cn(ghost, "mt-3")} disabled={busy} onClick={() => void persist(false, true)}>Use a graphics-led alternative</button></div> : <p className="flex items-center gap-2 text-sm"><Check className="size-4" />No additional required media for this treatment.</p>}
    {recipeId === "reaction-demo" && <div className="rounded-xl border border-border-control bg-surface-subtle p-4"><h4 className="font-semibold">Ask your developer for an app demo</h4><p className="mt-1 text-sm text-muted-foreground">Copy this request, then upload the finished recording below.</p><p className="mt-3 whitespace-pre-wrap text-sm">{developerDemoPrompt}</p><button type="button" className={cn(ghost, "mt-3")} onClick={() => void navigator.clipboard.writeText(developerDemoPrompt).then(() => setNotice("Developer request copied.")).catch(() => setError("Clipboard unavailable. Select and copy the request above."))}><Copy size={15} />Copy developer request</button></div>}
    <input type="file" ref={picker} hidden multiple accept="image/*,video/*,audio/*,.zip,.md,.txt,.pdf,.docx,.pptx,.json" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
    <div className="flex flex-wrap gap-2"><button type="button" className={ghost} disabled={busy} onClick={() => picker.current?.click()}><Upload size={15} />Upload files or ZIP</button><button type="button" className={ghost} onClick={() => void navigator.clipboard.writeText(brief).then(() => setNotice("Instructions copied for your agent.")).catch(() => setError("Clipboard unavailable. Download the Markdown brief instead."))}><Copy size={15} />Copy instructions for my agent</button><button type="button" className={ghost} onClick={download}><Download size={15} />Download brief</button></div>
    {recipeId !== "illustrated-explainer" && <>{suggestions.isFetching && <p role="status" className="text-sm text-muted-foreground">Sam is choosing the most relevant assets for this video…</p>}{suggestions.isError && <p role="alert" className="text-sm text-warning">Sam could not choose assets. You can select them below or <button type="button" className="underline" onClick={() => void suggestions.refetch()}>try again</button>.</p>}
    <AssetLibraryGallery ws={ws} files={available} selectedIds={files} disabled={busy} onToggle={(id, selected) => change(() => setFiles((current) => selected ? [...new Set([...current, id])].slice(0, 20) : current.filter((fileId) => fileId !== id)))} /></>}
    <div><label className="text-sm font-semibold" htmlFor="creation-music">Soundtrack</label><select id="creation-music" className={cn(field, "mt-2")} value={music} disabled={busy} onChange={(e) => change(() => { setMusic(e.target.value); setRights(false); })}><option value="">No additional music track</option>{available.filter((file) => file.kind === "audio" && /\.wav$/i.test(file.name)).map((file) => <option key={file.id} value={file.id}>{file.name}</option>)}</select><p className="mt-2 text-xs text-muted-foreground">Upload a licensed mono/stereo 16-bit PCM WAV track, at most 20 MB. Image licences do not include music rights. Narration is chosen in the voice options.</p>{music && <label className="mt-2 flex items-start gap-2 text-sm"><input type="checkbox" checked={rights} onChange={(e) => change(() => setRights(e.target.checked))} />I have the rights to use this track in the finished content.</label>}</div>
    {recipeId !== "illustrated-explainer" && <AssetSourceOptions ws={ws} allowCapture={recipeId === "reaction-demo"} onImported={async (id) => { await query.refetch(); change(() => setFiles((current) => current.includes(id) ? current : [...current, id].slice(0, 20))); }} />}
    {error && <p role="alert" className="text-sm text-warning">{error}</p>}{notice && <p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    <div className="flex flex-wrap gap-2"><button type="button" className={primary} disabled={busy || !!music && !rights} onClick={() => void persist()}>{busy ? "Saving…" : "Save asset choices"}</button><button type="button" className={ghost} disabled={busy} onClick={() => void persist(true)}><Clock3 size={15} />I’ll upload later · save idea</button></div>
  </section>;
}
