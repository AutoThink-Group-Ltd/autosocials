import { firecrawlWebResults } from "../_shared/firecrawl.ts";
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
    const { query, platform = 'tiktok', limit = 20, mode = 'keyword' } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ success: false, error: 'Search query is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!firecrawlKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auto-detect if the query looks like a username even in keyword mode
    const cleanQuery = query.trim().replace(/^@/, '');
    const looksLikeUsername = /^[a-zA-Z0-9._]{3,30}$/.test(cleanQuery) && /[._\d]/.test(cleanQuery) && !cleanQuery.includes(' ');
    const isUsername = mode === 'username' || (mode === 'keyword' && looksLikeUsername);

    if (mode === 'keyword' && looksLikeUsername) {
      console.log('Query looks like a username, will also do direct lookup:', cleanQuery);
    }

    if (isUsername) {
      console.log('Username detected:', cleanQuery, '- doing direct lookup');
      
      // Check if already in DB with enriched data
      const { data: existing } = await supabase
        .from('creator_profiles')
        .select('*')
        .eq('platform', platform)
        .eq('username', cleanQuery)
        .single();

      if (existing && existing.follower_count) {
        // Already enriched, just return
        await supabase.from('search_queries').insert({
          query, platform, result_count: 1, creator_ids: [existing.id],
        });
        return new Response(
          JSON.stringify({ success: true, data: [existing], meta: { query, platform, total_found: 1, creators_parsed: 1 } }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Build profile URL
      const profileUrl = platform === 'tiktok'
        ? `https://www.tiktok.com/@${cleanQuery}`
        : `https://www.instagram.com/${cleanQuery}/`;

      console.log('Username lookup:', cleanQuery, 'Platform:', platform);
      const profileData: Record<string, any> = {
        platform,
        username: cleanQuery,
        display_name: cleanQuery,
        profile_url: profileUrl,
        source_query: query,
        last_scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // For Instagram: try Graph API first
      if (platform === 'instagram') {
        const graphResult = await tryInstagramGraphAPI(cleanQuery, supabase);
        if (graphResult) {
          Object.assign(profileData, graphResult);
          console.log('Graph API found IG user:', cleanQuery, 'followers:', profileData.follower_count);
        }
      }

      // For TikTok or if Graph API failed: use Firecrawl
      if (platform === 'tiktok' || !profileData.follower_count) {
        try {
          const scrapeRes = await fetch('https://api.firecrawl.dev/v2/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
                            'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: profileUrl,
              formats: ['markdown'],
              waitFor: 3000,
            }),
          });

          if (scrapeRes.ok) {
            const scrapeJson = await scrapeRes.json();
            const result = scrapeJson.data || scrapeJson;
            const markdown = result.markdown || '';
            const metadata = result.metadata || {};

            console.log('Scraped markdown length:', markdown.length);

            // Extract stats from markdown (only if Graph API didn't already fill them)
            if (!profileData.follower_count) {
              const followerMatch = markdown.match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*(?:Followers|followers)/);
              if (followerMatch) profileData.follower_count = parseStatNumber(followerMatch[1], followerMatch[2]);
            }
            if (!profileData.following_count) {
              const followingMatch = markdown.match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*(?:Following|following)/);
              if (followingMatch) profileData.following_count = parseStatNumber(followingMatch[1], followingMatch[2]);
            }
            if (!profileData.total_likes) {
              const likesMatch = markdown.match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*(?:Likes|likes)/);
              if (likesMatch) profileData.total_likes = parseStatNumber(likesMatch[1], likesMatch[2]);
            }
            if (!profileData.video_count) {
              const videoMatch = markdown.match(/(\d+(?:\.\d+)?)\s*([KkMmBb])?\s*(?:Videos|videos|posts)/);
              if (videoMatch) profileData.video_count = parseStatNumber(videoMatch[1], videoMatch[2]);
            }

            if (!profileData.bio) {
              const bioMatch = markdown.match(/(?:Likes\n+|likes\n+|Following\n+)([\s\S]*?)(?:\n\n|\[|$)/);
              if (bioMatch && bioMatch[1].trim().length > 5) {
                profileData.bio = bioMatch[1].trim().substring(0, 500);
              }
            }

            if (!profileData.avatar_url && metadata.ogImage) profileData.avatar_url = metadata.ogImage;

            // TikTok-specific: extract video links
            if (platform === 'tiktok') {
              const videoLinks: string[] = [];
              const videoRegex = /tiktok\.com\/@[^\/]+\/video\/\d+/g;
              let m;
              while ((m = videoRegex.exec(markdown)) !== null) {
                videoLinks.push('https://www.' + m[0]);
              }

              profileData.raw_data = {
                ...(profileData.raw_data || {}),
                scraped_at: new Date().toISOString(),
                metadata,
                video_links: videoLinks.slice(0, 10),
              };

              if (videoLinks.length > 0) {
                try {
                  const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoLinks[0])}`);
                  if (oembedRes.ok) {
                    const oembed = await oembedRes.json();
                    if (oembed.thumbnail_url) profileData.thumbnail_url = oembed.thumbnail_url;
                    if (oembed.title) profileData.latest_video_description = oembed.title;
                    if (oembed.author_name) profileData.display_name = oembed.author_name;
                    if (oembed.author_thumbnail_url && !profileData.avatar_url) profileData.avatar_url = oembed.author_thumbnail_url;
                    profileData.latest_video_url = videoLinks[0];
                  }
                } catch (e) { console.error('oEmbed failed:', e); }
              }

              if (!profileData.thumbnail_url) {
                try {
                  const oembedRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(profileUrl)}`);
                  if (oembedRes.ok) {
                    const oembed = await oembedRes.json();
                    if (oembed.author_name) profileData.display_name = oembed.author_name;
                  }
                } catch (_) {}
              }
            }

            console.log('Enriched profile:', cleanQuery, 'followers:', profileData.follower_count, 'likes:', profileData.total_likes);
          }
        } catch (e) {
          console.error('Firecrawl scrape failed:', e);
        }
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('creator_profiles')
        .upsert(profileData, { onConflict: 'platform,username' })
        .select('*')
        .single();

      if (insertErr) {
        console.error('Insert error:', insertErr);
        return new Response(
          JSON.stringify({ success: false, error: 'Failed to create profile' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase.from('search_queries').insert({
        query, platform, result_count: 1, creator_ids: [inserted.id],
      });

      // Auto-generate public creator page for SEO (fire-and-forget)
      const supabaseFnUrl = Deno.env.get('SUPABASE_URL');
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      fetch(`${supabaseFnUrl}/functions/v1/generate-creator-page`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ creator_profile_id: inserted.id }),
      }).catch(e => console.error('Auto-generate page failed:', e));

      return new Response(
        JSON.stringify({ success: true, data: [inserted], meta: { query, platform, total_found: 1, creators_parsed: 1 } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Brand mode: scrape the website first, extract brand info, then search for creators
    if (mode === 'brand') {
      console.log('Brand mode: scraping website for brand context...');
      let brandName = cleanQuery;
      let brandDescription = '';
      let brandKeywords: string[] = [];

      // Format URL for scraping
      let brandUrl = cleanQuery.trim();
      if (!brandUrl.startsWith('http://') && !brandUrl.startsWith('https://')) {
        brandUrl = `https://${brandUrl}`;
      }

      try {
        const scrapeRes = await fetch('https://api.firecrawl.dev/v2/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
                        'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: brandUrl,
            formats: ['markdown'],
            onlyMainContent: true,
            waitFor: 3000,
          }),
        });

        if (scrapeRes.ok) {
          const scrapeJson = await scrapeRes.json();
          const result = scrapeJson.data || scrapeJson;
          const markdown = (result.markdown || '').substring(0, 3000);
          const metadata = result.metadata || {};

          // Extract brand name from metadata
          if (metadata.title) {
            brandName = metadata.title.split(/[|\-–—:]/)[0].trim();
          }
          if (metadata.description) {
            brandDescription = metadata.description;
          }

          // Extract product category keywords from the page content
          const pageText = (brandName + ' ' + brandDescription + ' ' + markdown).toLowerCase();
          const keywordCandidates = ['funnel', 'landing page', 'saas', 'software', 'app', 'tool', 'platform', 'ai', 'marketing', 'sales', 'crm', 'analytics', 'design', 'productivity', 'collaboration', 'video', 'social media', 'ecommerce', 'fintech', 'health', 'education', 'fitness', 'beauty', 'fashion', 'food', 'travel', 'gaming', 'music', 'crypto', 'real estate', 'mobile', 'website builder', 'email', 'automation'];
          brandKeywords = keywordCandidates.filter(kw => pageText.includes(kw)).slice(0, 5);

          console.log('Brand scraped:', brandName, '| Description:', brandDescription.substring(0, 100), '| Keywords:', brandKeywords.join(', '));
        }
      } catch (e) {
        console.error('Brand scrape failed:', e);
      }

      // Strip domain suffixes to get a clean brand name for searching
      const cleanBrandName = brandName
        .replace(/\.(io|com|co|ai|app|dev|net|org)$/i, '')
        .replace(/https?:\/\//i, '')
        .trim();

      // Build multiple search queries to find UGC creators promoting this brand
      // Strategy: search for people TALKING ABOUT the brand, not the brand's own account
      const platformDomain = platform === 'tiktok' ? 'tiktok.com' : 'instagram.com';
      const searchQueries = [
        `site:${platformDomain} "${cleanBrandName}" review OR tutorial OR honest OR trying OR tested`,
        `site:${platformDomain} "${cleanBrandName}" ad OR sponsored OR partnership OR ugc OR creator`,
        `site:${platformDomain} "${cleanBrandName}" ${brandKeywords.slice(0, 2).join(' ')}`,
      ];

      console.log('Brand search queries:', searchQueries);

      // Run multiple searches in parallel for broader results
      const allResults: any[] = [];
      const searchPromises = searchQueries.map(async (sq) => {
        try {
          const searchResponse = await fetch('https://api.firecrawl.dev/v2/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
                            'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: sq,
              limit: 10,
              scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
            }),
          });
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const results = firecrawlWebResults(searchData);
            allResults.push(...results);
          }
        } catch (e) {
          console.error('Search query failed:', sq, e);
        }
      });
      await Promise.all(searchPromises);

      console.log(`Brand search found ${allResults.length} total results`);

      // Deduplicate by URL
      const seenUrls = new Set<string>();
      const uniqueResults = allResults.filter(r => {
        const url = r.url || '';
        if (seenUrls.has(url)) return false;
        seenUrls.add(url);
        return true;
      });
      // Filter out the brand's own account
      const creators: any[] = [];
      const brandUsername = cleanBrandName.toLowerCase().replace(/\s+/g, '');
      for (const result of uniqueResults) {
        const parsed = parseCreatorFromResult(result, platform, `brand:${cleanQuery}`);
        if (parsed && parsed.username.toLowerCase() !== brandUsername && parsed.username.toLowerCase() !== cleanQuery.toLowerCase().replace(/\./g, '')) {
          creators.push(parsed);
        }
      }

      console.log(`Parsed ${creators.length} creators (excluding brand's own account)`);

      // Upsert + oEmbed (reuse same logic as keyword)
      const upsertedIds: string[] = [];
      for (const creator of creators) {
        const { data, error } = await supabase
          .from('creator_profiles')
          .upsert(creator, { onConflict: 'platform,username' })
          .select('id')
          .single();
        if (data) upsertedIds.push(data.id);
        if (error) console.error('Upsert error for', creator.username, error);
      }

      if (platform === 'tiktok') {
        const oembedPromises = creators.map(async (creator) => {
          try {
            if (creator.latest_video_url) {
              const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(creator.latest_video_url)}`);
              if (res.ok) {
                const oembed = await res.json();
                const updates: Record<string, any> = {};
                if (oembed.thumbnail_url) updates.thumbnail_url = oembed.thumbnail_url;
                if (oembed.title) updates.latest_video_description = oembed.title;
                if (oembed.author_name) updates.display_name = oembed.author_name;
                if (oembed.author_thumbnail_url) updates.avatar_url = oembed.author_thumbnail_url;
                if (Object.keys(updates).length > 0) {
                  await supabase.from('creator_profiles').update(updates).eq('platform', platform).eq('username', creator.username);
                }
              }
            }
          } catch (e) { console.error('oEmbed failed for', creator.username); }
        });
        await Promise.all(oembedPromises);
      }

      await supabase.from('search_queries').insert({ query: `brand:${cleanQuery}`, platform, result_count: creators.length, creator_ids: upsertedIds });

      // Auto-generate public creator pages for SEO (fire-and-forget)
      const supabaseFnUrl2 = Deno.env.get('SUPABASE_URL');
      const serviceKey2 = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
      for (const creatorId of upsertedIds) {
        fetch(`${supabaseFnUrl2}/functions/v1/generate-creator-page`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${serviceKey2}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ creator_profile_id: creatorId }),
        }).catch(e => console.error('Auto-generate page failed for', creatorId, e));
      }

      const { data: profiles } = await supabase
        .from('creator_profiles')
        .select('*')
        .in('id', upsertedIds)
        .order('follower_count', { ascending: false });

      return new Response(
        JSON.stringify({ success: true, data: profiles || [], meta: { query: `brand:${cleanQuery}`, platform, total_found: allResults.length, creators_parsed: creators.length } }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Keyword-based search — run multiple query variants for maximum coverage
    const platformDomain = platform === 'tiktok' ? 'tiktok.com' : 'instagram.com';
    // If query looks like it could be a username (no spaces, short), also add a direct profile URL query
    const maybeUsername = /^[a-zA-Z0-9._]{2,30}$/.test(cleanQuery) && !cleanQuery.includes(' ');
    const directProfileQuery = maybeUsername
      ? (platform === 'tiktok'
          ? [`site:${platformDomain}/@${cleanQuery}`]
          : [`site:${platformDomain}/${cleanQuery}/`])
      : [];

    const searchQueries = platform === 'instagram'
      ? [
          ...directProfileQuery,
          `site:${platformDomain} ${query} creator`,
          `site:${platformDomain} ${query} influencer`,
          `site:${platformDomain} ${query}`,
          `site:${platformDomain} ${query} content creator tips`,
          `site:${platformDomain} ${query} UGC brand`,
          `site:${platformDomain} ${query} review honest`,
          `site:${platformDomain} ${query} expert advice`,
        ]
      : [
          ...directProfileQuery,
          `site:${platformDomain} ${query} creator`,
          `site:${platformDomain} ${query} influencer`,
          `site:${platformDomain} "@" ${query}`,
          `site:${platformDomain} ${query} review tutorial`,
          `site:${platformDomain} ${query} tips tricks`,
          `site:${platformDomain} ${query} UGC brand deal`,
          `site:${platformDomain} ${query} expert advice how to`,
          `site:${platformDomain} ${query} trending viral`,
        ];

    console.log('Firecrawl search queries:', searchQueries);

    // Run all search queries in parallel for maximum coverage
    let allSearchResults: any[] = [];
    
    const searchPromises = searchQueries.map(async (sq) => {
      try {
        const searchResponse = await fetch('https://api.firecrawl.dev/v2/search', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
                        'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            query: sq,
            limit: 50,
            scrapeOptions: {
              formats: ['markdown'],
              onlyMainContent: true,
            },
          }),
        });

        if (searchResponse.ok) {
          const searchData = await searchResponse.json();
          const results = firecrawlWebResults(searchData);
          console.log(`Query "${sq}" returned ${results.length} results`);
          return results;
        } else {
          const errData = await searchResponse.json();
          console.error('Firecrawl error for query:', sq, errData);
          return [];
        }
      } catch (e) {
        console.error('Search failed for query:', sq, e);
        return [];
      }
    });
    
    const queryResults = await Promise.all(searchPromises);
    for (const results of queryResults) {
      allSearchResults.push(...results);
    }

    // Deduplicate by URL
    const seenUrls = new Set<string>();
    const results = allSearchResults.filter(r => {
      const url = r.url || '';
      if (seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });

    console.log(`Found ${results.length} unique results after dedup`);

    const searchData = { data: results };

    // Parse creator data from search results
    const creators: any[] = [];
    const seenUsernames = new Set<string>();

    for (const result of results) {
      const parsed = parseCreatorFromResult(result, platform, query);
      if (parsed && !seenUsernames.has(parsed.username)) {
        seenUsernames.add(parsed.username);
        creators.push(parsed);
      }
    }

    // Instagram fallback: if Firecrawl found nothing, try Graph API direct lookup
    // (treats the query as a potential username)
    if (platform === 'instagram' && creators.length === 0) {
      console.log('Instagram keyword search returned 0, trying Graph API lookup for:', query);
      const graphResult = await tryInstagramGraphAPI(query.replace(/^@/, '').trim(), supabase);
      if (graphResult) {
        const cleanUsername = query.replace(/^@/, '').trim();
        creators.push({
          platform: 'instagram',
          username: cleanUsername,
          display_name: graphResult.display_name || cleanUsername,
          profile_url: `https://www.instagram.com/${cleanUsername}/`,
          source_query: query,
          last_scraped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...graphResult,
        });
        console.log('Graph API fallback found IG user:', cleanUsername);
      }
    }

    console.log(`Parsed ${creators.length} creators`);

    // Upsert creators into DB
    const upsertedIds: string[] = [];
    for (const creator of creators) {
      const { data, error } = await supabase
        .from('creator_profiles')
        .upsert(creator, { onConflict: 'platform,username' })
        .select('id')
        .single();

      if (data) {
        upsertedIds.push(data.id);
      }
      if (error) {
        console.error('Upsert error for', creator.username, error);
      }
    }

    // Fetch thumbnails via oEmbed for TikTok creators
    if (platform === 'tiktok') {
      console.log('Fetching oEmbed thumbnails...');
      const oembedPromises = creators.map(async (creator) => {
        try {
          // Try video oEmbed first for thumbnail + avatar
          if (creator.latest_video_url) {
            const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(creator.latest_video_url)}`);
            if (res.ok) {
              const oembed = await res.json();
              const updates: Record<string, any> = {};
              if (oembed.thumbnail_url) updates.thumbnail_url = oembed.thumbnail_url;
              if (oembed.title) updates.latest_video_description = oembed.title;
              if (oembed.author_name) updates.display_name = oembed.author_name;
              if (oembed.author_thumbnail_url) updates.avatar_url = oembed.author_thumbnail_url;
              if (Object.keys(updates).length > 0) {
                await supabase
                  .from('creator_profiles')
                  .update(updates)
                  .eq('platform', platform)
                  .eq('username', creator.username);
              }
            }
          }
          // Also try profile oEmbed for display name
          const profileUrl = `https://www.tiktok.com/@${creator.username}`;
          const profileRes = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(profileUrl)}`);
          if (profileRes.ok) {
            const oembed = await profileRes.json();
            const profileUpdates: Record<string, any> = {};
            if (oembed.author_name) profileUpdates.display_name = oembed.author_name;
            if (oembed.author_thumbnail_url) profileUpdates.avatar_url = oembed.author_thumbnail_url;
            if (Object.keys(profileUpdates).length > 0) {
              await supabase
                .from('creator_profiles')
                .update(profileUpdates)
                .eq('platform', platform)
                .eq('username', creator.username);
            }
          }
        } catch (e) {
          console.error('oEmbed failed for', creator.username);
        }
      });
      await Promise.all(oembedPromises);
    }

    // Enrich stats by fetching TikTok profile HTML for creators missing follower counts
    if (platform === 'tiktok') {
      const creatorsNeedingStats = creators.filter(c => !c.follower_count);
      if (creatorsNeedingStats.length > 0) {
        console.log(`Enriching stats for ${creatorsNeedingStats.length} creators via TikTok HTML...`);
        const enrichPromises = creatorsNeedingStats.slice(0, 15).map(async (creator) => {
          try {
            const profileUrl = `https://www.tiktok.com/@${creator.username}`;
            const res = await fetch(profileUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml',
                'Accept-Language': 'en-US,en;q=0.9',
              },
            });
            if (!res.ok) return;
            const html = await res.text();

            // Extract stats from __UNIVERSAL_DATA_FOR_REHYDRATION__
            const dataMatch = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
            if (!dataMatch?.[1]) return;

            const parsed = JSON.parse(dataMatch[1]);
            const userInfo = parsed?.__DEFAULT_SCOPE__?.['webapp.user-detail']?.userInfo;
            if (!userInfo) return;

            const stats = userInfo.stats || {};
            const user = userInfo.user || {};
            const updates: Record<string, any> = {};

            if (stats.followerCount) updates.follower_count = stats.followerCount;
            if (stats.followingCount) updates.following_count = stats.followingCount;
            if (stats.heartCount) updates.total_likes = stats.heartCount;
            if (stats.videoCount) updates.video_count = stats.videoCount;
            if (user.nickname) updates.display_name = user.nickname;
            if (user.signature) updates.bio = user.signature.substring(0, 500);
            if (user.avatarLarger) updates.avatar_url = user.avatarLarger;

            // Calculate engagement rate
            if (stats.heartCount && stats.videoCount && stats.followerCount) {
              const avgLikes = stats.heartCount / stats.videoCount;
              updates.engagement_rate = Number(((avgLikes / stats.followerCount) * 100).toFixed(2));
            }
            // Calculate avg views
            if (stats.heartCount && stats.videoCount) {
              updates.avg_views = Math.round(stats.heartCount / stats.videoCount * 1.5);
            }

            if (Object.keys(updates).length > 0) {
              await supabase.from('creator_profiles').update(updates).eq('platform', platform).eq('username', creator.username);
              console.log(`Enriched ${creator.username}: ${updates.follower_count} followers`);
            }
          } catch (e) {
            // Silent fail — stats enrichment is best-effort
          }
        });
        await Promise.all(enrichPromises);
      }
    }

    // Log the search query
    await supabase.from('search_queries').insert({
      query,
      platform,
      result_count: creators.length,
      creator_ids: upsertedIds,
    });

    // Auto-generate public creator pages for SEO (fire-and-forget)
    const supabaseFnUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    for (const creatorId of upsertedIds) {
      fetch(`${supabaseFnUrl}/functions/v1/generate-creator-page`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ creator_profile_id: creatorId }),
      }).catch(e => console.error('Auto-generate page failed for', creatorId, e));
    }

    // Fetch the full profiles back (with updated thumbnails)
    const { data: profiles } = await supabase
      .from('creator_profiles')
      .select('*')
      .in('id', upsertedIds)
      .order('follower_count', { ascending: false });

    return new Response(
      JSON.stringify({
        success: true,
        data: profiles || [],
        meta: {
          query,
          platform,
          total_found: results.length,
          creators_parsed: creators.length,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Discovery error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseCreatorFromResult(result: any, platform: string, sourceQuery: string) {
  const url = result.url || '';
  const title = result.title || '';
  const description = result.description || '';
  const markdown = result.markdown || '';

  // Extract username from URL
  let username = '';
  if (platform === 'tiktok') {
    const match = url.match(/tiktok\.com\/@([^\/\?]+)/);
    if (match) username = match[1];
  } else if (platform === 'instagram') {
    const match = url.match(/instagram\.com\/([^\/\?]+)/);
    if (match) username = match[1];
  }

  // Skip non-profile URLs
  if (!username || ['explore', 'trending', 'discover', 'login', 'signup', 'about', 'help', 'tag', 'music', 'reels', 'stories', 'p'].includes(username)) {
    console.log('Skipped URL (no valid username):', url);
    return null;
  }

  // Build the actual profile URL (not the video URL from search)
  const profileUrl = platform === 'tiktok'
    ? `https://www.tiktok.com/@${username}`
    : `https://www.instagram.com/${username}/`;

  // Extract follower counts from text
  const combinedText = markdown + ' ' + description;
  const followerMatch = combinedText.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Follower|follower|Subscriber|subscriber)s?\b/i);
  let followerCount: number | null = null;
  if (followerMatch) {
    followerCount = parseStatNumber(followerMatch[1].replace(',', '.'), followerMatch[2]);
  }

  // Extract likes
  const likesMatch = combinedText.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Like|like|heart)s?\b/i);
  let totalLikes: number | null = null;
  if (likesMatch) {
    totalLikes = parseStatNumber(likesMatch[1].replace(',', '.'), likesMatch[2]);
  }

  // Extract video/post count
  const videoMatch = combinedText.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Video|video|Post|post|Reel|reel)s?\b/i);
  let videoCount: number | null = null;
  if (videoMatch) {
    videoCount = parseStatNumber(videoMatch[1].replace(',', '.'), videoMatch[2]);
  }

  // Extract following count
  const followingMatch = combinedText.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Following|following)\b/i);
  let followingCount: number | null = null;
  if (followingMatch) {
    followingCount = parseStatNumber(followingMatch[1].replace(',', '.'), followingMatch[2]);
  }

  // Calculate engagement rate if we have followers and likes
  let engagementRate: number | null = null;
  if (followerCount && totalLikes && videoCount && videoCount > 0) {
    const avgLikesPerPost = totalLikes / videoCount;
    engagementRate = Number(((avgLikesPerPost / followerCount) * 100).toFixed(2));
  }

  // Extract display name from title
  const displayName = title
    .replace(/\(@[^)]+\)/g, '')
    .replace(/\| TikTok/gi, '')
    .replace(/\| Instagram/gi, '')
    .replace(/on TikTok/gi, '')
    .replace(/on Instagram/gi, '')
    .trim()
    .split(' - ')[0]
    .trim() || username;

  // Extract bio from description
  const bio = description
    .replace(/\d+(?:\.\d+)?[KkMm]?\s*(?:followers|following|likes|posts|videos)/gi, '')
    .trim()
    .substring(0, 500) || null;

  // The original URL might be a video URL — save it for oEmbed thumbnail
  const videoUrl = (platform === 'tiktok' && url.includes('/video/')) ? url : null;

  return {
    platform,
    username,
    display_name: displayName,
    bio,
    profile_url: profileUrl,
    latest_video_url: videoUrl,
    follower_count: followerCount,
    following_count: followingCount,
    total_likes: totalLikes,
    video_count: videoCount,
    engagement_rate: engagementRate,
    niches: extractNiches(markdown + ' ' + description + ' ' + sourceQuery),
    source_query: sourceQuery,
    raw_data: { title, description, url, video_url: videoUrl, scraped_at: new Date().toISOString() },
    last_scraped_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function extractNiches(text: string): string[] {
  const nicheKeywords: Record<string, string[]> = {
    'SaaS': ['saas', 'software', 'b2b', 'startup'],
    'Tech': ['tech', 'technology', 'gadget', 'coding', 'developer'],
    'AI': ['ai', 'artificial intelligence', 'machine learning', 'chatgpt'],
    'Marketing': ['marketing', 'growth', 'seo', 'ads', 'branding'],
    'Automotive': ['car', 'automotive', 'vehicle', 'driving', 'motor'],
    'Beauty': ['beauty', 'makeup', 'skincare', 'cosmetics'],
    'Fashion': ['fashion', 'style', 'outfit', 'clothing'],
    'Food': ['food', 'cooking', 'recipe', 'restaurant', 'chef'],
    'Fitness': ['fitness', 'workout', 'gym', 'health', 'exercise'],
    'Gaming': ['gaming', 'game', 'gamer', 'esports'],
    'Travel': ['travel', 'wanderlust', 'destination', 'tourism'],
    'Lifestyle': ['lifestyle', 'daily', 'vlog', 'life'],
    'Education': ['education', 'learn', 'tutorial', 'teaching'],
    'Finance': ['finance', 'investing', 'money', 'crypto', 'trading'],
    'Entertainment': ['entertainment', 'comedy', 'funny', 'dance'],
    'eCommerce': ['ecommerce', 'e-commerce', 'shop', 'product', 'review', 'unboxing'],
  };

  const lower = text.toLowerCase();
  const found: string[] = [];
  for (const [niche, keywords] of Object.entries(nicheKeywords)) {
    if (keywords.some(kw => lower.includes(kw))) {
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

// Try Instagram Graph API for username lookup
async function tryInstagramGraphAPI(username: string, supabase: any): Promise<Record<string, any> | null> {
  try {
    const { data: tokenSource } = await supabase
      .from('meta_data_sources')
      .select('*')
      .eq('is_connected', true)
      .gt('token_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!tokenSource) return null;

    const accessToken = tokenSource.access_token;
    const igAccounts = tokenSource.connection_metadata?.ig_accounts || [];
    if (igAccounts.length === 0) return null;

    const searchIgId = igAccounts[0].ig_user_id;
    const url = `https://graph.facebook.com/v18.0/${searchIgId}?fields=business_discovery.fields(id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,media.limit(12){id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink}).username(${username})&access_token=${accessToken}`;

    console.log('Trying Graph API for IG user:', username);
    const res = await fetch(url);
    const data = await res.json();

    if (data.error || !data.business_discovery) {
      console.log('Graph API lookup failed:', data.error?.message || 'No data');
      return null;
    }

    const d = data.business_discovery;
    const result: Record<string, any> = {
      display_name: d.name || username,
      bio: d.biography || null,
      avatar_url: d.profile_picture_url || null,
      follower_count: d.followers_count || null,
      following_count: d.follows_count || null,
      video_count: d.media_count || null,
      raw_data: {
        ig_user_id: d.id,
        scraped_via: 'graph_api',
        scraped_at: new Date().toISOString(),
      },
    };

    // Process media
    const media = d.media?.data || [];
    if (media.length > 0) {
      let totalLikes = 0;
      let totalComments = 0;
      for (const m of media) {
        totalLikes += m.like_count || 0;
        totalComments += m.comments_count || 0;
      }
      result.total_likes = totalLikes;
      const avgEngagement = (totalLikes + totalComments) / media.length;
      if (d.followers_count > 0) {
        result.engagement_rate = parseFloat(((avgEngagement / d.followers_count) * 100).toFixed(2));
      }

      const firstMedia = media[0];
      result.thumbnail_url = firstMedia.thumbnail_url || firstMedia.media_url || null;
      result.latest_video_url = firstMedia.permalink || null;
      result.latest_video_description = firstMedia.caption?.substring(0, 500) || null;

      result.raw_data.recent_media = media.map((m: any) => ({
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

    // Extract niches
    const allText = [d.biography, ...media.map((m: any) => m.caption)].filter(Boolean).join(' ');
    result.niches = extractNichesFromText(allText);

    return result;
  } catch (e) {
    console.error('Graph API error:', e);
    return null;
  }
}
