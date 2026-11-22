import { useEffect, useState } from "react";
import { Link } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, X, Loader2, ShieldCheck, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface PendingPost {
  id: string;
  caption: string;
  submitted_at: string | null;
  submitted_by: string | null;
  scheduled_at: string | null;
  submitter_name?: string;
}

export default function PublishingApprovalsPage() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [posts, setPosts] = useState<PendingPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);

  const load = async () => {
    if (!currentWorkspace?.id || !user?.id) return;
    setLoading(true);
    const [{ data: ws }, { data: member }, { data: pending }] = await Promise.all([
      supabase.from("workspaces").select("requires_approval").eq("id", currentWorkspace.id).maybeSingle(),
      supabase.from("workspace_members").select("role").eq("workspace_id", currentWorkspace.id).eq("user_id", user.id).maybeSingle(),
      supabase.from("posts")
        .select("id, caption, submitted_at, submitted_by, scheduled_at")
        .eq("workspace_id", currentWorkspace.id)
        .eq("status", "awaiting_approval")
        .order("submitted_at", { ascending: false }),
    ]);
    setRequiresApproval(!!ws?.requires_approval);
    setIsOwner(member?.role === "owner");

    // Hydrate submitter names
    const ids = [...new Set((pending ?? []).map((p) => p.submitted_by).filter(Boolean) as string[])];
    let nameMap: Record<string, string> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? "Unknown"]));
    }
    setPosts((pending ?? []).map((p) => ({ ...p, submitter_name: p.submitted_by ? (nameMap[p.submitted_by] ?? "Unknown") : "Unknown" } as PendingPost)));
    setLoading(false);
  };

  useEffect(() => { load(); }, [currentWorkspace?.id, user?.id]);

  const toggleRequires = async (next: boolean) => {
    if (!currentWorkspace?.id) return;
    setRequiresApproval(next);
    const { error } = await supabase.from("workspaces").update({ requires_approval: next }).eq("id", currentWorkspace.id);
    if (error) {
      toast.error("Couldn't update setting");
      setRequiresApproval(!next);
    } else {
      toast.success(next ? "Approvals required" : "Approvals turned off");
    }
  };

  const decide = async (postId: string, decision: "approved" | "rejected") => {
    if (!user?.id) return;
    setWorking(postId);
    try {
      const reason = reasonById[postId]?.trim();
      if (decision === "rejected" && !reason) {
        toast.error("Add a short note so the editor knows what to change");
        setWorking(null);
        return;
      }
      const { error } = await supabase.from("posts").update({
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejection_reason: decision === "rejected" ? (reason ?? null) : null,
        status: decision === "approved" ? "scheduled" : "draft",
      }).eq("id", postId);
      if (error) throw error;
      await supabase.from("post_approval_events").insert({
        post_id: postId, actor_id: user.id, action: decision, comment: decision === "rejected" ? (reason ?? null) : null,
      });
      await supabase.functions.invoke("notify-post-approval", { body: { post_id: postId, action: decision } });
      toast.success(decision === "approved" ? "Approved & scheduled" : "Sent back to editor");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Failed");
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="container mx-auto px-6 py-8 max-w-4xl space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Approvals</h1>
        <p className="text-muted-foreground mt-1">
          {loading
            ? "Loading…"
            : posts.length === 0
            ? requiresApproval
              ? "Nothing waiting — your queue is clear."
              : "Approvals are off. Turn them on to require review before posts publish."
            : `${posts.length} post${posts.length === 1 ? "" : "s"} awaiting review`}
        </p>
      </div>

      <Card>
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="text-sm font-medium">Require approval before publishing</div>
              <div className="text-xs text-muted-foreground">
                When on, every scheduled post must be approved by a workspace owner first.
              </div>
            </div>
          </div>
          <Switch checked={requiresApproval} onCheckedChange={toggleRequires} disabled={!isOwner} />
        </CardContent>
      </Card>

      {!loading && posts.length > 0 && (
        <div className="space-y-3">
          {posts.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <CardTitle className="text-base font-medium line-clamp-2">
                    {p.caption || <span className="italic text-muted-foreground">Untitled draft</span>}
                  </CardTitle>
                  <Badge variant="outline" className="bg-amber-500/10 text-amber-700 dark:text-amber-400">
                    Awaiting
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  Submitted by {p.submitter_name}
                  {p.submitted_at && ` · ${formatDistanceToNow(new Date(p.submitted_at))} ago`}
                  {p.scheduled_at && ` · planned for ${new Date(p.scheduled_at).toLocaleString()}`}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/app/publishing/composer?id=${p.id}`}>
                      <ExternalLink className="h-3.5 w-3.5 mr-1.5" /> Open
                    </Link>
                  </Button>
                </div>
                {isOwner && (
                  <>
                    <Textarea
                      placeholder="Optional note (required when sending back)"
                      value={reasonById[p.id] ?? ""}
                      onChange={(e) => setReasonById((m) => ({ ...m, [p.id]: e.target.value }))}
                      rows={2}
                      className="resize-none text-sm"
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => decide(p.id, "rejected")}
                        disabled={working === p.id}
                      >
                        {working === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <X className="h-3.5 w-3.5 mr-1.5" />}
                        Send back
                      </Button>
                      <Button size="sm" onClick={() => decide(p.id, "approved")} disabled={working === p.id}>
                        {working === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Check className="h-3.5 w-3.5 mr-1.5" />}
                        Approve & schedule
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}