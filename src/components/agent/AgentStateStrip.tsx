import { Loader2, CheckCircle2, AlertTriangle, Pause, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { AgentRun, AgentRunState } from "@/hooks/useAgentRuns";

const labels: Record<AgentRunState, string> = {
  draft: "Drafting",
  awaiting_approval: "Awaiting your approval",
  running: "Working",
  blocked: "Blocked",
  complete: "Done",
  failed: "Failed",
};

const variants: Record<AgentRunState, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "outline",
  awaiting_approval: "secondary",
  running: "default",
  blocked: "destructive",
  complete: "outline",
  failed: "destructive",
};

function StateIcon({ state }: { state: AgentRunState }) {
  const cls = "h-3.5 w-3.5";
  switch (state) {
    case "running": return <Loader2 className={`${cls} animate-spin`} />;
    case "awaiting_approval": return <ShieldAlert className={cls} />;
    case "blocked": return <Pause className={cls} />;
    case "complete": return <CheckCircle2 className={cls} />;
    case "failed": return <AlertTriangle className={cls} />;
    default: return null;
  }
}

/**
 * Compact strip surfacing the most recent agent run state to the user.
 * Renders nothing when there's no run to show. Place near the top of
 * agent-driven panels (e.g. Vibe).
 */
export function AgentStateStrip({ run }: { run: AgentRun | undefined | null }) {
  if (!run) return null;
  const stateLabel = labels[run.state];
  const skill = run.skill_id ?? run.agent_id;
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-3 py-1.5 text-xs">
      <StateIcon state={run.state} />
      <span className="font-medium">{skill}</span>
      <Badge variant={variants[run.state]} className="h-5 px-1.5 text-[10px]">{stateLabel}</Badge>
      {run.error_message && (
        <span className="truncate text-destructive" title={run.error_message}>
          {run.error_message.slice(0, 80)}
        </span>
      )}
    </div>
  );
}
