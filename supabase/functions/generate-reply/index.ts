// Skill: outreach.draft_reply
// Canonical prompt: supabase/functions/_shared/prompts/outreach-draft-reply.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { buildReplySystemPrompt, buildReplyUserPrompt, OUTREACH_DRAFT_REPLY_PROMPT_VERSION } from "../_shared/prompts/outreach-draft-reply.ts";
import { createRun, finalizeRun, appendEvent, makeSeqCounter } from "../_shared/agent/trace.ts";
import { loadDossierContext } from "../_shared/dossier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  let runId: string | undefined;
  let workspaceId: string | undefined;
  const seq = makeSeqCounter();

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = await req.json();
    const { workspace_id, original_subject, original_body, creator_reply_text, creator_name, sender_name } = body;
    workspaceId = workspace_id;

    if (!workspace_id || !creator_reply_text) {
      return new Response(JSON.stringify({ error: "workspace_id and creator_reply_text are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: isMember } = await adminClient.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspace_id });
    if (!isMember) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    try {
      runId = await createRun({
        workspaceId: workspace_id, userId, agentId: "vibe", skillId: "outreach.draft_reply",
        request: { has_original: Boolean(original_body), reply_chars: creator_reply_text.length },
        promptVersion: OUTREACH_DRAFT_REPLY_PROMPT_VERSION, initialState: "running",
      });
      await appendEvent({ runId, workspaceId: workspace_id, seq: seq(), kind: "skill_invoked", name: "outreach.draft_reply" });
    } catch (e) { console.error("trace setup failed:", e); }

    const { data: commissionSettings } = await adminClient
      .from("commission_settings")
      .select("commission_type, default_percentage, default_flat_fee, currency")
      .eq("workspace_id", workspace_id).maybeSingle();

    let commissionContext = "";
    if (commissionSettings) {
      if (commissionSettings.commission_type === "percentage") {
        commissionContext = `Our default commission rate is ${commissionSettings.default_percentage}% recurring.`;
      } else if (commissionSettings.commission_type === "flat_fee") {
        commissionContext = `Our default commission is a flat fee of ${commissionSettings.currency || "GBP"} ${commissionSettings.default_flat_fee} per referral.`;
      }
    }

    const { data: wsData } = await adminClient.from("workspaces").select("booking_link").eq("id", workspace_id).maybeSingle();
    const bookingContext = wsData?.booking_link ? `We have a booking link for calls: ${wsData.booking_link}` : "";

    const recipientName = creator_name || "there";
    const dossier = await loadDossierContext(workspace_id);
    const baseSystemPrompt = buildReplySystemPrompt({ recipientName, commissionContext, bookingContext });
    const systemPrompt = dossier ? `${baseSystemPrompt}\n${dossier}\nThe WORKSPACE DOSSIER above is the highest authority on the brand. Reply in that voice and never contradict it.` : baseSystemPrompt;
    const userPrompt = buildReplyUserPrompt({ originalSubject: original_subject, originalBody: original_body, creatorReplyText: creator_reply_text, senderName: sender_name });

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      if (runId && workspaceId) {
        await appendEvent({ runId, workspaceId, seq: seq(), kind: "error", ok: false, errorCode: String(aiResponse.status), errorMessage: errText.slice(0, 500) });
        await finalizeRun({ runId, state: "failed", errorCode: String(aiResponse.status), errorMessage: "AI failed", latencyMs: Date.now() - startedAt });
      }
      const msg = aiResponse.status === 429 ? "Rate limited, please try again shortly."
        : aiResponse.status === 402 ? "AI credits exhausted." : "Failed to generate reply";
      return new Response(JSON.stringify({ error: msg }), {
        status: aiResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const replyText = aiData.choices?.[0]?.message?.content?.trim() || "";

    if (runId && workspaceId) {
      await appendEvent({ runId, workspaceId, seq: seq(), kind: "message", outputs: { reply_chars: replyText.length }, ok: true });
      await finalizeRun({ runId, state: "complete", response: { reply_chars: replyText.length }, latencyMs: Date.now() - startedAt });
    }
    return new Response(JSON.stringify({ reply: replyText }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("generate-reply error:", error);
    if (runId && workspaceId) {
      await finalizeRun({ runId, state: "failed", errorCode: "exception", errorMessage: error instanceof Error ? error.message : "Unknown", latencyMs: Date.now() - startedAt });
    }
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
