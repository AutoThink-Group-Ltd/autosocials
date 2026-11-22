import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronLeft,
  Copy,
  Eye,
  Film,
  Globe,
  History,
  ImageIcon,
  Link2,
  Loader2,
  MessageSquare,
  Plus,
  ScanEye,
  Search,
  Share2,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  resolveResearchTargets,
  startResearchRun,
  getResearchRun,
  listResearchRuns,
  saveResearchReply,
} from "@/lib/research.functions";
import { targetFromSocialUrl, type ResearchPost, type ResearchRun, type ResearchTarget } from "@/lib/research";
import { createResearchShare, getPublicResearchShare, revokeResearchShares } from "@/lib/research-share.functions";
import { previewResearchCompetitor, refreshVisualResearchShare } from "@/lib/research-visual.functions";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
const primary = `${button} bg-ink text-inverse hover:bg-ink-hover`;
const secondary = `${button} border border-border-control bg-surface text-ink hover:bg-surface-subtle`;
const control =
  "w-full rounded-xl border border-border-control bg-surface px-3.5 py-3 text-sm text-ink outline-none placeholder:text-text-muted focus:border-ink focus:ring-1 focus:ring-ink";
const activeStatuses = ["queued", "fetching", "analyzing"];
const platformNames = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};
type CompetitorChoice = { target: ResearchTarget; name: string; posts: ResearchPost[]; preview: "loading" | "ready" | "unavailable" };
const statusNames: Record<ResearchRun["status"], string> = {
  queued: "Getting started",
  fetching: "Collecting public posts",
  analyzing: "Reviewing the evidence",
  complete: "Report ready",
  partial: "Report ready · some sources unavailable",
  failed: "Research could not complete",
};
const reviewNames: Record<ResearchPost["review_basis"], string> = {
  frames: "Sampled frames available",
  thumbnail: "Cover + caption available",
  metadata: "Caption + metrics only",
};

