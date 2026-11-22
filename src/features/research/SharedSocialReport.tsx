import { useState } from "react";
import { ArrowUpRight, Check, Copy, ImageIcon, Loader2, Play, ScanEye } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { ResearchPost, ResearchRun } from "@/lib/research";

export type VisualReport = {
  status: "pending" | "ready" | "partial" | "unavailable";
  progress?: string;
  updated_at?: string;
  client_posts?: ResearchPost[];
  competitors: { id: string; name: string; url: string; reason: string; posts: ResearchPost[]; manual?: boolean; error?: string }[];
  examples: { post_id: string; style: string; relevance: string; on_camera: "yes" | "no" | "optional" | "unknown"; production: "existing-assets" | "original-footage" | "mixed" | "unknown" }[];
  comparisons: { client_post_id: string; competitor_post_id: string; caption: string }[];
  styles: { name: string; post_ids: string[]; caption?: string }[];
  directions: { title: string; caption: string; post_ids: string[] }[];
  errors?: string[];
};
type Trend = { title: string; explanation: string; source_url: string; source_label: string; observed_at?: string };
type Props = { run: ResearchRun; visual?: VisualReport; trends?: Trend[]; niche?: string; checkedAt?: string; trendStatus?: "pending" | "ready" | "unavailable"; briefStatus?: "pending" | "ready" | "unavailable" };
type Media = { post: ResearchPost; company: string };

