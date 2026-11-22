import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Bookmark, Search } from "lucide-react";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  getVirloStatus,
  listSavedVirloResearch,
  listRecentVirloSearches,
  saveVirloResearch,
  searchVirloResearch,
} from "@/lib/virlo.functions";
import { cn } from "@/lib/utils";
import { VirloExploreTools } from "./VirloExploreTools";
import { BriefResearch, BriefResearchReport } from "./BriefResearch";
import { BusinessLists, BusinessResults, LocalBusinessResearch } from "./LocalBusinessResearch";
import { ListResearchAction, ListResearchReport, type ListResearchData, type ListResearchResult } from "./ListResearch";
import { AddResearchCreator } from "@/features/outreach/AddResearchCreator";
import {
  acquirePendingRequest,
  completePendingRequest,
  type PendingRequest,
} from "./pendingRequest";

type Kind = "videos" | "creators";
type Platform = "" | "tiktok" | "instagram" | "youtube";
type Saved = {
  id: string;
  title: string;
  kind: string;
  created_at: string;
  data: unknown;
};
type Result = {
  id: string;
  data: unknown;
  title: string;
  kind: string;
  page: number;
  createdAt?: string;
};
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const str = (value: unknown) => (typeof value === "string" ? value : "");
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? new Intl.NumberFormat("en-GB", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value)
    : "—";
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";
const control =
  "w-full rounded-xl border border-border-control bg-surface px-3 py-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function sourceUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (/(^|\.)(tiktok\.com|instagram\.com|youtube\.com|youtu\.be)$/.test(
        url.hostname.toLowerCase(),
      ) ||
        (/(^|\.)facebook\.com$/.test(url.hostname.toLowerCase()) &&
          /^\/ads\/library(?:\/|$)/.test(url.pathname)))
    )
      return url.href;
  } catch {
    /* A missing or malformed source stays unlinked. */
  }
  return undefined;
}

/** Construct player URLs only from recognised public post URLs. */
function postEmbedUrl(source: string | undefined): string | undefined {
  if (!source) return;
  try {
    const url = new URL(source);
    const host = url.hostname.toLowerCase();
    if (["instagram.com", "www.instagram.com"].includes(host)) {
      const match = url.pathname.match(/^\/(p|reel|reels)\/([A-Za-z0-9_-]+)\/?$/);
      if (match) return `https://www.instagram.com/${match[1] === "reels" ? "reel" : match[1]}/${match[2]}/embed/`;
    }
    if (["tiktok.com", "www.tiktok.com"].includes(host)) {
      const match = url.pathname.match(/^\/@[^/]+\/video\/(\d+)\/?$/);
      if (match) return `https://www.tiktok.com/embed/v2/${match[1]}`;
    }
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? url.pathname.slice(1) : url.pathname.match(/^\/shorts\/([A-Za-z0-9_-]+)\/?$/)?.[1] || (url.pathname === "/watch" ? url.searchParams.get("v") : null);
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return `https://www.youtube.com/embed/${id}`;
    }
  } catch { /* Unsupported links retain the original source link. */ }
  return undefined;
}

function publicVirloImage(value: unknown): string | undefined {
  try {
    if (typeof value !== "string") return undefined;
    const url = new URL(value);
    if (url.protocol === "https:" && url.hostname === "auth.virlo.ai" && !url.username && !url.password && !url.port && url.pathname.startsWith("/storage/v1/object/public/")) return url.href;
  } catch { /* Unsupported images are omitted. */ }
  return undefined;
}

