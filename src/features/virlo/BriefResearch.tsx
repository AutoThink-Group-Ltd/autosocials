import { useEffect, useState, type FormEvent } from "react";
import { ResearchPostCard, researchGalleryGrid } from "./ResearchPostCard";
import { useQueryClient } from "@tanstack/react-query";
import { matchesResearchDate, ResearchDatePills, type ResearchDateRange } from "./ResearchDateFilter";
import {
  discardBriefResearch,
  runBriefResearch,
  saveBriefList,
} from "@/lib/brief-research.functions";
import {
  getVirloResearchResult,
  saveVirloResearch,
} from "@/lib/virlo.functions";
import {
  acquirePendingRequest,
  completePendingRequest,
} from "./pendingRequest";

type BriefData = {
  summary: string;
  summary_sources?: { title: string; url: string }[];
  lists: {
    title: string;
    description: string;
    items: {
      title: string;
      detail: string;
      sources: { title: string; url: string }[];
    }[];
  }[];
  limitations: string[];
  checked_at: string;
};
type GalleryPost = { url: string; platform: "tiktok" | "instagram"; caption: string; handle: string; published_at: string | null; views: number | null; likes: number | null; comments: number | null; thumbnail_url?: string };
type GalleryData = { mode: "gallery"; checked_at: string; groups: { title: string; posts: GalleryPost[] }[]; warnings: string[] };
type BriefResult = { id: string; title: string; data: BriefData | GalleryData };
const primary =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-ink px-4 text-sm font-semibold text-inverse disabled:opacity-50";
const secondary =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-border-control bg-surface px-4 text-sm font-semibold text-ink disabled:opacity-50";

function safeUrl(value: unknown): string | undefined {
  try {
    const url = new URL(typeof value === "string" ? value : "");
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port
    )
      return url.href;
  } catch {
    /* Invalid sources stay unlinked. */
  }
  return undefined;
}

