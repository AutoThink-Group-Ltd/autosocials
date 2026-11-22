import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { HomeSchedule } from "./HomeSchedule";
import { HomeContentLinks } from "./HomeContentLinks";
import { PersonalBrandGoals } from "./PersonalBrandGoals";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Check, Clapperboard, Eye, FileText, Images, Lightbulb, MessageCircle, Play, Sparkles, Target, Trash2, TrendingUp } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPersonalBrandReport, generatePersonalBrandReport, getPersonalBrandReviewStatus, refreshStalePersonalBrandReview } from "@/lib/personal-brand.functions";
import type { PersonalBrandReport } from "@/lib/personal-brand-report";
import { Button } from "@/components/ui/button";
import { SocialChannelIcon } from "@/components/agency/SocialChannelIcon";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/client-social-profiles";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { getPersonalBrandCorrections, savePersonalBrandCorrections } from "@/lib/personal-brand-corrections.functions";
import { getConnectedPersonalFeedCoverage, collectConnectedPersonalFeeds } from "@/lib/personal-connected-feeds.functions";
import { getPersonalContentIdeas, getPersonalIdeaTrash, setPersonalIdeaTrash } from "@/lib/personal-content-ideas.functions";
import { getWinners } from "@/lib/winners.functions";
import { savePersonalIdeaBatch } from "@/lib/personal-idea-batch.functions";
import { generateWrittenPosts } from "@/lib/written-posts.functions";
import { planSocialTiles } from "@/lib/social-tiles.functions";
import type { TilePlan } from "@/lib/social-tiles";

type Channel = { platform: string; handle: string; url?: string | null; status: string; posts: { url: string }[] };
type Finding = PersonalBrandReport["impression"][number];

