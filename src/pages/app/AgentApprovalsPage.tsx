import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Check, X, ShieldAlert } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

interface PendingAction {
  id: string;
  user_id: string;
  workspace_id: string | null;
  intent: string;
  label: string;
  payload: Record<string, unknown>;
  risk_level: "low" | "medium" | "high" | "destructive";
  confirmation_message: string | null;
  status: "pending" | "approved" | "rejected" | "executed" | "failed" | "cancelled";
  created_at: string;
  resolved_at: string | null;
}

const RISK_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  low: "secondary",
  medium: "outline",
  high: "default",
  destructive: "destructive",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  approved: "default",
  executed: "default",
  rejected: "destructive",
  failed: "destructive",
  cancelled: "secondary",
};

export default function AgentApprovalsPage() {
  const { currentWorkspace } = useWorkspace();
  const [rows, setRows] = useState<PendingAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("pending_agent_actions" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (currentWorkspace?.id) query = query.eq("workspace_id", currentWorkspace.id);
    if (filter === "pending") query = query.eq("status", "pending");
    const { data, error } = await query;
    if (error) toast.error(error.message);
    setRows(((data as unknown) as PendingAction[]) ?? []);
    setLoading(false);
  }, [currentWorkspace?.id, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const resolve = async (row: PendingAction, decision: "approved" | "rejected") => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("pending_agent_actions" as any)
      .update({
        status: decision,
        resolved_at: new Date().toISOString(),
        resolved_by: u.user?.id ?? null,
      })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(decision === "approved" ? "Action approved" : "Action rejected");
    load();
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-primary" />
            Agent Approvals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and resolve high-risk actions Vibe queued for human approval.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={filter === "pending" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("pending")}
          >
            Pending
          </Button>
          <Button
            variant={filter === "all" ? "default" : "outline"}
            size="sm"
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nothing to review. Vibe will queue actions here when they need human approval.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <CardTitle className="text-base truncate">{row.label}</CardTitle>
                    <div className="text-xs text-muted-foreground font-mono truncate">
                      {row.intent}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant={RISK_VARIANT[row.risk_level]}>{row.risk_level}</Badge>
                    <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {row.confirmation_message && (
                  <p className="text-sm">{row.confirmation_message}</p>
                )}
                {row.payload && Object.keys(row.payload).length > 0 && (
                  <pre className="text-xs bg-muted/40 rounded p-2 overflow-x-auto max-h-40">
                    {JSON.stringify(row.payload, null, 2)}
                  </pre>
                )}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    Queued {formatDistanceToNow(new Date(row.created_at), { addSuffix: true })}
                  </span>
                  {row.status === "pending" ? (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => resolve(row, "rejected")}
                      >
                        <X className="w-4 h-4 mr-1" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => resolve(row, "approved")}>
                        <Check className="w-4 h-4 mr-1" /> Approve
                      </Button>
                    </div>
                  ) : (
                    row.resolved_at && (
                      <span className="text-xs text-muted-foreground">
                        Resolved {formatDistanceToNow(new Date(row.resolved_at), { addSuffix: true })}
                      </span>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}