function safeUrl(value?: string | null) {
  try { const url = new URL(value || ""); return url.protocol === "https:" && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}
function short(value: string | undefined, limit = 140) {
  const text = (value || "").replace(/\b(?:instagram|facebook|tiktok):[\w-]+\b/g, "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const end = text.slice(0, limit).lastIndexOf(" ");
  return `${text.slice(0, end > 30 ? end : limit).replace(/[.,;: ]+$/, "")}…`;
}
function date(value?: string | null) {
  return value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) : "Date unavailable";
}
/** Load only canonical, official platform players, and only after a click. */
function embedUrl(post: ResearchPost) {
  try {
    const url = new URL(post.url);
    if (url.protocol !== "https:") return undefined;
    if (["instagram.com", "www.instagram.com"].includes(url.hostname)) {
      const match = url.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/);
      if (match) return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
    }
    if (["tiktok.com", "www.tiktok.com"].includes(url.hostname)) {
      const match = url.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/);
      if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`;
    }
  } catch { /* Unsupported sources keep their original link. */ }
  return undefined;
}
function Cover({ post }: { post: ResearchPost }) {
  const [failed, setFailed] = useState(false);
  const src = safeUrl(post.thumbnail_url);
  return src && !failed ? <img src={src} alt="Original social post cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : <div className="flex h-full flex-col items-center justify-center gap-3 bg-surface-subtle text-text-muted"><ImageIcon size={32} strokeWidth={1} /><span className="text-xs">Preview unavailable</span></div>;
}
function SectionTitle({ number, title, caption }: { number: string; title: string; caption?: string }) {
  return <div className="mb-5 flex items-end justify-between gap-5"><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted">{number} / Social Lens</p><h2 className="font-display text-2xl font-bold tracking-tight md:text-3xl">{title}</h2></div>{caption && <p className="hidden max-w-xs text-right text-xs leading-5 text-text-secondary sm:block">{caption}</p>}</div>;
}
function MediaCard({ media, label, caption, compact = false, onPlay }: { media: Media; label?: string; caption?: string; compact?: boolean; onPlay: (media: Media) => void }) {
  const { post, company } = media;
  const playable = post.media_type === "video" && !!embedUrl(post);
  const source = safeUrl(post.url);
  const cover = <><Cover post={post} /><div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3"><span className="max-w-[80%] rounded-full bg-surface/95 px-3 py-1.5 text-[10px] font-semibold text-ink">{short(label || (post.media_type === "video" ? "Video" : post.media_type === "carousel" ? "Carousel" : "Post"), 50)}</span><span className="rounded-full bg-surface/95 p-2 text-ink"><ArrowUpRight size={12} /></span></div>{post.media_type === "video" && <span className="absolute inset-0 flex items-center justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-full border border-inverse/40 bg-ink/70 text-inverse backdrop-blur-sm"><Play size={21} fill="currentColor" className="ml-1" /></span></span>}<span className="absolute bottom-3 left-3 rounded-full bg-ink/80 px-3 py-1.5 text-[10px] font-medium text-inverse">{playable ? "Play platform preview" : post.media_type === "video" ? "Watch original ↗" : "View original ↗"}</span></>;
  const mediaClass = `group relative block w-full overflow-hidden bg-surface-subtle text-left ${compact ? "aspect-[4/3]" : "aspect-[4/5]"}`;
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
    {playable ? <button type="button" onClick={() => onPlay(media)} className={`${mediaClass} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`} aria-label={`Play ${company} video preview`}>{cover}</button> : <a href={source} target="_blank" rel="noopener noreferrer" className={mediaClass} aria-label={`Open ${company} original post`}>{cover}</a>}
    <div className="p-4"><div className="flex items-center justify-between gap-3"><p className="truncate text-xs font-bold">{company}</p><a href={source} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[10px] text-text-secondary underline underline-offset-4">Original ↗</a></div><p className="mt-1 text-[10px] text-text-muted">{date(post.published_at)} · {post.platform}</p>{caption && <p className="mt-3 text-xs leading-5 text-text-secondary">{short(caption, 170)}</p>}<p className="mt-2 text-[9px] text-text-muted">AI evidence: {post.review_basis === "frames" ? "sampled frames" : post.review_basis === "thumbnail" ? "cover + caption" : "caption only"}</p></div>
  </article>;
}
function Playback({ media, onClose }: { media: Media; onClose: () => void }) {
  const [failed, setFailed] = useState(false);
  const embed = embedUrl(media.post);
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="flex max-h-[94dvh] w-[calc(100%-1.5rem)] max-w-md flex-col gap-0 overflow-hidden rounded-2xl bg-surface p-0 text-ink"><DialogTitle className="truncate border-b border-border px-4 py-4 pr-12 text-sm">{media.company}</DialogTitle><DialogDescription className="sr-only">Original platform preview. If playback is restricted, use the original source link.</DialogDescription><div className="min-h-0 flex-1 overflow-y-auto bg-surface-subtle">{embed && !failed ? <iframe src={embed} title={`${media.company} original platform preview`} className="h-[65dvh] min-h-80 w-full border-0" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowFullScreen referrerPolicy="no-referrer" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" onError={() => setFailed(true)} /> : <div className="p-10 text-center text-sm text-text-secondary">This preview cannot play here.</div>}</div><div className="border-t border-border p-4"><a href={safeUrl(media.post.url)} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-3 text-xs font-semibold text-inverse">Watch on {media.post.platform}<ArrowUpRight size={14} /></a><p className="mt-2 text-center text-[10px] leading-4 text-text-muted">If the platform limits playback, use the original link.</p></div></DialogContent></Dialog>;
}

/** Receives only the selected public share snapshot, never the private client question. */
export function SharedSocialReport({ run, visual, trends = [], niche, checkedAt }: Props) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const [active, setActive] = useState<Media | null>(null);
  const [style, setStyle] = useState("all");
  const [competitorInputOpen, setCompetitorInputOpen] = useState(false);
  const [competitorInput, setCompetitorInput] = useState("");
  const [requestCopied, setRequestCopied] = useState(false);
  const [requestError, setRequestError] = useState("");
  const competitorLines = competitorInput.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const validateCompetitors = () => {
    if (!competitorLines.length || competitorLines.length > 3) { setRequestError("Add up to three competitors, one per line."); return false; }
    if (competitorLines.some((line) => line.length > 500 || !(/^(?:(?:instagram|tiktok|facebook)\s*:\s*)?@[A-Za-z0-9._]{2,30}$/i.test(line) || /^(?:https:\/\/)?[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:[/?#].*)?$/.test(line)))) { setRequestError("Use a website, social profile link, or @handle. Add a platform before non-Instagram handles."); return false; }
    setRequestError(""); return true;
  };
  const brand = run.targets[0]?.display_name || (run.query.match(/^https?:\/\//i) ? `@${run.targets[0]?.handle || "Your business"}` : run.query);
  const ownPosts = visual?.client_posts || run.posts;
  const competitors = visual?.competitors || [];
  const all: Media[] = [...ownPosts.map((post) => ({ post, company: brand })), ...competitors.flatMap((company) => company.posts.map((post) => ({ post, company: company.name })))];
  const find = (id: string) => all.find((item) => item.post.id === id);
  const detail = (id: string) => visual?.examples.find((item) => item.post_id === id);
  const comparisons = (visual?.comparisons || []).flatMap((item) => { const own = ownPosts.find((post) => post.id === item.client_post_id); const other = find(item.competitor_post_id); return own && other ? [{ ...item, own: { post: own, company: brand }, other }] : []; }).slice(0, 3);
  const styles = (visual?.styles || []).filter((item) => item.post_ids.some((id) => !!find(id)));
  const styleLabel = (name: string) => {
    if (name === "all") return "All styles";
    const accounts = new Set((styles.find((item) => item.name === name)?.post_ids || []).map((id) => find(id)?.company).filter(Boolean)).size;
    return `${name} · ${accounts > 1 ? `${accounts} businesses` : "one account"}`;
  };
  const activeStyle = styles.some((item) => item.name === style) ? style : "all";
  const galleryIds = activeStyle === "all" ? [...new Set(styles.flatMap((item) => item.post_ids))] : styles.find((item) => item.name === activeStyle)?.post_ids || [];
  const directions = (visual?.directions || []).map((item) => ({ ...item, media: item.post_ids.map(find).filter((item): item is Media => !!item).slice(0, 2) })).filter((item) => item.media.length).slice(0, 3);
  const pending = visual?.status === "pending";
  const renderCard = (media: Media, compact = false) => <MediaCard key={`${media.company}-${media.post.id}`} media={media} label={detail(media.post.id)?.style} caption={detail(media.post.id)?.relevance} compact={compact} onPlay={setActive} />;
  return <div className="min-h-dvh bg-canvas text-ink">
    <header className="border-b border-border bg-surface"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 md:px-8"><Logo size={27} /><div className="flex items-center gap-4"><span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-text-muted sm:block">Social Lens / Visual report</span><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(window.location.href); setCopied(true); setCopyError(false); } catch { setCopyError(true); } }} className="inline-flex items-center gap-2 rounded-full border border-border-control px-4 py-2 text-xs font-semibold hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{copied ? <Check size={13} /> : <Copy size={13} />}{copied ? "Link copied" : "Copy link"}</button></div></div>{copyError && <p role="status" className="mx-auto max-w-7xl px-5 pb-3 text-xs text-text-secondary">Copy the link from your browser’s address bar.</p>}</header>
    <main className="mx-auto max-w-7xl px-5 pb-12 pt-10 md:px-8 md:pt-14">
      <section className="mb-10 flex flex-wrap items-end justify-between gap-6 border-b border-border pb-8"><div className="max-w-3xl"><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-text-muted"><ScanEye size={14} /> A look around your social world</p><h1 className="mt-4 break-words font-display text-3xl font-bold leading-tight tracking-tight md:text-5xl">{brand}</h1><p className="mt-3 font-editorial text-xl italic text-text-secondary md:text-2xl">Your content. Similar businesses. New possibilities.</p></div><div className="text-xs leading-6 text-text-secondary"><p>{ownPosts.length} of your posts · {competitors.length} comparable businesses</p><p>Snapshot {date(visual?.updated_at || run.updated_at)}</p></div></section>

      <section className="mb-12" aria-label="Your socials today"><SectionTitle number="01" title="Your socials today" caption="A quick look at your recent public content." /><div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-5">{ownPosts.slice(0, 4).map((post) => renderCard({ post, company: brand }))}</div>{ownPosts.length > 4 && <details className="mt-4"><summary className="cursor-pointer text-xs font-semibold text-text-secondary">See more of your posts</summary><div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-5">{ownPosts.slice(4).map((post) => renderCard({ post, company: brand }, true))}</div></details>}</section>

      {pending && <div role="status" className="mb-10 flex items-center gap-3 rounded-2xl border border-border bg-surface p-5"><Loader2 size={18} className="shrink-0 animate-spin text-brand-purple" /><div><p className="text-sm font-semibold">Finding your visual landscape</p><p className="mt-1 text-xs text-text-secondary">{visual?.progress || "Matching similar businesses and collecting real examples…"}</p></div></div>}

      <section className="mb-12" aria-label="Comparable businesses"><SectionTitle number="02" title="Businesses like yours" caption="Comparable companies, with the reason each belongs here." />
        <div className="mb-5 rounded-2xl border border-border bg-surface p-4 md:p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold">Know a business we should compare?</p><p className="mt-1 text-xs text-text-secondary">Paste its website, social profile, or @handle.</p></div><button type="button" className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-inverse" onClick={() => setCompetitorInputOpen((open) => !open)} aria-expanded={competitorInputOpen}>Add competitors</button></div>
          {competitorInputOpen && <div className="mt-4 border-t border-border pt-4"><label htmlFor="shared-competitors" className="text-xs font-semibold">Competitors to include</label><textarea id="shared-competitors" rows={3} maxLength={1500} value={competitorInput} onChange={(event) => { setCompetitorInput(event.target.value); setRequestError(""); setRequestCopied(false); }} placeholder="@localagent\ntiktok:@anotheragent\nhttps://example.co.uk" className="mt-2 w-full resize-y rounded-xl border border-border-control bg-canvas p-3 text-sm text-ink" /><p className="mt-2 text-xs text-text-secondary">Copy these suggestions and send them to the agency that shared this report. They can update the report in Social Lens.</p>{requestError && <p role="alert" className="mt-2 text-xs text-destructive">{requestError}</p>}<div className="mt-3 flex flex-wrap gap-2"><button type="button" className="rounded-full bg-ink px-4 py-2 text-xs font-semibold text-inverse" onClick={async () => { if (!validateCompetitors()) return; try { await navigator.clipboard.writeText(`Social Lens report: ${window.location.href}\nSuggested competitors:\n${competitorLines.join("\n")}`); setRequestCopied(true); } catch { setRequestError("Could not copy. Select the suggestions and send them to your agency."); } }}>{requestCopied ? "Suggestions copied" : "Copy suggestions"}</button></div></div>}
        </div>
        {competitors.length ? <div className="grid gap-6 md:grid-cols-2">{competitors.map((company) => <article key={company.id} className="rounded-3xl border border-border bg-surface p-4 md:p-5"><div className="mb-4 flex items-start justify-between gap-4"><div><h3 className="font-display text-xl font-bold">{company.name}</h3><p className="mt-1 max-w-xl text-xs leading-5 text-text-secondary">{short(company.reason, 190)}</p></div><a href={safeUrl(company.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${company.name}`} className="rounded-full border border-border p-2"><ArrowUpRight size={15} /></a></div>{company.posts.length ? <div className="grid grid-cols-2 gap-3">{company.posts.slice(0, 2).map((post) => renderCard({ post, company: company.name }))}</div> : <p className="rounded-xl bg-canvas p-5 text-xs text-text-secondary">{company.error || "Public post previews were unavailable for this account."}</p>}</article>)}</div> : <p className="rounded-2xl border border-border bg-surface p-6 text-sm text-text-secondary">{pending ? "Comparable accounts will appear here as research completes." : "Comparable public content could not be retrieved. Your agency can update the competitor selection and regenerate this report."}</p>}</section>

      {comparisons.length > 0 && <section className="mb-12" aria-label="Side-by-side comparisons"><SectionTitle number="03" title="See the difference" caption="Similar subjects, different ways to present them." /><div className="space-y-6">{comparisons.map((item, index) => <article key={`${item.client_post_id}-${item.competitor_post_id}`} className="rounded-3xl border border-border bg-surface p-4 md:p-6"><div className="mb-4 flex items-center gap-3"><span className="font-editorial text-2xl italic text-brand-purple">0{index + 1}</span><p className="text-sm font-medium leading-6">{short(item.caption, 200)}</p></div><div className="grid grid-cols-2 gap-3 md:gap-5"><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">Your content</p>{renderCard(item.own, true)}</div><div><p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">A comparable example</p>{renderCard(item.other, true)}</div></div></article>)}</div></section>}

      {styles.length > 0 && <section className="mb-12" aria-label="Industry style gallery"><SectionTitle number="04" title="Explore the styles" caption={niche ? `Real examples from ${niche}.` : "Browse the approaches found in this research."} /><div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filter content styles">{["all", ...styles.map((item) => item.name)].map((name) => <button key={name} type="button" aria-pressed={activeStyle === name} onClick={() => setStyle(name)} className={`rounded-full border px-4 py-2 text-xs font-medium ${activeStyle === name ? "border-ink bg-ink text-inverse" : "border-border-control bg-surface text-text-secondary hover:text-ink"}`}>{styleLabel(name)}</button>)}</div><div className="grid grid-cols-2 gap-3 lg:grid-cols-4 md:gap-5">{galleryIds.slice(0, 12).map((id) => { const media = find(id); const example = detail(id); return media ? <div key={id}>{renderCard(media)}<div className="mt-2 flex flex-wrap gap-1.5 text-[9px] text-text-secondary">{example?.on_camera && <span className="rounded-full bg-surface-subtle px-2 py-1">{({ yes: "Person on camera", no: "No face needed", optional: "Person optional", unknown: "Camera needs unconfirmed" })[example.on_camera]}</span>}{example?.production && <span className="rounded-full bg-surface-subtle px-2 py-1">{({ "existing-assets": "Existing photos / assets", "original-footage": "Original footage", mixed: "Photos + footage", unknown: "Assets unconfirmed" })[example.production]}</span>}</div></div> : null; })}</div><p className="mt-4 text-[10px] leading-5 text-text-muted">Style labels describe these examples. Repeated use across accounts does not establish popularity or results.</p></section>}

      {directions.length > 0 && <section className="mb-12" aria-label="Visual directions to explore"><SectionTitle number="05" title="What could suit you?" caption="Three directions to react to. Point to the one you like." /><div className="grid gap-5 md:grid-cols-3">{directions.map((item, index) => <article key={item.title} className="overflow-hidden rounded-3xl border border-border bg-surface"><div className="p-5"><p className="text-[10px] font-semibold uppercase tracking-widest text-brand-purple">Direction 0{index + 1}</p><h3 className="mt-2 font-display text-xl font-bold">{short(item.title, 85)}</h3><p className="mt-2 text-xs leading-5 text-text-secondary">{short(item.caption, 180)}</p></div><div className={`grid gap-2 px-3 pb-3 ${item.media.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>{item.media.map((media) => renderCard(media, true))}</div></article>)}</div></section>}

      <details className="rounded-2xl border border-border bg-surface p-5 text-xs text-text-secondary"><summary className="cursor-pointer font-semibold text-ink">Sources and how to read this report</summary><div className="mt-4 grid gap-4 leading-6 md:grid-cols-2"><p>These are real public posts, attributed to their original companies. Each card shows its publication date and original link. Platform playback can be restricted; use “Watch original” when a preview cannot play.</p><p>Style suggestions use available captions, covers and any explicitly reviewed frames. They do not establish full video pacing, audio, sales or return on investment. {all.some((item) => item.post.review_basis === "frames") ? "Selected frames were available for some posts." : "No video footage was reviewed."}</p></div>{visual?.errors?.length ? <p className="mt-3 border-t border-border pt-3">Some sources were unavailable: {visual.errors.map((error) => short(error, 180)).join(" · ")}</p> : null}{run.analysis && <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer font-medium text-ink">Account assessment</summary><p className="mt-2 leading-6">{run.analysis.summary}</p></details>}{trends.length > 0 && <details className="mt-4 border-t border-border pt-3"><summary className="cursor-pointer font-medium text-ink">Further reading{checkedAt ? ` · checked ${date(checkedAt)}` : ""}</summary><ul className="mt-2 space-y-2">{trends.filter((item) => safeUrl(item.source_url)).map((item) => <li key={item.source_url}><a href={safeUrl(item.source_url)} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{item.source_label} ↗</a>{item.observed_at ? ` · ${date(item.observed_at)}` : ""}</li>)}</ul></details>}</details>
    </main>
    <footer className="border-t border-border px-5 py-6"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-[10px] text-text-muted"><span>Curated with AutoSocials · Social Lens</span><span>Public content · {date(visual?.updated_at || run.updated_at)}</span></div></footer>
    {active && <Playback media={active} onClose={() => setActive(null)} />}
  </div>;
}
