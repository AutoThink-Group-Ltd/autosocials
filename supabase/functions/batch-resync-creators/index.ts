const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

function parseStatNumber(numStr: string, suffix?: string): number {
  let num = parseFloat(numStr);
  const s = (suffix || '').toUpperCase();
  if (s === 'K') num *= 1000;
  if (s === 'M') num *= 1000000;
  if (s === 'B') num *= 1000000000;
  return Math.round(num);
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

async function fetchViaTikTokProfile(username: string): Promise<Record<string, any> | null> {
  try {
    const profileUrl = `https://www.tiktok.com/@${username}`;
    const res = await fetch(profileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      console.error(`TikTok profile fetch failed for ${username}: ${res.status}`);
      return null;
    }

    const html = await res.text();
    const profileData: Record<string, any> = {};

    const universalDataMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application\/json">([\s\S]*?)<\/script>/);
    if (universalDataMatch?.[1]) {
      try {
        const universalData = JSON.parse(universalDataMatch[1]);
        const detail = universalData?.__DEFAULT_SCOPE__?.['webapp.user-detail'];
        const userInfo = detail?.userInfo || {};
        const user = userInfo?.user || {};
        const stats = userInfo?.stats || {};

        profileData.follower_count = toNumber(stats.followerCount);
        profileData.following_count = toNumber(stats.followingCount);
        profileData.total_likes = toNumber(stats.heartCount ?? stats.heart);
        profileData.video_count = toNumber(stats.videoCount);

        profileData.display_name = user.nickname || null;
        profileData.bio = user.signature || null;
        profileData.avatar_url = user.avatarLarger || user.avatarMedium || user.avatarThumb || null;
        profileData.thumbnail_url = profileData.avatar_url;
        profileData.profile_url = user.uniqueId ? `https://www.tiktok.com/@${user.uniqueId}` : profileUrl;

        const bioLink = user.bioLink?.link || user.bioLink?.url;
        if (bioLink) profileData.website_url = bioLink;
      } catch (e) {
        console.error(`Failed to parse TikTok universal JSON for ${username}:`, e);
      }
    }

    if (!profileData.follower_count) {
      const followerFallback = html.match(/"followerCount"\s*:\s*"?(\d+)/i);
      if (followerFallback) profileData.follower_count = Number(followerFallback[1]);
    }
    if (!profileData.total_likes) {
      const likesFallback = html.match(/"heartCount"\s*:\s*"?(\d+)/i);
      if (likesFallback) profileData.total_likes = Number(likesFallback[1]);
    }
    if (!profileData.video_count) {
      const videosFallback = html.match(/"videoCount"\s*:\s*"?(\d+)/i);
      if (videosFallback) profileData.video_count = Number(videosFallback[1]);
    }

    if (profileData.follower_count && profileData.total_likes && profileData.video_count) {
      const avgLikes = profileData.total_likes / profileData.video_count;
      profileData.engagement_rate = parseFloat((avgLikes / profileData.follower_count).toFixed(4));
      profileData.avg_views = Math.round(avgLikes * 3);
    }

    const hasStats = Boolean(profileData.follower_count || profileData.total_likes || profileData.video_count);
    console.log(`TikTok profile stats for ${username}: followers=${profileData.follower_count}, likes=${profileData.total_likes}, videos=${profileData.video_count}, hasStats=${hasStats}`);

    return hasStats || profileData.avatar_url || profileData.display_name ? profileData : null;
  } catch (e) {
    console.error(`TikTok profile parse error for ${username}:`, e);
    return null;
  }
}

async function fetchViaOembed(username: string): Promise<Record<string, any> | null> {
  try {
    const url = `https://www.tiktok.com/oembed?url=${encodeURIComponent(`https://www.tiktok.com/@${username}`)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.author_name) return null;
    return {
      display_name: data.author_name,
      avatar_url: data.author_thumbnail_url || null,
      thumbnail_url: data.thumbnail_url || null,
    };
  } catch {
    return null;
  }
}

async function fetchViaFirecrawlSearch(username: string, platform: string, firecrawlKey: string): Promise<Record<string, any> | null> {
  if (!firecrawlKey) return null;

  try {
    const domain = platform === 'tiktok' ? 'tiktok.com' : 'instagram.com';
    // Use a broader search to get Google snippets with stats
    const searchQuery = `site:${domain}/@${username}`;

    const res = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: searchQuery,
        limit: 5,
      }),
    });

    if (!res.ok) {
      console.error(`Firecrawl search failed for ${username}: ${res.status}`);
      return null;
    }

    const searchData = await res.json();
    const results = searchData.data || [];

    if (results.length === 0) return null;

    // Combine all text from all results (title + description + markdown)
    let allText = '';
    let bestMetadata: any = {};
    for (const r of results) {
      const url = (r.url || '').toLowerCase();
      if (url.includes(`/@${username.toLowerCase()}`) || url.includes(`/${username.toLowerCase()}`)) {
        allText += ` ${r.title || ''} ${r.description || ''} ${r.markdown || ''}`;
        if (r.metadata) bestMetadata = r.metadata;
      }
    }
    // Also check all results if profile-specific ones had nothing
    if (allText.trim().length < 20) {
      for (const r of results) {
        allText += ` ${r.title || ''} ${r.description || ''} ${r.markdown || ''}`;
        if (r.metadata && !bestMetadata.ogImage) bestMetadata = r.metadata;
      }
    }

    console.log(`Combined text for ${username} (${allText.length} chars): ${allText.substring(0, 400)}`);

    const profileData: Record<string, any> = {};

    // Extract stats from combined text
    const followerMatch = allText.match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*(?:Followers|followers)/i);
    if (followerMatch) profileData.follower_count = parseStatNumber(followerMatch[1], followerMatch[2]);

    const followingMatch = allText.match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*(?:Following|following)/i);
    if (followingMatch) profileData.following_count = parseStatNumber(followingMatch[1], followingMatch[2]);

    const likesMatch = allText.match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*(?:Likes|likes)/i);
    if (likesMatch) profileData.total_likes = parseStatNumber(likesMatch[1], likesMatch[2]);

    const videoMatch = allText.match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*(?:Videos|videos|posts)/i);
    if (videoMatch) profileData.video_count = parseStatNumber(videoMatch[1], videoMatch[2]);

    // Bio from description
    const bioMatch = allText.match(/(?:Likes\n+|likes\.?\s+)([\s\S]*?)(?:\.\s|$)/);
    if (bioMatch && bioMatch[1].trim().length > 5) {
      profileData.bio = bioMatch[1].trim().substring(0, 500);
    }

    // Display name from title
    const titleMatch = allText.match(/^(.+?)(?:\s*\(@|\s*\||\s*-)/m);
    if (titleMatch && titleMatch[1].trim().length > 1) {
      profileData.display_name = titleMatch[1].trim();
    }

    if (bestMetadata.ogImage) {
      profileData.avatar_url = bestMetadata.ogImage;
      profileData.thumbnail_url = bestMetadata.ogImage;
    }

    // Engagement calc
    if (profileData.follower_count && profileData.total_likes && profileData.video_count) {
      const avgLikes = profileData.total_likes / profileData.video_count;
      profileData.engagement_rate = parseFloat(((avgLikes / profileData.follower_count) * 100).toFixed(2));
      profileData.avg_views = Math.round(avgLikes * 3);
    }

    const hasData = profileData.follower_count || profileData.total_likes;
    console.log(`Stats for ${username}: followers=${profileData.follower_count}, likes=${profileData.total_likes}, hasData=${!!hasData}`);
    return hasData ? profileData : null;
  } catch (e) {
    console.error(`Search error for ${username}:`, e);
    return null;
  }
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { batch_size = 5, offset = 0, platform_filter } = await req.json().catch(() => ({}));

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY') || '';

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let query = supabase
      .from('creator_profiles')
      .select('id, username, platform')
      .or('follower_count.is.null,follower_count.eq.0')
      .order('created_at', { ascending: true })
      .range(offset, offset + batch_size - 1);

    if (platform_filter) query = query.eq('platform', platform_filter);

    const { data: creators, error: fetchError } = await query;

    if (fetchError) {
      return new Response(
        JSON.stringify({ success: false, error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!creators || creators.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No creators need resyncing', updated: 0, remaining: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let updated = 0;
    let failed = 0;
    const results: Array<{ username: string; status: string; followers?: number }> = [];

    for (const creator of creators) {
      console.log(`=== Resyncing ${creator.username} (${creator.platform}) ===`);

      let profileData: Record<string, any> = {};

      // Step 1: direct TikTok profile parse (best source for stats)
      if (creator.platform === 'tiktok') {
        const profileHtmlData = await fetchViaTikTokProfile(creator.username);
        if (profileHtmlData) Object.assign(profileData, profileHtmlData);

        // Keep oEmbed as fallback for avatar/name if missing
        if (!profileData.avatar_url || !profileData.display_name) {
          const oembedData = await fetchViaOembed(creator.username);
          if (oembedData) Object.assign(profileData, oembedData);
        }
      }

      // Step 2: Firecrawl search fallback (mainly for non-TikTok)
      if (!profileData.follower_count && !profileData.total_likes) {
        const searchData = await fetchViaFirecrawlSearch(creator.username, creator.platform, firecrawlKey);
        if (searchData) Object.assign(profileData, searchData);
      }

      if (profileData.follower_count || profileData.total_likes) {
        profileData.last_scraped_at = new Date().toISOString();
        profileData.updated_at = new Date().toISOString();
        profileData.raw_data = { source: 'batch_resync', scraped_at: new Date().toISOString() };

        const { error: updateError } = await supabase
          .from('creator_profiles')
          .update(profileData)
          .eq('id', creator.id);

        if (!updateError) {
          updated++;
          results.push({ username: creator.username, status: 'updated', followers: profileData.follower_count });
          console.log(`✓ ${creator.username}: ${profileData.follower_count} followers`);
        } else {
          failed++;
          results.push({ username: creator.username, status: 'update_failed' });
        }
      } else if (Object.keys(profileData).length > 0) {
        // Save partial data (name/avatar from oEmbed)
        profileData.last_scraped_at = new Date().toISOString();
        profileData.updated_at = new Date().toISOString();
        await supabase.from('creator_profiles').update(profileData).eq('id', creator.id);
        failed++;
        results.push({ username: creator.username, status: 'partial' });
      } else {
        failed++;
        results.push({ username: creator.username, status: 'no_data' });
      }

      await sleep(500);
    }

    const { count: remaining } = await supabase
      .from('creator_profiles')
      .select('id', { count: 'exact', head: true })
      .or('follower_count.is.null,follower_count.eq.0');

    return new Response(
      JSON.stringify({ success: true, batch_size: creators.length, updated, failed, remaining: remaining || 0, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Batch resync error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
