import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Check, RefreshCw } from "lucide-react";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { getOlderWinnerPosts, getWinnerComments, getWinners, refreshWinnerFindings, updateWinnerShortlist } from "@/lib/winners.functions";
import { EmptyState } from "@/workspace/ui";
import { isFreshMeasurement, rankPosts, type Comparison } from "./ranking";

import { matchesPostSearch, PostSearch } from "./PostSearch";

export type WinnerPost = { title?: string | null; id: string; external_id: string; account_id: string; platform: string; caption: string; format: string; thumbnail_url: string | null; permalink: string | null; published_at: string; measured_at: string; views: number | null; reach: number | null; likes: number | null; comments_count: number | null; shares: number | null; comments_status: string };
type Account = { id: string; platform: string; handle: string | null; display_name: string | null; status: string; is_enabled: boolean };
type Sync = { account_id: string; status: string; message: string | null; cursor: string | null; last_success_at: string | null };
type Finding = { id: string; title: string; explanation: string; source_post_ids: string[]; evidence: { percentile: number }[]; updated_at: string };
type Cursor = { published_at: string; id: string };
type Dashboard = { posts: WinnerPost[]; accounts: Account[]; syncs: Sync[]; findings: Finding[]; shortlist: { winner_post_id: string }[]; next_cursor: Cursor | null };
const date = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const number = (value: number | null) => value === null ? "—" : new Intl.NumberFormat("en-GB", { notation: "compact", maximumFractionDigits: 1 }).format(value);
function PostPreview({ post }: { post: WinnerPost }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasImage = post.thumbnail_url && post.thumbnail_url !== failedUrl;
  const usePlayer = !hasImage && post.platform === "tiktok" && /^\d+$/.test(post.external_id);
  const caption = post.caption.trim();

  return <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface-subtle">
      {hasImage ? <img src={post.thumbnail_url!} alt="" loading="lazy" referrerPolicy="no-referrer"
        onError={() => setFailedUrl(post.thumbnail_url)} className="h-full w-full object-contain" /> :
        usePlayer ? <div className="flex h-full w-full flex-col"><iframe title={caption || "TikTok video preview"} loading="lazy" allowFullScreen
          className="min-h-0 w-full flex-1 border-0" src={`https://www.tiktok.com/player/v1/${post.external_id}?autoplay=0`} />
          {post.permalink && <a className="px-3 py-2 text-center text-sm font-semibold underline" href={post.permalink}
            target="_blank" rel="noopener noreferrer">Watch on TikTok ↗</a>}
        </div> :
        <div className="space-y-3 px-6">
          {caption ? <p className="line-clamp-4 whitespace-pre-line font-display text-xl font-semibold leading-snug">{caption}</p> :
            <p className="text-sm text-text-secondary">Preview unavailable</p>}
          {post.permalink && <a className="text-sm underline" href={post.permalink} target="_blank" rel="noopener noreferrer">Open original post ↗</a>}
        </div>}
    </div>;
}

function PostComments({ workspaceId, postId }: { workspaceId: string; postId: string }) {
  const query = useQuery({ queryKey: ["winner-comments", workspaceId, postId], queryFn: () => getWinnerComments({ data: { workspace_id: workspaceId, post_id: postId } }), staleTime: 60_000 });
  if (query.isLoading) return <p role="status">Loading comments…</p>;
  if (query.error || !query.data || query.data.status !== "available") return <p>Comment text is unavailable for this post or connection.</p>;
  return query.data.comments.length ? <>{query.data.comments.map((c, i) => <p key={i} className="rounded bg-surface-subtle p-2">{c.text}</p>)}</> : <p>No comments returned.</p>;
}

