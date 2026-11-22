const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, ig_user_id } = await req.json();

    if (!username && !ig_user_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'username or ig_user_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get a valid Meta access token
    const { data: tokenSource } = await supabase
      .from('meta_data_sources')
      .select('*')
      .eq('is_connected', true)
      .gt('token_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!tokenSource) {
      return new Response(
        JSON.stringify({ success: false, error: 'No valid Meta token found. Please connect Instagram first.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const accessToken = tokenSource.access_token;
    let targetIgUserId = ig_user_id;

    // If we have username but no ig_user_id, search for the user
    if (username && !targetIgUserId) {
      // Use the connected IG account to search for the target user
      const igAccounts = tokenSource.connection_metadata?.ig_accounts || [];
      if (igAccounts.length === 0) {
        return new Response(
          JSON.stringify({ success: false, error: 'No Instagram Business account linked' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const searchIgId = igAccounts[0].ig_user_id;
      const searchUrl = `https://graph.facebook.com/v18.0/${searchIgId}?fields=business_discovery.fields(id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,media.limit(12){id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink}).username(${username})&access_token=${accessToken}`;

      console.log('Searching IG user:', username);
      const searchRes = await fetch(searchUrl);
      const searchData = await searchRes.json();

      if (searchData.error) {
        console.error('IG search error:', searchData.error);
        // Fall back to Firecrawl scraping
        return await firecrawlFallback(username, supabase);
      }

      const discovery = searchData.business_discovery;
      if (!discovery) {
        return await firecrawlFallback(username, supabase);
      }

      // We got full data from the Graph API — upsert to creator_profiles
      const profileData: Record<string, any> = {
        platform: 'instagram',
        username: discovery.username || username,
        display_name: discovery.name || discovery.username || username,
        bio: discovery.biography || null,
        avatar_url: discovery.profile_picture_url || null,
        profile_url: `https://www.instagram.com/${discovery.username || username}/`,
        follower_count: discovery.followers_count || null,
        following_count: discovery.follows_count || null,
        video_count: discovery.media_count || null,
        last_scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        source_query: `ig:${username}`,
        raw_data: {
          ig_user_id: discovery.id,
          scraped_via: 'graph_api',
          scraped_at: new Date().toISOString(),
        },
      };

      // Process media for engagement and thumbnails
      const media = discovery.media?.data || [];
      if (media.length > 0) {
        let totalLikes = 0;
        let totalComments = 0;
        for (const m of media) {
          totalLikes += m.like_count || 0;
          totalComments += m.comments_count || 0;
        }
        const avgEngagement = (totalLikes + totalComments) / media.length;
        if (discovery.followers_count > 0) {
          profileData.engagement_rate = parseFloat(((avgEngagement / discovery.followers_count) * 100).toFixed(2));
        }
        profileData.avg_views = Math.round(avgEngagement); // approximation
        profileData.total_likes = totalLikes;

        // First media as thumbnail
        const firstMedia = media[0];
        profileData.thumbnail_url = firstMedia.thumbnail_url || firstMedia.media_url || null;
        profileData.latest_video_url = firstMedia.permalink || null;
        profileData.latest_video_description = firstMedia.caption?.substring(0, 500) || null;

        profileData.raw_data.recent_media = media.map((m: any) => ({
          id: m.id,
          type: m.media_type,
          url: m.permalink,
          thumbnail: m.thumbnail_url || m.media_url,
          caption: m.caption?.substring(0, 200),
          likes: m.like_count,
          comments: m.comments_count,
          timestamp: m.timestamp,
        }));
      }

      // Extract niches from bio and captions
      const allText = [discovery.biography, ...media.map((m: any) => m.caption)].filter(Boolean).join(' ');
      profileData.niches = extractNiches(allText);

      // Upsert
      const { data: upserted, error: upsertError } = await supabase
        .from('creator_profiles')
        .upsert(profileData, { onConflict: 'platform,username' })
        .select('*')
        .single();

      if (upsertError) {
        console.error('Upsert error:', upsertError);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to save creator' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Auto-generate public creator page for SEO (fire-and-forget)
      if (upserted?.id) {
        const supabaseFnUrl = Deno.env.get('SUPABASE_URL');
        const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
        fetch(`${supabaseFnUrl}/functions/v1/generate-creator-page`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ creator_profile_id: upserted.id }),
        }).catch(e => console.error('Auto-generate page failed:', e));
      }

      return new Response(
        JSON.stringify({ success: true, data: upserted, source: 'graph_api' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Could not resolve user' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Instagram scrape error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function firecrawlFallback(username: string, supabase: any) {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!firecrawlKey) {
    return new Response(
      JSON.stringify({ success: false, error: 'User not found via Graph API and Firecrawl not configured' }),
      { status: 404, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  console.log('Falling back to Firecrawl for:', username);

  const profileUrl = `https://www.instagram.com/${username}/`;
  const profileData: Record<string, any> = {
    platform: 'instagram',
    username,
    display_name: username,
    profile_url: profileUrl,
    source_query: `ig:${username}`,
    last_scraped_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // Try direct scrape of Instagram profile page for avatar (og:image)
  try {
    const directRes = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: profileUrl,
        formats: ['markdown'],
        waitFor: 5000,
      }),
    });

    if (directRes.ok) {
      const directData = await directRes.json();
      const metadata = directData.data?.metadata || directData.metadata || {};
      const markdown = directData.data?.markdown || directData.markdown || '';
      
      console.log('Direct IG scrape metadata:', JSON.stringify(metadata).substring(0, 500));
      
      // og:image from Instagram profile pages is the profile picture
      if (metadata.ogImage) {
        profileData.avatar_url = metadata.ogImage;
        profileData.thumbnail_url = metadata.ogImage;
      }

      // Try to extract display name and bio from page content
      if (metadata.ogTitle) {
        const nameMatch = metadata.ogTitle.match(/^([^(@]+)/);
        if (nameMatch && nameMatch[1].trim().length > 1) {
          profileData.display_name = nameMatch[1].trim();
        }
      }
      if (metadata.ogDescription) {
        const desc = metadata.ogDescription;
        const igBioMatch = desc.match(/on Instagram:\s*"([^"]+)"/i);
        if (igBioMatch && igBioMatch[1].length > 3) {
          profileData.bio = igBioMatch[1].substring(0, 500);
        }
        // Also parse follower stats from og:description
        const followerMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Follower|follower)s?\b/i);
        if (followerMatch && !profileData.follower_count) {
          profileData.follower_count = parseStatNumber(followerMatch[1].replace(',', '.'), followerMatch[2]);
        }
        const followingMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*Following/i);
        if (followingMatch && !profileData.following_count) {
          profileData.following_count = parseStatNumber(followingMatch[1].replace(',', '.'), followingMatch[2]);
        }
        const postMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Post|post)s?\b/i);
        if (postMatch && !profileData.video_count) {
          profileData.video_count = parseStatNumber(postMatch[1].replace(',', '.'), postMatch[2]);
        }
      }

      // Extract recent post links from profile page markdown
      const reelMatches = [...markdown.matchAll(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[A-Za-z0-9_-]+/g)];
      if (reelMatches.length > 0) {
        const videoLinks = [...new Set(reelMatches.map((m: RegExpMatchArray) => m[0]))].slice(0, 30);
        profileData.raw_data = { 
          ...(profileData.raw_data || {}), 
          video_links: videoLinks,
        };
        console.log(`Found ${videoLinks.length} post/reel links from IG profile`);
      }
    }
  } catch (e) {
    console.error('Direct IG scrape error:', e);
  }

  // Google search fallback for any missing data
  if (!profileData.follower_count || !profileData.avatar_url) {
    try {
      const searchRes = await fetch('https://api.firecrawl.dev/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
                    'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `"${username}" instagram followers`,
          limit: 5,
          scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
        }),
      });

      if (searchRes.ok) {
        const data = await searchRes.json();
        const results = data.data || [];

        for (const r of results) {
          const text = `${r.title || ''} ${r.description || ''} ${r.markdown || ''}`;
          const titleText = r.title || '';
          const descText = r.description || '';

          if (!profileData.display_name || profileData.display_name === username) {
            const nameMatch = titleText.match(/^([A-Za-z\s\-']+?)\s*\(@/);
            if (nameMatch && nameMatch[1].trim().length > 1) {
              profileData.display_name = nameMatch[1].trim();
            }
          }

          if (!profileData.bio) {
            const igBioMatch = descText.match(/on Instagram:\s*"([^"]+)"/i);
            if (igBioMatch && igBioMatch[1].length > 3) {
              profileData.bio = igBioMatch[1].substring(0, 500);
            }
          }

          const followerMatch = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Follower|follower)s?\b/i);
          if (followerMatch && !profileData.follower_count) {
            profileData.follower_count = parseStatNumber(followerMatch[1].replace(',', '.'), followerMatch[2]);
          }
          const followingMatch = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*Following/i);
          if (followingMatch && !profileData.following_count) {
            profileData.following_count = parseStatNumber(followingMatch[1].replace(',', '.'), followingMatch[2]);
          }
          const postMatch = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Post|post)s?\b/i);
          if (postMatch && !profileData.video_count) {
            profileData.video_count = parseStatNumber(postMatch[1].replace(',', '.'), postMatch[2]);
          }

          const metadata = r.metadata || {};
          if (metadata.ogImage && !profileData.avatar_url) {
            profileData.avatar_url = metadata.ogImage;
            profileData.thumbnail_url = metadata.ogImage;
          }
        }
      }
    } catch (e) {
      console.error('Google search error:', e);
    }
  }

  if (!profileData.raw_data) {
    profileData.raw_data = { scraped_via: 'firecrawl', scraped_at: new Date().toISOString() };
  } else {
    profileData.raw_data.scraped_via = 'firecrawl';
    profileData.raw_data.scraped_at = new Date().toISOString();
  }

  const { data: upserted, error } = await supabase
    .from('creator_profiles')
    .upsert(profileData, { onConflict: 'platform,username' })
    .select('*')
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ success: false, error: 'Failed to save creator' }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Auto-generate public creator page for SEO (fire-and-forget)
  if (upserted?.id) {
    const supabaseFnUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    fetch(`${supabaseFnUrl}/functions/v1/generate-creator-page`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ creator_profile_id: upserted.id }),
    }).catch(e => console.error('Auto-generate page failed:', e));
  }

  return new Response(
    JSON.stringify({ success: true, data: upserted, source: 'firecrawl' }),
    { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
  );
}

