// Trace logging helpers.
// Edge functions call these to record agent_runs and agent_trace_events.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import type { AgentRunState, TraceEventKind } from "./types.ts";

let cached: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (cached) return cached;
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  cached = createClient(url, key);
  return cached;
}

export interface CreateRunInput {
  workspaceId: string;
  userId: string;
  agentId: string;
  skillId?: string;
  workflowId?: string;
  request?: unknown;
  promptVersion?: string;
  initialState?: AgentRunState;
}

export async function createRun(input: CreateRunInput): Promise<string> {
  const { data, error } = await adminClient()
    .from("agent_runs")
    .insert({
      workspace_id: input.workspaceId,
      user_id: input.userId,
      agent_id: input.agentId,
      skill_id: input.skillId,
      workflow_id: input.workflowId,
      request: input.request ?? null,
      prompt_version: input.promptVersion,
      state: input.initialState ?? "running",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export interface FinalizeRunInput {
  runId: string;
  state: AgentRunState;
  response?: unknown;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
  costUsd?: number;
}

export async function finalizeRun(input: FinalizeRunInput) {
  const { error } = await adminClient()
    .from("agent_runs")
    .update({
      state: input.state,
      response: input.response ?? null,
      error_code: input.errorCode ?? null,
      error_message: input.errorMessage ?? null,
      latency_ms: input.latencyMs ?? null,
      cost_usd: input.costUsd ?? null,
    })
    .eq("id", input.runId);
  if (error) console.error("finalizeRun failed:", error);
}

export interface TraceEventInput {
  runId: string;
  workspaceId: string;
  seq: number;
  kind: TraceEventKind;
  name?: string;
  inputs?: unknown;
  outputs?: unknown;
  ok?: boolean;
  errorCode?: string;
  errorMessage?: string;
  latencyMs?: number;
  costUsd?: number;
}

export async function appendEvent(ev: TraceEventInput) {
  const { error } = await adminClient().from("agent_trace_events").insert({
    run_id: ev.runId,
    workspace_id: ev.workspaceId,
    seq: ev.seq,
    kind: ev.kind,
    name: ev.name,
    inputs: sanitise(ev.inputs),
    outputs: sanitise(ev.outputs),
    ok: ev.ok ?? null,
    error_code: ev.errorCode ?? null,
    error_message: ev.errorMessage ?? null,
    latency_ms: ev.latencyMs ?? null,
    cost_usd: ev.costUsd ?? null,
  });
  if (error) console.error("appendEvent failed:", error);
}

/** Strip obvious PII / large blobs before persisting. Keep small + structural. */
function sanitise(v: unknown): unknown {
  if (v == null) return null;
  try {
    const s = JSON.stringify(v);
    if (s.length > 8000) return { _truncated: true, preview: s.slice(0, 1000) };
    return v;
  } catch {
    return null;
  }
}

export function makeSeqCounter() {
  let n = 0;
  return () => ++n;
}
