import type { VirloOperation } from "./virlo-catalog";

/** Provider IDs have account-wide scope; require a matching workspace-owned resource kind. */
export function virloResourceKind(op: VirloOperation): string | null {
  if (op.operation === "videos" && op.scope === "agent") return "research";
  if (op.operation === "lookup_status") return `lookup_${op.lookup}`;
  if (op.operation === "tracking_data" || op.operation === "tracking_update" || op.operation === "untrack") return op.kind;
  if (op.operation === "research_status" || op.operation === "research_data" || op.operation === "research_update" || op.operation === "research_delete") return "research";
  return null;
}
