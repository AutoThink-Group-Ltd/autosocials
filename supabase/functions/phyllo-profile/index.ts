const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const PHYLLO_API_BASE = 'https://api.staging.getphyllo.com/v1';

function getBasicAuthHeader(): string {
  const clientId = Deno.env.get('PHYLLO_CLIENT_ID');
  const clientSecret = Deno.env.get('PHYLLO_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('Phyllo credentials not configured');
  }
  return 'Basic ' + btoa(`${clientId}:${clientSecret}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phyllo_id, username, platform = 'tiktok' } = await req.json();

    if (!phyllo_id && !username) {
      return new Response(
        JSON.stringify({ success: false, error: 'phyllo_id or username is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = getBasicAuthHeader();

    // If we have a phyllo_id, fetch directly
    let profileData: any = null;

    if (phyllo_id) {
      const res = await fetch(`${PHYLLO_API_BASE}/creators/${phyllo_id}`, {
        headers: {
          'Authorization': authHeader,
          'Accept': 'application/json',
        },
      });

      if (res.ok) {
        profileData = await res.json();
      } else {
        console.error(`Phyllo profile fetch error [${res.status}]:`, await res.text());
      }
    }

    // If no phyllo_id or fetch failed, try searching by username
    if (!profileData && username) {
      const searchRes = await fetch(`${PHYLLO_API_BASE}/creators/search`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          search_keyword: username,
          limit: 1,
        }),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const results = searchData.data || searchData.creators || searchData.results || [];
        if (results.length > 0) {
          profileData = results[0];
        }
      }
    }

    if (!profileData) {
      return new Response(
        JSON.stringify({ success: false, error: 'Creator not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save to our database for local access
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const profile = profileData.profile || profileData;
    const reputation = profileData.reputation || profileData;
    const engagement = profileData.engagement || profileData;

    const creatorUsername = (profile.username || profile.platform_username || username || '').replace(/^@/, '');

    const upsertData: Record<string, any> = {
      platform,
      username: creatorUsername,
      display_name: profile.full_name || profile.name || profile.display_name || creatorUsername,
      bio: profile.description || profile.bio || null,
      profile_url: profile.url || profile.profile_url || null,
      avatar_url: profile.image_url || profile.profile_picture_url || null,
      thumbnail_url: profile.image_url || profile.profile_picture_url || null,
      follower_count: reputation.follower_count || profile.follower_count || null,
      following_count: reputation.following_count || profile.following_count || null,
      engagement_rate: engagement.engagement_rate || profile.engagement_rate || null,
      avg_views: engagement.average_views || profile.avg_views || null,
      total_likes: reputation.like_count || profile.total_likes || null,
      video_count: reputation.content_count || profile.media_count || null,
      location: profile.location || profile.country || null,
      niches: profile.topic_tags || profile.interests || [],
      content_themes: profile.hashtags || profile.content_tags || [],
      contact_email: profile.email || profile.emails?.[0] || null,
      website_url: profile.website || profile.external_url || null,
      last_scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      source_query: `phyllo:${creatorUsername}`,
      raw_data: {
        phyllo_id: profileData.id || phyllo_id,
        source: 'phyllo',
        fetched_at: new Date().toISOString(),
        raw: profileData,
      },
    };

    const { data: saved, error: saveError } = await supabase
      .from('creator_profiles')
      .upsert(upsertData, { onConflict: 'platform,username' })
      .select('*')
      .single();

    if (saveError) {
      console.error('Save error:', saveError);
    }

    // Auto-generate public creator page (fire-and-forget)
    if (saved?.id) {
      const fnUrl = Deno.env.get('SUPABASE_URL');
      const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      fetch(`${fnUrl}/functions/v1/generate-creator-page`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${svcKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_profile_id: saved.id }),
      }).catch(e => console.error('Auto-generate page failed:', e));
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: saved || upsertData,
        source: 'phyllo',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Phyllo profile error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
