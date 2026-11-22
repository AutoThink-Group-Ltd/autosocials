import { useEffect, useRef, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Loader2, Facebook, Instagram } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NativeAccountFeed } from "@/components/publishing/NativeAccountFeed";
import { ComposerDrawer } from "@/components/publishing/ComposerDrawer";

interface PostRow {
  id: string;
  status: string;
  caption: string;
  scheduled_at: string | null;
  published_at: string | null;
  updated_at: string;
}

interface ConnectedAccount {
  id: string;
  platform: "facebook" | "instagram" | "tiktok";
  display_name: string | null;
  handle: string | null;
  avatar_url: string | null;
}

export default function PublishingPostsPage() {
  const { currentWorkspace } = useWorkspace();
  const [posts, setPosts] = useState<PostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerPostId, setComposerPostId] = useState<string | null>(null);
  const composerFlushRef = useRef<(() => Promise<void>) | null>(null);

  const latestDraftId = posts.find((p) => p.status === "draft")?.id ?? null;

  const refetchPosts = async () => {
    if (!currentWorkspace?.id) return;
    const { data } = await supabase
      .from("posts")
      .select("id, status, caption, scheduled_at, published_at, updated_at")
      .eq("workspace_id", currentWorkspace.id)
      .order("updated_at", { ascending: false })
      .limit(50);
    setPosts((data ?? []) as PostRow[]);
  };

  const openComposer = (postId: string | null = null) => {
    setComposerPostId(postId);
    setComposerOpen(true);
  };

  const continueDraft = () => {
    openComposer(composerPostId ?? latestDraftId);
  };

  useEffect(() => {
    const load = async () => {
      if (!currentWorkspace?.id) return;
      setLoading(true);
      const [{ data: postsData }, { data: accData }] = await Promise.all([
        supabase
          .from("posts")
          .select("id, status, caption, scheduled_at, published_at, updated_at")
          .eq("workspace_id", currentWorkspace.id)
          .order("updated_at", { ascending: false })
          .limit(50),
        supabase
          .from("social_accounts")
          .select("id, platform, display_name, handle, avatar_url")
          .eq("workspace_id", currentWorkspace.id)
          .eq("status", "connected")
          .in("platform", ["facebook", "instagram"])
          .order("platform", { ascending: true }),
      ]);
      setPosts((postsData ?? []) as PostRow[]);
      const acc = (accData ?? []) as ConnectedAccount[];
      setAccounts(acc);
      setActiveAccountId((prev) => prev ?? acc[0]?.id ?? null);
      setLoading(false);
    };
    load();
  }, [currentWorkspace?.id]);

  const drafts = posts.filter((p) => p.status === "draft").length;
  const scheduled = posts.filter((p) => p.status === "scheduled").length;
  const published = posts.filter((p) => p.status === "published").length;

  return (
    <div className="container mx-auto px-6 py-8 max-w-5xl space-y-8">
      {/* Outcome hero */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Publishing</h1>
          <p className="text-muted-foreground mt-1">
            {loading
              ? "Loading your content…"
              : posts.length === 0
              ? "No posts yet — start with a single draft, Vibe will help."
              : `${drafts} draft${drafts === 1 ? "" : "s"} · ${scheduled} scheduled · ${published} published`}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Tip: open the <Link to="/app/publishing/calendar" className="underline hover:text-foreground">Calendar</Link> to view, edit, or reschedule any post.
          </p>
        </div>
        <Button onClick={continueDraft}>
          <Plus className="h-4 w-4 mr-2" /> {composerPostId || latestDraftId ? "Continue draft" : "New post"}
        </Button>
      </div>

      {accounts.length > 0 && activeAccountId && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Live feed from your connected accounts</CardTitle>
            <p className="text-xs text-muted-foreground">A native preview of what's live on each account — proof everything is wired up correctly.</p>
          </CardHeader>
          <CardContent>
            <Tabs value={activeAccountId} onValueChange={setActiveAccountId}>
              <TabsList className="grid w-full h-auto gap-1 bg-muted/50 p-1" style={{ gridTemplateColumns: `repeat(${accounts.length}, minmax(0, 1fr))` }}>
                {accounts.map((a) => (
                  <TabsTrigger key={a.id} value={a.id} className="gap-1.5 w-full justify-center">
                    {a.platform === "facebook" ? <Facebook className="h-3.5 w-3.5" /> : <Instagram className="h-3.5 w-3.5" />}
                    <span className="truncate">{a.display_name || a.handle || a.platform}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
              {accounts.map((a) => (
                <TabsContent key={a.id} value={a.id} className="mt-4">
                  <NativeAccountFeed
                    socialAccountId={a.id}
                    platform={a.platform as "facebook" | "instagram"}
                    fallbackName={a.display_name || a.handle || "Account"}
                    fallbackHandle={a.handle}
                    fallbackAvatar={a.avatar_url}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      )}

      {loading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
        </div>
      )}
      <ComposerDrawer
        open={composerOpen}
        onOpenChange={async (o) => {
          if (!o) {
            // Flush any pending autosave BEFORE unmounting the composer so no work is lost.
            try {
              await composerFlushRef.current?.();
            } catch {
              // ignore
            }
          }
          setComposerOpen(o);
          if (!o && currentWorkspace?.id) {
            // Refetch immediately, then poll a few times to catch the
            // async publish pipeline transitioning from "publishing" -> "published".
            await refetchPosts();
            [1500, 4000, 8000].forEach((ms) => setTimeout(refetchPosts, ms));
          }
        }}
        postId={composerPostId}
        onPostIdChange={(id) => setComposerPostId(id)}
        flushRef={composerFlushRef}
      />
    </div>
  );
}