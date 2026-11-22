import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

export const researchGalleryGrid = 'grid grid-cols-1 items-start gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export function ResearchPostCard({ title, subtitle, caption, date, metrics, source, embed, thumbnail, embedTitle }: {
  title: string; subtitle: string; caption?: string; date?: string | null; metrics: string; source?: string; embed?: string; thumbnail?: string; embedTitle: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = thumbnail && !imageFailed ? thumbnail : undefined;
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
    <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-3"><span className="truncate text-sm font-semibold text-ink">{title}</span><span className="shrink-0 text-xs capitalize text-text-secondary">{subtitle}</span></div>
    <div className="relative aspect-[4/5] overflow-hidden bg-surface-subtle">
      {image ? <img src={image} alt={`${title} social post`} loading="lazy" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="h-full w-full object-cover" /> : embed ? <iframe src={embed} title={embedTitle} loading="lazy" referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; web-share" allowFullScreen className="absolute inset-0 h-full w-full border-0" /> : <div className="flex h-full items-center justify-center p-4 text-center text-sm text-text-secondary">Post preview unavailable</div>}
    </div>
    <div className="space-y-2 p-3"><p className="line-clamp-3 min-h-[3.75rem] break-words text-sm leading-5 text-ink">{caption || 'Post details unavailable'}</p><p className="text-xs text-text-secondary">{metrics}</p><p className="text-xs text-text-secondary">{date ? date.slice(0, 10) : 'Date unavailable'}</p><div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <Dialog><DialogTrigger asChild><button type="button" className="font-semibold text-ink underline underline-offset-4">View larger</button></DialogTrigger><DialogContent className="max-w-3xl"><DialogTitle className="pr-8">{title} · {subtitle}</DialogTitle><DialogDescription>Post preview. If the platform cannot display it here, use Open post.</DialogDescription><div className="mx-auto flex max-h-[65dvh] w-full items-center justify-center overflow-hidden rounded-xl bg-surface-subtle">{embed ? <iframe src={embed} title={`Larger ${embedTitle}`} referrerPolicy="strict-origin-when-cross-origin" allow="encrypted-media; picture-in-picture; web-share" allowFullScreen className="h-[60dvh] w-full max-w-xl border-0" /> : image ? <img src={image} alt={`${title} social post`} referrerPolicy="no-referrer" className="max-h-[65dvh] w-auto object-contain" /> : <p className="p-8 text-sm text-text-secondary">Preview unavailable.</p>}</div><p className="whitespace-pre-wrap break-words text-sm">{caption || 'Post details unavailable'}</p>{source && <a href={source} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold underline underline-offset-4">Open post ↗</a>}</DialogContent></Dialog>
      {source && <a href={source} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline underline-offset-4">Open post ↗</a>}
    </div></div>
  </article>;
}