function date(value: string | null | undefined) {
  if (!value || Number.isNaN(new Date(value).valueOf()))
    return "Date unavailable";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function number(value: number | null | undefined) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("en-GB", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(value);
}
function previewText(value: string, limit = 155) {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= limit) return compact;
  const cut = compact.slice(0, limit).lastIndexOf(" ");
  return `${compact.slice(0, cut > limit / 2 ? cut : limit).replace(/[.,;: ]+$/, "")}…`;
}
function firstThought(value: string) {
  const compact = value.replace(/\s+/g, " ").trim();
  const sentenceEnd = compact.search(/[.!?](?:\s|$)/);
  return previewText(sentenceEnd > 0 && sentenceEnd < 190 ? compact.slice(0, sentenceEnd + 1) : compact, 190);
}
function safeUrl(value: string | null | undefined) {
  return value && (/^https?:\/\//i.test(value) || /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value)) ? value : undefined;
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please retry.";
}

function PostCard({
  post,
  onOpen,
}: {
  post: ResearchPost;
  onOpen: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  return (
    <article
      id={`post-${post.id}`}
      className="group overflow-hidden rounded-2xl border border-border bg-surface scroll-mt-6"
    >
      <button
        type="button"
        onClick={onOpen}
        className="relative block aspect-[4/5] w-full overflow-hidden bg-surface-subtle text-left"
        aria-label={`Review ${platformNames[post.platform]} post: ${post.caption.slice(0, 70)}`}
      >
        {safeUrl(post.thumbnail_url) && !imageFailed ? (
          <img
            src={post.thumbnail_url!}
            alt="Post cover"
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center text-text-muted">
            <ImageIcon size={30} strokeWidth={1} />
            <span className="text-xs">
              Preview unavailable
              <br />
              Open the original post to view it.
            </span>
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-surface/95 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink">
          {platformNames[post.platform]}
        </span>
        {post.media_type === "video" && (
          <span className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-ink/85 text-inverse">
            <Film size={14} />
          </span>
        )}
        <span className="absolute bottom-3 left-3 right-3 flex items-center gap-1.5 rounded-lg bg-surface/95 px-2.5 py-2 text-[10px] font-medium text-ink">
          <Eye size={12} />
          {reviewNames[post.review_basis]}
        </span>
      </button>
      <div className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2 text-[11px] text-text-secondary">
          <span>{date(post.published_at)}</span>
          <a
            href={safeUrl(post.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-ink"
          >
            Original <ArrowUpRight size={12} />
          </a>
        </div>
        <p className="line-clamp-2 min-h-10 text-sm leading-5 text-ink">
          {post.caption || "No public caption available."}
        </p>
        <div className="grid grid-cols-3 gap-2 border-t border-border pt-3 text-[11px] text-text-secondary">
          <div>
            <strong className="block text-sm font-semibold text-ink">
              {number(post.metrics.likes)}
            </strong>
            Likes
          </div>
          <div>
            <strong className="block text-sm font-semibold text-ink">
              {number(post.metrics.comments)}
            </strong>
            Comments
          </div>
          <div>
            <strong className="block text-sm font-semibold text-ink">
              {number(post.metrics.views)}
            </strong>
            Views
          </div>
        </div>
      </div>
    </article>
  );
}

function PostDetail({
  post,
  onClose,
}: {
  post: ResearchPost;
  onClose: () => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto rounded-2xl bg-surface p-5 md:p-7">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          {platformNames[post.platform]} · {date(post.published_at)}
        </p>
        <DialogTitle className="pr-8 font-display text-xl font-bold">
          The source behind the suggestion
        </DialogTitle>
        <DialogDescription className="sr-only">
          Source post, available evidence and the limits of its creative review.
        </DialogDescription>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6">
          {post.caption || "No public caption available."}
        </p>
        <div className="mt-5 rounded-xl bg-canvas p-4">
          <p className="flex items-center gap-2 text-xs font-semibold">
            <Eye size={14} />
            {reviewNames[post.review_basis]}
          </p>
          <p className="mt-1 text-xs leading-5 text-text-secondary">
            {post.review_basis === "frames"
              ? "The available evidence includes selected still frames and text. It does not cover the complete video or soundtrack."
              : "Available evidence is limited to the cover, caption and public metrics. Full footage and audio have not been assessed."}
          </p>
        </div>
        {!!post.frames?.length && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {post.frames.filter(safeUrl).map((frame, index) => (
              <img
                key={frame}
                src={frame}
                alt={`Sampled frame ${index + 1}`}
                className="aspect-video w-full rounded-lg bg-surface-subtle object-cover"
              />
            ))}
          </div>
        )}
        <a
          className={cn(secondary, "mt-5")}
          href={safeUrl(post.url)}
          target="_blank"
          rel="noopener noreferrer"
        >
          View original post <ArrowUpRight size={15} />
        </a>
      </DialogContent>
    </Dialog>
  );
}

export function SocialLens() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;
  if (!workspaceId)
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-text-secondary">
        Select a business to start your research.
      </div>
    );
  return <SocialLensWorkspace key={workspaceId} workspaceId={workspaceId} />;
}

function SocialLensWorkspace({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [candidates, setCandidates] = useState<ResearchTarget[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [providerReady, setProviderReady] = useState(true);
  const [runId, setRunId] = useState<string | null>(null);
  const restoredRun = useRef(false);
  const latestRunId = useRef<string | null>(null);
  latestRunId.current = runId;
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reply, setReply] = useState("");
  const [replyDirty, setReplyDirty] = useState(false);
  const [openPost, setOpenPost] = useState<ResearchPost | null>(null);
  const [platform, setPlatform] = useState("all");
  const [shareUrl, setShareUrl] = useState("");
  const [shareToken, setShareToken] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [competitorEditorOpen, setCompetitorEditorOpen] = useState(false);
  const [competitorChoices, setCompetitorChoices] = useState<CompetitorChoice[]>([]);
  const [competitorQuery, setCompetitorQuery] = useState("");
  const [competitorMatches, setCompetitorMatches] = useState<ResearchTarget[]>([]);
  const [competitorLookupBusy, setCompetitorLookupBusy] = useState(false);
  const [regenerateBusy, setRegenerateBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedRun = params.get("run") || "";
    const linkedShare = params.get("share") || "";
    if (!/^[a-f0-9-]{36}$/i.test(linkedRun) || !/^[a-f0-9]{64}$/.test(linkedShare)) return;
    restoredRun.current = true;
    setRunId(linkedRun);
    setShareToken(linkedShare);
    setShareUrl(`${window.location.origin}/report/${linkedShare}`);
  }, []);

  function openCompetitorEditor() {
    setCompetitorChoices((sharedReport.data?.visual?.competitors ?? []).flatMap((item) => {
      const target = targetFromSocialUrl(item.url);
      return target ? [{ target, name: item.name, posts: item.posts, preview: item.posts.length ? "ready" as const : "unavailable" as const }] : [];
    }));
    setCompetitorMatches([]);
    setCompetitorQuery("");
    setCompetitorEditorOpen((open) => !open);
  }

  async function addCompetitor(target: ResearchTarget) {
    if (competitorChoices.some((item) => item.target.id === target.id)) { toast.message("That profile is already selected"); return; }
    if (competitorChoices.length >= 3) { toast.error("Choose up to three competitors"); return; }
    setCompetitorChoices((items) => [...items, { target, name: target.display_name || `@${target.handle}`, posts: [], preview: "loading" }]);
    setCompetitorMatches([]);
    setCompetitorQuery("");
    try {
      const posts = await previewResearchCompetitor({ data: { workspace_id: workspaceId, target } });
      setCompetitorChoices((items) => items.map((item) => item.target.id === target.id ? { ...item, posts, preview: posts.length ? "ready" : "unavailable" } : item));
    } catch {
      setCompetitorChoices((items) => items.map((item) => item.target.id === target.id ? { ...item, preview: "unavailable" } : item));
    }
  }

  async function lookupCompetitor() {
    const input = competitorQuery.trim();
    if (!input) return;
    const prefixed = input.match(/^(instagram|tiktok|facebook)\s*:\s*@([\w.-]{2,100})$/i);
    const query = prefixed ? `https://www.${prefixed[1]!.toLowerCase()}.com/${prefixed[1]!.toLowerCase() === "tiktok" ? "@" : ""}${prefixed[2]}` : input;
    setCompetitorLookupBusy(true);
    try {
      const result = await resolveResearchTargets({ data: { workspace_id: workspaceId, query } });
      const matches = result.candidates.filter((candidate) => !run?.targets.some((own) => own.id === candidate.id) && !competitorChoices.some((item) => item.target.id === candidate.id));
      if (matches.length === 1) void addCompetitor(matches[0]!);
      else if (matches.length) setCompetitorMatches(matches.slice(0, 8));
      else toast.error("No matching public profile found. Try a direct social profile link.");
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setCompetitorLookupBusy(false); }
  }

  const sharedReport = useQuery({
    queryKey: ["public-research-report", shareToken],
    enabled: !!shareToken,
    queryFn: () => getPublicResearchShare({ data: { token: shareToken } }),
    refetchInterval: (query) => query.state.data?.visual?.status === "pending" ? 4000 : false,
  });

  const history = useQuery({
    queryKey: ["research-runs", workspaceId],
    enabled: !!workspaceId,
    queryFn: () => listResearchRuns({ data: { workspace_id: workspaceId! } }),
  });
  useEffect(() => {
    if (restoredRun.current || !history.data) return;
    restoredRun.current = true;
    if (runId) return;
    let saved: string | null = null;
    try { saved = sessionStorage.getItem(`as:research-run:${workspaceId}`); } catch { /* Storage is optional. */ }
    const previous = history.data.find((item) => item.id === saved);
    const active = history.data.find((item) => activeStatuses.includes(item.status));
    const resume = active ?? previous;
    if (resume) { setRunId(resume.id); setQuery(resume.query); }
  }, [history.data, runId, workspaceId]);
  useEffect(() => {
    if (!runId) return;
    try { sessionStorage.setItem(`as:research-run:${workspaceId}`, runId); } catch { /* Storage is optional. */ }
  }, [runId, workspaceId]);
  const report = useQuery({
    queryKey: ["research-run", workspaceId, runId],
    enabled: !!workspaceId && !!runId,
    queryFn: () =>
      getResearchRun({ data: { workspace_id: workspaceId!, run_id: runId! } }),
    refetchInterval: (state) =>
      state.state.data && activeStatuses.includes(state.state.data.status)
        ? 4000
        : false,
  });
  const run = report.data;
  useEffect(() => {
    setReply(run?.reply ?? run?.analysis?.reply ?? "");
    setReplyDirty(false);
  }, [run?.id, run?.reply, run?.analysis?.reply]);
  useEffect(() => {
    if (run && !activeStatuses.includes(run.status))
      void qc.invalidateQueries({ queryKey: ["research-runs", workspaceId] });
  }, [run?.status, workspaceId, qc]);
  const resolve = useMutation({
    mutationFn: () =>
      resolveResearchTargets({
        data: { workspace_id: workspaceId!, query: query.trim() },
      }),
    onSuccess: (data) => {
      setCandidates(data.candidates);
      setSelected([]);
      setWarnings(data.warnings ?? []);
      setProviderReady(data.provider_ready);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const start = useMutation({
    mutationFn: () =>
      startResearchRun({
        data: {
          workspace_id: workspaceId!,
          query: query.trim(),
          question: question.trim(),
          targets: candidates.filter((candidate) =>
            selected.includes(candidate.id),
          ),
        },
      }),
    onSuccess: (data) => {
      setRunId(data.id);
      if (data.reused) toast.message("Your existing scan is still running. Reopening its progress.");
      setPlatform("all");
      setShareUrl("");
      setShareToken("");
      setCompetitorEditorOpen(false);
      void qc.invalidateQueries({ queryKey: ["research-runs", workspaceId] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const save = useMutation({
    mutationFn: () =>
      saveResearchReply({
        data: { workspace_id: workspaceId!, run_id: runId!, reply },
      }),
    onSuccess: () => {
      setReplyDirty(false);
      toast.success("Reply saved to this report");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  function search(event: FormEvent) {
    event.preventDefault();
    if (workspaceId && query.trim()) resolve.mutate();
  }
  function newResearch() {
    restoredRun.current = true;
    try { sessionStorage.removeItem(`as:research-run:${workspaceId}`); } catch { /* Storage is optional. */ }
    setRunId(null);
    setCandidates([]);
    setSelected([]);
    setWarnings([]);
    setProviderReady(true);
    setPlatform("all");
    setShareUrl("");
    setShareToken("");
    setCompetitorEditorOpen(false);
  }
  async function shareReport() {
    if (!runId || shareBusy) return;
    const requestedRunId = runId;
    const newTab = window.open("about:blank", "_blank");
    if (newTab) newTab.opener = null;
    setShareBusy(true);
    try {
      const { token } = await createResearchShare({ data: { workspace_id: workspaceId, run_id: requestedRunId } });
      const url = `${window.location.origin}/report/${encodeURIComponent(token)}`;
      if (latestRunId.current === requestedRunId) { setShareUrl(url); setShareToken(token); }
      if (newTab) newTab.location.replace(url);
      else toast.message("Report ready. Use Copy link to open or send it.");
    } catch (error) {
      newTab?.close();
      toast.error(errorMessage(error));
    } finally {
      setShareBusy(false);
    }
  }
  async function regenerateVisualReport(manualCompetitorUrls: string[] | null) {
    if (!runId || !shareToken || regenerateBusy) return;
    setRegenerateBusy(true);
    try {
      await refreshVisualResearchShare({ data: {
        workspace_id: workspaceId, run_id: runId, token: shareToken,
        manual_competitor_urls: manualCompetitorUrls,
      } });
      setCompetitorEditorOpen(false);
      await sharedReport.refetch();
      toast.success("Visual report is refreshing. Keep the link you already shared.");
    } catch (error) { toast.error(errorMessage(error)); }
    finally { setRegenerateBusy(false); }
  }
  const working = !!run && activeStatuses.includes(run.status);
  const visiblePosts =
    run?.posts.filter(
      (post) => platform === "all" || post.platform === platform,
    ) ?? [];

  return (
    <div className="min-h-0 flex-1 overflow-y-auto bg-canvas">
      <div className="mx-auto max-w-[1600px] px-5 py-7 md:px-9 md:py-10 xl:px-12">
        <div className="mb-8 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
            <ScanEye size={16} />
            Research / Social Lens
          </div>
          <button
            type="button"
            className={cn(secondary, "min-h-9 text-xs")}
            onClick={() => setHistoryOpen((value) => !value)}
            aria-expanded={historyOpen}
          >
            <History size={14} />
            Saved reports
            {history.data?.length ? (
              <span className="rounded-full bg-surface-subtle px-1.5 py-0.5 text-[10px]">
                {history.data.length}
              </span>
            ) : null}
          </button>
        </div>
        {historyOpen && (
          <section
            aria-label="Saved research reports"
            className="mb-7 rounded-2xl border border-border bg-surface p-5"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Your workspace research</h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label="Close saved reports"
              >
                <X size={16} />
              </button>
            </div>
            {history.isLoading ? (
              <p className="text-sm text-text-secondary">Loading reports…</p>
            ) : history.error ? (
              <p className="text-sm text-danger">
                {errorMessage(history.error)}
              </p>
            ) : !history.data?.length ? (
              <p className="text-sm text-text-secondary">
                Research and source snapshots will appear here.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {history.data.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setRunId(item.id);
                      setHistoryOpen(false);
                      setPlatform("all");
                      setShareUrl("");
                      setShareToken("");
                      setCompetitorEditorOpen(false);
                    }}
                    className="rounded-xl border border-border p-3 text-left transition-colors hover:bg-canvas"
                  >
                    <p className="truncate text-sm font-semibold">
                      {item.query}
                    </p>
                    <p className="mt-1 text-[11px] text-text-secondary">
                      {date(item.created_at)} · {statusNames[item.status]}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}
        {!runId ? (
          <>
            <div className="mb-9 grid gap-7 xl:grid-cols-[1fr_340px] xl:items-end">
              <div>
                <p className="mb-3 text-xs font-semibold text-text-secondary">
                  A fresh perspective. Grounded in real posts.
                </p>
                <h1 className="max-w-3xl font-display text-4xl font-bold leading-[1.12] tracking-tight md:text-5xl">
                  See the feed.
                  <br />
                  <span className="font-editorial font-normal italic">
                    Find the opportunity.
                  </span>
                </h1>
                <p className="mt-5 max-w-2xl text-base leading-7 text-text-secondary">
                  Bring a company, website or social profile. Get a visual
                  review of its recent content, sharper creative ideas, and a
                  considered response to your client.
                </p>
              </div>
              <aside className="rounded-2xl border border-border bg-surface p-5">
                <p className="flex items-center gap-2 text-xs font-semibold">
                  <Sparkles size={15} />
                  What you’ll get
                </p>
                <div className="mt-4 space-y-3 text-sm text-text-secondary">
                  <p className="flex items-center gap-3">
                    <ImageIcon size={15} />
                    Recent posts, side by side
                  </p>
                  <p className="flex items-center gap-3">
                    <Film size={15} />A stronger reel treatment
                  </p>
                  <p className="flex items-center gap-3">
                    <MessageSquare size={15} />A reply you can make your own
                  </p>
                </div>
              </aside>
            </div>
            <form
              onSubmit={search}
              className="rounded-2xl border border-border-control bg-surface p-5 md:p-7"
            >
              <label
                htmlFor="research-query"
                className="mb-2 block text-sm font-semibold"
              >
                Who are we looking at?
              </label>
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-4 top-3.5 text-text-muted"
                    size={18}
                  />
                  <input
                    id="research-query"
                    value={query}
                    disabled={resolve.isPending || start.isPending}
                    maxLength={500}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setCandidates([]);
                      setWarnings([]);
                      resolve.reset();
                    }}
                    className={cn(control, "pl-11")}
                    placeholder="Company name, website, @handle or social link"
                    required
                  />
                </div>
                <button
                  className={primary}
                  disabled={resolve.isPending || !query.trim()}
                >
                  {resolve.isPending ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  Find accounts
                </button>
              </div>
              <p className="mt-2 text-xs text-text-muted">
                Instagram, Facebook and TikTok · Public profiles only
              </p>
              <details className="mt-5 border-t border-border pt-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Add the client’s question or email{" "}
                  <span className="font-normal text-text-muted">
                    (optional)
                  </span>
                </summary>
                <label htmlFor="research-question" className="sr-only">
                  Client question or email
                </label>
                <textarea
                  id="research-question"
                  value={question}
                  disabled={start.isPending}
                  maxLength={12000}
                  onChange={(event) => setQuestion(event.target.value)}
                  className={cn(control, "mt-3 min-h-28 resize-y")}
                  placeholder="For example: How would you approach our property reels differently?"
                />
                <p className="mt-2 text-xs text-text-muted">
                  This gives the review a clear purpose and shapes your draft
                  reply.
                </p>
              </details>
            </form>
            {resolve.isPending && (
              <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-surface p-5 text-sm text-text-secondary">
                <Loader2 size={18} className="animate-spin" />
                Looking for the right public accounts…
              </div>
            )}
            {resolve.isSuccess && !resolve.isPending && !candidates.length && !warnings.length && (
              <p className="mt-5 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
                No public account matches were found. Try the company’s website or paste a direct social profile link.
              </p>
            )}
            {!!warnings.length && (
              <div className="mt-5 space-y-2 rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">
                {warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </div>
            )}
            {!!candidates.length && (
              <section className="mt-8">
                <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                      Confirm the match
                    </p>
                    <h2 className="mt-1 font-display text-xl font-bold">
                      Choose the accounts to review
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      Check these are the right company before collecting posts.
                    </p>
                  </div>
                  <span className="text-xs text-text-muted">
                    {selected.length} / 3 selected
                  </span>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {candidates.map((candidate) => {
                    const checked = selected.includes(candidate.id);
                    return (
                      <label
                        key={candidate.id}
                        className={cn(
                          "flex cursor-pointer items-start gap-3 rounded-xl border bg-surface p-4 transition-colors",
                          checked
                            ? "border-ink ring-1 ring-ink"
                            : "border-border hover:border-border-control",
                        )}
                      >
                        <input
                          type="checkbox"
                          disabled={start.isPending || (!checked && selected.length >= 3)}
                          className="mt-1 accent-ink"
                          checked={checked}
                          onChange={() =>
                            setSelected((current) =>
                              checked
                                ? current.filter((id) => id !== candidate.id)
                                : [...current, candidate.id],
                            )
                          }
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
                            {platformNames[candidate.platform]}
                          </p>
                          <p className="mt-1 truncate text-sm font-semibold">
                            {candidate.display_name || candidate.handle}
                          </p>
                          <p className="truncate text-xs text-text-secondary">
                            {candidate.handle}
                          </p>
                          <a
                            href={safeUrl(candidate.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 inline-flex items-center gap-1 text-xs underline underline-offset-4"
                            onClick={(event) => event.stopPropagation()}
                          >
                            Check profile <ArrowUpRight size={11} />
                          </a>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl bg-surface-subtle p-4">
                  <p className="text-xs text-text-secondary">
                    Choose up to 3 accounts, with up to 12 recent public posts each.
                    The report saves in this workspace.
                  </p>
                  <button
                    type="button"
                    className={primary}
                    disabled={!selected.length || start.isPending || !providerReady}
                    onClick={() => start.mutate()}
                  >
                    {start.isPending ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ScanEye size={16} />
                    )}
                    Build visual review
                  </button>
                </div>
              </section>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              className="mb-5 flex items-center gap-1 text-xs text-text-secondary hover:text-ink"
              onClick={newResearch}
            >
              <ChevronLeft size={14} />
              New research
            </button>
            {report.isLoading && (
              <div className="flex min-h-64 items-center justify-center gap-3 text-sm text-text-secondary">
                <Loader2 className="animate-spin" size={20} />
                Opening your research…
              </div>
            )}
            {report.error && (
              <div className="rounded-xl border border-danger bg-danger-surface p-5 text-sm text-danger">
                {errorMessage(report.error)}
                <button
                  type="button"
                  className="ml-3 underline"
                  onClick={() => void report.refetch()}
                >
                  Retry
                </button>
              </div>
            )}
            {run && (
              <>
                <div className="mb-7 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
                  <div>
                    <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-text-secondary">
                      {working ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <CheckCheck size={14} />
                      )}
                      {statusNames[run.status]}
                    </p>
                    <h1 className="break-words font-display text-3xl font-bold tracking-tight md:text-4xl">
                      {run.query.match(/^https?:\/\//i)
                        ? run.targets[0]?.display_name || `@${run.targets[0]?.handle || "Social profile"}`
                        : run.query}
                    </h1>
                    <p className="mt-3 text-xs text-text-secondary">
                      Checked {date(run.updated_at)} · {run.targets.length}{" "}
                      account{run.targets.length === 1 ? "" : "s"} ·{" "}
                      {run.posts.length} retrieved posts
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {run.targets.map((target) => (
                      <a
                        key={target.id}
                        href={safeUrl(target.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border-control px-3 py-1.5 text-[11px] font-medium"
                      >
                        {platformNames[target.platform]} · {target.handle}
                        <ArrowUpRight size={11} />
                      </a>
                    ))}
                  </div>
                </div>
                {run.analysis && (run.status === "complete" || run.status === "partial") && (
                  <div className="mb-7 flex flex-wrap items-center gap-3 rounded-2xl border border-border-control bg-surface p-4">
                    <div className="min-w-48 flex-1">
                      <p className="text-sm font-semibold">A visual report your client can open</p>
                      <p className="mt-0.5 text-xs text-text-secondary">Real posts and comparable businesses on one page. No login needed; anyone with the link can view it.</p>
                    </div>
                    <button type="button" className={primary} onClick={shareReport} disabled={shareBusy}>
                      {shareBusy ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
                      Share visual report
                    </button>
                    {shareUrl && (
                      <>
                        <button type="button" className={secondary} onClick={async () => {
                          try { await navigator.clipboard.writeText(shareUrl); toast.success("Report link copied"); }
                          catch { toast.error("Could not copy the link. Select it below instead."); }
                        }}><Link2 size={15} /> Copy link</button>
                          <button type="button" className={secondary} onClick={() => window.open(shareUrl, "_blank", "noopener,noreferrer")}>Open report <ArrowUpRight size={14} /></button>
                          <button type="button" className={secondary} onClick={openCompetitorEditor}>Edit competitors</button>
                          <button type="button" className={secondary} disabled={regenerateBusy || sharedReport.data?.visual?.status === "pending"} onClick={() => void regenerateVisualReport(null)}>
                            {regenerateBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Regenerate
                          </button>
                          {sharedReport.data?.visual?.status === "pending" && <p role="status" className="w-full text-xs text-text-secondary">{sharedReport.data.visual.progress || "Finding comparable businesses and recent examples…"}</p>}
                          {sharedReport.data?.visual?.status === "partial" && <p role="status" className="w-full text-xs text-text-secondary">Some competitor posts were unavailable; the report shows the examples retrieved.</p>}
                          {competitorEditorOpen && <div className="w-full rounded-2xl border border-border bg-canvas p-4 md:p-5">
                            <div className="mb-4 flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-semibold">Selected competitors</p><p className="mt-1 text-xs text-text-secondary">See the profiles and recent public posts before updating this link.</p></div><span className="text-xs text-text-muted">{competitorChoices.length} / 3 selected</span></div>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              {competitorChoices.map((item) => <article key={item.target.id} className="overflow-hidden rounded-xl border border-border bg-surface">
                                <div className="flex items-center gap-3 p-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-subtle">{safeUrl(item.target.avatar_url) ? <img src={safeUrl(item.target.avatar_url)} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" /> : <span className="text-sm font-bold">{item.target.handle.slice(0, 1).toUpperCase()}</span>}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{item.name}</p><p className="truncate text-xs text-text-secondary">{platformNames[item.target.platform]} · @{item.target.handle}</p></div><button type="button" aria-label={`Remove ${item.name}`} className="rounded-full border border-border p-2 text-text-secondary hover:text-ink" onClick={() => setCompetitorChoices((items) => items.filter((choice) => choice.target.id !== item.target.id))}><X size={14} /></button></div>
                                {item.posts.length ? <div className="grid grid-cols-2 gap-1 px-3 pb-3">{item.posts.slice(0, 2).map((post) => <a key={post.id} href={safeUrl(post.url)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${item.name} post`} className="aspect-[4/3] overflow-hidden rounded-lg bg-surface-subtle">{safeUrl(post.thumbnail_url) ? <img src={safeUrl(post.thumbnail_url)} alt="Recent public post" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><ImageIcon size={18} /></div>}</a>)}</div> : <p className="px-3 pb-3 text-xs text-text-secondary">{item.preview === "loading" ? "Pulling recent posts…" : "Preview unavailable; posts will be checked when you regenerate."}</p>}
                              </article>)}
                              {competitorChoices.length < 3 && <button type="button" className="flex min-h-36 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border-control bg-surface text-sm font-semibold hover:bg-surface-subtle" onClick={() => document.getElementById("research-competitor-query")?.focus()}><Plus size={20} /> Add competitor</button>}
                            </div>
                            {competitorChoices.length < 3 && <div className="mt-4"><label htmlFor="research-competitor-query" className="text-xs font-semibold">Find a competitor</label><div className="mt-2 flex flex-col gap-2 sm:flex-row"><input id="research-competitor-query" value={competitorQuery} onChange={(event) => setCompetitorQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void lookupCompetitor(); } }} className={control} placeholder="Website, Instagram link, @handle, or tiktok:@handle" maxLength={500} /><button type="button" className={secondary} disabled={competitorLookupBusy || !competitorQuery.trim()} onClick={() => void lookupCompetitor()}>{competitorLookupBusy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Find profile</button></div></div>}
                            {competitorMatches.length > 0 && <div className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Matching profiles">{competitorMatches.map((target) => <button key={target.id} type="button" className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3 text-left hover:bg-surface-subtle" onClick={() => void addCompetitor(target)}><span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-subtle text-xs font-bold">{target.handle.slice(0, 1).toUpperCase()}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{target.display_name || `@${target.handle}`}</span><span className="block truncate text-xs text-text-secondary">{platformNames[target.platform]} · {target.url}</span></span><Plus size={16} /></button>)}</div>}
                            <div className="mt-4 flex flex-wrap gap-2"><button type="button" className={primary} disabled={regenerateBusy || sharedReport.data?.visual?.status === "pending"} onClick={() => void regenerateVisualReport(competitorChoices.map((item) => item.target.url))}>Save and regenerate</button><button type="button" className={secondary} onClick={() => setCompetitorEditorOpen(false)}>Cancel</button></div>
                          </div>}
                        <input aria-label="Shared report link" readOnly value={shareUrl} onFocus={(event) => event.target.select()} className="w-full truncate rounded-lg bg-canvas px-3 py-2 text-xs text-text-secondary" />
                      </>
                    )}
                    <button type="button" className="text-xs text-text-secondary underline underline-offset-4 hover:text-ink" onClick={async () => {
                      if (!window.confirm("Disable all shared links for this report? You can create a new link afterwards.")) return;
                      try {
                        await revokeResearchShares({ data: { workspace_id: workspaceId, run_id: run.id } });
                        setShareUrl("");
                        setShareToken("");
                        toast.success("Shared links disabled");
                      } catch (error) { toast.error(errorMessage(error)); }
                    }}>Disable shared links</button>
                  </div>
                )}
                {working && (
                  <div
                    role="status"
                    className="mb-7 rounded-2xl bg-ink p-5 text-inverse"
                  >
                    <div className="flex items-center gap-3">
                      <ScanEye className="shrink-0 animate-pulse" size={22} />
                      <div>
                        <p className="text-sm font-semibold">
                          {statusNames[run.status]}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-inverse/70">
                          Posts appear as sources finish. You can leave this
                          page and reopen the saved report later.
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 flex gap-2">
                      {[
                        "Find accounts",
                        "Collect posts",
                        "Creative review",
                      ].map((label, index) => (
                        <span
                          key={label}
                          className={cn(
                            "flex-1 rounded-lg px-2 py-2 text-center text-[10px]",
                            index === 0 ||
                              (index === 1 && run.status === "analyzing")
                              ? "bg-inverse/15 text-inverse"
                              : "border border-inverse/20 text-inverse/60",
                          )}
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {!!run.errors.length && (
                  <div className="mb-7 space-y-2 rounded-xl border border-border-control bg-surface p-4 text-xs leading-5 text-text-secondary">
                    <p className="font-semibold text-ink">Source coverage</p>
                    {run.errors.map((error) => (
                      <p key={error}>{error}</p>
                    ))}
                  </div>
                )}
                {run.analysis && (
                  <section className="mb-8" aria-label="Creative review">
                    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                      <div>
                        <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                          <Sparkles size={14} /> The creative read
                        </p>
                        <h2 className="mt-1 font-display text-2xl font-bold">The 30-second review</h2>
                      </div>
                      <span className="text-xs text-text-secondary">Based on {run.posts.length} public posts</span>
                    </div>
                    <div className="rounded-2xl bg-ink p-5 text-inverse md:p-6">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-inverse/60">The take</p>
                      <p className="mt-2 max-w-5xl font-display text-lg font-semibold leading-snug md:text-xl">
                        {firstThought(run.analysis.summary)}
                      </p>
                      {firstThought(run.analysis.summary) !== run.analysis.summary.trim() && (
                        <details className="mt-3 text-xs text-inverse/75">
                          <summary className="cursor-pointer underline underline-offset-4">Read the full assessment</summary>
                          <p className="mt-3 max-w-4xl leading-6">{run.analysis.summary}</p>
                        </details>
                      )}
                    </div>
                    <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
                      {run.analysis.findings.map((finding, index) => {
                        const evidence = finding.post_ids
                          .map((id) => run.posts.find((post) => post.id === id))
                          .filter((post): post is ResearchPost => !!post);
                        const cover = evidence.find((post) => safeUrl(post.thumbnail_url));
                        return (
                          <article key={`${finding.title}-${index}`} className="overflow-hidden rounded-2xl border border-border bg-surface">
                            <div className="flex min-h-32 gap-4 p-4">
                              <button
                                type="button"
                                disabled={!cover}
                                onClick={() => cover && setOpenPost(cover)}
                                className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-surface-subtle disabled:cursor-default"
                                aria-label={cover ? `Open source post for ${finding.title}` : undefined}
                              >
                                {cover ? (
                                  <img src={safeUrl(cover.thumbnail_url)} alt="Source post cover" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover" />
                                ) : <ImageIcon size={22} className="m-auto text-text-muted" />}
                              </button>
                              <div className="min-w-0 flex-1">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Finding {String(index + 1).padStart(2, "0")}</p>
                                <h3 className="mt-1 font-display text-base font-bold leading-snug">{finding.title}</h3>
                                <p className="mt-2 text-xs leading-5 text-text-secondary">{previewText(finding.body, 125)}</p>
                              </div>
                            </div>
                            <details className="border-t border-border px-4 py-3 text-xs text-text-secondary">
                              <summary className="cursor-pointer font-semibold text-ink">Why we say this · {evidence.length} source{evidence.length === 1 ? "" : "s"}</summary>
                              <p className="mt-3 leading-6">{finding.body}</p>
                              <div className="mt-3 flex flex-wrap gap-2">
                                {evidence.map((post) => (
                                  <button type="button" key={post.id} onClick={() => setOpenPost(post)} className="rounded-full border border-border-control px-2.5 py-1.5 text-[11px] text-ink hover:bg-canvas">
                                    {platformNames[post.platform]} · {date(post.published_at)} <ArrowUpRight size={11} className="inline" />
                                  </button>
                                ))}
                              </div>
                            </details>
                          </article>
                        );
                      })}
                    </div>
                    <div className="mt-4 rounded-2xl border border-border bg-surface p-5 md:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted"><Film size={14} /> A stronger reel treatment</p>
                          <h3 className="mt-1 font-display text-xl font-bold">{run.analysis.treatment.title}</h3>
                        </div>
                        <span className="rounded-full bg-canvas px-3 py-1 text-[10px] text-text-secondary">Concept only · No video generated</span>
                      </div>
                      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-xl bg-ink p-4 text-inverse">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-inverse/60">Opening hook</p>
                          <p className="mt-3 font-editorial text-xl italic leading-snug">“{run.analysis.treatment.hook}”</p>
                        </div>
                        {run.analysis.treatment.beats.slice(0, 3).map((beat, index) => (
                          <div key={`${index}-${beat}`} className="rounded-xl bg-canvas p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">Beat {String(index + 1).padStart(2, "0")}</p>
                            <p className="mt-3 text-sm font-medium leading-6">{beat}</p>
                          </div>
                        ))}
                      </div>
                      <details className="mt-4 text-xs text-text-secondary">
                        <summary className="cursor-pointer font-semibold text-ink">Full treatment and reasoning</summary>
                        {run.analysis.treatment.beats.length > 3 && (
                          <ol className="mt-3 space-y-2">
                            {run.analysis.treatment.beats.slice(3).map((beat, index) => (
                              <li key={`${index}-${beat}`}><span className="font-semibold">Beat {String(index + 4).padStart(2, "0")} · </span>{beat}</li>
                            ))}
                          </ol>
                        )}
                        <p className="mt-2 max-w-4xl leading-6">{run.analysis.treatment.rationale}</p>
                      </details>
                    </div>
                  </section>
                )}
                <section className="mb-8">
                  <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                        The evidence
                      </p>
                      <h2 className="mt-1 font-display text-2xl font-bold">
                        Inside the recent feed
                      </h2>
                    </div>
                    <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
                      {[
                        "all",
                        ...new Set(run.posts.map((post) => post.platform)),
                      ].map((item) => (
                        <button
                          type="button"
                          key={item}
                          onClick={() => setPlatform(item)}
                          className={cn(
                            "rounded-md px-3 py-1.5 text-[11px] font-medium",
                            platform === item
                              ? "bg-ink text-inverse"
                              : "text-text-secondary hover:bg-canvas",
                          )}
                        >
                          {item === "all"
                            ? "All posts"
                            : platformNames[item as keyof typeof platformNames]}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="mb-5 text-xs leading-5 text-text-secondary">
                    Public counts are a snapshot, not private account analytics.
                    A dash means the metric was unavailable. Each post shows
                    what the AI could inspect.
                  </p>
                  {visiblePosts.length ? (
                    <div className="grid grid-cols-1 gap-4 min-[480px]:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {visiblePosts.map((post) => (
                        <PostCard
                          key={post.id}
                          post={post}
                          onOpen={() => setOpenPost(post)}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border-control bg-surface px-6 text-center text-text-secondary">
                      <Globe size={24} strokeWidth={1} />
                      <p className="text-sm">
                        {working
                          ? "Waiting for the first public posts…"
                          : "No public posts could be retrieved from these accounts."}
                      </p>
                      <p className="max-w-md text-xs leading-5">
                        {working
                          ? "The source gallery will fill in here as accounts finish."
                          : "Check the source coverage above, or start another review with a direct public profile link."}
                      </p>
                    </div>
                  )}
                </section>
                {run.analysis && (
                  <details className="rounded-2xl border border-border-control bg-surface p-5 md:p-7">
                    <summary className="cursor-pointer list-none font-display text-lg font-bold marker:hidden">
                      <span className="flex flex-wrap items-center justify-between gap-2">
                        <span className="flex items-center gap-2"><MessageSquare size={17} /> Client reply draft</span>
                        <span className="text-xs font-semibold text-text-secondary underline underline-offset-4">Open and edit reply</span>
                      </span>
                    </summary>
                    <div className="mt-5 border-t border-border pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-text-muted">
                          <MessageSquare size={14} />
                          Make it your own
                        </p>
                        <h2 className="font-display text-2xl font-bold">
                          Your client reply
                        </h2>
                        <p className="mt-2 text-xs text-text-secondary">
                          Edit the draft before you use it. Saving keeps it
                          within this workspace.
                        </p>
                      </div>
                      <button
                        type="button"
                        className={secondary}
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(reply);
                            toast.success("Reply copied");
                          } catch {
                            toast.error(
                              "Could not copy. Select and copy the reply below.",
                            );
                          }
                        }}
                      >
                        <Copy size={14} />
                        Copy reply
                      </button>
                    </div>
                    {run.question && (
                      <details className="mt-4 rounded-xl bg-canvas p-3 text-xs text-text-secondary">
                        <summary className="cursor-pointer font-medium">
                          Original client question
                        </summary>
                        <p className="mt-3 whitespace-pre-wrap leading-6">
                          {run.question}
                        </p>
                      </details>
                    )}
                    <label htmlFor="research-reply" className="sr-only">
                      Editable client reply
                    </label>
                    <textarea
                      id="research-reply"
                      className={cn(
                        control,
                        "mt-5 min-h-72 resize-y leading-7",
                      )}
                      value={reply}
                      maxLength={20000}
                      onChange={(event) => {
                        setReply(event.target.value);
                        setReplyDirty(true);
                      }}
                    />
                    <div className="mt-4 flex items-center justify-between gap-3">
                      <p className="text-xs text-text-muted">
                        {replyDirty
                          ? "You have unsaved edits."
                          : "Saved with the report."}
                      </p>
                      <button
                        type="button"
                        className={primary}
                        disabled={!replyDirty || save.isPending}
                        onClick={() => save.mutate()}
                      >
                        {save.isPending ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Check size={14} />
                        )}
                        Save reply
                      </button>
                    </div>
                    </div>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </div>
      {openPost && (
        <PostDetail post={openPost} onClose={() => setOpenPost(null)} />
      )}
    </div>
  );
}
