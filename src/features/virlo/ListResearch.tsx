import { ResearchPostCard, researchGalleryGrid } from './ResearchPostCard';
import { useEffect, useRef, useState } from 'react';
import { matchesResearchDate, ResearchDatePills, type ResearchDateRange } from './ResearchDateFilter';
import { LoaderCircle, Search } from 'lucide-react';
import { startListResearch, researchListBusiness, skipListBusiness } from '@/lib/list-research.functions';
import { acquirePendingRequest, completePendingRequest } from './pendingRequest';

export type ListResearchPost = { url: string; caption?: string; published_at?: string; views?: number; likes?: number; thumbnail_url?: string; media_type?: string; width?: number; height?: number };
export type ListResearchProfile = { platform: string; handle: string; url: string; source: string; posts: ListResearchPost[]; warning?: string };
export type ListResearchBusiness = { name: string; address: string; website?: string; status: 'pending' | 'complete' | 'partial'; profiles: ListResearchProfile[]; warnings: string[] };
export type ListResearchData = { list_name: string; status: 'running' | 'complete'; businesses: ListResearchBusiness[]; checked_at: string };
export type ListResearchResult = { id: string; data: ListResearchData };
const primary = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-inverse disabled:cursor-not-allowed disabled:opacity-50';
const secondary = 'inline-flex min-h-10 items-center justify-center rounded-xl border border-border-control bg-surface px-4 text-sm font-semibold text-ink hover:bg-surface-subtle';
const pill = (active: boolean) => `rounded-full border px-3 py-1.5 text-sm ${active ? 'border-ink bg-ink text-inverse' : 'border-border-control bg-surface text-ink'}`;
const metric = (value: number) => new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/** Only link to supported social platforms, never trust a provider URL as markup. */
function socialUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port && /(^|\.)(instagram\.com|tiktok\.com|youtube\.com|youtu\.be|facebook\.com|fb\.com|linkedin\.com|x\.com|twitter\.com|pinterest\.com|threads\.net|snapchat\.com|substack\.com|reddit\.com)$/.test(url.hostname.toLowerCase())) return url.href;
  } catch { /* Invalid sources remain unlinked. */ }
}

