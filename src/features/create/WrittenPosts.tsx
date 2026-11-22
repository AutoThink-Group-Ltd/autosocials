import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ComposerDrawer } from "@/components/publishing/ComposerDrawer";
import { supabase } from "@/integrations/supabase/client";
import { generateWrittenPostsWithContext } from "@/lib/written-posts.functions";
import { AssetBuildProgress, AssetWorkflow } from "./AssetWorkflow";
import { CreationContextCards } from "./CreationContextCards";
import type { CreationContextMode } from "@/lib/creation-context-mode";

export function WrittenPosts({ workspaceId, onBack }: { workspaceId: string; onBack: () => void }) {
  const queryClient = useQueryClient();
  const [brief, setBrief] = useState("");
  const [ideaOpen, setIdeaOpen] = useState(false);
  const [useDna, setUseDna] = useState(true);
  useEffect(() => {
    const key = `as:written-idea:${workspaceId}`;
    const value = sessionStorage.getItem(key);
    if (value) {
      setBrief(value.slice(0, 2000));
      setIdeaOpen(true);
      sessionStorage.removeItem(key);
    }
  }, [workspaceId]);
  const [count, setCount] = useState(7);
  const [currentContext, setCurrentContext] = useState(false);
  const [searchStatus, setSearchStatus] = useState<"ready" | "unavailable" | "off">("off");
  const [sources, setSources] = useState<{ title: string; url: string }[]>([]);
  const [posts, setPosts] = useState<string[]>([]);
  useEffect(() => { const key = `as:written-draft:${workspaceId}`; const value = sessionStorage.getItem(key); if (value) { setPosts([value.slice(0, 3000)]); setCount(1); sessionStorage.removeItem(key); } }, [workspaceId]);
  const [ids, setIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const validCount = Number.isInteger(count) && count >= 1 && count <= 14;
  async function generate(mode: CreationContextMode) {
    if (busy || !validCount) return;
    setBusy(true);
    try {
      const result = await generateWrittenPostsWithContext({ data: { workspace_id: workspaceId, brief: mode === "goals" ? "" : brief.trim(), count, current_context: mode !== "goals" && currentContext, context_mode: mode } });
      setPosts(result.posts); setSources(result.sources); setSearchStatus(result.searchStatus); setIds([]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not create posts."); }
    finally { setBusy(false); }
  }
  async function save() {
    setBusy(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Please sign in again.");
      if (posts.some(post => !post.trim() || post.length > 3000)) throw new Error("Each post needs text of up to 3,000 characters.");
      const { data, error } = await supabase.from("posts").insert(posts.map(caption => ({ workspace_id: workspaceId, created_by: auth.user!.id, caption, status: "draft" as const, created_via: "written_posts" }))).select("id");
      if (error || !data || data.length !== posts.length) throw new Error("Could not save drafts. Please try again.");
      setIds(data.map(row => row.id));
      void queryClient.invalidateQueries({ queryKey: ["pipeline-assets", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["home-written-posts", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["home-has-finished-assets", workspaceId] });
      toast.success("Drafts saved. Review each post before scheduling.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save drafts."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto w-full max-w-4xl px-5 py-10 md:px-10">
    <AssetWorkflow stage={ids.length ? "ready" : posts.length || busy ? "production" : "plans"} />
    <button type="button" onClick={onBack} className="mb-8 inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground"><ArrowLeft className="h-4 w-4" /> All creation options</button>
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">Create with Sam</p>
    <h1 className="mt-3 font-display text-4xl font-bold">Written posts</h1>
    <p className="mt-3 text-muted-foreground">Create text-only posts for LinkedIn and other channels. Review them before scheduling.</p>
    <div className="mt-8">
      <CreationContextCards
        brief={brief} onBriefChange={setBrief} ideaOpen={ideaOpen} onIdeaOpenChange={setIdeaOpen}
        useDna={useDna} onUseDnaChange={setUseDna} onGenerate={(mode) => void generate(mode)}
        busy={busy} disabled={!validCount} submitLabel="Create posts"
        ideaOptions={<>
          <div><p className="text-sm font-semibold">Need inspiration? Try an idea</p><div className="mt-2 flex flex-wrap gap-2">{["Explain a recent change in my industry and what it means for my audience", "Explore how AI is changing marketing and share practical ideas", "Discuss an emerging method in my field and its potential", "Answer a question my customers often ask"].map(idea => <button key={idea} type="button" onClick={() => setBrief(idea)} className="rounded-full border border-border-control px-3 py-2 text-left text-sm hover:bg-muted">{idea}</button>)}</div></div>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={currentContext} onChange={e => setCurrentContext(e.target.checked)} className="mt-1" /><span>Look for current news and developments <span className="block text-xs text-muted-foreground">Your brief will be sent to the search provider. Check sources and dates before publishing, especially for legal or other professional advice.</span></span></label>
        </>}
      >
        <label className="text-sm font-semibold">Number of posts <input type="number" min={1} max={14} disabled={busy} value={count} onChange={e => setCount(Number(e.target.value))} className="ml-2 w-20 rounded-lg border border-border-control bg-surface p-2" /></label>
      </CreationContextCards>
    </div>
    {busy && <AssetBuildProgress label={posts.length ? "Updating written posts" : "Writing posts"} />}
    {posts.length > 0 && searchStatus === "unavailable" && <p role="status" className="mt-5 text-sm text-muted-foreground">Current search was unavailable or found no usable sources. These drafts are not based on current news.</p>}
    {posts.length > 0 && searchStatus === "ready" && <div className="mt-5 text-sm"><p className="font-semibold">Search leads to review</p><p className="text-muted-foreground">Search snippets may be undated or incomplete. Check each source and its date before relying on it.</p><ul className="mt-2 list-disc space-y-1 pl-5">{sources.map(source => <li key={source.url}><a href={source.url} target="_blank" rel="noopener noreferrer" className="underline">{source.title}</a></li>)}</ul></div>}
    {posts.length > 0 && <div className="mt-10 space-y-5"><div><h2 className="font-display text-2xl font-bold">Your posts</h2><p className="mt-1 text-sm text-muted-foreground">{ids.length ? "Open each draft to choose an account and schedule it." : "Edit your posts, then save them as drafts."}</p></div>{posts.map((post, index) => <section key={index} className="rounded-2xl border border-border bg-surface p-5"><div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Post {index + 1}</h3>{ids[index] && <Button variant="outline" size="sm" onClick={() => setActive(ids[index]!)}>Review and schedule</Button>}</div><textarea aria-label={`Post ${index + 1}`} rows={7} maxLength={3000} readOnly={!!ids.length} value={post} onChange={e => setPosts(current => current.map((value, i) => i === index ? e.target.value : value))} className="w-full resize-y rounded-lg border border-border-control bg-surface p-3 text-sm" /></section>)}{!ids.length && <Button disabled={busy} onClick={save}>Save drafts</Button>}</div>}
    <ComposerDrawer open={!!active} onOpenChange={open => { if (!open) setActive(null); }} postId={active} />
  </main>;
}