function socialUrl(value: unknown, platform: GalleryPost["platform"]): string | undefined {
  const href = safeUrl(value);
  if (!href) return;
  const url = new URL(href), host = url.hostname.toLowerCase();
  const domain = `${platform}.com`;
  const path = platform === "tiktok" ? /^\/@[\w.-]+\/(video|photo)\/\d+\/?$/ : /^\/(p|reel|reels)\/[\w-]+\/?$/;
  return (host === domain || host.endsWith(`.${domain}`)) && path.test(url.pathname) ? href : undefined;
}
function embedUrl(source: string | undefined): string | undefined {
  if (!source) return;
  const url = new URL(source), host = url.hostname.toLowerCase();
  if (["instagram.com", "www.instagram.com"].includes(host)) {
    const match = url.pathname.match(/^\/(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/);
    if (match) return `https://www.instagram.com/${match[1] === "reels" ? "reel" : match[1]}/${match[2]}/embed/`;
  }
  if (["tiktok.com", "www.tiktok.com"].includes(host)) {
    const match = url.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/);
    if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`;
  }
  return undefined;
}
function PostCard({ post }: { post: GalleryPost }) {
  const source = socialUrl(post.url, post.platform), embed = embedUrl(source), image = safeUrl(post.thumbnail_url);
  const imageUrl = image ? new URL(image) : undefined;
  const thumbnail = imageUrl && ((imageUrl.hostname === "auth.virlo.ai" && imageUrl.pathname.startsWith("/storage/v1/object/public/")) || /(^|\.)(cdninstagram\.com|fbcdn\.net|tiktokcdn\.com|tiktokcdn-us\.com|byteoversea\.com|ibytedtos\.com)$/.test(imageUrl.hostname)) ? image : undefined;
  const metric = (value: number | null) => typeof value === "number" && Number.isFinite(value) ? new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value) : "—";
  return <ResearchPostCard title={post.handle ? (post.handle.startsWith("@") ? post.handle : `@${post.handle}`) : "Creator"} subtitle={post.platform} caption={post.caption} date={post.published_at} metrics={`${metric(post.views)} views · ${metric(post.likes)} likes · ${metric(post.comments)} comments`} source={source} embed={embed} thumbnail={thumbnail} embedTitle={`${post.platform} post by ${post.handle || "creator"}`} />;
}
export function BriefResearchGallery({ data, onSaveList }: { data: GalleryData; onSaveList?: (index: number) => void }) {
  const [platform, setPlatform] = useState<"all" | "tiktok" | "instagram">("all");
  const [dateRange, setDateRange] = useState<ResearchDateRange>("all");
  const groups = Array.isArray(data.groups) ? data.groups : [];
  const [expanded, setExpanded] = useState<number[]>([]);
  return <div className="min-w-0 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-text-secondary">Public posts · checked {data.checked_at ? new Date(data.checked_at).toLocaleString("en-GB") : "recently"}</p><div className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-1" aria-label="Filter posts by platform">{([ ["all", "All"], ["tiktok", "TikTok"], ["instagram", "Instagram"] ] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={platform === value} onClick={() => setPlatform(value)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${platform === value ? "bg-ink text-inverse" : "text-text-secondary"}`}>{label}</button>)}</div></div>
    <ResearchDatePills value={dateRange} onChange={setDateRange} />
    {groups.length ? groups.map((group, index) => { const posts = (Array.isArray(group.posts) ? group.posts : []).filter(post => (platform === "all" || post.platform === platform) && matchesResearchDate(post.published_at, dateRange)); return <section key={`${group.title}-${index}`} className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="min-w-0"><h3 className="break-words text-lg font-semibold text-ink">{group.title}</h3><p className="text-xs text-text-secondary">{posts.length} {posts.length === 1 ? "post" : "posts"}</p></div>{onSaveList && <button type="button" className={secondary} onClick={() => onSaveList(index)}>Save topic</button>}</div>{posts.length ? <div className={researchGalleryGrid}>{(expanded.includes(index) ? posts : posts.slice(0, 8)).map((post, i) => <PostCard key={`${post.url}-${i}`} post={post} />)}</div> : <p className="rounded-xl border border-border p-4 text-sm text-text-secondary">No posts for this filter.</p>}{posts.length > 8 && <button type="button" className={secondary} onClick={() => setExpanded(current => current.includes(index) ? current.filter(i => i !== index) : [...current, index])}>{expanded.includes(index) ? "Show fewer" : `Show more (${posts.length - 8})`}</button>}</section>; }) : <p className="rounded-xl border border-border p-4 text-sm text-text-secondary">No matching posts were found for this brief.</p>}
    {Array.isArray(data.warnings) && data.warnings.length > 0 && <div className="rounded-xl bg-warning-surface p-4 text-sm text-warning"><p className="font-semibold">Research notes</p><ul className="mt-2 list-disc space-y-1 pl-5">{data.warnings.map((warning, index) => <li key={index} className="break-words">{warning}</li>)}</ul></div>}
  </div>;
}