/** Starts or resumes one report. Each business request has a durable browser idempotency key. */
export function ListResearchAction({ workspaceId, listId, businessCount, businessIndex, businessName, businessAddress, disabled, existingReport, onOpenReport, onProgress }: {
  workspaceId: string; listId?: string; businessCount: number; businessIndex?: number; businessName?: string; businessAddress?: string; disabled?: boolean; existingReport?: ListResearchResult; onOpenReport: (result: ListResearchResult) => void; onProgress?: (state: { activeIndex: number | null; statuses: ListResearchBusiness['status'][]; running: boolean; result?: ListResearchResult }) => void;
}) {
  const [report, setReport] = useState<ListResearchResult | undefined>(existingReport);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [failedIndex, setFailedIndex] = useState<number | null>(null);
  const [confirmSkip, setConfirmSkip] = useState(false);
  const mounted = useRef(true);
  const latest = useRef<ListResearchResult | undefined>(existingReport);
  const progressCallback = useRef(onProgress); progressCallback.current = onProgress;
  const publish = (current: ListResearchResult | undefined, index: number | null, running: boolean) => progressCallback.current?.({ activeIndex: index === null ? null : (businessIndex ?? index), statuses: current?.data.businesses.map(item => item.status) ?? [], running, ...(current ? { result: current } : {}) });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const progress = report?.data.businesses.filter(item => item.status !== 'pending').length ?? 0;
  const run = async () => {
    if (busy || disabled) return;
    setBusy(true); setError('');
    publish(latest.current, null, true);
    try {
      let current = report;
      if (!current) {
        if (!listId) throw new Error('This list is unavailable.');
        const pending = await acquirePendingRequest(workspaceId, { type: 'start-list-research', list_id: listId, business_index: businessIndex, business_name: businessName, business_address: businessAddress });
        const started = await startListResearch({ data: { workspace_id: workspaceId, list_id: listId, request_id: pending.id, confirmed: true, ...(businessIndex === undefined ? {} : { business_index: businessIndex, business_name: businessName ?? '', business_address: businessAddress ?? '' }) } });
        current = started as unknown as ListResearchResult;
        if (!mounted.current) return;
        completePendingRequest(pending);
        latest.current = current; publish(current, null, true);
        setReport(current);
      }
      for (let index = 0; index < current.data.businesses.length; index++) {
        if (!mounted.current) return;
        if (current.data.businesses[index]?.status !== 'pending') continue;
        setFailedIndex(index);
        publish(current, index, true);
        const pending = await acquirePendingRequest(workspaceId, { type: 'list-research-business', result_id: current.id, index });
        current = await researchListBusiness({ data: { workspace_id: workspaceId, result_id: current.id, index, request_id: pending.id } }) as unknown as ListResearchResult;
        completePendingRequest(pending);
        if (!mounted.current) return;
        latest.current = current; publish(current, null, true);
        setReport(current);
        setFailedIndex(null);
      }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Research could not be completed.');
    } finally { if (mounted.current) { publish(latest.current, null, false); setBusy(false); } }
  };
  const skip = async () => {
    if (!report || failedIndex === null || busy) return;
    setBusy(true); setError(''); publish(latest.current, null, true);
    try {
      const updated = await skipListBusiness({ data: { workspace_id: workspaceId, result_id: report.id, index: failedIndex } });
      if (mounted.current) { latest.current = updated as unknown as ListResearchResult; publish(latest.current, null, true); setReport(latest.current); setFailedIndex(null); setConfirmSkip(false); }
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'This business could not be skipped.');
    } finally { if (mounted.current) { publish(latest.current, null, false); setBusy(false); } }
  };
  const complete = report?.data.status === 'complete';
  return <div className="space-y-2">
    <div className="flex flex-wrap items-center gap-3">
      {!complete && <button type="button" className={primary} disabled={disabled || busy || (!report && businessCount === 0)} onClick={() => setConfirming(true)}><Search size={15} />{busy ? 'Researching…' : report ? 'Resume research' : businessIndex === undefined ? 'Research this list' : 'Research business'}</button>}
      {report && !busy && <button type="button" className={secondary} onClick={() => onOpenReport(report)}>View saved research</button>}
    </div>
    <p className="text-xs text-text-secondary">Find social links from business websites and retrieve available public posts. Research may take several minutes.</p>
    {confirming && !busy && <div className="space-y-2 rounded-xl border border-border-control bg-surface p-4 text-sm"><p>Research up to {report ? report.data.businesses.length - progress : businessCount} businesses. Estimated Virlo usage is up to ${((report ? report.data.businesses.length - progress : businessCount) * 0.08).toFixed(2)} in total (up to $0.08 per business); website and AI providers may also incur usage. Actual charges and channel availability may vary.</p><div className="flex gap-2"><button type="button" className={primary} onClick={() => { setConfirming(false); void run(); }}>Start research</button><button type="button" className={secondary} onClick={() => setConfirming(false)}>Cancel</button></div></div>}
    {report && <p role="status" className="text-sm text-text-secondary">{complete ? 'Research complete' : 'Research in progress'} · {progress} of {report.data.businesses.length} businesses checked{!complete && !busy ? ' · resume to continue' : ''}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error} Check saved research before retrying.</p>}
    {error && report && failedIndex !== null && !busy && <div className="space-y-2 rounded-xl border border-border-control bg-surface p-4 text-sm"><p>Research for {report.data.businesses[failedIndex]?.name || 'this business'} may be incomplete, and provider charges may still apply. You can skip it and continue with the remaining businesses.</p>{confirmSkip ? <div className="flex gap-2"><button type="button" className={primary} onClick={() => void skip()}>Confirm skip</button><button type="button" className={secondary} onClick={() => setConfirmSkip(false)}>Cancel</button></div> : <button type="button" className={secondary} onClick={() => setConfirmSkip(true)}>Skip this business</button>}</div>}
  </div>;
}

