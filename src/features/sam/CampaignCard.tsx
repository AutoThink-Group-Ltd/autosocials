import { useNavigate } from "@tanstack/react-router";
import { ProductionProgress } from "@/features/create/ProductionProgress";
import { AssetWorkflow } from "@/features/create/AssetWorkflow";
import { useWorkspaceUi } from "@/workspace/WorkspaceUi";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContentCampaign, saveContentCampaign } from "@/lib/content-campaign.functions";
import { estimateContentCampaign, quoteContentCampaignProduction, produceContentCampaign, getContentCampaignProduction } from "@/lib/personal-idea-batch.functions";
import { CampaignScheduleReview } from "@/features/schedule/CampaignScheduleReview";
import { CampaignFormatHandoff } from "@/features/create/CampaignFormatHandoff";
import type { TilePlan } from "@/lib/social-tiles";
import { TileCopyPreview } from "@/features/create/TileCopyPreview";
import { campaignTile, type ContentCampaign } from "@/lib/content-campaign";

export function CampaignCard({ workspaceId, campaignId, previewGroup }: { workspaceId: string; campaignId: string; previewGroup?: number }) {
  const navigate = useNavigate();
  const { setMobileView } = useWorkspaceUi();
  const get = useServerFn(getContentCampaign);
  const save = useServerFn(saveContentCampaign);
  const estimate = useServerFn(estimateContentCampaign);
  const quoteProduction = useServerFn(quoteContentCampaignProduction);
  const produce = useServerFn(produceContentCampaign);
  const status = useServerFn(getContentCampaignProduction);
  const client = useQueryClient();
  const key = ["content-campaign", workspaceId, campaignId];
  const query = useQuery({ queryKey: key, queryFn: () => get({ data: { workspace_id: workspaceId, campaign_id: campaignId } }) });
  const [draft, setDraft] = useState<ContentCampaign | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [quote, setQuote] = useState<{ quoteId: string; batch_id: string; totalCredits: number } | null>(null);
  const [results, setResults] = useState<Array<{postId:string; type:"tile"|"written"; assetId:string | null; editablePlan?:TilePlan; date:string; platform:string; caption:string; status:string; previewUrl?:string|null; message?:string}>>([]);
  const [busy, setBusy] = useState(false);
  const [offset, setOffset] = useState(previewGroup ?? 0);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (query.data && !dirty) setDraft(query.data); }, [query.data, dirty]);
  const version = query.data?.revision;
  const runKey = ["campaign-submission", workspaceId, campaignId, version, offset];
  const submission = useQuery<{pending:boolean; error:string}>({queryKey:runKey, enabled:false, queryFn:() => ({pending:false,error:""})});
  function openPreview() {
    setMobileView("live");
    void navigate({to:"/app/create", search:{production:campaignId, group:offset}});
  }
  const estimateQuery = useQuery({
    queryKey: ["campaign-estimate", workspaceId, campaignId, version, offset],
    enabled: !!version && !dirty && query.data?.posts.some(post => post.format === "tiles" || post.format === "written") === true,
    queryFn: () => estimate({ data: { workspace_id: workspaceId, campaign_id: campaignId, revision: version!, offset } }),
    staleTime: 60000, retry: false,
  });
  const activeQuote = quote ?? (estimateQuery.data?.quoteId ? { quoteId: estimateQuery.data.quoteId, batch_id: estimateQuery.data.batchId, totalCredits: estimateQuery.data.totalCredits } : null);
  const progress = useQuery({
    queryKey: ["campaign-progress", workspaceId, campaignId, version, offset, activeQuote?.quoteId],
    enabled: !!version && !!activeQuote && !dirty,
    queryFn: () => status({ data: { workspace_id: workspaceId, campaign_id: campaignId, revision: version!, offset, batch_id: activeQuote!.batch_id, quote_id: activeQuote!.quoteId } }),
    refetchInterval: query => query.state.data?.status === "in_progress" || submission.data?.pending ? 10000 : false,
  });
  if (query.isPending) return <p role="status">Loading your content plan…</p>;
  if (query.isError || !draft) return <p role="alert">The content plan could not be loaded. <button onClick={() => void query.refetch()} className="underline">Try again</button></p>;
  function update(index: number, field: "date" | "title" | "caption" | "brief", value: string) {
    setDirty(true);
    setQuote(null);
    setResults([]);
    setDraft(current => current && { ...current, posts: current.posts.map((post, i) => i === index ? { ...post, [field]: value } : post) });
  }
  async function saveEdits() {
    if (!draft) return;
    setSaving(true); setError("");
    try {
      const updated = await save({ data: { workspace_id: workspaceId, campaign_id: campaignId, revision: draft.revision, posts: draft.posts } });
      client.setQueryData(key, updated);
      setDirty(false); setQuote(null); setResults([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); }
    finally { setSaving(false); }
  }
  async function startProduction() {
    if (!draft || !estimateQuery.data) return;
    setBusy(true); setError("");
    client.setQueryData(runKey, {pending:true,error:""});
    openPreview();
    try {
      const input = { workspace_id: workspaceId, campaign_id: campaignId, revision: draft.revision, offset };
      const approved = activeQuote ?? await quoteProduction({ data: input });
      setQuote(approved);
      client.setQueryData(["campaign-estimate",workspaceId,campaignId,draft.revision,offset], { totalCredits: approved.totalCredits, quoteId: approved.quoteId, batchId: approved.batch_id });
      if (approved.totalCredits !== (activeQuote?.totalCredits ?? estimateQuery.data.totalCredits)) {
        throw new Error("The estimate changed. Return to the campaign to review the new total before approving.");
      }
      const result = await produce({ data: { ...input, batch_id: approved.batch_id, quote_id: approved.quoteId, confirmed: true } });
      setResults(result.results);
      await client.invalidateQueries({ queryKey: ["campaign-progress", workspaceId, campaignId] });
      client.setQueryData(runKey, {pending:false,error:""});
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Production could not be confirmed. Check the saved status.";
      setError(message);
      client.setQueryData(runKey, {pending:false,error:message});
    }
    finally { setBusy(false); }
  }
  async function refreshStatus() {
    if (!draft || !activeQuote) return;
    setBusy(true); setError("");
    try {
      const result = await status({ data: { workspace_id: workspaceId, campaign_id: campaignId, revision: draft.revision, offset, batch_id: activeQuote.batch_id, quote_id: activeQuote.quoteId } });
      setResults(result.results);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not check production."); }
    finally { setBusy(false); }
  }
  const producible = draft.posts.filter(post => post.format === "tiles" || post.format === "written");
  const currentResults = progress.data?.status && progress.data.status !== "not_submitted" ? progress.data.results : results;
  const scheduleRows = currentResults.flatMap(item => ["ready", "done"].includes(item.status) && item.assetId ? [{ postId: item.postId, type: item.type, assetId: item.assetId, date: item.date, platform: item.platform, caption: item.caption }] : []);
  if (previewGroup !== undefined) {
    const posts = producible.slice(offset,offset + 20);
    const pending = submission.data?.pending === true;
    return <>
      <ProductionProgress workspaceId={workspaceId} trashScope={{ kind: "campaign", id: campaignId }}
        items={posts.map(post => ({title:post.title,format:post.format === "tiles" ? "tiles" : "written",caption:post.caption,trashId:post.id}))}
        results={posts.map(post => {
          const result = currentResults.find(item => item.postId === post.id);
          const waiting = !result || (result.status === "unconfirmed" && progress.data?.status === "in_progress");
          return { kind: post.format === "tiles" ? "tile" : "written", id: result?.assetId ?? post.id,
            status: waiting ? (progress.data?.status === "not_submitted" && !pending ? "unconfirmed" : "pending") : result.status,
            ...(result?.editablePlan ? { editablePlan: result.editablePlan } : {}),
            ...(result?.previewUrl ? {previewUrl: result.previewUrl, downloadUrl: result.previewUrl} : {}),
            ...(result?.message ? {message:result.message} : {}) };
        })}
        checking={progress.isFetching} notice={pending && !activeQuote ? "Preparing the approved batch…" : progress.data?.status === "not_submitted" && !pending ? "Production has not been confirmed for this batch." : ""}
        error={submission.data?.error || progress.error?.message || estimateQuery.error?.message || null}
        onCheck={() => { void estimateQuery.refetch(); if (activeQuote) void progress.refetch(); }}
        backLabel="Back to plan" onBack={() => void navigate({to:"/app/create",search:{stage:"plans",item:`campaign:${campaignId}`}})} />
      {scheduleRows.length > 0 && <div className="mx-auto max-w-4xl px-5 pb-10"><CampaignScheduleReview workspaceId={workspaceId} timezone={draft.timezone} rows={scheduleRows} /></div>}
    </>;
  }
  return <section className="my-3 space-y-3 rounded-xl border border-border-control bg-surface p-4" aria-label="Content plan">
    <AssetWorkflow stage="plans" />
    <h3 className="font-bold">{draft.title}</h3>
    <p className="text-sm text-muted-foreground">{draft.posts.length} posts · {draft.timezone}</p>
    <ol className="grid gap-3 sm:grid-cols-2">
    {draft.posts.map((post, index) => <li key={post.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs font-semibold text-muted-foreground">{index + 1} <span className="ml-2">{post.date}</span></p>
      {post.format === "tiles" ? <TileCopyPreview tile={campaignTile(post)} /> : post.format === "written" ? <p className="whitespace-pre-wrap break-words text-sm">{post.caption}</p> : <p className="font-semibold">{post.title}</p>}
      <details>
        <summary className="cursor-pointer text-sm font-semibold">{post.format === "video" ? "Video setup" : post.format === "carousel" ? "Carousel setup" : "Edit post"}</summary>
      <div className="mt-3 space-y-2 text-sm">
        <label className="block">Date<input type="date" className="mt-1 w-full rounded border border-border-control bg-surface p-2" value={post.date} onChange={event => update(index, "date", event.target.value)} /></label>
        <label className="block">Title<input className="mt-1 w-full rounded border border-border-control bg-surface p-2" value={post.title} onChange={event => update(index, "title", event.target.value)} /></label>
        <label className="block">Caption<textarea rows={6} className="mt-1 w-full rounded border border-border-control bg-surface p-2" value={post.caption} onChange={event => update(index, "caption", event.target.value)} /></label>
        <label className="block">Design brief<textarea rows={3} className="mt-1 w-full rounded border border-border-control bg-surface p-2" value={post.brief} onChange={event => update(index, "brief", event.target.value)} /></label>
        {post.format === "tiles" && post.design && <p>Proposed design: {post.design.treatment} · {post.design.aspect} · {post.design.medium}</p>}
        {post.format === "tiles" && post.quote && <p>Quotation: “{post.quote.text}” — {post.quote.speaker}. <a className="underline" href={post.quote.sourceUrl} target="_blank" rel="noreferrer">{post.quote.sourceTitle}</a></p>}
        {post.format === "tiles" && post.quoteNotice && <p role="status">{post.quoteNotice}</p>}
        {(post.format === "video" || post.format === "carousel") && <CampaignFormatHandoff workspaceId={workspaceId} post={post} revision={draft.revision} disabled={dirty} />}
      </div>
      </details>
    </li>)}
    </ol>
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={saving || !dirty || busy} onClick={() => void saveEdits()} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-inverse disabled:opacity-50">{saving ? "Saving…" : "Save changes"}</button>
    {producible.length > 20 && <label className="block text-sm">Production group<select className="ml-2 rounded border p-2" value={offset} onChange={event => { setOffset(Number(event.target.value)); setQuote(null); setResults([]); }}>{Array.from({ length: Math.ceil(producible.length / 20) }, (_, index) => <option value={index * 20} key={index}>Posts {index * 20 + 1}–{Math.min(producible.length, (index + 1) * 20)}</option>)}</select></label>}
    {producible.length > 0 && (estimateQuery.data ? <div>
      <p>{activeQuote?.totalCredits ?? estimateQuery.data.totalCredits} credits for {Math.min(20, producible.length - offset)} posts</p>
      {!(progress.data && progress.data.status !== "not_submitted") && <button type="button" disabled={busy || dirty || (activeQuote !== null && progress.isPending)} onClick={() => void startProduction()} className="rounded-lg bg-ink px-4 py-2 text-inverse">{busy ? "Starting production…" : "Approve & produce"}</button>}
    </div> : estimateQuery.isError ? <p role="alert">Production estimate unavailable. <button onClick={() => void estimateQuery.refetch()}>Retry estimate</button></p> : !dirty && <p>Checking production cost…</p>)}
    {dirty && <p className="text-sm">Save changes before reviewing the production cost.</p>}
    {activeQuote && <button type="button" onClick={openPreview} className="rounded-lg border border-border-control px-4 py-2">View production</button>}
    {activeQuote && <button type="button" disabled={busy} onClick={() => void refreshStatus()} className="rounded-lg border border-border-control px-4 py-2">Check production status</button>}
    {currentResults.length > 0 && <><p>{scheduleRows.length} of {currentResults.length} ready</p><CampaignScheduleReview workspaceId={workspaceId} timezone={draft.timezone} rows={scheduleRows} /></>}

  </section>;
}
