// Vibe brand-plan: dossier-grounded proactive suggestions + sample weekly plan.
// Used by HomePage to prove the dossier is alive in the agent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.99.1";
import { loadDossierContext } from "../_shared/dossier.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { workspace_id } = await req.json();
    if (!workspace_id) {
      return new Response(JSON.stringify({ error: "workspace_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth (optional but used for membership scope)
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
    if (userId) {
      const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: ok } = await svc.rpc("is_workspace_member", { _user_id: userId, _workspace_id: workspace_id });
      if (!ok) {
        return new Response(JSON.stringify({ error: "forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const dossier = await loadDossierContext(workspace_id);
    if (!dossier) {
      return new Response(JSON.stringify({
        has_dossier: false,
        brand_name: null,
        headline: "Upload a dossier so Vibe can plan around your brand.",
        summary: "Drop a brand brief, ICP, services or business model into the Dossier — Vibe will turn it into proactive plans.",
        suggestions: [],
        plan: [],
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const sys = `You are Vibe, an AI creator-marketing copilot. The user has just connected a WORKSPACE DOSSIER.
${dossier}
Your job: PROVE you understand this brand. Return STRICT JSON only, no prose, matching:
{
  "brand_name": "string — the exact brand the dossier is about",
  "headline": "one short sentence showing you understand the brand and its core objective",
  "summary": "2-3 sentences: who the brand is, who it serves, and what kind of social/creator strategy fits",
  "suggestions": [
    {"title":"specific action","prompt":"what to ask Vibe to do (1 sentence, brand-specific)","why":"one line tying it to the dossier","icon":"search|mail|calendar|users|message|sparkles|megaphone|chart"}
  ],
  "plan": [
    {"day":"Mon","platform":"tiktok|instagram|facebook","angle":"brand-specific angle","hook":"first-line hook in the brand's voice"}
  ]
}
Rules:
- 5 suggestions. Each MUST reference something concrete from the dossier (services, ICP, case studies, offers, niches). No generic "post more reels".
- 5 plan entries Mon–Fri. Each hook ≤ 90 chars and in the brand's voice.
- Never invent facts not in the dossier. If something isn't there, omit it.
- Output JSON only.`;

    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: "Generate the brand-grounded suggestions and weekday plan." },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ error: "ai_failed", detail: t.slice(0, 500) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const j = await r.json();
    const raw = j?.choices?.[0]?.message?.content ?? "{}";
    let parsed: any = {};
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    return new Response(JSON.stringify({
      has_dossier: true,
      brand_name: parsed.brand_name ?? null,
      headline: parsed.headline ?? "",
      summary: parsed.summary ?? "",
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.slice(0, 6) : [],
      plan: Array.isArray(parsed.plan) ? parsed.plan.slice(0, 7) : [],
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});