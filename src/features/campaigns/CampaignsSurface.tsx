import { useState } from "react";
import { matchesPostSearch, PostSearch } from "@/features/winners/PostSearch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { getWinners, updateWinnerShortlist } from "@/lib/winners.functions";
import { EmptyState, StageHeader } from "@/workspace/ui";
import type { WinnerPost } from "@/features/winners/WinnersSurface";

export function CampaignsSurface() {
  const { currentWorkspace } = useWorkspace();
  const ws = currentWorkspace?.id;
  const client = useQueryClient();
  const query = useQuery({ queryKey: ["winners", ws], queryFn: () => getWinners({ data: { workspace_id: ws! } }), enabled: !!ws, refetchOnWindowFocus: false });
  const remove = useMutation({ mutationFn: (id: string) => updateWinnerShortlist({ data: { workspace_id: ws!, post_ids: [id], selected: false } }), onSuccess: () => void client.invalidateQueries({ queryKey: ["winners", ws] }) });
  const [search, setSearch] = useState("");
  const selected = new Set((query.data?.shortlist ?? []).map(x => x.winner_post_id));
  const posts = (query.data?.shortlist ?? []).map(x => x.winner_posts as unknown as WinnerPost | null).filter((p): p is WinnerPost => !!p);
  const matches = posts.filter(post => matchesPostSearch(post, search));
  return <div className="mx-auto max-w-4xl space-y-6 p-4 md:p-6"><StageHeader module="campaigns" /><div className="rounded-xl border border-border bg-surface p-4 text-sm text-text-secondary">This shortlist prepares organic posts for future paid tests. Ad accounts and campaign launches are not connected yet; adding a post does not create an ad or spend money.</div><section><h2 className="font-display text-xl font-bold">Paid-testing shortlist</h2>
    {posts.length > 0 && <div className="mt-3"><PostSearch value={search} onChange={setSearch} /></div>}{!ws ? <p className="mt-3 text-sm">Choose a workspace.</p> : query.isLoading ? <p className="mt-3 text-sm" role="status">Loading shortlist…</p> : query.error ? <p className="mt-3 text-sm text-destructive" role="alert">Could not load the shortlist.</p> : !posts.length ? <div className="mt-3"><EmptyState title="No posts selected yet" body="Choose promising posts in Find winners to prepare them for paid testing." action={<Link className="underline" to="/app/winners">Find winners</Link>} /></div> : <div className="mt-3 space-y-2">{matches.length === 0 && <p role="status">No matching shortlisted posts.</p>}{matches.map(p => <article key={p.id} className="flex gap-3 rounded-xl border border-border bg-surface p-3">{p.thumbnail_url && <img src={p.thumbnail_url} alt="" className="h-20 w-16 rounded object-cover" />}<div className="min-w-0 flex-1"><p className="text-xs capitalize text-text-secondary">{p.platform} · {p.format}</p><p className="line-clamp-2 text-sm font-semibold">{p.caption || "Post without a caption"}</p><p className="mt-1 text-xs text-text-secondary">{p.likes ?? "—"} likes · {p.comments_count ?? "—"} comments · measured {new Date(p.measured_at).toLocaleDateString("en-GB")}</p>{p.permalink && <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-xs underline">Original post ↗</a>}</div><Button variant="outline" size="sm" disabled={remove.isPending} onClick={() => remove.mutate(p.id)}>Remove</Button></article>)}</div>}{selected.size > posts.length && <p className="mt-2 text-xs text-text-secondary">Some selected posts are unavailable.</p>}{remove.error && <p role="alert" className="mt-2 text-sm text-destructive">Could not remove that post.</p>}</section></div>;
}
