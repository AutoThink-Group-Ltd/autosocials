// Skill: vibe.chat
// Canonical prompt: supabase/functions/_shared/prompts/vibe-chat.ts
// Traces: agent_runs + agent_trace_events (workspace-scoped)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import {
  buildBrandContext,
  buildVibeChatSystemPrompt,
  VIBE_CHAT_PROMPT_VERSION,
} from "../_shared/prompts/vibe-chat.ts";
import { createRun, finalizeRun, appendEvent, makeSeqCounter } from "../_shared/agent/trace.ts";
import { loadDossierContext } from "../_shared/dossier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let runId: string | undefined;
  let workspaceId: string | undefined;
  const seq = makeSeqCounter();

  try {
    const { messages, workspace, workspace_id, rich } = await req.json();
    // `rich`: optional client opt-in to receive a `vibe-rich` JSON envelope.
    // Default false to preserve existing behaviour for all callers.
    const richMode = rich === true;
    workspaceId = workspace_id || workspace?.id;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Best-effort auth resolution for trace ownership
    const authHeader = req.headers.get("Authorization") || "";
    let userId: string | undefined;
    if (authHeader.startsWith("Bearer ")) {
      try {
        const userClient = createClient(
          Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!,
          { global: { headers: { Authorization: authHeader } } },
        );
        const { data } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
        userId = data?.claims?.sub as string | undefined;
      } catch { /* anon */ }
    }

    if (workspaceId && userId) {
      try {
        runId = await createRun({
          workspaceId, userId, agentId: "vibe", skillId: "vibe.chat",
          request: {
            last_user_message: messages?.[messages.length - 1]?.content?.slice(0, 500),
            rich_mode: richMode,
          },
          promptVersion: VIBE_CHAT_PROMPT_VERSION, initialState: "running",
        });
        await appendEvent({
          runId, workspaceId, seq: seq(), kind: "skill_invoked", name: "vibe.chat",
          inputs: { message_count: messages?.length || 0, rich_mode: richMode },
        });
      } catch (e) { console.error("trace setup failed:", e); }
    }

    const dossier = await loadDossierContext(workspaceId);
    const systemPrompt = buildVibeChatSystemPrompt({
      brandContext: buildBrandContext(workspace),
      richMode,
      dossier,
    });
    const allMessages = [{ role: "system", content: systemPrompt }, ...messages];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4.1-mini", messages: allMessages, stream: true }),
    });

    if (!response.ok) {
      const status = response.status;
      const errBody = await response.text();
      console.error("AI gateway error:", status, errBody);
      if (runId && workspaceId) {
        await appendEvent({ runId, workspaceId, seq: seq(), kind: "error", name: "ai_gateway", ok: false, errorCode: String(status), errorMessage: errBody.slice(0, 500) });
        await finalizeRun({ runId, state: "failed", errorCode: String(status), errorMessage: "AI gateway error", latencyMs: Date.now() - startedAt });
      }
      const userMsg = status === 429 ? "Rate limit exceeded. Please try again in a moment."
        : status === 402 ? "AI credits exhausted. Please add funds in Settings."
        : "Failed to get AI response";
      return new Response(JSON.stringify({ error: userMsg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (runId && workspaceId) {
      // Mark complete on stream start; precise per-stream cost not tracked.
      finalizeRun({ runId, state: "complete", latencyMs: Date.now() - startedAt }).catch(() => {});
    }

    return new Response(response.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("vibe-chat error:", e);
    if (runId && workspaceId) {
      await finalizeRun({ runId, state: "failed", errorCode: "exception", errorMessage: e instanceof Error ? e.message : "Unknown", latencyMs: Date.now() - startedAt });
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
