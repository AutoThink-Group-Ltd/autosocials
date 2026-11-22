// Best-effort, non-blocking trace wrapper for read/external tools where the
// caller may be unauthenticated or workspace-less. Never throws; never
// changes the function's response shape.

import { appendEvent, createRun, finalizeRun, makeSeqCounter } from "./trace.ts";
import type { AgentRunState } from "./types.ts";

export interface ObserveOptions {
  toolName: string;
  workspaceId?: string | null;
  userId?: string | null;
  request?: unknown;
}

export interface ObservationHandle {
  finish: (state: AgentRunState, output?: unknown, errorMessage?: string) => Promise<void>;
}

export async function observeToolCall(opts: ObserveOptions): Promise<ObservationHandle> {
  const noop: ObservationHandle = { finish: async () => {} };
  if (!opts.workspaceId || !opts.userId) return noop;

  const seq = makeSeqCounter();
  let runId: string | null = null;
  try {
    runId = await createRun({
      workspaceId: opts.workspaceId,
      userId: opts.userId,
      agentId: "vibe",
      skillId: opts.toolName,
      request: opts.request,
      initialState: "running",
    });
    await appendEvent({
      runId,
      workspaceId: opts.workspaceId,
      seq: seq(),
      kind: "tool_called",
      name: opts.toolName,
      inputs: opts.request,
    });
  } catch (e) {
    console.warn(`[observe:${opts.toolName}] open failed (non-fatal):`, e);
    return noop;
  }

  return {
    finish: async (state, output, errorMessage) => {
      if (!runId) return;
      try {
        await appendEvent({
          runId,
          workspaceId: opts.workspaceId!,
          seq: seq(),
          kind: "tool_result",
          name: opts.toolName,
          ok: state === "complete",
          outputs: output,
          errorMessage,
        });
        await finalizeRun({
          runId,
          state,
          response: output,
          errorMessage,
        });
      } catch (e) {
        console.warn(`[observe:${opts.toolName}] finish failed (non-fatal):`, e);
      }
    },
  };
}

/** Resolve userId from an Authorization header. Returns null on any failure. */
export async function userIdFromAuthHeader(authHeader: string | null): Promise<string | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  try {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.99.1");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data } = await client.auth.getClaims(token);
    return (data?.claims?.sub as string) ?? null;
  } catch {
    return null;
  }
}