export function WinnersSurface() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const client = useQueryClient();
  const [account, setAccount] = useState("all"), [period, setPeriod] = useState("all");
  const [comparison, setComparison] = useState<Comparison>("engagement");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(60);
  const [opened, setOpened] = useState<string | null>(null);
  const [older, setOlder] = useState<WinnerPost[]>([]), [cursor, setCursor] = useState<Cursor | null | undefined>();
  const [syncError, setSyncError] = useState<string | null>(null), [syncing, setSyncing] = useState(false);
  const started = useRef<string | null>(null);
  const query = useQuery({ queryKey: ["winners", ws], queryFn: () => getWinners({ data: { workspace_id: ws! } }) as Promise<Dashboard>, enabled: !!ws, staleTime: 60_000, refetchOnWindowFocus: false });
  const dashboard = query.data;
  const allPosts = useMemo(() => [...new Map([...(dashboard?.posts ?? []), ...older].map(p => [p.id, p])).values()], [dashboard, older]);
  const update = useMutation({ mutationFn: (ids: string[]) => updateWinnerShortlist({ data: { workspace_id: ws!, post_ids: ids, selected: true } }), onSuccess: () => client.invalidateQueries({ queryKey: ["winners", ws] }) });
  const shortlist = useMemo(() => new Set((dashboard?.shortlist ?? []).map(x => x.winner_post_id)), [dashboard]);
  const ranks = useMemo(() => new Map(rankPosts(allPosts.filter(p => isFreshMeasurement(p.measured_at)).map(p => ({ id: p.id, accountId: p.account_id, platform: p.platform, format: p.format, publishedAt: p.published_at, measuredAt: p.measured_at, likes: p.likes, comments: p.comments_count, shares: p.shares, views: p.views, reach: p.reach })), comparison).map(p => [p.id, p])), [allPosts, comparison]);
  const more = useMutation({ mutationFn: (next: Cursor) => getOlderWinnerPosts({ data: { workspace_id: ws!, cursor: next } }), onSuccess: result => { setOlder(previous => [...previous, ...(result.posts as WinnerPost[])]); setCursor(result.next_cursor as Cursor | null); } });
  const posts = useMemo(() => {
    const cutoff = period === "all" ? 0 : Date.now() - Number(period) * 86_400_000;
    return allPosts.filter(p => (account === "all" || p.account_id === account) && Date.parse(p.published_at) >= cutoff && matchesPostSearch(p, search))
      .sort((a, b) => (ranks.get(b.id)?.percentile ?? -1) - (ranks.get(a.id)?.percentile ?? -1) || Date.parse(b.published_at) - Date.parse(a.published_at));
  }, [allPosts, account, period, ranks, search]);
  const visiblePosts = posts.slice(0, shown);
  async function syncAccounts(accounts: Account[]) {
    if (syncing || !accounts.length) return;
    setSyncing(true); setSyncError(null); setOlder([]); setCursor(undefined); let failures = 0;
    try {
      for (const target of accounts) for (let page = 0; page < 10; page++) {
        const { data, error } = await supabase.functions.invoke("winner-sync", { body: { account_id: target.id } });
        if (error || data?.error) { failures++; break; }
        await client.invalidateQueries({ queryKey: ["winners", ws] });
        if (!data?.has_more) break;
      }
      if (failures < accounts.length && ws) {
        try { await refreshWinnerFindings({ data: { workspace_id: ws } }); }
        catch { setSyncError("Posts synced, but Sam could not update the findings. Try syncing again later."); }
      }
    } catch { failures++; }
    finally { setSyncing(false); await client.invalidateQueries({ queryKey: ["winners", ws] }); }
    if (failures) setSyncError("Some accounts could not sync. See their status below.");
  }
  useEffect(() => { setAccount("all"); setSearch(""); setOpened(null); setOlder([]); setCursor(undefined); setShown(60); started.current = null; }, [ws]);
  useEffect(() => { setShown(60); }, [account, period, comparison, search]);
  useEffect(() => {
    if (!ws || !dashboard || syncing || started.current === ws) return;
    started.current = ws;
    const due = dashboard.accounts.filter(a => a.status === "connected" && a.is_enabled && (() => {
      const sync = dashboard.syncs.find(s => s.account_id === a.id);
      return !sync || (!!sync.cursor && sync.status !== "error" && sync.status !== "reconnect") || (!!sync.last_success_at && Date.now() - Date.parse(sync.last_success_at) > 12 * 3_600_000 && sync.status !== "reconnect");
    })());
    void syncAccounts(due);
  // Start once when this workspace's data first loads; later refreshes are explicit.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ws, dashboard, syncing]);
  if (!ws) return <div className="p-6"><EmptyState title="Choose a workspace" body="Select a client workspace to see its content intelligence." /></div>;
  if (query.isLoading) return <p className="p-6 text-sm text-text-secondary" role="status">Loading content intelligence…</p>;
  if (query.error || !dashboard) return <div className="p-6"><p role="alert">Could not load content intelligence.</p><Button variant="outline" onClick={() => void query.refetch()}>Try again</Button></div>;
  const connected = dashboard.accounts.filter(a => a.status === "connected" && a.is_enabled);
  const next = cursor === undefined ? dashboard.next_cursor : cursor;
  return <main className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="font-display text-3xl font-bold tracking-tight">Find winners</h1>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void syncAccounts(connected)} disabled={syncing || !connected.length}>
          <RefreshCw className={syncing ? "animate-spin" : ""} />{syncing ? "Syncing…" : "Sync accounts"}
        </Button>
        <Link to="/app/campaigns" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-semibold">
          <Bookmark size={16} /> Ad shortlist ({shortlist.size})
        </Link>
      </div>
    </header>
    {(syncError || update.error) && <p role="alert" className="text-sm text-destructive">{syncError || "Could not save this post. Try again."}</p>}
    <section aria-labelledby="top-posts" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-5">
        <div><h2 id="top-posts" className="font-display text-xl font-bold">Top performing posts</h2>
          <p className="text-sm text-text-secondary">Ranked against similar posts from the same account.</p></div>
        <div className="flex flex-wrap gap-2"><label className="text-xs">Account<select className="ml-2 rounded-md border border-border bg-canvas p-2 text-sm" value={account} onChange={e => setAccount(e.target.value)}><option value="all">All accounts</option>{dashboard.accounts.map(a => <option key={a.id} value={a.id}>{a.platform} · {a.handle || a.display_name || "Account"}</option>)}</select></label><label className="text-xs">Period<select className="ml-2 rounded-md border border-border bg-canvas p-2 text-sm" value={period} onChange={e => setPeriod(e.target.value)}><option value="30">30 days</option><option value="90">90 days</option><option value="365">12 months</option><option value="all">All time</option></select></label><label className="text-xs">Compare<select className="ml-2 rounded-md border border-border bg-canvas p-2 text-sm" value={comparison} onChange={e => setComparison(e.target.value as Comparison)}><option value="engagement">Engagement</option><option value="views">Views</option><option value="reach">Reach</option></select></label></div></div>
      <PostSearch value={search} onChange={setSearch} />
      {!posts.length && search.trim() && <p role="status">No matching posts in the loaded history.</p>}
      {!posts.length && !search.trim() && <EmptyState title="No posts in this view" body={connected.length ? "Choose a different account or period, or sync your posts." : "Connect a social account to see its posts here."} />}
      <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {visiblePosts.map(post => {
          const rank = ranks.get(post.id);
          const saved = shortlist.has(post.id);
          const owner = dashboard.accounts.find(a => a.id === post.account_id);
          return <article key={post.id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-surface">
            <PostPreview post={post} />
            <div className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-1 text-xs text-text-secondary">
                <span className="capitalize">{post.platform} · {owner?.handle || owner?.display_name || post.format}</span>
                <time dateTime={post.published_at}>{date(post.published_at)}</time>
              </div>
              {post.thumbnail_url && post.caption.trim() && <p className="line-clamp-2 font-medium">{post.caption || post.format}</p>}
              <p className="text-sm font-semibold">{rank?.percentile != null ? `Ahead of ${rank.percentile}% of comparable posts` : "Unranked"}</p>
              <dl className="grid grid-cols-3 gap-2 border-y border-border py-3">
                {([[comparison === "reach" ? "Reach" : "Views", comparison === "reach" ? post.reach : post.views], ["Likes", post.likes], ["Comments", post.comments_count]] as const).map(([label, value]) =>
                  <div key={label}><dt className="text-xs text-text-secondary">{label}</dt><dd className="font-display text-lg font-bold tabular-nums">{number(value)}</dd></div>)}
              </dl>
              <button className="text-xs underline" aria-expanded={opened === post.id} onClick={() => setOpened(opened === post.id ? null : post.id)}>
                {opened === post.id ? "Hide details" : "View details and comments"}
              </button>
              {opened === post.id && <div className="space-y-2 border-t border-border pt-3 text-sm">
                <p className="whitespace-pre-wrap">{post.caption}</p>
                <p>{number(post.views)} views · {number(post.reach)} {post.platform === "facebook" ? "unique viewers" : "reach"} · {number(post.shares)} shares</p>
                <p className="text-xs text-text-secondary">{rank?.reason || "Measurement is over seven days old."} Measured {date(post.measured_at)}.</p>
                <PostComments workspaceId={ws} postId={post.id} />
                {post.permalink && <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="underline">Open original post ↗</a>}
              </div>}
            </div>
            <div className="mt-auto px-4 pb-4">
              <Button className="w-full" variant={saved ? "outline" : "default"} disabled={saved || update.isPending}
                onClick={() => update.mutate([post.id])}>{saved ? <Check /> : <Bookmark />}{saved ? "Shortlisted" : "Shortlist for ads"}</Button>
            </div>
          </article>;
        })}
      </div>
      {shown < posts.length && <Button variant="outline" onClick={() => setShown(n => n + 60)}>Show more posts</Button>}
      {next && <Button variant="outline" disabled={more.isPending || syncing} onClick={() => more.mutate(next)}>{more.isPending ? "Loading…" : "Load older posts"}</Button>}
      {more.error && <p role="alert">Could not load older posts.</p>}
    </section>
    <details className="border-t border-border pt-4 text-sm text-text-secondary">
      <summary className="cursor-pointer">Account sync details</summary>
      {dashboard.accounts.map(a => {
        const sync = dashboard.syncs.find(s => s.account_id === a.id);
        return <p className="mt-2" key={a.id}>{a.platform} · {a.handle || a.display_name} · {a.status !== "connected" || !a.is_enabled ? "Disconnected" : sync?.status || "Waiting to sync"} {sync?.message}</p>;
      })}
      <Link to="/app/settings/connections" className="mt-2 inline-block underline">Manage connections</Link>
    </details>
  </main>;
}
