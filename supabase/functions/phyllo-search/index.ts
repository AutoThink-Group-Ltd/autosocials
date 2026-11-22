const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const PHYLLO_API_BASE = 'https://api.staging.getphyllo.com/v1';

interface PhylloSearchParams {
  query: string;
  platform: 'tiktok' | 'instagram' | 'youtube';
  limit?: number;
  offset?: number;
  min_followers?: number;
  max_followers?: number;
  min_engagement_rate?: number;
  niches?: string[];
  location?: string;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// Platform IDs as used by Phyllo
const PLATFORM_IDS: Record<string, string> = {
  tiktok: '25d78c',
  instagram: '9bb8913b-ddd9-430b-a66a-d74d846e6c66',
  youtube: 'a4e0c0',
};

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
    const params: PhylloSearchParams = await req.json();
    const { query, platform = 'tiktok', limit = 20, offset = 0 } = params;

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authHeader = getBasicAuthHeader();

    // Build the search request body for Phyllo Creator Search API
    const searchBody: Record<string, any> = {
      search_keyword: query,
      work_platform_ids: [PLATFORM_IDS[platform] || PLATFORM_IDS.tiktok],
      limit,
      offset,
      sort: {
        field: params.sort_by || 'follower_count',
        order: params.sort_order || 'desc',
      },
    };

    // Add optional filters
    if (params.min_followers || params.max_followers) {
      searchBody.follower_count = {};
      if (params.min_followers) searchBody.follower_count.min = params.min_followers;
      if (params.max_followers) searchBody.follower_count.max = params.max_followers;
    }

    if (params.min_engagement_rate) {
      searchBody.engagement_rate = { min: params.min_engagement_rate };
    }

    if (params.niches?.length) {
      searchBody.topic_tags = params.niches;
    }

    if (params.location) {
      searchBody.creator_locations = [params.location];
    }

    console.log('Phyllo search request:', JSON.stringify(searchBody));

    const searchRes = await fetch(`${PHYLLO_API_BASE}/creators/search`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(searchBody),
    });

    if (!searchRes.ok) {
      const errorText = await searchRes.text();
      console.error(`Phyllo API error [${searchRes.status}]:`, errorText);

      // If this specific endpoint fails, try alternative endpoint structure
      if (searchRes.status === 404) {
        // Try the alternative search/creators path
        const altRes = await fetch(`${PHYLLO_API_BASE}/search/creators`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(searchBody),
        });

        if (!altRes.ok) {
          const altError = await altRes.text();
          console.error(`Phyllo alt endpoint error [${altRes.status}]:`, altError);
          return new Response(
            JSON.stringify(buildPhylloErrorResponse(altRes.status, altError)),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const altData = await altRes.json();
        return formatResponse(altData, query, platform);
      }

      return new Response(
        JSON.stringify(buildPhylloErrorResponse(searchRes.status, errorText)),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await searchRes.json();
    return formatResponse(data, query, platform);
  } catch (error) {
    console.error('Phyllo search error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildPhylloErrorResponse(status: number, rawError: string) {
  let details = rawError;

  try {
    const parsed = JSON.parse(rawError);
    if (typeof parsed?.message === 'string') {
      details = parsed.message;
    }
  } catch {
    // Keep raw response body if it isn't JSON
  }

  return {
    success: false,
    error: `Phyllo API error: ${status}`,
    details,
    fallback_to_legacy: true,
  };
}

function formatResponse(data: any, query: string, platform: string) {
  // Normalize the Phyllo response to our CreatorProfile format
  const rawCreators = data.data || data.creators || data.results || [];
  const total = data.metadata?.total_count || data.total || rawCreators.length;

  const creators = rawCreators.map((c: any) => normalizePhylloCreator(c, platform));

  return new Response(
    JSON.stringify({
      success: true,
      data: creators,
      meta: {
        query,
        platform,
        total_found: total,
        creators_parsed: creators.length,
        source: 'phyllo',
        has_more: total > (data.metadata?.offset || 0) + creators.length,
      },
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function normalizePhylloCreator(raw: any, platform: string) {
  // Phyllo returns creators in various formats, normalize to our schema
  const profile = raw.profile || raw;
  const reputation = raw.reputation || raw;
  const engagement = raw.engagement || raw;

  const username = profile.username ||
    profile.platform_username ||
    profile.external_id ||
    '';

  const platformDomain = platform === 'tiktok'
    ? 'tiktok.com'
    : platform === 'instagram'
    ? 'instagram.com'
    : 'youtube.com';

  const profilePrefix = platform === 'tiktok' ? '@' : '';
  const profileUrl = profile.url ||
    profile.profile_url ||
    `https://www.${platformDomain}/${profilePrefix}${username}`;

  return {
    // Use a composite key so we can match/save later
    phyllo_id: raw.id || profile.id || null,
    platform,
    username: username.replace(/^@/, ''),
    display_name: profile.full_name || profile.name || profile.display_name || username,
    bio: profile.description || profile.bio || profile.introduction || null,
    profile_url: profileUrl,
    avatar_url: profile.image_url || profile.profile_picture_url || profile.picture || null,
    thumbnail_url: profile.image_url || profile.profile_picture_url || null,
    follower_count: reputation.follower_count || profile.follower_count || profile.followers_count || null,
    following_count: reputation.following_count || profile.following_count || null,
    engagement_rate: engagement.engagement_rate || profile.engagement_rate || null,
    avg_views: engagement.average_views || profile.avg_views || null,
    total_likes: reputation.like_count || profile.total_likes || null,
    video_count: reputation.content_count || profile.media_count || profile.video_count || null,
    location: profile.location || profile.country || null,
    niches: profile.topic_tags || profile.interests || profile.categories || [],
    content_themes: profile.hashtags || profile.content_tags || [],
    contact_email: profile.email || profile.emails?.[0] || null,
    website_url: profile.website || profile.external_url || null,
    // Keep raw data for debugging / enrichment
    raw_phyllo: raw,
  };
}
