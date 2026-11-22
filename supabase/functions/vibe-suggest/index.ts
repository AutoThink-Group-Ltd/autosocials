// Skill: vibe.suggest
// Canonical prompt: supabase/functions/_shared/prompts/vibe-suggest.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { buildVibeSuggestSystemPrompt, VIBE_SUGGEST_PROMPT_VERSION } from "../_shared/prompts/vibe-suggest.ts";
import { buildBrandContext } from "../_shared/prompts/vibe-chat.ts";
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
    const { message, history, workspace, workspace_id } = await req.json();
    workspaceId = workspace_id || workspace?.id;
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") || "";
    let userId: string | undefined;
    if (authHeader.startsWith("Bearer ")) {
      try {
        const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: authHeader } } });
        const { data } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
        userId = data?.claims?.sub as string | undefined;
      } catch { /* anon */ }
    }

    if (workspaceId && userId) {
      try {
        runId = await createRun({
          workspaceId, userId, agentId: "vibe", skillId: "vibe.suggest",
          request: { message: String(message ?? "").slice(0, 500) },
          promptVersion: VIBE_SUGGEST_PROMPT_VERSION, initialState: "running",
        });
        await appendEvent({ runId, workspaceId, seq: seq(), kind: "skill_invoked", name: "vibe.suggest" });
      } catch (e) { console.error("trace setup failed:", e); }
    }

    const dossier = await loadDossierContext(workspaceId);
    const systemPrompt = buildVibeSuggestSystemPrompt({ brandContext: buildBrandContext(workspace), dossier });
    const messages = [
      { role: "system", content: systemPrompt },
      ...(history || []),
      { role: "user", content: message },
    ];

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini", messages,
        tools: [{
          type: "function",
          function: {
            name: "suggest_creators",
            description: "Return keyword suggestions and creator type recommendations for discovery",
            parameters: {
              type: "object",
              properties: {
                message: { type: "string" },
                keywords: { type: "array", items: { type: "string" } },
                creator_types: { type: "array", items: { type: "string" } },
                pro_tips: { type: "array", items: { type: "string" } },
              },
              required: ["message", "keywords"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_creators" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const errBody = await response.text();
      console.error("AI gateway error:", status, errBody);
      if (runId && workspaceId) {
        await appendEvent({ runId, workspaceId, seq: seq(), kind: "error", ok: false, errorCode: String(status), errorMessage: errBody.slice(0, 500) });
        await finalizeRun({ runId, state: "failed", errorCode: String(status), errorMessage: "AI gateway error", latencyMs: Date.now() - startedAt });
      }
      const userMsg = status === 429 ? "Rate limit exceeded. Please try again in a moment."
        : status === 402 ? "AI credits exhausted. Please add funds in Settings."
        : "Failed to get AI suggestions";
      return new Response(JSON.stringify({ error: userMsg }), {
        status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let result: unknown;
    if (toolCall?.function?.arguments) {
      result = JSON.parse(toolCall.function.arguments);
    } else {
      const content = data.choices?.[0]?.message?.content || "";
      try { result = JSON.parse(content); }
      catch { result = { message: content, keywords: [], creator_types: [], pro_tips: [] }; }
    }

    if (runId && workspaceId) {
      await appendEvent({ runId, workspaceId, seq: seq(), kind: "message", outputs: result, ok: true });
      await finalizeRun({ runId, state: "complete", response: result, latencyMs: Date.now() - startedAt });
    }
    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("vibe-suggest error:", e);
    if (runId && workspaceId) {
      await finalizeRun({ runId, state: "failed", errorCode: "exception", errorMessage: e instanceof Error ? e.message : "Unknown", latencyMs: Date.now() - startedAt });
    }
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
