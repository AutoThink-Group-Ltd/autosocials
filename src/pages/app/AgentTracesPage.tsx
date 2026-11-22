import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface AgentRun {
  id: string;
  agent_id: string;
  skill_id: string | null;
  workflow_id: string | null;
  state: string;
  request: unknown;
  response: unknown;
  error_message: string | null;
  latency_ms: number | null;
  created_at: string;
}

interface TraceEvent {
  id: string;
  seq: number;
  kind: string;
  name: string | null;
  inputs: unknown;
  outputs: unknown;
  ok: boolean | null;
  error_message: string | null;
  created_at: string;
}

const STATE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  complete: "default",
  running: "secondary",
  awaiting_approval: "outline",
  blocked: "destructive",
  failed: "destructive",
  draft: "outline",
};

export default function AgentTracesPage() {
  const { currentWorkspace } = useWorkspace();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const loadRuns = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("agent_runs")
      .select("id, agent_id, skill_id, workflow_id, state, request, response, error_message, latency_ms, created_at")
      .eq("workspace_id", currentWorkspace.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (!error && data) setRuns(data as AgentRun[]);
    setLoading(false);
  };

  const loadEvents = async (runId: string) => {
    setSelectedRunId(runId);
    setEventsLoading(true);
    const { data } = await supabase
      .from("agent_trace_events")
      .select("id, seq, kind, name, inputs, outputs, ok, error_message, created_at")
      .eq("run_id", runId)
      .order("seq", { ascending: true });
    setEvents((data as TraceEvent[]) ?? []);
    setEventsLoading(false);
  };

  useEffect(() => {
    loadRuns();
  }, [currentWorkspace?.id]);

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agent Traces</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Live record of every Vibe agent run, tool call, and confirmation gate.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadRuns} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">Recent runs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 max-h-[70vh] overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && runs.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No agent runs yet. Send an outreach email or change your plan to record one.
              </p>
            )}
            {runs.map((run) => (
              <button
                key={run.id}
                onClick={() => loadEvents(run.id)}
                className={`w-full text-left p-3 rounded-md border transition-colors hover:bg-accent ${
                  selectedRunId === run.id ? "bg-accent border-primary" : "border-border"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">
                    {run.workflow_id || run.skill_id || run.agent_id}
                  </span>
                  <Badge variant={STATE_VARIANT[run.state] ?? "outline"} className="shrink-0 text-xs">
                    {run.state}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2">
                  <span>{formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}</span>
                  {run.latency_ms != null && <span>· {run.latency_ms}ms</span>}
                </div>
              </button>
            ))}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">
              {selectedRunId ? "Trace events" : "Select a run"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 max-h-[70vh] overflow-y-auto">
            {!selectedRunId && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Select a run on the left to inspect every tool call and gate.
              </p>
            )}
            {eventsLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            )}
            {!eventsLoading && selectedRunId && events.length === 0 && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                No events recorded for this run.
              </p>
            )}
            {events.map((ev) => (
              <div key={ev.id} className="p-3 rounded-md border border-border space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">#{ev.seq}</span>
                  <Badge variant="outline" className="text-xs">{ev.kind}</Badge>
                  {ev.name && <span className="font-medium">{ev.name}</span>}
                  {ev.ok === false && <Badge variant="destructive" className="text-xs">error</Badge>}
                </div>
                {ev.inputs != null && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">inputs</summary>
                    <pre className="mt-1 p-2 bg-muted rounded overflow-x-auto">{JSON.stringify(ev.inputs, null, 2)}</pre>
                  </details>
                )}
                {ev.outputs != null && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground">outputs</summary>
                    <pre className="mt-1 p-2 bg-muted rounded overflow-x-auto">{JSON.stringify(ev.outputs, null, 2)}</pre>
                  </details>
                )}
                {ev.error_message && (
                  <p className="text-xs text-destructive">{ev.error_message}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}