function SocialCover({ source, thumbnail, title, platform }: { source: string; thumbnail: unknown; title: string; platform: string }) {
  const [failed, setFailed] = useState(false);
  const image = publicVirloImage(thumbnail);
  return <a href={source} target="_blank" rel="noopener noreferrer" className="mb-4 block overflow-hidden rounded-xl border border-border bg-surface-subtle" aria-label={`Open ${platform} post: ${title.slice(0, 100)}`}>
    {image && !failed ? <img src={image} alt={`${platform} post preview`} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-80 w-full object-cover" /> : <span className="flex h-40 items-center justify-center p-4 text-sm text-text-secondary">Preview unavailable · open the original ↗</span>}
  </a>;
}

export function ResultCards({
  result,
  workspaceId,
}: {
  result: Result;
  workspaceId: string;
}) {
  const [handoff, setHandoff] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const data = record(result.data);
  const nested = record(data["result"]);
  const slideshowItems = record(data["slideshows"])["items"];
  const candidates = [
    data[result.kind],
    data["videos"],
    data["creators"],
    data["hooks"],
    data["sounds"],
    data["ads"],
    data["results"],
    data["trends"],
    data["items"],
    data["posts"],
    data["outliers"],
    slideshowItems,
    nested["videos"], nested["posts"], nested["creators"],
    record(nested["outliers"])["outlier_videos"], record(nested["slideshows"])["items"],
  ];
  const found = Array.isArray(result.data) ? result.data : candidates.find((value) => Array.isArray(value) && value.length > 0) ?? candidates.find(Array.isArray);
  const items = (Array.isArray(found) && Array.isArray(slideshowItems) && found !== slideshowItems ? [...found, ...slideshowItems] : found ?? (["raw_creator", "meta_ad"].includes(result.kind) && Object.keys(data).length ? [result.kind === "raw_creator" && Object.keys(record(data["profile"])).length ? data["profile"] : data] : undefined)) as unknown[] | undefined;
  const notApplied = Array.isArray(data["not_applied"])
    ? data["not_applied"].filter((v): v is string => typeof v === "string")
    : [];
  return (
    <div className="space-y-4">
      {notApplied.length > 0 && (
        <p
          role="status"
          className="rounded-xl bg-warning-surface p-3 text-sm text-warning"
        >
          Some filters could not be applied: {notApplied.join(", ")}
        </p>
      )}
      {!items ? (
        <div className="rounded-2xl border border-border bg-surface p-4">
          <p className="mb-2 text-sm font-semibold text-ink">
            Research details
          </p>
          <pre className="overflow-x-auto whitespace-pre-wrap break-words text-xs text-text-secondary">
            {JSON.stringify(result.data, null, 2)}
          </pre>
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-border p-6 text-sm text-text-secondary">
          No results were returned for this page. Try another search.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {items.map((item, index) => {
            const row = record(item),
              author = record(row["author"]),
              stats = record(row["stats"]),
              profile = record(row["profile"]),
              advertiser = record(row["advertiser"]),
              creative = record(
                Array.isArray(row["creatives"]) ? row["creatives"][0] : null,
              );
            const url = sourceUrl(
              row["url"] ?? row["profile_url"] ?? profile["url"],
            );
            const embed = postEmbedUrl(url);
            const creator = result.kind === "creators" || result.kind === "raw_creator";
            const avatar = creator ? publicVirloImage(row["avatar_url"] ?? profile["avatar_url"]) : undefined;
            const instagram = !!url && /(^|\.)instagram\.com$/i.test(new URL(url).hostname);
            const firstImage = Array.isArray(row["images"]) ? record(row["images"][0])["image_url"] : undefined;
            const cover = row["thumbnail_url"] ?? firstImage;
            const slideshow = !!url && /\/photo\//.test(new URL(url).pathname) && !!publicVirloImage(cover);
            const title =
              (creator ? str(row["display_name"]) || str(row["username"]) || str(row["handle"]) : "") ||
              str(row["description"]) ||
              str(row["caption"]) ||
              str(row["bio"]) ||
              str(row["title"]) ||
              str(row["name"]) ||
              str(row["text"]) ||
              str(row["hook_text"]) ||
              str(creative["body"]) ||
              str(creative["title"]) ||
              str(advertiser["name"]) ||
              str(row["display_name"]) ||
              str(row["username"]) ||
              str(row["handle"]) ||
              str(author["username"]) ||
              "Public result";
            const account =
              str(row["username"]) ||
              str(row["handle"]) ||
              str(author["username"]) ||
              str(author["handle"]);
            const platform =
              str(row["platform"]) || (result.kind === "ads" ? "Meta ad" : "");
            const date = str(row["publish_date"]) || str(row["published_at"]) || str(row["started_at"]);
            return (
              <li
                key={`${str(row["id"]) || url || title}-${index}`}
                className="flex flex-col rounded-2xl border border-border bg-surface p-4"
              >
                {url && ((instagram && embed) || slideshow) ? <SocialCover source={url} thumbnail={cover} title={title} platform={instagram ? "Instagram" : "TikTok"} /> : embed && (
                  <div className="mb-4 overflow-hidden rounded-xl border border-border bg-surface-subtle">
                    <iframe
                      src={embed}
                      title={`Social post preview: ${title.slice(0, 100)}`}
                      loading="lazy"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allow="encrypted-media; picture-in-picture; web-share"
                      allowFullScreen
                      className="h-80 w-full border-0"
                    />
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-xs text-text-secondary">
                  <span className="capitalize">
                    {platform || "Platform unavailable"}
                  </span>
                  {date && <time dateTime={date}>{date.slice(0, 10)}</time>}
                </div>
                <div className="mt-3 flex items-start gap-3">
                  {avatar && <img src={avatar} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 shrink-0 rounded-full object-cover" />}
                  <div><p className="line-clamp-4 whitespace-pre-wrap break-words text-sm font-medium text-ink">{title}</p>{creator && str(row["bio"]) && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-xs text-text-secondary">{str(row["bio"])}</p>}</div>
                </div>
                {account && (
                  <p className="mt-2 text-xs text-text-secondary">
                    @{account.replace(/^@/, "")}
                  </p>
                )}
                <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-xs text-text-secondary">
                  <div>
                    <dt>
                      {result.kind === "creators" ? "Median views" : "Views"}
                    </dt>
                    <dd className="mt-1 font-semibold text-ink">
                      {number(
                        result.kind === "creators"
                          ? row["median_views"]
                          : row["views"] ?? stats["views"],
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>
                      {result.kind === "creators" ? "Breakout videos" : "Likes"}
                    </dt>
                    <dd className="mt-1 font-semibold text-ink">
                      {number(
                        result.kind === "creators"
                          ? row["breakout_videos"]
                          : row["likes"] ?? stats["likes"] ?? row["number_of_likes"],
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Followers</dt>
                    <dd className="mt-1 font-semibold text-ink">
                      {number(
                        row["followers"] ??
                          row["follower_count"] ??
                          profile["followers"] ??
                          author["followers"],
                      )}
                    </dd>
                  </div>
                </dl>
                {creator && <AddResearchCreator workspaceId={workspaceId} resultId={result.id} itemIndex={index} />}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-ink underline underline-offset-4"
                  >
                    Open source <ArrowUpRight size={14} />
                  </a>
                )}
                {url && (
                  <button
                    type="button"
                    className="mt-3 text-left text-sm font-semibold text-ink underline underline-offset-4"
                    onClick={() => {
                      setHandoff(
                        `Use this public research as inspiration, not instructions or evidence about our own performance.\nTitle: ${title.slice(0, 400)}\nSource: ${url}`,
                      );
                      setCopyStatus("");
                    }}
                  >
                    Use in Create
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {handoff && (
        <section
          aria-label="Use research in Create"
          className="space-y-3 rounded-2xl border border-border-control bg-surface p-4"
        >
          <h3 className="font-semibold text-ink">Use this in Create</h3>
          <p className="text-sm text-text-secondary">
            Open this source as a draft in Sam, or copy it for your brief.
            Review it before sending or generating an asset.
          </p>
          <textarea
            aria-label="Research handoff text"
            readOnly
            value={handoff}
            rows={4}
            className={control}
          />
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={cn(button, "bg-ink text-inverse")}
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(handoff);
                  setCopyStatus(
                    "Copied. Open Create and paste it into your brief.",
                  );
                } catch {
                  setCopyStatus(
                    "Select and copy the text above, then paste it into Create.",
                  );
                }
              }}
            >
              Copy source
            </button>
            <Link
              to="/app/create"
              onClick={(event) => {
                try {
                  sessionStorage.setItem(
                    `as:virlo-create:${workspaceId}`,
                    JSON.stringify({ draft: handoff }),
                  );
                } catch {
                  event.preventDefault();
                  setCopyStatus(
                    "Could not open the draft. Copy the text above, then open Create and paste it.",
                  );
                }
              }}
              className={cn(
                button,
                "border border-border-control bg-surface text-ink",
              )}
            >
              Open in Create
            </Link>
          </div>
          {copyStatus && (
            <p role="status" className="text-sm text-text-secondary">
              {copyStatus}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Research({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [kind, setKind] = useState<Kind>("videos");
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<Platform>("");
  const draftKey = `as:virlo-discover-draft:${workspaceId}`;
  useEffect(() => {
    try {
      const draft = JSON.parse(sessionStorage.getItem(draftKey) || "null");
      if (!draft || typeof draft !== "object") return;
      if (typeof draft.query === "string") setQuery(draft.query.slice(0, 200));
      if (draft.kind === "videos" || draft.kind === "creators") setKind(draft.kind);
      if (["", "tiktok", "instagram", "youtube"].includes(draft.platform)) setPlatform(draft.platform);
    } catch { /* Storage is optional. */ }
  }, [draftKey]);
  const saveDraft = (draft: { query: string; kind: Kind; platform: Platform }) => {
    try { sessionStorage.setItem(draftKey, JSON.stringify(draft)); } catch { /* Storage is optional. */ }
  };
  const [view, setView] = useState<"search" | "brief" | "businesses" | "lists" | "tools" | "saved">("search");
  const [openListId, setOpenListId] = useState("");
  const [initialResearchBusiness, setInitialResearchBusiness] = useState("");
  const [activeResearchBusiness, setActiveResearchBusiness] = useState<number | null>(null);
  const [current, setCurrent] = useState<Result | null>(null);
  const [lastSearch, setLastSearch] = useState<{
    query: string;
    platform: Platform;
    kind: Kind;
  } | null>(null);
  const [message, setMessage] = useState("");
  const [preparing, setPreparing] = useState(false);
  const [storageError, setStorageError] = useState("");
  const status = useQuery({
    queryKey: ["virlo-status", workspaceId],
    queryFn: () => getVirloStatus({ data: { workspace_id: workspaceId } }),
  });
  const recent = useQuery({
    queryKey: ["virlo-recent", workspaceId, user?.id],
    queryFn: () => listRecentVirloSearches({ data: { workspace_id: workspaceId } }),
    enabled: !!user?.id,
  });
  const saved = useQuery({
    queryKey: ["virlo-saved", workspaceId],
    queryFn: () =>
      listSavedVirloResearch({ data: { workspace_id: workspaceId } }),
    enabled: view === "saved",
  });
  const search = useMutation({
    mutationFn: async (input: {
      query: string;
      platform: Platform;
      kind: Kind;
      page: number;
      pending: PendingRequest;
    }) => {
      const data = await searchVirloResearch({
        data: {
          workspace_id: workspaceId,
          kind: input.kind,
          query: input.query,
          ...(input.platform ? { platform: input.platform } : {}),
          page: input.page,
          request_id: input.pending.id,
        },
      });
      return {
        id: data["id"],
        data: data["data"],
        title: input.query,
        kind: input.kind,
        page: input.page,
      };
    },
    onSuccess: (result, input) => {
      completePendingRequest(input.pending);
      void queryClient.invalidateQueries({ queryKey: ["virlo-recent", workspaceId, user?.id] });
      setCurrent(result);
      setLastSearch({
        query: input.query,
        platform: input.platform,
        kind: input.kind,
      });
      setMessage("");
    },
  });
  const save = useMutation({
    mutationFn: (result: Result) =>
      saveVirloResearch({
        data: {
          workspace_id: workspaceId,
          result_id: result.id,
          title: result.title,
        },
      }),
    onSuccess: () => {
      setMessage("Saved to this business’s research.");
      void queryClient.invalidateQueries({
        queryKey: ["virlo-saved", workspaceId],
      });
    },
  });
  const submitSearch = async (input: {
    query: string;
    platform: Platform;
    kind: Kind;
    page: number;
  }) => {
    if (preparing || search.isPending) return;
    setPreparing(true);
    setStorageError("");
    try {
      const pending = await acquirePendingRequest(workspaceId, {
        type: "search",
        ...input,
      });
      search.mutate({ ...input, pending });
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? error.message
          : "Research could not start safely.",
      );
    } finally {
      setPreparing(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (query.trim().length >= 2 && !search.isPending)
      void submitSearch({ query: query.trim(), platform, kind, page: 1 });
  };
  const busy = status.isPending || search.isPending || preparing;
  const openBusinessList = (id: string) => { setOpenListId(id); setView("lists"); };
  const openListResearch = (result: ListResearchResult, initialBusiness = "") => { setInitialResearchBusiness(initialBusiness); setActiveResearchBusiness(null); setCurrent({ id: result.id, title: result.data.list_name, kind: "list_research", data: result.data, page: 1 }); void queryClient.invalidateQueries({ queryKey: ["virlo-saved", workspaceId] }); setView("saved"); };
  const findBusinessSocial = (name: string) => {
    setQuery(name);
    setKind("creators");
    setPlatform("");
    setCurrent(null);
    setLastSearch(null);
    setMessage("Search for this business, then review profile matches carefully to confirm they belong to it.");
    saveDraft({ query: name, kind: "creators", platform: "" });
    setView("search");
  };
  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-7 sm:py-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-widest text-text-secondary">
            Explore
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink">
            Research
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
            Discover public videos and creators for your next idea. Explore the
            original sources and save useful results to this business.
          </p>
        </header>
        <nav
          aria-label="Research views"
          className="flex flex-wrap gap-2 border-b border-border pb-3"
        >
          {(
            [
              ["search", "Discover"],
              ["brief", "Your Prompt"],
              ["businesses", "Businesses"],
              ["lists", "Lists"],
              ["tools", "Explore & track"],
              ["saved", "Saved research"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-current={view === value ? "page" : undefined}
              onClick={() => {
                setView(value);
                setActiveResearchBusiness(null);
                setInitialResearchBusiness("");
                if (value === "lists") setOpenListId("");
                setCurrent(null);
                setMessage("");
              }}
              className={cn(
                button,
                view === value
                  ? "bg-ink text-inverse"
                  : "text-text-secondary hover:bg-surface-subtle",
              )}
            >
              {label}
            </button>
          ))}
        </nav>
        {(view === "search" || view === "tools") && status.isError && (
          <p
            role="alert"
            className="rounded-xl bg-warning-surface p-4 text-sm text-warning"
          >
            Research connection status is unavailable. Please try again.
          </p>
        )}
        {(view === "search" || view === "tools") && status.data && !status.data["configured"] && (
          <p
            role="status"
            className="rounded-xl border border-border-control bg-surface p-4 text-sm text-text-secondary"
          >
            Research is not connected yet. Your other creation tools are
            available as usual.
          </p>
        )}
        <div hidden={view !== "brief"}><BriefResearch workspaceId={workspaceId} /></div>
        {view === "search" ? (
          <>
            <form
              onSubmit={submit}
              className="space-y-4 rounded-2xl border border-border bg-surface p-4 sm:p-5"
            >
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-ink">
                  Find
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["videos", "Videos"],
                      ["creators", "Creators"],
                    ] as const
                  ).map(([value, label]) => (
                    <label
                      key={value}
                      className={cn(
                        "cursor-pointer rounded-full border px-4 py-2 text-sm",
                        kind === value
                          ? "border-ink bg-ink text-inverse"
                          : "border-border-control text-ink",
                      )}
                    >
                      <input
                        type="radio"
                        name="research-kind"
                        value={value}
                        checked={kind === value}
                        onChange={() => { setKind(value); saveDraft({ query, kind: value, platform }); }}
                        className="sr-only"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
                <label className="space-y-1.5 text-sm font-medium text-ink">
                  Topic
                  <input
                    className={control}
                    type="search"
                    required
                    minLength={2}
                    maxLength={200}
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); saveDraft({ query: e.target.value, kind, platform }); }}
                    placeholder="e.g. skincare routines"
                  />
                </label>
                <label className="space-y-1.5 text-sm font-medium text-ink">
                  Platform
                  <select
                    className={control}
                    value={platform}
                    onChange={(e) => { const next = e.target.value as Platform; setPlatform(next); saveDraft({ query, kind, platform: next }); }}
                  >
                    <option value="">All platforms</option>
                    <option value="tiktok">TikTok</option>
                    <option value="instagram">Instagram</option>
                    <option value="youtube">YouTube Shorts</option>
                  </select>
                </label>
                <button
                  type="submit"
                  className={cn(
                    button,
                    "bg-ink text-inverse hover:bg-ink-hover",
                  )}
                  disabled={busy || !status.data?.configured}
                >
                  <Search size={16} />
                  {search.isPending ? "Searching…" : "Search"}
                </button>
              </div>
            </form>
            <section aria-label="Recent searches" className="space-y-2">
              <h2 className="text-sm font-semibold text-ink">Recent searches</h2>
              {recent.isError ? <p className="text-sm text-text-secondary">Recent searches are unavailable.</p> :
                recent.isPending ? <p className="text-sm text-text-secondary">Loading recent searches…</p> :
                recent.data?.length ? <div className="flex flex-wrap gap-2">{recent.data.map((item) => (
                  <button key={item.id} type="button" className={cn(button, "border border-border-control bg-surface text-ink hover:bg-surface-subtle")}
                    onClick={() => {
                      setCurrent({ id: item.id, title: item.title, kind: item.kind, data: item.data, page: 1, createdAt: item.created_at });
                      setLastSearch(null);
                      setQuery(item.title);
                      const nextKind: Kind = item.kind === "creators" ? "creators" : "videos";
                      setKind(nextKind);
                      setPlatform("");
                      saveDraft({ query: item.title, kind: nextKind, platform: "" });
                      setMessage("");
                    }}>
                    {item.title} <span className="text-xs font-normal text-text-secondary">· {item.kind}</span>
                  </button>
                ))}</div> : <p className="text-sm text-text-secondary">Your completed searches will appear here.</p>}
            </section>
            {storageError && (
              <p
                role="alert"
                className="rounded-xl bg-warning-surface p-4 text-sm text-warning"
              >
                {storageError}
              </p>
            )}
            {search.isError && (
              <p
                role="alert"
                className="rounded-xl bg-warning-surface p-4 text-sm text-warning"
              >
                {search.error instanceof Error
                  ? search.error.message
                  : "Research could not be completed."}{" "}
                If the outcome is uncertain, check your saved research before
                starting it again.
              </p>
            )}
            {message && (
              <p role="status" className="text-sm text-text-secondary">
                {message}
              </p>
            )}
            {current && (
              <section aria-label="Research results" className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-ink">
                      {current.kind === "videos" ? "Videos" : "Creators"} for “
                      {current.title}”
                    </h2>
                    <p className="text-xs text-text-secondary">
                      Public data from Virlo · retrieved{" "}
                      {new Date(current.createdAt || Date.now()).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => save.mutate(current)}
                    disabled={save.isPending}
                    className={cn(
                      button,
                      "border border-border-control bg-surface text-ink hover:bg-surface-subtle",
                    )}
                  >
                    <Bookmark size={15} />
                    {save.isPending ? "Saving…" : "Save search"}
                  </button>
                </div>
                {save.isError && (
                  <p role="alert" className="text-sm text-danger">
                    Could not save this research. Please try again.
                  </p>
                )}
                <ResultCards
                  key={current.id}
                  result={current}
                  workspaceId={workspaceId}
                />
                {lastSearch && record(current.data)["has_more"] === true && (
                  <button
                    type="button"
                    disabled={search.isPending}
                    onClick={() =>
                      submitSearch({ ...lastSearch, page: current.page + 1 })
                    }
                    className={cn(
                      button,
                      "border border-border-control bg-surface text-ink",
                    )}
                  >
                    Next page
                  </button>
                )}
              </section>
            )}
          </>
        ) : view === "brief" ? (
          null
        ) : view === "businesses" ? (
          <LocalBusinessResearch workspaceId={workspaceId} onFindSocial={findBusinessSocial} onOpenList={openBusinessList} />
        ) : view === "lists" ? (
          <BusinessLists key={openListId} workspaceId={workspaceId} onFindSocial={findBusinessSocial} initialListId={openListId} onOpenResearch={openListResearch} />
        ) : view === "tools" ? (
          <VirloExploreTools
            workspaceId={workspaceId}
            configured={Boolean(status.data?.configured)}
            onResult={(result) => {
              setCurrent({ ...result, page: 1 });
              setMessage("");
            }}
            result={
              current ? (
                <section className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h2 className="text-lg font-semibold text-ink">
                      {current.title}
                    </h2>
                    <button
                      type="button"
                      onClick={() => save.mutate(current)}
                      disabled={save.isPending}
                      className={cn(
                        button,
                        "border border-border-control bg-surface text-ink",
                      )}
                    >
                      <Bookmark size={15} />
                      Save result
                    </button>
                  </div>
                  {message && (
                    <p role="status" className="text-sm text-text-secondary">
                      {message}
                    </p>
                  )}
                  {save.isError && (
                    <p role="alert" className="text-sm text-danger">
                      Could not save this result.
                    </p>
                  )}
                  <ResultCards
                    key={current.id}
                    result={current}
                    workspaceId={workspaceId}
                  />
                </section>
              ) : null
            }
          />
        ) : (
          <section aria-label="Saved research" className="space-y-4">
            <h2 className="text-lg font-semibold text-ink">Saved research</h2>
            {saved.isPending ? (
              <p className="text-sm text-text-secondary">
                Loading saved research…
              </p>
            ) : saved.isError ? (
              <p role="alert" className="text-sm text-danger">
                Saved research could not be loaded.
              </p>
            ) : (saved.data as Saved[] | undefined)?.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {(saved.data as Saved[]).map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setInitialResearchBusiness("");
                        setActiveResearchBusiness(null);
                        setCurrent({
                          id: item.id,
                          title: item.title,
                          kind: item.kind,
                          data: item.data,
                          page: 1,
                        });
                      }}
                      className="w-full rounded-xl border border-border bg-surface p-4 text-left hover:bg-surface-subtle"
                    >
                      <span className="block font-semibold text-ink">
                        {item.title}
                      </span>
                      <span className="mt-1 block text-xs capitalize text-text-secondary">
                        {item.kind === "list_research" ? (item.data && typeof item.data === "object" && !Array.isArray(item.data) && (item.data as Record<string, unknown>)["scope"] === "business" ? "Business research" : "List research") : item.kind.replaceAll("_", " ")} ·{" "}
                        {item.created_at.slice(0, 10)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-2xl border border-border p-6 text-sm text-text-secondary">
                No saved searches yet.
              </p>
            )}
            {current && (
              <>
                <h3 className="pt-2 text-lg font-semibold text-ink">
                  {current.title}
                </h3>
                {current.kind === "brief_research" ? <BriefResearchReport data={current.data} /> : current.kind === "list_research" ? <><ListResearchAction key={current.id} workspaceId={workspaceId} businessCount={(current.data as ListResearchData).businesses?.length ?? 0} existingReport={{ id: current.id, data: current.data as ListResearchData }} onOpenReport={openListResearch} onProgress={state => { setActiveResearchBusiness(state.activeIndex); const report = state.result; if (report) setCurrent(previous => previous?.id === report.id ? { ...previous, data: report.data } : previous); }} /><ListResearchReport key={`${current.id}-${initialResearchBusiness}`} data={current.data} initialBusiness={initialResearchBusiness} activeIndex={activeResearchBusiness} /></> : current.kind === "businesses" ? <BusinessResults key={current.id} data={current.data} workspaceId={workspaceId} resultId={current.id} onFindSocial={findBusinessSocial} onOpenList={openBusinessList} /> : <ResultCards
                  key={current.id}
                  result={current}
                  workspaceId={workspaceId}
                />}
              </>
            )}
          </section>
        )}
        <p className="text-xs leading-5 text-text-secondary">
          Research reflects public information available at the time of
          collection. Metrics and source availability can change.
        </p>
      </div>
    </div>
  );
}

export function VirloResearchPage() {
  const { currentWorkspace, loading } = useWorkspace();
  if (loading)
    return (
      <div className="p-6 text-sm text-text-secondary">Loading business…</div>
    );
  if (!currentWorkspace)
    return (
      <div className="p-6 text-sm text-text-secondary">
        Choose a business to use Research.
      </div>
    );
  return (
    <Research key={currentWorkspace.id} workspaceId={currentWorkspace.id} />
  );
}