export function BriefResearchReport({
  data,
  onSaveList,
}: {
  data: unknown;
  onSaveList?: (index: number) => void;
}) {
  if (data && typeof data === "object" && (data as { mode?: unknown }).mode === "gallery") return <BriefResearchGallery data={data as GalleryData} {...(onSaveList ? { onSaveList } : {})} />;
  const report = data as Partial<BriefData> | null;
  if (!report || typeof report !== "object")
    return (
      <p className="text-sm text-text-secondary">
        Research details are unavailable.
      </p>
    );
  return (
    <div className="space-y-5">
      {report.checked_at && (
        <p className="text-xs text-text-secondary">
          Checked {new Date(report.checked_at).toLocaleString("en-GB")}
        </p>
      )}
      {report.summary && (
        <section aria-label="Executive summary" className="space-y-2">
          <h3 className="font-semibold text-ink">Executive summary</h3>
          <p className="whitespace-pre-wrap text-sm leading-6 text-ink">{report.summary}</p>
          {Array.isArray(report.summary_sources) && <ul className="flex flex-wrap gap-3">{report.summary_sources.map((source, index) => {
            const href = safeUrl(source.url);
            return href ? <li key={index}><a href={href} target="_blank" rel="noopener noreferrer" className="text-xs text-text-secondary underline underline-offset-4">{source.title || "Open source"} ↗</a></li> : null;
          })}</ul>}
        </section>
      )}
      {Array.isArray(report.lists) &&
        report.lists.map((list, index) => (
          <section
            key={index}
            className="space-y-3 rounded-2xl border border-border bg-surface p-4"
          >
            <h3 className="font-semibold text-ink">{list.title}</h3>
            <p className="whitespace-pre-wrap text-sm text-text-secondary">
              {list.description}
            </p>
            {onSaveList && (
              <button
                type="button"
                className={secondary}
                onClick={() => onSaveList(index)}
              >
                Save this list
              </button>
            )}
            <ul className="space-y-3">
              {Array.isArray(list.items) &&
                list.items.map((item, i) => (
                  <li key={i} className="border-t border-border pt-3">
                    <h4 className="font-medium text-ink">{item.title}</h4>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">
                      {item.detail}
                    </p>
                    {Array.isArray(item.sources) && item.sources.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-3">
                        {item.sources.map((source, j) => {
                          const href = safeUrl(source.url);
                          return (
                            <li key={j} className="text-xs text-text-secondary">
                              {href ? (
                                <a
                                  className="underline underline-offset-4"
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  {source.title || "Open source"} ↗
                                </a>
                              ) : (
                                <span>
                                  {source.title || "Source unavailable"}
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      {Array.isArray(report.limitations) && report.limitations.length > 0 && (
        <section className="rounded-xl bg-warning-surface p-4 text-sm text-warning">
          <h3 className="font-semibold">Limitations</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {report.limitations.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function BriefResearch({ workspaceId }: { workspaceId: string }) {
  const [brief, setBrief] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<BriefResult | null>(null);
  const [briefExpanded, setBriefExpanded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [legacyId, setLegacyId] = useState("");
  const [legacyOpen, setLegacyOpen] = useState(false);
  const client = useQueryClient();
  const draftKey = `as:brief-gallery-result:${workspaceId}`;
  useEffect(() => {
    let cancelled = false;
    try { setLegacyId(sessionStorage.getItem(`as:brief-result:${workspaceId}`) || ""); } catch { /* Storage unavailable. */ }
    try {
      const id = sessionStorage.getItem(draftKey);
      if (id)
        void getVirloResearchResult({
          data: { workspace_id: workspaceId, result_id: id },
        })
          .then((found) => {
            if (!cancelled && found.kind === "brief_research")
              setResult(found as unknown as BriefResult);
          })
          .catch(() => {
            if (!cancelled)
              setError("The previous draft could not be recovered.");
          });
    } catch {
      /* Session storage may be unavailable. */
    }
    return () => {
      cancelled = true;
    };
  }, [draftKey, workspaceId]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (brief.trim() && !busy) setConfirming(true);
  };
  const run = async () => {
    setConfirming(false);
    setBusy(true);
    setError("");
    try {
      const text = brief.trim();
      const pending = await acquirePendingRequest(workspaceId, {
        type: "brief-research",
        brief: text,
      });
      const response = await runBriefResearch({
        data: {
          workspace_id: workspaceId,
          brief: text,
          request_id: pending.id,
          confirmed: true,
        },
      });
      completePendingRequest(pending);
      setResult(response as BriefResult);
      setBriefExpanded(false);
      setSaved(false);
      setLegacyOpen(false);
      try {
        sessionStorage.setItem(draftKey, response.id);
      } catch {
        /* Result remains visible in this session. */
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Research could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!result || saving) return;
    setSaving(true);
    setError("");
    try {
      await saveVirloResearch({
        data: {
          workspace_id: workspaceId,
          result_id: result.id,
          title: result.title,
        },
      });
      setSaved(true);
      try {
        sessionStorage.removeItem(legacyOpen ? `as:brief-result:${workspaceId}` : draftKey);
        if (legacyOpen) setLegacyId("");
      } catch {
        /* Saved on server. */
      }
      void client.invalidateQueries({ queryKey: ["virlo-saved", workspaceId] });
    } catch {
      setError("Could not save this research. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const saveList = async (index: number) => {
    if (!result || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await saveBriefList({
        data: {
          workspace_id: workspaceId,
          result_id: result.id,
          list_index: index,
        },
      });
      setNotice("Topic saved to this business’s research.");
      void client.invalidateQueries({ queryKey: ["virlo-saved", workspaceId] });
    } catch {
      setError("Could not save this topic. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  const discard = async () => {
    if (!result || saving) return;
    setSaving(true);
    setError("");
    try {
      if (!saved)
        await discardBriefResearch({
          data: { workspace_id: workspaceId, result_id: result.id },
        });
      try {
        sessionStorage.removeItem(legacyOpen ? `as:brief-result:${workspaceId}` : draftKey);
        if (legacyOpen) setLegacyId("");
      } catch {
        /* The draft is cleared on the server. */
      }
      setResult(null);
      setSaved(false);
      setLegacyOpen(false);
    } catch {
      setError("Could not discard this draft. Please try again.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="min-w-0 space-y-4">
      {result && <button type="button" className={secondary} aria-expanded={briefExpanded} aria-controls="research-brief-form" onClick={() => setBriefExpanded(open => !open)}>{briefExpanded ? "Hide brief" : "Show brief"}</button>}
      <div hidden={!!result && !briefExpanded}>
      <form
        id="research-brief-form"
        onSubmit={submit}
        className="space-y-3 rounded-2xl border border-border bg-surface p-4 sm:p-5"
      >
        <label className="block space-y-2 text-sm font-semibold text-ink">
          Your Prompt
          <textarea
            required
            maxLength={20000}
            rows={4}
            value={brief}
            onChange={(event) => {
              setBrief(event.target.value);
              setConfirming(false);
            }}
            className="w-full min-w-0 max-w-full resize-y rounded-xl border border-border-control bg-surface px-3 py-2.5 text-sm font-normal text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            placeholder="Paste your brief and describe the research you need…"
          />
        </label>
        <p className="text-xs leading-5 text-text-secondary">
          Discover public TikTok and Instagram posts organised by topic. Each run uses up to 12 Virlo searches (up to $0.12) and one OpenAI planning call. OpenAI usage may also incur costs, including if a request fails.
        </p>
        <button
          className={primary}
          type="submit"
          disabled={busy || !brief.trim() || (!!result && !saved)}
        >
          {busy ? "Researching…" : "Find posts"}
        </button>
        {result && !saved && (
          <p className="text-xs text-text-secondary">
            Save or discard the current research before starting another.
          </p>
        )}
      </form>
      </div>
      {legacyId && !result && <button type="button" className={secondary} onClick={() => { void getVirloResearchResult({ data: { workspace_id: workspaceId, result_id: legacyId } }).then(found => { if (found.kind === "brief_research") { setLegacyOpen(true); setResult(found as unknown as BriefResult); } }).catch(() => setError("The previous draft could not be recovered.")); }}>Open previous report draft</button>}
      {legacyOpen && result && <button type="button" className={secondary} onClick={() => { setResult(null); setLegacyOpen(false); }}>Close previous report and start research</button>}
      {confirming && (
        <div className="space-y-3 rounded-xl border border-border-control bg-surface p-4 text-sm text-ink">
          <p>
            Send this brief to Virlo and OpenAI? Up to 12 Virlo searches cost up to $0.12, plus one OpenAI planning call. Usage costs can apply even if the request fails.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className={primary}
              onClick={() => void run()}
            >
              Start research
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-warning-surface p-4 text-sm text-warning"
        >
          {error} If the outcome is uncertain, retry the same brief in this
          browser to recover the request; check saved research too. Changing the
          brief starts a new request.
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-text-secondary">
          {notice}
        </p>
      )}
      {result && (
        <section aria-label="Brief research results" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="min-w-0 break-words text-lg font-semibold text-ink">{result.title}</h2>
            <div className="flex gap-2">
              <button
                type="button"
                className={secondary}
                onClick={() => void save()}
                disabled={saving || saved}
              >
                {saved
                  ? "Research saved"
                  : saving
                    ? "Working…"
                    : "Save full research"}
              </button>
              <button
                type="button"
                className={secondary}
                disabled={saving}
                onClick={() => void discard()}
              >
                {saved ? "Close research" : "Discard draft"}
              </button>
            </div>
          </div>
          <p className="text-xs text-text-secondary">
            Discarding clears this research draft. Provider usage records are
            retained.
          </p>
          <BriefResearchReport
            data={result.data}
            {...(!saving && { onSaveList: (index: number) => void saveList(index) })}
          />
        </section>
      )}
    </div>
  );
}