export function PersonalBrandReview({ workspaceId, channels, onDiscoveryUpdated, hasContent = false, profileUrl }: { workspaceId: string; channels: Channel[]; onDiscoveryUpdated: () => void; hasContent?: boolean; profileUrl?: string | null }) {
  const queryClient = useQueryClient();
  const getReport = useServerFn(getPersonalBrandReport);
  const getCoverage = useServerFn(getConnectedPersonalFeedCoverage);
  const coverage = useQuery({ queryKey: ["personal-feed-coverage", workspaceId], queryFn: () => getCoverage({ data: { workspace_id: workspaceId } }) });
  const collectFeeds = useServerFn(collectConnectedPersonalFeeds);
  const getStatus = useServerFn(getPersonalBrandReviewStatus);
  const refreshStale = useServerFn(refreshStalePersonalBrandReview);
  const requested = useRef(false);
  const statusBeforeQueue = useRef<string | null>(null);
  const [queued, setQueued] = useState(false);
  const [queueError, setQueueError] = useState(false);
  const [feedError, setFeedError] = useState(false);
  const accounts = useQuery({ queryKey: ["personal-connected-count", workspaceId], queryFn: async () => { const result = await supabase.from("social_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("status", "connected").eq("is_enabled", true); if (result.error) throw result.error; return result.count ?? 0; } });
  const status = useQuery({ queryKey: ["personal-brand-review-status", workspaceId], queryFn: () => getStatus({ data: { workspace_id: workspaceId } }), refetchInterval: (q) => q.state.data?.status === "running" || queued ? 3000 : false });
  useEffect(() => { if (requested.current || !status.isSuccess || !status.data.canEdit) return; requested.current = true; void (async () => { if (status.data.status !== "running") await collectFeeds({ data: { workspace_id: workspaceId } }).then(() => coverage.refetch()).catch(() => setFeedError(true)); const result = await refreshStale({ data: { workspace_id: workspaceId } }); if (result.queued) { statusBeforeQueue.current = status.data.updatedAt; setQueueError(false); setQueued(true); } await status.refetch(); })().catch(() => {}); }, [workspaceId, status.isSuccess, status.data?.canEdit]);
  useEffect(() => { if (!queued) return; if (status.data?.status === "running" || (status.data?.updatedAt && status.data.updatedAt !== statusBeforeQueue.current && ["complete", "failed"].includes(status.data.status))) { setQueued(false); return; } const timer = setTimeout(() => { setQueued(false); setQueueError(true); }, 20000); return () => clearTimeout(timer); }, [queued, status.data?.status, status.data?.updatedAt]);
  const generate = useServerFn(generatePersonalBrandReport);
  const query = useQuery({ queryKey: ["personal-brand-report", workspaceId], queryFn: () => getReport({ data: { workspace_id: workspaceId } }) });
  const run = useMutation({ mutationFn: async () => { statusBeforeQueue.current = status.data?.updatedAt ?? null; setQueueError(false); setFeedError(false); await collectFeeds({ data: { workspace_id: workspaceId, force: true } }).then(() => coverage.refetch()).catch(() => setFeedError(true)); return generate({ data: { workspace_id: workspaceId } }); }, onSuccess: () => { setQueued(true); void query.refetch(); void status.refetch(); } });
  useEffect(() => { if (status.data?.status === "complete") { void query.refetch(); void queryClient.invalidateQueries({ queryKey: ["personal-content-ideas", workspaceId] }); onDiscoveryUpdated(); } }, [status.data?.status, status.data?.updatedAt]);
  const report = query.data;
  const running = run.isPending || queued || status.data?.status === "running";
  const dates = report?.evidence.flatMap((item) => item.date && Number.isFinite(Date.parse(item.date)) ? [Date.parse(item.date)] : []) ?? [];
  const period = dates.length ? `${new Date(Math.min(...dates)).toLocaleDateString()} to ${new Date(Math.max(...dates)).toLocaleDateString()}` : "dates unavailable";
  const bases = [...new Set(report?.evidence.flatMap((item) => item.basis) ?? [])];
  const renderFindings = (title: string, findings: Finding[], channelCard = false, showSources = false) => {
    if (!findings.length) return null;
    const platforms = [...new Set(findings.flatMap(finding => finding.evidenceIds.flatMap(id => { const platform = report?.evidence.find(item => item.id === id)?.platform; return platform && (SOCIAL_PLATFORMS as readonly string[]).includes(platform) ? [platform as SocialPlatform] : []; })))];
    const Icon = title === "First impression" ? Eye : title === "Recurring themes" ? Target : title === "Strengths" ? TrendingUp : title === "Mixed signals" ? MessageCircle : title === "Opportunities" ? Lightbulb : Sparkles;
    const evidenceLinks = (finding: Finding) => <div className="mt-3 flex flex-wrap gap-2">{finding.evidenceIds.map((id) => { const post = report?.evidence.find((item) => item.id === id); return post ? <a key={id} href={post.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-full bg-surface-subtle px-3 py-1 text-xs font-medium underline">{post.platform} {post.basis.includes("profile") ? "profile" : post.date ? new Date(post.date).toLocaleDateString() : "post"}<ArrowUpRight className="size-3" /></a> : null; })}</div>;
    return <section className={`min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6 ${channelCard ? "flex min-h-64 flex-1 flex-col" : ""}`}>
      <div className="flex items-start justify-between gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-subtle"><Icon className="size-5" aria-hidden /></span><span className="rounded-full bg-surface-subtle px-3 py-1 text-xs font-semibold text-muted-foreground">{findings.length} {findings.length === 1 ? "insight" : "insights"}</span></div>
      {showSources && platforms.length > 0 && <div className="mt-4 flex flex-wrap items-center gap-2" aria-label="Evidence sources"><span className="text-xs font-medium text-muted-foreground">Sources</span>{platforms.map(platform => <span key={platform} aria-label={platform} title={platform} className="grid size-7 place-items-center rounded-full bg-surface-subtle"><SocialChannelIcon platform={platform} className="size-3.5" /></span>)}</div>}
      <h2 className="mt-4 font-display text-lg font-bold capitalize">{title}</h2>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{findings[0]!.text}</p>
      <details className={`group border-t border-border pt-3 ${channelCard ? "mt-auto" : "mt-4"}`}><summary className="cursor-pointer list-none text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">Explore insights <span aria-hidden className="inline-block transition group-open:rotate-90">→</span></summary>
        <ul className="mt-4 space-y-5">{findings.map((finding, i) => <li key={i} className="text-sm leading-relaxed"><p>{finding.text}</p>{evidenceLinks(finding)}</li>)}</ul>
      </details>
    </section>;
  };
  return <div className="space-y-6" aria-label="Personal brand review">
    <section className="flex flex-wrap items-end justify-between gap-5 rounded-[28px] bg-ink p-7 text-inverse"><div><p className="text-xs font-semibold uppercase tracking-widest opacity-75">A first look by Sam</p><h1 className="mt-3 font-display text-3xl font-bold sm:text-4xl">How you come across</h1><p className="mt-2 text-sm opacity-80">Your personal brand, seen through the content available to Sam.</p>{report && <p className="mt-2 text-xs opacity-70">Last updated {new Date(report.generatedAt).toLocaleString()}</p>}</div><Button variant="secondary" disabled={running || !status.data?.canEdit} onClick={() => run.mutate()}>{running ? "Building your review…" : report ? "Update your review" : "Build your review"}</Button></section>
    {queueError && <p role="alert" className="text-sm text-destructive">The review did not start. Please try again.</p>}{feedError && <p role="alert" className="text-sm text-destructive">Connected feeds could not be refreshed. Available public evidence may still be used.</p>}{status.data?.status === "interrupted" && <p role="status">The last review was interrupted. A workspace manager can retry it.</p>}{status.data?.status === "failed" && <p role="status">The last review could not finish. A workspace manager can retry it.</p>}{query.isLoading && <p role="status">Loading your review…</p>}{query.isError && <p role="alert">Couldn’t load your review.</p>}{run.isError && <p role="alert" className="text-destructive">{run.error instanceof Error ? run.error.message : "Couldn’t build your review."}</p>}
    <Tabs defaultValue={hasContent ? "content" : "ideas"} className="space-y-4">
      <div className="overflow-x-auto"><TabsList aria-label="Personal brand review sections" className="h-auto min-w-max justify-start gap-1 rounded-xl bg-surface-subtle p-1">
        <TabsTrigger value="content" className="rounded-lg px-4 py-2.5">Content</TabsTrigger>
        <TabsTrigger value="schedule" className="rounded-lg px-4 py-2.5">Schedule</TabsTrigger>
        <TabsTrigger value="ideas" className="rounded-lg px-4 py-2.5">Ideas</TabsTrigger>
        <TabsTrigger value="input" className="rounded-lg px-4 py-2.5">Goals</TabsTrigger>
        <TabsTrigger value="channels" className="rounded-lg px-4 py-2.5">Channels</TabsTrigger>
        <TabsTrigger value="more" className="rounded-lg px-4 py-2.5">More</TabsTrigger>
      </TabsList></div>
      <TabsContent value="content"><HomeContentLinks workspaceId={workspaceId} /></TabsContent>
      <TabsContent value="ideas" forceMount className="data-[state=inactive]:hidden"><PersonalContentIdeas workspaceId={workspaceId} /></TabsContent>
      <TabsContent value="schedule"><HomeSchedule key={workspaceId} workspaceId={workspaceId} /></TabsContent>
      <TabsContent value="channels">
      <section className="space-y-4"><h2 className="font-display text-xl font-bold">Channels</h2><p className="text-sm text-muted-foreground">Connected accounts and saved profiles appear here. Sam only gives insights where there is enough evidence.</p>{coverage.isError && <p role="alert" className="text-sm text-destructive">Connected accounts could not be loaded.</p>}{coverage.isLoading && <p role="status" className="text-sm text-muted-foreground">Loading connected accounts…</p>}<div className="grid items-stretch gap-4 sm:grid-cols-2">{[...new Set([...(coverage.data?.accounts ?? []).map(account => account.platform), ...channels.map(channel => channel.platform), ...(report?.channels ?? []).map(channel => channel.platform)])].map(platform => { const connected = (coverage.data?.accounts ?? []).filter(account => account.platform === platform); const profiles = channels.filter(channel => channel.platform === platform); const findings = report?.channels.filter(channel => channel.platform === platform).flatMap(channel => channel.findings) ?? []; const counts = connected.map(account => account.status === "available" ? `${account.count} recent posts retrieved` : account.status === "empty" ? "No recent posts returned" : account.status === "unsupported" ? "Connected feed collection not supported" : account.status === "unavailable" ? "Connected feed could not be retrieved" : "Connected feed not reviewed yet"); return <div key={platform} className="flex min-w-0 flex-col gap-2">{findings.length ? renderFindings(platform, findings, true) : <section className="min-h-64 flex-1 rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="grid size-10 place-items-center rounded-xl bg-surface-subtle"><Sparkles className="size-5" aria-hidden /></div><h2 className="mt-4 font-display text-lg font-bold capitalize">{platform}</h2><p className="mt-2 text-sm text-muted-foreground">No channel insights yet. Sam needs enough usable evidence to assess this channel.</p></section>}<div className="mt-auto min-h-12 rounded-xl bg-surface-subtle px-4 py-3 text-xs text-muted-foreground">{connected.length ? connected.map((account, index) => <p key={account.id}>{account.handle ? `@${account.handle.replace(/^@/, "")} · ` : ""}Connected · {counts[index]}</p>) : <p>{coverage.isLoading || coverage.isError ? "Connection status unavailable" : profiles.length ? "Saved public profile · no connected account" : "Insights from reviewed evidence"}</p>}</div></div>; })}</div></section>
      </TabsContent>
      <TabsContent value="more" className="space-y-8">
        {report ? <div className="grid items-start gap-4 sm:grid-cols-2">{renderFindings("First impression", report.impression, false, true)}{renderFindings("Recurring themes", report.themes, false, true)}{renderFindings("Strengths", report.strengths, false, true)}{renderFindings("Mixed signals", report.mixedSignals, false, true)}</div> : <section className="rounded-2xl border border-border bg-card p-6"><h2 className="font-display text-xl font-bold">Your first impression</h2><p className="mt-2 text-sm text-muted-foreground">{query.isLoading ? "Loading your review…" : "No personal review has been generated yet. Build your review to see Sam’s first impression."}</p></section>}
      <PerformanceOpportunities workspaceId={workspaceId} />

    <section className="space-y-4" aria-label="Coverage">
      <div><h2 className="font-display text-xl font-bold">Coverage</h2><p className="mt-1 text-sm text-muted-foreground">A sample of available evidence, not every post. Connected feeds include posts from the past year. Private analytics are not assumed.</p></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-2xl font-bold">{report ? report.evidence.filter(item => !item.basis.includes("profile")).length : "—"}</p><p className="mt-1 text-xs text-muted-foreground">Posts reviewed</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-2xl font-bold">{report ? report.evidence.filter(item => item.basis.includes("profile")).length : "—"}</p><p className="mt-1 text-xs text-muted-foreground">Profiles reviewed</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-2xl font-bold">{accounts.isError || accounts.isLoading ? "—" : accounts.data}</p><p className="mt-1 text-xs text-muted-foreground">Connected accounts</p></div>
        <div className="rounded-2xl border border-border bg-card p-4"><p className="text-sm font-semibold">{report ? period : "Not yet available"}</p><p className="mt-1 text-xs text-muted-foreground">Evidence period</p></div>
      </div>
      <p className="text-xs text-muted-foreground">{report ? `Updated ${new Date(report.generatedAt).toLocaleString()} · Reviewed: ${bases.join(", ") || "unavailable"}.` : "No personal review has been generated yet."}</p>
      <details className="rounded-2xl border border-border bg-card p-4"><summary className="cursor-pointer font-display text-lg font-bold">Saved public profiles</summary><div><h3 className="sr-only">Saved public profiles</h3><p className="mt-1 text-xs text-muted-foreground">Public profile checks and connected account feeds are separate; a review can use either.</p></div>
      <ul className="grid gap-3 sm:grid-cols-2">{channels.map((channel, index) => { const count = report?.evidence.filter(item => item.platform === channel.platform && !item.basis.includes("profile")).length ?? 0; const profileCount = report?.evidence.filter(item => item.platform === channel.platform && item.basis.includes("profile")).length ?? 0; const sourceStatus = channel.status === "available" ? `${channel.posts.length} public posts retrieved` : channel.status === "unsupported" ? "public profile collection not supported" : channel.status === "unavailable" ? "No recent content available" : channel.status === "empty" ? "No recent content available" : "public profile not checked yet"; return <li key={`${channel.platform}-${index}`} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4"><p className="font-semibold capitalize">{channel.platform}</p><p className="mt-1 text-xs text-muted-foreground">@{channel.handle.replace(/^@/, "")}</p><p className="mt-3 text-sm">{sourceStatus}{report && ` · ${count} post${count === 1 ? "" : "s"} used across this platform${profileCount ? " · profile description reviewed" : ""}`}</p></li>; })}</ul>
      </details><details className="rounded-2xl border border-border bg-card p-4"><summary className="cursor-pointer font-display text-lg font-bold">Connected accounts</summary><div><h3 className="sr-only">Connected accounts</h3><p className="mt-1 text-xs text-muted-foreground">Saved profiles are not necessarily connected accounts.</p></div>
      {coverage.isError ? <p className="text-sm text-destructive">Couldn’t load connected account coverage.</p> : coverage.isLoading ? <p className="text-sm">Loading account coverage…</p> : coverage.data?.accounts.length ? <ul className="mt-3 grid gap-3 sm:grid-cols-2">{coverage.data.accounts.map(account => <li key={account.id} className="rounded-2xl border border-border bg-card p-4"><p className="font-semibold capitalize">{account.platform}</p>{account.handle && <p className="mt-1 text-xs text-muted-foreground">@{account.handle.replace(/^@/, "")}</p>}<p className="mt-3 text-sm">{account.status === "available" ? `${account.count} recent posts retrieved` : account.status === "empty" ? "No recent posts returned" : account.status === "unsupported" ? "Collection not supported" : account.status === "unavailable" ? "Could not retrieve posts" : "Not reviewed yet"}</p></li>)}</ul> : <p className="text-sm text-muted-foreground">No accounts connected.</p>}</details>
    </section>
        {report && <details className="rounded-2xl border border-border bg-card p-6"><summary className="cursor-pointer font-display text-xl font-bold">Evidence reviewed</summary><ul className="mt-4 max-h-[32rem] space-y-3 overflow-y-auto pr-2">{report.evidence.map((post) => <li key={post.id} className="text-sm"><a className="font-medium underline" href={post.url} target="_blank" rel="noreferrer">{post.platform} · {post.basis.includes("profile") ? "Profile" : post.date ? new Date(post.date).toLocaleDateString() : "Date unavailable"} ↗</a><p className="text-xs text-muted-foreground">Reviewed: {post.basis.join(", ")} · {post.attribution === "authored" ? "Matched to your profile" : post.attribution === "repost" ? "Repost — another person’s words" : post.attribution === "self_description" ? "Profile self-description" : "Authorship not verified"}</p><p className="mt-1 line-clamp-3 whitespace-pre-line">{post.caption}</p></li>)}</ul></details>}
      </TabsContent>
      <TabsContent value="input" forceMount className="space-y-4 data-[state=inactive]:hidden"><PersonalBrandGoals key={workspaceId + (profileUrl ?? "")} workspaceId={workspaceId} profileUrl={profileUrl} /><PersonalBrandCorrections workspaceId={workspaceId} /></TabsContent>
    </Tabs>
  </div>;
}

type ContentIdea = { title: string; angle: string };
type IdeaFormat = "video" | "tiles" | "written";
type PreparedIdea = { format: IdeaFormat; text?: string; plan?: TilePlan; error?: string };
function PersonalContentIdeas({ workspaceId }: { workspaceId: string }) {
  const getIdeas = useServerFn(getPersonalContentIdeas);
  const saveBatch = useServerFn(savePersonalIdeaBatch);
  const writePost = useServerFn(generateWrittenPosts);
  const planTile = useServerFn(planSocialTiles);
  const getTrash = useServerFn(getPersonalIdeaTrash);
  const saveTrash = useServerFn(setPersonalIdeaTrash);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<ContentIdea[]>([]);
  const [formats, setFormats] = useState<Record<string, IdeaFormat>>({});
  const [step, setStep] = useState<"ideas" | "formats" | "prepared">("ideas");
  const [prepared, setPrepared] = useState<Record<string, PreparedIdea>>({});
  const [preparing, setPreparing] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [planReady, setPlanReady] = useState<string | null>(null);
  useEffect(() => { setSelected([]); setFormats({}); setPrepared({}); setStep("ideas"); try { const saved = JSON.parse(sessionStorage.getItem(`as:idea-plan:${workspaceId}`) ?? "null"); if (saved && Array.isArray(saved.selected)) { setSelected(saved.selected.filter((item: unknown): item is ContentIdea => !!item && typeof item === "object" && typeof (item as ContentIdea).title === "string" && typeof (item as ContentIdea).angle === "string").slice(0, 20)); setFormats(saved.formats && typeof saved.formats === "object" ? Object.fromEntries(Object.entries(saved.formats).filter(([, value]) => value === "video" || value === "tiles" || value === "written")) as Record<string, IdeaFormat> : {}); if (saved.prepared && typeof saved.prepared === "object") setPrepared(saved.prepared); if (saved.step === "prepared") setStep("prepared"); else if (saved.step === "formats") setStep("formats"); } } catch { /* Ignore a malformed local plan. */ } setPlanReady(workspaceId); }, [workspaceId]);
  useEffect(() => { if (planReady === workspaceId) sessionStorage.setItem(`as:idea-plan:${workspaceId}`, JSON.stringify({ selected, formats, step, prepared })); }, [workspaceId, selected, formats, step, prepared, planReady]);
  const ideas = useQuery({ queryKey: ["personal-content-ideas", workspaceId], queryFn: () => getIdeas({ data: { workspace_id: workspaceId } }), staleTime: 10 * 60_000, refetchOnWindowFocus: false, retry: false });
  const [confirmIdea, setConfirmIdea] = useState<ContentIdea | null>(null);
  const trash = useQuery({ queryKey: ["personal-idea-trash", workspaceId], queryFn: () => getTrash({ data: { workspace_id: workspaceId } }), refetchOnWindowFocus: false });
  const changeTrash = useMutation({ mutationFn: ({ idea, trashed }: { idea: ContentIdea; trashed: boolean }) => saveTrash({ data: { workspace_id: workspaceId, idea, trashed } }), onSuccess: (_result, { idea, trashed }) => { queryClient.setQueryData<{ ideas: ContentIdea[]; needsContext: boolean }>(["personal-content-ideas", workspaceId], old => old ? { ...old, ideas: trashed ? old.ideas.filter(item => item.title !== idea.title) : [...old.ideas.filter(item => item.title !== idea.title), idea] } : { ideas: trashed ? [] : [idea], needsContext: false }); if (trashed) setSelected(old => old.filter(item => item.title !== idea.title)); void queryClient.invalidateQueries({ queryKey: ["personal-idea-trash", workspaceId] }); } });
  const shown = [...new Map([...selected, ...(ideas.data?.ideas ?? [])].map(item => [item.title.toLocaleLowerCase(), item])).values()].filter(item => !(trash.data?.ideas ?? []).some(removed => removed.title.toLocaleLowerCase() === item.title.toLocaleLowerCase()));
  const toggle = (item: ContentIdea) => setSelected(old => old.some(value => value.title === item.title) ? old.filter(value => value.title !== item.title) : old.length < 20 ? [...old, item] : old);
  async function createSelectedContent() {
    if (preparing || selected.some(item => !formats[item.title])) return;
    setPreparing(true); setBatchError("");
    try {
      const items = selected.map(item => ({ ...item, format: formats[item.title]! }));
      const signature = JSON.stringify(items);
      const key = `as:idea-batch-request:${workspaceId}`;
      let request: { signature: string; id: string } | null = null;
      try { request = JSON.parse(sessionStorage.getItem(key) ?? "null"); } catch { /* Start a new request. */ }
      if (!request || request.signature !== signature || typeof request.id !== "string") { request = { signature, id: crypto.randomUUID() }; sessionStorage.setItem(key, JSON.stringify(request)); }
      const batch = await saveBatch({ data: { workspace_id: workspaceId, request_id: request.id, items } });
      sessionStorage.setItem(`as:idea-batch-active:${workspaceId}`, batch.batchId);
      sessionStorage.removeItem(key);
      try { localStorage.setItem(`as:idea-batch-active:${workspaceId}`, batch.batchId); } catch { /* The saved plan remains available in this tab. */ }
      void navigate({ to: "/app/create", search: { ideaBatch: batch.batchId } });
    } catch (error) { setBatchError(error instanceof Error ? error.message : "Could not save your ideas. Please try again."); }
    finally { setPreparing(false); }
  }
  async function prepareAll() {
    if (preparing || selected.some(item => !formats[item.title])) return;
    setPreparing(true);
    setStep("prepared");
    const next: Record<string, PreparedIdea> = { ...prepared };
    for (const item of selected) {
      const format = formats[item.title]!;
      if (next[item.title]?.format === format && !next[item.title]?.error) continue;
      const brief = `${item.title}\n\n${item.angle}`;
      try {
        if (format === "tiles") next[item.title] = { format, plan: await planTile({ data: { workspace_id: workspaceId, brief, count: 1, previous_titles: [] } }) };
        else { const posts = await writePost({ data: { workspace_id: workspaceId, brief: format === "video" ? `Write a short spoken narration for a video about this idea:\n\n${brief}` : brief, count: 1 } }); next[item.title] = { format, text: posts[0] }; }
      } catch { next[item.title] = { format, error: "Could not prepare this idea. Try again." }; }
      setPrepared({ ...next });
    }
    setPreparing(false);
  }
  function openIdea(item: ContentIdea, result: PreparedIdea) {
    const brief = `${item.title}\n\n${item.angle}`;
    if (result.format === "written") { sessionStorage.setItem(`as:written-idea:${workspaceId}`, brief); if (result.text) sessionStorage.setItem(`as:written-draft:${workspaceId}`, result.text); }
    else if (result.format === "tiles" && result.plan) sessionStorage.setItem(`as:social-tiles:${workspaceId}`, JSON.stringify({ brief, plan: result.plan }));
    else { sessionStorage.setItem(`as:create-own-brief:${workspaceId}`, `${brief}\n\nSuggested narration: ${result.text ?? ""}`.slice(0, 600)); sessionStorage.setItem(`as:create-entry:${workspaceId}`, "brief"); sessionStorage.setItem(`as:create-count:${workspaceId}`, "1"); sessionStorage.setItem(`as:create-format:${workspaceId}`, "video"); sessionStorage.setItem("as:new-asset", "1"); }
    void navigate({ to: "/app/create", search: { wizard: result.format === "written" ? "written" : result.format === "tiles" ? "tiles" : "video" } });
  }
  return <section className="space-y-4"><AlertDialog open={!!confirmIdea} onOpenChange={open => { if (!open) setConfirmIdea(null); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Move idea to Trash?</AlertDialogTitle><AlertDialogDescription>You can restore this idea later from Settings.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirmIdea) changeTrash.mutate({ idea: confirmIdea, trashed: true }); }}>Move to Trash</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-display text-xl font-bold">{step === "ideas" ? "Content Ideas" : step === "formats" ? "Choose formats" : "Prepared ideas"}</h2><p className="mt-1 text-sm text-muted-foreground">{step === "ideas" ? "Select ideas to develop, or move unwanted ideas to Trash." : step === "formats" ? "Choose a format for each idea, then prepare them together." : "Review your drafts. Video and tile designs need a final production step."}</p></div>{step === "ideas" && <div className="flex gap-2"><Button type="button" variant="outline" disabled={ideas.isFetching || selected.length > 0} onClick={() => void ideas.refetch()}>Refresh ideas</Button></div>}</div>
    {changeTrash.isError && <p role="alert" className="text-sm text-destructive">Couldn’t update Trash. Please try again.</p>}{batchError && <p role="alert" className="text-sm text-destructive">{batchError}</p>}
    {step === "prepared" ? <><button className="text-sm underline" disabled={preparing} onClick={() => setStep("formats")}>← Back to formats</button>{preparing && <p role="status" className="text-sm text-muted-foreground">Sam is preparing your ideas…</p>}<div className="space-y-3">{selected.map(item => { const result = prepared[item.title]; return <article key={item.title} className="rounded-2xl border border-border bg-card p-5"><h3 className="font-bold">{item.title}</h3><p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{!result ? preparing ? "Waiting to prepare…" : "Preparation interrupted. Prepare again to continue." : result.error ? result.error : result.format === "tiles" ? result.plan?.tiles[0]?.headline : result.text}</p>{result && !result.error && <Button className="mt-4" variant="outline" disabled={preparing} onClick={() => openIdea(item, result)}>{result.format === "written" ? "Review written draft" : result.format === "tiles" ? "Create social tile" : "Create video"}</Button>}</article>; })}</div>{!preparing && selected.some(item => !prepared[item.title] || prepared[item.title]?.error) && <Button onClick={() => void prepareAll()}>Prepare again</Button>}</> : step === "formats" ? <><button className="text-sm underline" onClick={() => setStep("ideas")}>← Back to ideas</button><div className="space-y-3">{selected.map(item => <article key={item.title} className="rounded-2xl border border-border bg-card p-5"><h3 className="font-bold">{item.title}</h3><p className="mt-1 text-sm text-muted-foreground">{item.angle}</p><div role="group" aria-label={`Format for ${item.title}`} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">{(["video", "tiles", "written"] as const).map(format => <button type="button" key={format} aria-pressed={formats[item.title] === format} onClick={() => setFormats(old => ({ ...old, [item.title]: format }))} className="overflow-hidden rounded-xl border border-border text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink aria-pressed:border-ink aria-pressed:ring-2 aria-pressed:ring-ink"><span aria-hidden className={`flex h-24 items-center justify-center ${format === "video" ? "bg-ink text-inverse" : "bg-surface-subtle text-ink"}`}>{format === "video" ? <span className="relative flex size-20 items-center justify-center"><span className="absolute inset-0 rounded-full border border-inverse/20" /><span className="absolute inset-2 rounded-full border border-inverse/20" /><span className="relative flex h-14 w-10 -rotate-12 items-center justify-center rounded-lg border border-inverse/30 bg-surface-subtle/20"><Play className="size-5 fill-current" /></span></span> : format === "tiles" ? <span className="relative flex items-center justify-center"><span className="absolute h-14 w-12 -translate-x-7 -rotate-12 rounded-md border border-border-control bg-surface" /><span className="absolute h-14 w-12 translate-x-7 rotate-12 rounded-md border border-border-control bg-surface" /><span className="relative rotate-6 rounded-lg bg-ink p-2 font-display text-xs font-bold text-inverse">BIG IDEAS.<br />BOLD POSTS.</span></span> : <span className="rotate-3 rounded-lg border border-border-control bg-surface p-3 font-display text-sm font-bold">WORDS THAT<br />GO FURTHER.</span>}</span><span className="flex items-center gap-2 p-3 text-sm font-semibold">{format === "video" ? <Clapperboard className="size-4" /> : format === "tiles" ? <Images className="size-4" /> : <FileText className="size-4" />}{format === "video" ? "Video" : format === "tiles" ? "Social tile" : "Written post"}</span></button>)}</div></article>)}</div><Button disabled={!selected.length || selected.some(item => !formats[item.title]) || preparing} onClick={() => void createSelectedContent()}>{preparing ? "Saving ideas…" : "Create content"}</Button></> : <>
    {ideas.isFetching && <p role="status" className="text-sm text-muted-foreground">Sam is preparing your ideas…</p>}{ideas.isError && <p role="alert" className="text-sm text-destructive">Couldn’t prepare ideas. Try refreshing.</p>}{ideas.data?.needsContext && <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">Save your goals or add a social profile to give Sam a starting point.</p>}
    {!!shown.length && <><div className="grid gap-4 sm:grid-cols-2">{shown.map(item => <article key={item.title} onClick={event => { if (!(event.target as HTMLElement).closest("button, label, input")) toggle(item); }} className="group flex cursor-pointer flex-col rounded-2xl border border-border bg-card p-5"><div className="flex items-center justify-between"><span className="grid size-10 place-items-center rounded-xl bg-surface-subtle"><Lightbulb className="size-5" /></span><label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium"><input type="checkbox" className="peer sr-only" checked={selected.some(value => value.title === item.title)} onChange={() => toggle(item)} aria-label={`Select ${item.title}`} /><span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border-control bg-surface text-transparent peer-checked:border-ink peer-checked:bg-ink peer-checked:text-inverse peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink"><Check className="size-4" strokeWidth={2.5} /></span>Select</label></div><h3 className="mt-4 font-display text-lg font-bold">{item.title}</h3><p className="mt-2 flex-1 text-sm text-muted-foreground">{item.angle}</p><Button className="mt-4 min-h-11 min-w-11 self-end opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" variant="ghost" size="icon" aria-label={`Move ${item.title} to Trash`} disabled={!trash.data?.canEdit || changeTrash.isPending} onClick={() => setConfirmIdea(item)}><Trash2 className="size-4" aria-hidden="true" /></Button></article>)}</div><Button disabled={!selected.length} onClick={() => setStep("formats")}>Choose formats ({selected.length})</Button></>}
  </>}</section>;
}

function PerformanceOpportunities({ workspaceId }: { workspaceId: string }) {
  const getPerformance = useServerFn(getWinners);
  const performance = useQuery({ queryKey: ["personal-performance-opportunities", workspaceId], queryFn: () => getPerformance({ data: { workspace_id: workspaceId } }), staleTime: 60_000, retry: false });
  return <section className="space-y-4"><div><h2 className="font-display text-xl font-bold">Performance opportunities</h2><p className="mt-1 text-sm text-muted-foreground">Ideas to test based on measured results from your existing posts.</p></div>{performance.isLoading ? <p role="status" className="text-sm">Loading performance findings…</p> : performance.isError ? <p role="alert" className="text-sm text-destructive">Couldn’t load performance findings.</p> : performance.data?.findings.length ? <div className="grid gap-4 sm:grid-cols-2">{performance.data.findings.map(finding => <article key={finding.id} className="rounded-2xl border border-border bg-card p-5"><TrendingUp className="size-5" /><h3 className="mt-4 font-display text-lg font-bold">{finding.title}</h3><p className="mt-2 text-sm text-muted-foreground">{finding.explanation}</p></article>)}</div> : <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">No measured performance opportunities yet. Sync posts in Find winners to identify patterns when sufficient data is available.</p>}<a href="/app/winners" className="inline-block text-sm font-semibold underline">Open Find winners →</a></section>;
}

function PersonalBrandCorrections({ workspaceId }: { workspaceId: string }) {
  const getCorrections = useServerFn(getPersonalBrandCorrections);
  const saveCorrections = useServerFn(savePersonalBrandCorrections);
  const query = useQuery({ queryKey: ["personal-brand-corrections", workspaceId], queryFn: () => getCorrections({ data: { workspace_id: workspaceId } }) });
  const save = useMutation({ mutationFn: (text: string) => saveCorrections({ data: { workspace_id: workspaceId, text } }) });
  return <section className="rounded-2xl border border-border bg-card p-6"><h2 className="font-display text-xl font-bold">What should Sam understand differently?</h2><p className="mt-2 text-sm text-muted-foreground">Your corrections are saved separately from observed posts. Update the review after saving to use them.</p>{query.isLoading ? <p role="status">Loading corrections…</p> : query.isError ? <p role="alert">Couldn’t load corrections.</p> : <form className="mt-4 space-y-3" onSubmit={(event) => { event.preventDefault(); save.mutate(String(new FormData(event.currentTarget).get("corrections") ?? "")); }}><label className="block text-sm font-medium">Your corrections<textarea name="corrections" maxLength={4000} defaultValue={query.data?.text} disabled={!query.data?.canEdit} className="mt-1 min-h-24 w-full rounded-lg border border-input bg-background p-3" /></label>{query.data?.canEdit && <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save corrections"}</Button>}{save.isSuccess && <p role="status" className="text-sm">Corrections saved. Update your review to use them.</p>}{save.isError && <p role="alert" className="text-sm text-destructive">Couldn’t save corrections.</p>}</form>}</section>;
}
