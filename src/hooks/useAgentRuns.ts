import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AgentRunState =
  | "draft" | "awaiting_approval" | "running" | "blocked" | "complete" | "failed";

export interface AgentRun {
  id: string;
  workspace_id: string;
  user_id: string;
  agent_id: string;
  skill_id: string | null;
  workflow_id: string | null;
  state: AgentRunState;
  request: unknown;
  response: unknown;
  error_code: string | null;
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
  updated_at: string;
}

/** Live-list recent agent runs for a workspace, with realtime updates. */
export function useAgentRuns(workspaceId: string | null | undefined, opts?: { limit?: number; agentId?: string }) {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const limit = opts?.limit ?? 20;

  useEffect(() => {
    if (!workspaceId) { setRuns([]); setLoading(false); return; }
    let mounted = true;

    const load = async () => {
      let q = supabase.from("agent_runs").select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (opts?.agentId) q = q.eq("agent_id", opts.agentId);
      const { data, error } = await q;
      if (!mounted) return;
      if (error) console.error("useAgentRuns:", error);
      setRuns((data as AgentRun[]) || []);
      setLoading(false);
    };
    load();

    const channel = supabase.channel(`agent_runs:${workspaceId}:${Math.random().toString(36).slice(2, 8)}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "agent_runs", filter: `workspace_id=eq.${workspaceId}` },
        () => load(),
      )
      .subscribe();

    return () => { mounted = false; supabase.removeChannel(channel); };
  }, [workspaceId, limit, opts?.agentId]);

  const activeRun = useMemo(
    () => runs.find((r) => r.state === "running" || r.state === "awaiting_approval" || r.state === "blocked"),
    [runs],
  );

  return { runs, activeRun, loading };
}
