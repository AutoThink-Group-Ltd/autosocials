import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAgentRuns } from "@/hooks/useAgentRuns";
import { AgentStateStrip } from "@/components/agent/AgentStateStrip";

/**
 * Persistent app-shell strip that surfaces the most recent in-flight or
 * recently-finalised agent run for the current workspace. Implements the
 * Status Layer of the AutoSocials UX OS — the system always tells the user
 * what it's doing.
 *
 * Hides itself when the workspace is empty or there are no recent runs at all.
 */
export function GlobalAgentStatusStrip() {
  const { currentWorkspace } = useWorkspace();
  const { runs } = useAgentRuns(currentWorkspace?.id, { limit: 5 });

  // Prefer the most recent active run; otherwise the most recent finalised one
  // within 30 seconds (so users see "Done" briefly).
  const active = runs.find((r) => ["running", "draft", "awaiting_approval", "blocked"].includes(r.state));
  const recentDone = runs.find((r) => {
    if (!["complete", "failed"].includes(r.state)) return false;
    const ageMs = Date.now() - new Date(r.updated_at).getTime();
    return ageMs < 30_000;
  });
  const run = active ?? recentDone;
  if (!run) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-border bg-background/80 px-4 py-1.5 backdrop-blur"
    >
      <div className="mx-auto max-w-screen-2xl">
        <AgentStateStrip run={run} />
      </div>
    </div>
  );
}