function publicThumbnail(value: unknown): string | undefined {
  try { const url = new URL(typeof value === 'string' ? value : ''); if (url.protocol === 'https:' && url.hostname === 'auth.virlo.ai' && !url.username && !url.password && !url.port && url.pathname.startsWith('/storage/v1/object/public/')) return url.href; } catch { /* Untrusted image URL. */ }
}

/** Construct embed URLs only from supported public post URLs. */
function embedPost(value: unknown): string | undefined {
  const source = socialUrl(value); if (!source) return;
  const url = new URL(source), host = url.hostname.toLowerCase();
  if (['instagram.com', 'www.instagram.com'].includes(host)) { const match = url.pathname.match(/^\/(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/); if (match) return `https://www.instagram.com/${match[1] === 'reels' ? 'reel' : match[1]}/${match[2]}/embed/`; }
  if (['tiktok.com', 'www.tiktok.com'].includes(host)) { const match = url.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/); if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`; }
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(host)) { const id = host === 'youtu.be' ? url.pathname.slice(1) : url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)\/?$/)?.[1] || (url.pathname === '/watch' ? url.searchParams.get('v') : null); if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return `https://www.youtube.com/embed/${id}`; }
}

/** A chronological snapshot. Missing posts or metadata are never treated as evidence of inactivity. */
export function ListResearchReport({ data, initialBusiness, activeIndex }: { data: unknown; initialBusiness?: string; activeIndex?: number | null }) {
  const report = data && typeof data === 'object' && !Array.isArray(data) ? data as Partial<ListResearchData> : {};
  const businesses = Array.isArray(report.businesses) ? report.businesses : [];
  const initialIndex = initialBusiness?.startsWith('index:') ? Number(initialBusiness.slice(6)) : initialBusiness ? businesses.findIndex(item => item.name === initialBusiness) : -1;
  const [business, setBusiness] = useState(initialIndex >= 0 ? String(initialIndex) : 'all');
  const [excluded, setExcluded] = useState<number[]>([]);
  const [platform, setPlatform] = useState('all');
  const [dateRange, setDateRange] = useState<ResearchDateRange>('all');
  const platforms = [...new Set(businesses.flatMap(item => (Array.isArray(item.profiles) ? item.profiles : []).map(profile => profile.platform)).filter(Boolean))];
  const visible = businesses.map((item, index) => ({ item, index })).filter(({ index }) => !excluded.includes(index) && (business === 'all' || business === String(index)));
  const posts = visible.flatMap(({ item, index }) => (Array.isArray(item.profiles) ? item.profiles : []).filter(profile => platform === 'all' || profile.platform === platform).flatMap(profile => (Array.isArray(profile.posts) ? profile.posts : []).filter(post => matchesResearchDate(post.published_at, dateRange)).map(post => ({ post, profile, business: item, businessIndex: index }))));
  // ECMAScript sort is stable, retaining provider order when dates are absent or equal.
  const dateValue = (value: string | undefined) => { const date = value ? Date.parse(value) : NaN; return Number.isFinite(date) ? date : -Infinity; };
  posts.sort((a, b) => dateValue(b.post.published_at) - dateValue(a.post.published_at));
  return <section aria-label="List social research" className="space-y-5">
    <div><h3 className="text-xl font-semibold text-ink">{report.list_name || 'List research'}</h3><p className="mt-1 text-sm text-text-secondary">{report.status === 'complete' ? 'Research complete' : 'Research in progress'}{report.checked_at ? ` · checked ${new Date(report.checked_at).toLocaleDateString('en-GB')}` : ''} · Public data; review the linked profiles before relying on a match.</p></div>
    {activeIndex !== null && activeIndex !== undefined && businesses[activeIndex] && <p role="status" className="flex items-center gap-2 text-sm text-text-secondary"><LoaderCircle size={16} className="animate-spin motion-reduce:animate-none" />Researching {businesses[activeIndex]?.name}…</p>}
    <div className="space-y-2"><p className="text-xs font-semibold text-text-secondary">BUSINESS</p><div className="flex flex-wrap gap-2"><button type="button" aria-pressed={business === 'all'} className={pill(business === 'all')} onClick={() => setBusiness('all')}>All businesses</button>{businesses.map((item, index) => <button key={index} type="button" aria-pressed={business === String(index)} className={pill(business === String(index))} onClick={() => { setExcluded(previous => previous.filter(i => i !== index)); setBusiness(String(index)); }}>{index === activeIndex && <LoaderCircle aria-hidden="true" size={14} className="mr-1 inline animate-spin motion-reduce:animate-none" />}{item.name}</button>)}</div></div>
    {businesses.length > 1 && <details className="rounded-xl border border-border-control bg-surface p-3"><summary className="cursor-pointer text-sm font-medium">Filter businesses{excluded.length ? ` · ${excluded.length} hidden` : ''}</summary><div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">{businesses.map((item, index) => <label key={index} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!excluded.includes(index)} onChange={event => setExcluded(previous => event.target.checked ? previous.filter(i => i !== index) : [...previous, index])} /> {item.name}</label>)}</div></details>}
    {platforms.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-text-secondary">CHANNEL</p><div className="flex flex-wrap gap-2"><button type="button" aria-pressed={platform === 'all'} className={pill(platform === 'all')} onClick={() => setPlatform('all')}>All channels</button>{platforms.map(item => <button key={item} type="button" aria-pressed={platform === item} className={`${pill(platform === item)} capitalize`} onClick={() => setPlatform(item)}>{item}</button>)}</div></div>}
    <ResearchDatePills value={dateRange} onChange={setDateRange} />
    <div><h4 className="text-lg font-semibold text-ink">Recent posts</h4><p className="text-xs text-text-secondary">Newest first · posts without a date appear under All time</p></div>
    {posts.length ? <ul aria-label="Social post gallery" className={researchGalleryGrid}>{posts.map(({ post, profile, business: item }, index) => {
      const source = socialUrl(post.url), embed = embedPost(post.url), thumbnail = publicThumbnail(post.thumbnail_url);
      return <li key={`${post.url}-${index}`}><ResearchPostCard title={item.name} subtitle={`${profile.platform} · ${profile.handle}`} caption={post.caption} date={post.published_at} metrics={[typeof post.views === 'number' ? `${metric(post.views)} views` : '', typeof post.likes === 'number' ? `${metric(post.likes)} likes` : ''].filter(Boolean).join(' · ')} source={source} embed={embed} thumbnail={thumbnail} embedTitle={`${item.name} ${profile.platform} post`} /></li>;
    })}</ul> : <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">No public posts are available for these filters.</p>}
    <details className="rounded-xl border border-border-control bg-surface p-4"><summary className="cursor-pointer text-sm font-semibold">Profiles and research status</summary><div className="mt-4 space-y-4">{visible.map(({ item, index }) => {
      const profiles = (Array.isArray(item.profiles) ? item.profiles : []).filter(profile => platform === 'all' || profile.platform === platform);
      return <article key={index} className="space-y-2"><h4 className="font-semibold text-ink">{item.name}</h4>{item.status === 'pending' ? <p className="text-sm text-text-secondary">Waiting to be researched.</p> : !profiles.length ? <p className="text-sm text-text-secondary">No matching profiles were found or available.</p> : profiles.map((profile, i) => { const link = socialUrl(profile.url); return <div key={i} className="text-sm"><span className="capitalize">{profile.platform} · </span>{link ? <a className="underline" href={link} target="_blank" rel="noopener noreferrer">{profile.handle || 'Open profile'}</a> : <span>{profile.handle}</span>} <span className="text-xs text-text-secondary">{profile.source === 'website' ? 'Linked from business website' : 'AI-suggested match · verify ownership'}</span>{profile.warning && <p className="text-xs text-text-secondary">{profile.warning}</p>}</div>; })}{Array.isArray(item.warnings) && item.warnings.map((warning, i) => <p key={i} className="text-xs text-text-secondary">{warning}</p>)}</article>;
    })}</div></details>
    {!businesses.length && <p className="text-sm text-text-secondary">This report contains no businesses.</p>}
  </section>;
}
