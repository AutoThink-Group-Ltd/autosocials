import { corsHeaders } from "npm:@supabase/supabase-js/cors";
import { createClient } from "npm:@supabase/supabase-js";
import { loadDossierContext } from "../_shared/dossier.ts";

interface PlannedPost {
  day_offset: number;
  hour: number;
  platform: "facebook" | "instagram" | "tiktok";
  hook: string;
  caption: string;
  format: "image" | "carousel" | "reel" | "video" | "text";
  hashtags: string[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization");
    if (!auth) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const body = await req.json();
    const { workspace_id, brief, week_start, platforms, posts_per_day = 1, mode = "preview" } = body ?? {};
    if (!workspace_id || !brief || !week_start || !Array.isArray(platforms) || platforms.length === 0) {
      return new Response(JSON.stringify({ error: "missing fields" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Verify membership
    const { data: member } = await service.from("workspace_members").select("role").eq("workspace_id", workspace_id).eq("user_id", userData.user.id).maybeSingle();
    if (!member) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) throw new Error("OPENAI_API_KEY missing");

    const dossier = await loadDossierContext(workspace_id);
    const sys = `You are Vibe, AutoSocials' creator-marketing copilot. Plan a 7-day social content calendar.
${dossier}
The WORKSPACE DOSSIER above is the highest authority on brand voice, ICP, services, offers and tone. Every hook, caption and angle MUST reflect it. Do not invent positioning that contradicts it.
Return STRICT JSON only — no prose.
Schema:
{"posts":[{"day_offset":0-6,"hour":0-23,"platform":"facebook|instagram|tiktok","hook":"string","caption":"string","format":"image|carousel|reel|video|text","hashtags":["#tag"]}]}
Rules:
- Tailor tone per platform: TikTok/IG = punchy lead hook; Facebook = conversational.
- Vary formats and angles across the week (educational, social proof, behind-the-scenes, CTA).
- Respect requested platforms only. Total posts = ${posts_per_day} per day across selected platforms.
- Captions ≤ 2200 chars; hashtags 3–8 per post (none for Facebook unless natural).
- Recommend posting hours that fit each platform's peak windows.`;

    const user = `Brief:\n${brief}\n\nWeek starts: ${week_start}\nPlatforms: ${platforms.join(", ")}\nPosts/day: ${posts_per_day}`;

    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text();
      return new Response(JSON.stringify({ error: "ai_failed", detail: txt }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiJson = await aiRes.json();
    const content = aiJson?.choices?.[0]?.message?.content ?? "{}";
    let parsed: { posts: PlannedPost[] };
    try { parsed = JSON.parse(content); } catch { parsed = { posts: [] }; }
    const posts = (parsed.posts ?? []).filter((p) => platforms.includes(p.platform));

    if (mode === "preview") {
      return new Response(JSON.stringify({ posts }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // mode === "commit": create draft posts + targets
    const { data: accounts } = await service
      .from("social_accounts")
      .select("id, platform")
      .eq("workspace_id", workspace_id)
      .eq("status", "active");
    const accountByPlatform = new Map<string, string>();
    for (const a of accounts ?? []) if (!accountByPlatform.has(a.platform)) accountByPlatform.set(a.platform, a.id);

    const weekStartDate = new Date(week_start);
    const created: string[] = [];
    const agentRunId = crypto.randomUUID();
    for (const p of posts) {
      const scheduledAt = new Date(weekStartDate);
      scheduledAt.setDate(scheduledAt.getDate() + (p.day_offset ?? 0));
      scheduledAt.setHours(p.hour ?? 10, 0, 0, 0);

      const captionFull = `${p.hook}\n\n${p.caption}${p.hashtags?.length ? "\n\n" + p.hashtags.join(" ") : ""}`.trim();

      const { data: post, error: postErr } = await service.from("posts").insert({
        workspace_id,
        created_by: userData.user.id,
        caption: captionFull,
        status: "draft",
        scheduled_at: scheduledAt.toISOString(),
        agent_run_id: agentRunId,
        created_via: "plan_week",
      }).select("id").single();
      if (postErr || !post) continue;

      const accId = accountByPlatform.get(p.platform);
      if (accId) {
        await service.from("post_targets").insert({
          post_id: post.id,
          social_account_id: accId,
          platform: p.platform,
          status: "pending",
        });
      }
      await service.from("post_agent_events").insert({
        post_id: post.id,
        workspace_id,
        agent_run_id: agentRunId,
        skill: "publishing.plan_week",
        tool: "publishing.bulk_create_drafts",
        event_type: "draft_created",
        actor_user_id: userData.user.id,
        payload: { platform: p.platform, format: p.format, scheduled_at: scheduledAt.toISOString() },
      });
      created.push(post.id);
    }

    return new Response(JSON.stringify({ created_count: created.length, post_ids: created, agent_run_id: agentRunId }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});