// Shared agent runtime types (Deno-side mirror of /tools/_types.ts).
// Imported by edge functions implementing tools.

export type ToolPermission = "read" | "write" | "external" | "billing";

export type ConfirmationRequirement =
  | "none"
  | "user_confirmation"
  | "explicit_typed_confirmation";

export interface ToolContext {
  userId: string;
  workspaceId: string;
  runId?: string;
  traceSeq: () => number;
  confirmed?: boolean;
  /** Authorization header passed through from the original request. */
  authHeader?: string;
}

export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; details?: unknown } };

export interface RegisteredTool<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  permissions: ToolPermission[];
  requiresConfirmation: ConfirmationRequirement;
  parseInput: (raw: unknown) => TInput;
  handler: (input: TInput, ctx: ToolContext) => Promise<ToolResult<TOutput>>;
}

export type AgentRunState =
  | "draft"
  | "awaiting_approval"
  | "running"
  | "blocked"
  | "complete"
  | "failed";

export type TraceEventKind =
  | "skill_invoked"
  | "tool_called"
  | "tool_result"
  | "state_change"
  | "error"
  | "message"
  | "confirmation_required"
  | "confirmation_granted";
