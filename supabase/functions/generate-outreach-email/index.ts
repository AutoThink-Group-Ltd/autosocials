// Skill: outreach.draft_email
// Canonical prompt: supabase/functions/_shared/prompts/outreach-draft-email.ts

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import {
  buildOutreachDraftPrompt,
  OUTREACH_DRAFT_EMAIL_SYSTEM,
  OUTREACH_DRAFT_EMAIL_PROMPT_VERSION,
  TEMPLATE_DESCRIPTIONS,
} from "../_shared/prompts/outreach-draft-email.ts";
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
    const body = await req.json();
    const { creator, template_type, variations = 1, current_subject, current_body, workspace_id } = body;
    workspaceId = workspace_id;

    if (!creator?.username) {
      return new Response(JSON.stringify({ success: false, error: "Creator data required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) {
      return new Response(JSON.stringify({ success: false, error: "AI not configured" }), {
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
          workspaceId, userId, agentId: "vibe", skillId: "outreach.draft_email",
          request: { creator_username: creator.username, template_type, variations },
          promptVersion: OUTREACH_DRAFT_EMAIL_PROMPT_VERSION, initialState: "running",
        });
        await appendEvent({ runId, workspaceId, seq: seq(), kind: "skill_invoked", name: "outreach.draft_email" });
      } catch (e) { console.error("trace setup failed:", e); }
    }

    const templateDesc = TEMPLATE_DESCRIPTIONS[template_type] || TEMPLATE_DESCRIPTIONS.collab;
    const name = creator.display_name || creator.username;
    const niche = creator.niches?.[0] || "content creation";
    const followers = creator.follower_count
      ? creator.follower_count >= 1_000_000 ? `${(creator.follower_count / 1_000_000).toFixed(1)}M`
      : creator.follower_count >= 1_000 ? `${(creator.follower_count / 1_000).toFixed(1)}K`
      : String(creator.follower_count) : "a growing";
    const engagement = creator.engagement_rate ? `${(creator.engagement_rate * 100).toFixed(1)}%` : "unknown";
    const variationCount = Math.min(Math.max(Number(variations) || 1, 1), 5);
    const contextBlock = current_body
      ? `\n\nThe user's current draft (use as inspiration for tone/structure, but create something fresh):\nSubject: ${current_subject || "(none)"}\nBody: ${current_body.slice(0, 500)}`
      : "";

    const prompt = buildOutreachDraftPrompt({
      templateDesc, variationCount, name, platform: creator.platform, followers, engagement,
      niche, niches: creator.niches || [], bio: creator.bio || "", contextBlock,
    });

    const dossier = await loadDossierContext(workspace_id);
    const systemContent = dossier
      ? `${OUTREACH_DRAFT_EMAIL_SYSTEM}\n${dossier}\nThe WORKSPACE DOSSIER above is authoritative for brand voice, offers and ICP. Never contradict it.`
      : OUTREACH_DRAFT_EMAIL_SYSTEM;

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: prompt },
        ],
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI API error:", response.status, errText);
      if (runId && workspaceId) {
        await appendEvent({ runId, workspaceId, seq: seq(), kind: "error", ok: false, errorCode: String(response.status), errorMessage: errText.slice(0, 500) });
        await finalizeRun({ runId, state: "failed", errorCode: String(response.status), errorMessage: "AI failed", latencyMs: Date.now() - startedAt });
      }
      const msg = response.status === 429 ? "Rate limit exceeded. Please wait a moment and try again."
        : response.status === 402 ? "AI credits exhausted. Please add funds." : "AI generation failed";
      return new Response(JSON.stringify({ success: false, error: msg }), {
        status: response.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch {
      console.error("Failed to parse AI response:", content);
      if (runId && workspaceId) {
        await finalizeRun({ runId, state: "failed", errorCode: "parse_error", errorMessage: "AI returned non-JSON", latencyMs: Date.now() - startedAt });
      }
      return new Response(JSON.stringify({ success: false, error: "Failed to parse AI response" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result: { variations: Array<{ subject: string; body: string }> } = { variations: [] };
    if (Array.isArray(parsed.variations)) result.variations = parsed.variations;
    else if (parsed.subject && parsed.body) result.variations = [{ subject: parsed.subject, body: parsed.body }];

    if (runId && workspaceId) {
      await appendEvent({ runId, workspaceId, seq: seq(), kind: "message", outputs: { variation_count: result.variations.length }, ok: true });
      await finalizeRun({ runId, state: "complete", response: { variation_count: result.variations.length }, latencyMs: Date.now() - startedAt });
    }

    return new Response(JSON.stringify({
      success: true, ...result,
      subject: result.variations[0]?.subject, body: result.variations[0]?.body,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Generate outreach error:", error);
    if (runId && workspaceId) {
      await finalizeRun({ runId, state: "failed", errorCode: "exception", errorMessage: error instanceof Error ? error.message : "Unknown", latencyMs: Date.now() - startedAt });
    }
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