function extractNiches(text: string): string[] {
  const lower = text.toLowerCase();
  const nicheKeywords: Record<string, string[]> = {
    'fitness': ['fitness', 'workout', 'gym', 'exercise', 'training'],
    'beauty': ['beauty', 'makeup', 'skincare', 'cosmetics'],
    'fashion': ['fashion', 'style', 'outfit', 'ootd', 'clothing'],
    'food': ['food', 'recipe', 'cooking', 'chef', 'restaurant'],
    'travel': ['travel', 'wanderlust', 'explore', 'adventure'],
    'tech': ['tech', 'gadget', 'software', 'coding', 'developer'],
    'gaming': ['gaming', 'gamer', 'esports', 'twitch'],
    'music': ['music', 'singer', 'musician', 'producer'],
    'comedy': ['comedy', 'funny', 'humor', 'meme'],
    'education': ['education', 'learn', 'tutorial', 'tips'],
    'lifestyle': ['lifestyle', 'daily', 'routine', 'vlog'],
    'business': ['business', 'entrepreneur', 'startup', 'marketing'],
  };

  const found: string[] = [];
  for (const [niche, keywords] of Object.entries(nicheKeywords)) {
    if (keywords.some(k => lower.includes(k))) {
      found.push(niche);
    }
  }
  return found.slice(0, 5);
}

function parseStatNumber(numStr: string, suffix?: string): number {
  let num = parseFloat(numStr);
  const s = (suffix || '').toUpperCase();
  if (s === 'K') num *= 1000;
  if (s === 'M') num *= 1000000;
  if (s === 'B') num *= 1000000000;
  return Math.round(num);
}
