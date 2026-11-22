import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[GENERATE-CREATOR-PAGE] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiApiKey) throw new Error("OPENAI_API_KEY not set");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const { creator_profile_id } = await req.json();
    if (!creator_profile_id) throw new Error("creator_profile_id is required");

    logStep("Generating page for creator", { creator_profile_id });

    // Fetch creator profile
    const { data: creator, error: creatorError } = await supabaseAdmin
      .from("creator_profiles")
      .select("*")
      .eq("id", creator_profile_id)
      .single();

    if (creatorError || !creator) throw new Error("Creator not found");

    logStep("Creator loaded", { username: creator.username, platform: creator.platform });

    // Check if page already exists
    const { data: existing } = await supabaseAdmin
      .from("public_creator_pages")
      .select("id")
      .eq("creator_profile_id", creator_profile_id)
      .single();

    const displayName = creator.display_name || creator.username;
    const platform = creator.platform;
    const platLabel = platform === "tiktok" ? "TikTok" : platform === "instagram" ? "Instagram" : platform;

    // Generate AI summary
    const prompt = `You are writing content for a creator intelligence platform called AutoSocials. Generate a unique, informative profile summary for a social media creator.

Creator details:
- Name: ${displayName}
- Username: @${creator.username}
- Platform: ${platLabel}
- Bio: ${creator.bio || "Not available"}
- Followers: ${creator.follower_count || "Unknown"}
- Engagement Rate: ${creator.engagement_rate ? `${creator.engagement_rate}%` : "Unknown"}
- Average Views: ${creator.avg_views || "Unknown"}
- Total Likes: ${creator.total_likes || "Unknown"}
- Video Count: ${creator.video_count || "Unknown"}
- Niches: ${(creator.niches || []).join(", ") || "Not categorized"}
- Content Themes: ${(creator.content_themes || []).join(", ") || "Not detected"}
- Location: ${creator.location || "Unknown"}

Respond in valid JSON with these fields:
{
  "ai_summary": "A 2-3 paragraph unique description of this creator, their content style, audience, and what makes them notable. Write naturally, not like a template. Reference specific details about their content.",
  "ai_content_topics": ["topic1", "topic2", "topic3", "topic4", "topic5"],
  "ai_audience_interests": ["interest1", "interest2", "interest3", "interest4"],
  "ai_collaboration_notes": "A brief paragraph about what types of brand collaborations this creator would be well-suited for, based on their content and audience.",
  "page_title": "${displayName} ${platLabel} Creator Profile | Followers, Engagement & Creator Insights",
  "meta_description": "A 150-character SEO description for this creator's page."
}

Important: Every field must be unique and specific to this creator. Do not use generic filler.`;

    logStep("Calling AI gateway");

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      logStep("AI gateway error", { status: aiResponse.status, body: errText });
      throw new Error(`AI generation failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const rawContent = aiData.choices?.[0]?.message?.content || "";

    logStep("AI response received", { length: rawContent.length });

    // Parse JSON from AI response (handle markdown code blocks)
    let parsed;
    try {
      const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, rawContent];
      parsed = JSON.parse(jsonMatch[1]!.trim());
    } catch (e) {
      logStep("JSON parse failed, using raw content");
      parsed = {
        ai_summary: rawContent,
        ai_content_topics: creator.niches || [],
        ai_audience_interests: [],
        ai_collaboration_notes: null,
        page_title: `${displayName} ${platLabel} Creator Profile | Followers, Engagement & Creator Insights`,
        meta_description: `Discover ${displayName} (@${creator.username}) on ${platLabel}. View engagement stats and content insights.`,
      };
    }

    // Check data quality
    const hasFollowers = !!creator.follower_count;
    const hasBio = !!creator.bio;
    const hasAvatar = !!creator.avatar_url;
    const lowData = !hasFollowers && !hasBio;

    const slug = `${platform}/${creator.username}`;

    const pageRecord = {
      creator_profile_id,
      platform,
      username: creator.username,
      display_name: displayName,
      slug,
      page_title: parsed.page_title,
      meta_description: parsed.meta_description,
      ai_summary: parsed.ai_summary,
      ai_content_topics: parsed.ai_content_topics || [],
      ai_audience_interests: parsed.ai_audience_interests || [],
      ai_collaboration_notes: parsed.ai_collaboration_notes,
      status: "published",
      review_status: "needs_review",
      is_indexable: true,
      low_data_warning: lowData,
      duplicate_risk: false,
      updated_at: new Date().toISOString(),
    };

    let result;
    if (existing) {
      // Update existing page
      const { data, error } = await supabaseAdmin
        .from("public_creator_pages")
        .update(pageRecord)
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      result = data;
      logStep("Page updated", { id: existing.id });
    } else {
      // Insert new page
      const { data, error } = await supabaseAdmin
        .from("public_creator_pages")
        .insert({
          ...pageRecord,
          generated_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      result = data;
      logStep("Page created", { id: data.id });
    }

    return new Response(JSON.stringify({ success: true, page: result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
