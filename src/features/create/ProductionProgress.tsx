import { useState } from 'react';
import { Check, Clapperboard, FileText, Images, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ShareDialog } from './wizard/ShareDialog';
import { PipelineTrashAction, usePipelineTrash } from './PipelineTrash';

import type { TilePlan } from "@/lib/social-tiles";
import { SocialDesignEditor } from "./SocialDesignEditor";
import { AssetWorkflow } from "./AssetWorkflow";

type Result = { kind: 'written' | 'tile' | 'video'; id: string; status: string; message?: string; editablePlan?: TilePlan; previewUrl?: string; downloadUrl?: string; text?: string };
type Item = { title: string; format: 'written' | 'tiles' | 'video'; caption?: string; trashId?: string };
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
export function ProductionProgress({ workspaceId, items, results, checking, notice, error, onCheck, onRetry, onBack, trashScope, backLabel = "Back to ideas" }: { workspaceId: string; items: Item[]; results: Result[]; checking: boolean; notice: string; error: string | null; onCheck: () => void; onRetry?: () => void; onBack: () => void; trashScope?: { kind: "batch" | "campaign"; id: string }; backLabel?: string }) {
  const [editingTile, setEditingTile] = useState<Result | null>(null);
  const [sharing, setSharing] = useState<{ id: string; title: string } | null>(null);
  const [copied, setCopied] = useState<number | null>(null);

  const trash = usePipelineTrash(trashScope && uuid.test(trashScope.id) ? workspaceId : '');
  const [shareMessage, setShareMessage] = useState('');
  const shareTile = async (url: string, title: string) => {
    try {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], 'social-tile.png', { type: 'image/png' });
      if (!navigator.share || !navigator.canShare?.({ files: [file] })) { setShareMessage('Sharing images is unavailable here. Download the tile to share it.'); return; }
      await navigator.share({ title, files: [file] });
    } catch (error) { if (!(error instanceof Error && error.name === 'AbortError')) setShareMessage('Could not open sharing. Download the tile to share it.'); }
  };
  const attention = results.some(result => ['failed', 'needs_attention', 'reconciliation_required', 'limit_reached', 'unconfirmed'].includes(result.status));
  const allReady = items.length > 0 && results.length >= items.length && results.every(result => ['ready', 'done', 'completed'].includes(result.status));
  const counts = { video: 0, tile: 0, written: 0 };
  if (editingTile?.editablePlan) return <SocialDesignEditor key={editingTile.id} workspaceId={workspaceId}
    storageKey={"as:campaign-tile-edit:" + workspaceId + ":" + editingTile.id} plan={editingTile.editablePlan} onBack={() => setEditingTile(null)} />;
  return <main className="mx-auto w-full max-w-4xl px-5 py-10 md:px-10">
    <AssetWorkflow stage={allReady ? "ready" : "production"} />
    <section className="relative overflow-hidden rounded-3xl border border-border bg-surface-subtle p-6 sm:p-10">
      <div aria-hidden className="build-orbit pointer-events-none absolute -right-12 -top-20 size-56 rounded-full border-2 border-dashed border-ink/15" />
      <div className="relative"><span className="grid size-12 place-items-center rounded-full bg-ink text-inverse"><Sparkles className={`size-6 ${!attention && !allReady ? 'motion-safe:animate-pulse' : ''}`} /></span><p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">Creating with Sam</p><h1 className="mt-2 font-display text-3xl font-bold">{attention ? 'Some content needs attention' : allReady ? 'Your content is ready to review' : 'Your content is in production'}</h1><p className="mt-2 text-sm text-muted-foreground">Each asset has its own status. Nothing is published automatically.</p></div>
      {!attention && !allReady && <div aria-hidden className="relative mt-6 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="build-draw h-full w-full origin-left bg-ink" /></div>}
    </section>
    <div className="mt-3 space-y-3" aria-live="polite">{items.map((item, index) => {
      const kind = item.format === 'tiles' ? 'tile' : item.format;
      const result = results.filter(value => value.kind === kind)[counts[kind]++];
      const state = result?.status;
      const ready = state && ['ready', 'done', 'completed'].includes(state);
      const problem = state && ['failed', 'needs_attention', 'reconciliation_required', 'limit_reached', 'unconfirmed'].includes(state);
      const label = ready ? (kind === 'written' ? 'Draft saved' : 'Ready to review') : problem ? 'Needs attention' : state === 'queued' ? 'Queued' : state === 'rendering' ? 'Rendering' : state === 'preparing' ? 'Preparing' : state === 'pending' || state === 'running' ? 'In progress' : 'Checking status';
      const Icon = kind === 'video' ? Clapperboard : kind === 'tile' ? Images : FileText;
      const identity = item.trashId ?? result?.id;
      const trashKey = trashScope && uuid.test(trashScope.id) && identity && uuid.test(identity) ? `production-item:${trashScope.kind}:${trashScope.id}:${kind}:${identity}` : null;
      const trashed = !!trashKey && trash.ids.includes(trashKey);
      if (trashed) return null;
      return <article key={index} className="rounded-2xl border border-border bg-card p-5"><div className="flex items-start gap-4"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-subtle"><Icon className="size-5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{kind === 'video' ? 'Video' : kind === 'tile' ? 'Social tile' : 'Written post'}</p><h2 className="mt-1 break-words font-semibold">{item.title}</h2><p className="mt-2 text-sm text-muted-foreground">{problem ? (result?.previewUrl ? 'The video is available to inspect, but quality checks need attention.' : 'The outcome needs checking before another attempt.') : ready ? (kind === 'written' ? 'Saved as a draft in Publish.' : 'Available in your creations.') : 'We’re checking this asset’s progress.'}</p>{result?.message && (problem || kind === 'video') && <p className="mt-1 text-xs text-muted-foreground">{result.message}</p>}</div><span className="inline-flex shrink-0 items-center gap-2 text-sm font-semibold">{ready ? <Check className="size-4" /> : !problem ? <span className="size-2 rounded-full bg-ink motion-safe:animate-pulse" /> : null}{label}</span>{trashKey && <PipelineTrashAction readyAsset title={item.title} trashed={trashed} disabled={trash.isLoading || trash.isError || trash.isPending} onChange={next => trash.setTrashed(trashKey, next)} />}</div>
        {item.caption && <p className="mt-4 whitespace-pre-wrap break-words text-sm">{item.caption}</p>}
        {result && (result.previewUrl || result.text || ready) && <div className="mt-4 space-y-3">{kind === 'video' && result.previewUrl && <video src={result.previewUrl} controls playsInline preload="metadata" className="block max-h-[70vh] max-w-full rounded-xl bg-ink object-contain" aria-label={`Preview ${item.title}`} />}{kind === 'tile' && result.previewUrl && <img src={result.previewUrl} alt={`Preview ${item.title}`} className="max-h-96 max-w-full rounded-xl object-contain" />}{kind === 'written' && result.text && <p className="whitespace-pre-wrap break-words rounded-xl bg-surface-subtle p-4 text-sm">{result.text}</p>}<div className="flex flex-wrap gap-4 text-sm font-semibold">{!trashed && ready && kind === "tile" && result.editablePlan && <button type="button" onClick={() => setEditingTile(result)} className="underline">Edit design</button>}{!trashed && (ready || (kind === 'video' && state === 'needs_attention')) && result.downloadUrl && <a href={result.downloadUrl} download={kind === 'tile' ? 'social-tile.png' : undefined} className="underline">Download</a>}{!trashed && ready && kind === 'video' && <button type="button" className="underline" onClick={() => setSharing({ id: result.id, title: item.title })}>Share video</button>}{!trashed && ready && kind === 'tile' && result.previewUrl && <button type="button" className="underline" onClick={() => void shareTile(result.previewUrl!, item.title)}>Share tile</button>}{!trashed && ready && kind === 'written' && result.text && <button type="button" className="underline" onClick={() => { void navigator.clipboard.writeText(result.text!).then(() => setCopied(index)).catch(() => setShareMessage('Could not copy the post. Select the text to copy it.')); }}>{copied === index ? 'Copied' : 'Copy post'}</button>}{!trashed && ready && <a href={`/app/create?stage=ready&item=${encodeURIComponent(`${kind}:${result.id}`)}`} className="underline">Open this asset</a>}</div></div>}
      </article>;
    })}</div>
    {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}{notice && <p role="status" className="mt-4 text-sm text-muted-foreground">{notice}</p>}{shareMessage && <p role="status" className="mt-4 text-sm text-muted-foreground">{shareMessage}</p>}
    <div className="mt-6 flex flex-wrap items-center gap-3">{(error || attention || results.length < items.length) && <Button type="button" variant="outline" disabled={checking} onClick={onCheck}>{checking ? 'Checking…' : 'Check production status'}</Button>}{onRetry && results.some(result => ['failed', 'reconciliation_required', 'limit_reached', 'unconfirmed'].includes(result.status)) && <Button type="button" disabled={checking} onClick={onRetry}>Retry work that didn’t start</Button>}<button type="button" className="text-sm font-semibold underline" onClick={onBack}>{backLabel}</button></div>
    {sharing && <ShareDialog ws={workspaceId} variantIds={[sharing.id]} title={sharing.title} open onOpenChange={open => { if (!open) setSharing(null); }} />}
  </main>;
}
