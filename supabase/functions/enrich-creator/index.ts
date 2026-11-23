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
    const { creator_id } = await req.json();

    if (!creator_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'creator_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: creator, error: fetchError } = await supabase
      .from('creator_profiles')
      .select('*')
      .eq('id', creator_id)
      .single();

    if (fetchError || !creator) {
      return new Response(
        JSON.stringify({ success: false, error: 'Creator not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Enriching creator:', creator.username, 'Platform:', creator.platform);

    const updates: Record<string, any> = {
      last_scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    // Step 0: For Instagram, try public profile endpoint first, then Graph API
    if (creator.platform === 'instagram') {
      const publicSuccess = await enrichViaInstagramPublicProfile(creator, updates);
      if (publicSuccess) {
        console.log('Instagram public profile enrichment succeeded');
      } else {
        const graphSuccess = await enrichViaInstagramGraphAPI(creator, updates, supabase);
        if (graphSuccess) {
          console.log('Graph API enrichment succeeded, skipping Firecrawl');
        } else if (firecrawlKey) {
          console.log('Graph API failed, trying Firecrawl for Instagram...');
          await enrichInstagramViaFirecrawl(creator, updates, firecrawlKey);
        }
      }
    }

    // Step 1: Try to get stats from Google search snippets (if we still need data)
    if (firecrawlKey && !updates.follower_count && creator.platform !== 'instagram') {
      await extractStatsFromGoogleSnippets(creator, updates, firecrawlKey);
    }

    // Step 2: Try third-party stat pages with better wait times
    if (firecrawlKey && (!updates.follower_count || !updates.avatar_url)) {
      await scrapeThirdPartyStats(creator, updates, firecrawlKey);
    }

    // Step 3: Get video links (TikTok only)
    if (firecrawlKey && creator.platform === 'tiktok') {
      await scrapeVideoLinks(creator, updates, firecrawlKey);
    }

    // Step 4: oEmbed for display name, thumbnails (TikTok only)
    if (creator.platform === 'tiktok') {
      await enrichViaTikTokOEmbed(creator, updates);
    }

    // Step 5: Extract contacts from scraped text
    extractContactsFromRawData(creator, updates);

    // Step 6: Deep contact enrichment - visit website/Linktree for emails
    if (firecrawlKey) {
      await deepContactEnrichment(creator, updates, firecrawlKey);
    }

    // Step 7: Promote contact_details to top-level columns
    promoteContactColumns(creator, updates);

    // Update creator in DB
    const { data: updated, error: updateError } = await supabase
      .from('creator_profiles')
      .update(updates)
      .eq('id', creator_id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to update creator' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Enriched creator:', creator.username, 'Final stats:', {
      followers: updates.follower_count,
      following: updates.following_count,
      likes: updates.total_likes,
      videos: updates.video_count,
      has_thumbnail: !!updates.thumbnail_url,
      has_avatar: !!updates.avatar_url,
    });

    return new Response(
      JSON.stringify({ success: true, data: updated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Enrich error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

// Use Google search to find stats - Google snippets often show "30.2K Followers" directly
async function extractStatsFromGoogleSnippets(creator: any, updates: Record<string, any>, firecrawlKey: string) {
  try {
    // Search specifically for this creator's stats on the right platform
    const platformName = creator.platform === 'instagram' ? 'instagram' : 'tiktok';
    const query = `"@${creator.username}" ${platformName}`;
    console.log('Google snippet search:', query);

    const res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        limit: 5,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const results = firecrawlWebResults(data);
      console.log(`Google search returned ${results.length} results`);

      // Look for the TikTok profile in results (most authoritative)
      for (const r of results) {
        const url = r.url || '';
        const text = `${r.title || ''} ${r.description || ''} ${r.markdown || ''}`;
        
        console.log('Result URL:', url, '| Preview:', text.substring(0, 200));
        
        // Only trust stats from the platform's own page or the profile's direct description
        const isPlatformResult = creator.platform === 'instagram'
          ? url.includes('instagram.com/' + creator.username)
          : url.includes('tiktok.com/@' + creator.username);
        const isAboutThisCreator = text.toLowerCase().includes(`@${creator.username.toLowerCase()}`);
        
        if (!isPlatformResult && !isAboutThisCreator) continue;

        extractTikTokProfileStats(text, updates);
        
        // Extract avatar from result metadata (og:image often has profile pic)
        if (!updates.avatar_url && isPlatformResult) {
          const metadata = r.metadata || {};
          if (metadata.ogImage) {
            updates.avatar_url = metadata.ogImage;
            updates.thumbnail_url = metadata.ogImage;
          }
          // Also try extracting from markdown image tags
          const imgMatches = [...(r.markdown || '').matchAll(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g)];
          for (const im of imgMatches) {
            if (im[1].includes('tiktokcdn') || im[1].includes('muscdn') || im[1].includes('avatar') || im[1].includes('scontent') || im[1].includes('cdninstagram')) {
              if (!updates.avatar_url) {
                updates.avatar_url = im[1];
                updates.thumbnail_url = im[1];
              }
              break;
            }
          }
        }

        // Extract display_name from title like "Kasim Javed (@kasimjaved_kj)"
        if (!updates.display_name && !creator.display_name) {
          const titleText = r.title || '';
          const nameMatch = titleText.match(/^([A-Za-z\s\-']+?)\s*\(@/);
          if (nameMatch && nameMatch[1].trim().length > 1) {
            updates.display_name = nameMatch[1].trim();
          }
        }

        // Extract bio from platform result description
        if (isPlatformResult && !updates.bio && !creator.bio) {
          // Instagram descriptions often look like: '372 Followers, 422 Following, 72 Posts - Kasim Javed (@kasimjaved_kj) on Instagram: "Director of ..."'
          const descText = r.description || '';
          const igBioMatch = descText.match(/on Instagram:\s*"([^"]+)"/i);
          if (igBioMatch && igBioMatch[1].length > 3) {
            updates.bio = igBioMatch[1].substring(0, 500);
          } else if (descText.length > 15 && !descText.match(/^\d+(\.\d+)?[KkMm]?\s*(Followers|Following|Likes)/)) {
            updates.bio = descText.substring(0, 500);
          }
        }

        // Set profile_url for Instagram
        if (isPlatformResult && !updates.profile_url && !creator.profile_url) {
          if (creator.platform === 'instagram') {
            updates.profile_url = `https://www.instagram.com/${creator.username}/`;
          }
        }

        if (updates.follower_count) break;
      }

      // Store scraped text for contact extraction
      const allText = results.map((r: any) => `${r.title || ''} ${r.description || ''} ${r.markdown || ''}`).join('\n');
      updates.raw_data = {
        ...(creator.raw_data || {}),
        ...(updates.raw_data || {}),
        _scraped_text: allText.substring(0, 3000),
      };
    }
  } catch (e) {
    console.error('Google snippet search error:', e);
  }
}

// Extract stats patterns like "30.2K Followers", "723.3K Likes"
function extractTikTokProfileStats(text: string, updates: Record<string, any>) {
  // Match patterns: "30.2K Followers", "723.3K Likes", "54 Following"
  // Also: "Followers: 30.2K", "30,200 Followers"
  
  if (!updates.follower_count) {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Follower|follower)s?\b/i) 
           || text.match(/(?:Follower|follower)s?\s*[:\s]+(\d+(?:[.,]\d+)?)\s*([KkMmBb])?/i);
    if (m) {
      const val = parseStatNumber(m[1].replace(',', '.'), m[2]);
      if (val > 0) updates.follower_count = val;
    }
  }
  
  if (!updates.following_count) {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*Following/i);
    if (m) {
      const val = parseStatNumber(m[1].replace(',', '.'), m[2]);
      if (val > 0) updates.following_count = val;
    }
  }
  
  if (!updates.total_likes) {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Like|like)s?\b/i)
           || text.match(/(?:Like|like)s?\s*[:\s]+(\d+(?:[.,]\d+)?)\s*([KkMmBb])?/i);
    if (m) {
      const val = parseStatNumber(m[1].replace(',', '.'), m[2]);
      if (val > 0) updates.total_likes = val;
    }
  }
  
  if (!updates.video_count) {
    const m = text.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Video|video|Post|post)s?\b/i);
    if (m) {
      const val = parseStatNumber(m[1].replace(',', '.'), m[2]);
      if (val > 0) updates.video_count = val;
    }
  }
}

// Third-party stat scraping with improved wait times
async function scrapeThirdPartyStats(creator: any, updates: Record<string, any>, firecrawlKey: string) {
  if (creator.platform !== 'tiktok') return;
  
  // Use socialcounts.org which loads data server-side
  const statsUrls = [
    `https://socialcounts.org/tiktok-live-follower-count/${creator.username}`,
  ];

  for (const statsUrl of statsUrls) {
    if (updates.follower_count) break;
    try {
      console.log('Scraping third-party stats:', statsUrl);
      const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
                    'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: statsUrl,
          formats: ['markdown'],
          waitFor: 8000,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const markdown = data.data?.markdown || '';
        const metadata = data.data?.metadata || {};
        console.log('Third-party markdown (first 800):', markdown.substring(0, 800));

        extractTikTokProfileStats(markdown, updates);

        // Extract avatar
        const imgMatches = [...markdown.matchAll(/!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g)];
        for (const m of imgMatches) {
          const imgUrl = m[1];
          if (imgUrl.includes('tiktokcdn') || imgUrl.includes('muscdn') || imgUrl.includes('avatar')) {
            if (!updates.avatar_url) updates.avatar_url = imgUrl;
            break;
          }
        }
        if (!updates.avatar_url && metadata.ogImage) {
          updates.avatar_url = metadata.ogImage;
        }
      }
    } catch (e) {
      console.error('Third-party scrape failed:', e);
    }
  }
}

// Get video links
async function scrapeVideoLinks(creator: any, updates: Record<string, any>, firecrawlKey: string) {
  try {
    // Step 1: Direct scrape TikTok profile page for video links
    console.log('Direct-scraping TikTok profile for video links...');
    const profileRes = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://www.tiktok.com/@${creator.username}`,
        formats: ['markdown'],
        waitFor: 5000,
      }),
    });

    const profileVideoLinks: string[] = [];
    if (profileRes.ok) {
      const profileData = await profileRes.json();
      const markdown = profileData.data?.markdown || profileData.markdown || '';
      const videoRegex = /https?:\/\/(?:www\.)?tiktok\.com\/@[^\/\s]+\/video\/\d+/g;
      const matches = [...markdown.matchAll(videoRegex)];
      for (const m of matches) {
        profileVideoLinks.push(m[0]);
      }
      // Also match relative refs
      const relRegex = new RegExp(`tiktok\\.com/@${creator.username}/video/(\\d+)`, 'g');
      const relMatches = [...markdown.matchAll(relRegex)];
      for (const m of relMatches) {
        profileVideoLinks.push(`https://www.tiktok.com/@${creator.username}/video/${m[1]}`);
      }
      console.log(`Profile page scrape found ${profileVideoLinks.length} video links`);
    }

    // Step 2: Google search for additional videos
    const res = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `site:tiktok.com/@${creator.username} video`,
        limit: 20,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
    });

    if (res.ok) {
      const searchData = await res.json();
      const videoLinks: string[] = [];
      for (const r of (firecrawlWebResults(searchData))) {
        const url = r.url || '';
        if (url.includes('/video/') && url.includes(`@${creator.username}`)) {
          videoLinks.push(url);
        }
        // Also extract from markdown
        const markdown = r.markdown || '';
        const videoRegex = new RegExp(`tiktok\\.com/@${creator.username}/video/\\d+`, 'g');
        let m2;
        while ((m2 = videoRegex.exec(markdown)) !== null) {
          videoLinks.push('https://www.' + m2[0]);
        }
      }
      
      const existingLinks = creator.raw_data?.video_links || [];
      const allLinks = [...new Set([...profileVideoLinks, ...videoLinks, ...existingLinks])].slice(0, 50);
      
      updates.raw_data = {
        ...(creator.raw_data || {}),
        ...(updates.raw_data || {}),
        enriched_at: new Date().toISOString(),
        video_links: allLinks,
      };

      console.log(`Found ${videoLinks.length} new video links, ${allLinks.length} total`);
    }
  } catch (e) {
    console.error('Video link search error:', e);
  }
}

// oEmbed for thumbnails and display name
async function enrichViaTikTokOEmbed(creator: any, updates: Record<string, any>) {
  const profileUrl = `https://www.tiktok.com/@${creator.username}`;
  try {
    const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(profileUrl)}`);
    if (res.ok) {
      const oembed = await res.json();
      if (oembed.author_name) updates.display_name = oembed.author_name;
      if (oembed.author_thumbnail_url && !updates.avatar_url) updates.avatar_url = oembed.author_thumbnail_url;
      updates.raw_data = {
        ...(creator.raw_data || {}),
        ...(updates.raw_data || {}),
        oembed,
      };
    }
  } catch (_) {}

  // Get thumbnail from first video
  const videoLinks = updates.raw_data?.video_links || creator.raw_data?.video_links || [];
  const videoSources = [creator.latest_video_url, ...videoLinks].filter(Boolean);
  
  if (!updates.thumbnail_url && videoSources.length > 0) {
    for (const videoUrl of videoSources.slice(0, 3)) {
      try {
        const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`);
        if (res.ok) {
          const oembed = await res.json();
          if (oembed.thumbnail_url) {
            updates.thumbnail_url = oembed.thumbnail_url;
            updates.latest_video_url = videoUrl;
            if (oembed.title) updates.latest_video_description = oembed.title;
            if (oembed.author_name) updates.display_name = oembed.author_name;
            if (oembed.author_thumbnail_url && !updates.avatar_url) updates.avatar_url = oembed.author_thumbnail_url;
            break;
          }
        }
      } catch (_) {}
    }
  }
}

// Extract contacts from scraped text
function extractContactsFromRawData(creator: any, updates: Record<string, any>) {
  const rawData = updates.raw_data || creator.raw_data || {};
  const text = rawData._scraped_text || '';
  
  const details: Record<string, string> = rawData.contact_details || {};

  if (text) {
    const emailMatch = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    if (emailMatch) details.email = emailMatch[0].toLowerCase();

    const blocked = /socialinsider|countik|socialcounts|socialblade|tokcount|tiktokcdn|muscdn|\.webp|\.jpg|\.jpeg|\.png|firecrawl|tikreport/i;
    const websiteMatch = text.match(/https?:\/\/(?!www\.tiktok\.com)(?!tiktok\.com)([\w-]+\.)+[\w-]{2,}(?:\/[^\s)\]]*)?/i);
    if (websiteMatch && !blocked.test(websiteMatch[0])) {
      details.website = websiteMatch[0];
    }

    const instaMatch = text.match(/(?:instagram\.com\/|📷\s*@?)([A-Za-z0-9._]{2,30})/i);
    if (instaMatch && !instaMatch[1].toLowerCase().includes('tiktok')) {
      details.instagram = `@${instaMatch[1]}`;
    }

    const ytMatch = text.match(/(?:youtube\.com\/(?:@|channel\/|c\/)|youtu\.be\/)([A-Za-z0-9_\-@]+)/i);
    if (ytMatch) details.youtube = ytMatch[1].startsWith('@') ? ytMatch[1] : `@${ytMatch[1]}`;
  }

  if (Object.keys(details).length > 0) {
    updates.raw_data = {
      ...(creator.raw_data || {}),
      ...(updates.raw_data || {}),
      contact_details: details,
    };
  }

  // Clean up internal field
  if (updates.raw_data?._scraped_text) {
    delete updates.raw_data._scraped_text;
  }
}

function parseStatNumber(numStr: string, suffix?: string): number {
  let num = parseFloat(numStr);
  const s = (suffix || '').toUpperCase();
  if (s === 'K') num *= 1000;
  if (s === 'M') num *= 1000000;
  if (s === 'B') num *= 1000000000;
  return Math.round(num);
}

async function enrichViaInstagramPublicProfile(creator: any, updates: Record<string, any>): Promise<boolean> {
  try {
    const username = creator.username;
    const url = `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
    const res = await fetch(url, {
      headers: {
        'x-ig-app-id': '936619743392459',
        'x-asbd-id': '129477',
        'x-ig-www-claim': '0',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'accept': 'application/json',
        'accept-language': 'en-US,en;q=0.9',
      },
    });

    if (!res.ok) {
      console.log('Instagram public profile request failed with status:', res.status);
      return false;
    }

    const payload = await res.json();
    const user = payload?.data?.user;
    if (!user) {
      console.log('Instagram public profile returned no user');
      return false;
    }

    updates.display_name = user.full_name || updates.display_name || creator.display_name || creator.username;
    updates.bio = user.biography || updates.bio || creator.bio || null;
    updates.avatar_url = user.profile_pic_url_hd || user.profile_pic_url || updates.avatar_url || creator.avatar_url || null;
    updates.follower_count = user.edge_followed_by?.count ?? updates.follower_count ?? creator.follower_count ?? null;
    updates.following_count = user.edge_follow?.count ?? updates.following_count ?? creator.following_count ?? null;
    updates.video_count = user.edge_owner_to_timeline_media?.count ?? updates.video_count ?? creator.video_count ?? null;
    updates.profile_url = creator.profile_url || `https://www.instagram.com/${creator.username}/`;

    const edges = Array.isArray(user.edge_owner_to_timeline_media?.edges)
      ? user.edge_owner_to_timeline_media.edges
      : [];

    const recentMedia = edges.slice(0, 15).map((edge: any) => {
      const node = edge?.node || {};
      const shortcode = node.shortcode;
      const permalink = shortcode ? `https://www.instagram.com/p/${shortcode}/` : null;
      const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || null;
      const likes = node.edge_liked_by?.count ?? null;
      const comments = node.edge_media_to_comment?.count ?? null;

      return {
        id: node.id || shortcode || crypto.randomUUID(),
        type: node.is_video ? 'VIDEO' : 'IMAGE',
        url: permalink,
        thumbnail: node.display_url || node.thumbnail_src || null,
        caption: caption ? String(caption).substring(0, 200) : null,
        likes,
        comments,
        timestamp: node.taken_at_timestamp ? new Date(node.taken_at_timestamp * 1000).toISOString() : null,
      };
    }).filter((item: any) => item.url);

    if (recentMedia.length > 0) {
      updates.thumbnail_url = recentMedia[0].thumbnail || updates.thumbnail_url || creator.thumbnail_url || null;
      updates.latest_video_url = recentMedia[0].url || updates.latest_video_url || creator.latest_video_url || null;
      updates.latest_video_description = recentMedia[0].caption || updates.latest_video_description || creator.latest_video_description || null;

      const totalLikes = recentMedia.reduce((sum: number, item: any) => sum + (item.likes || 0), 0);
      const totalComments = recentMedia.reduce((sum: number, item: any) => sum + (item.comments || 0), 0);
      updates.total_likes = totalLikes || updates.total_likes || creator.total_likes || null;

      const avgEngagement = (totalLikes + totalComments) / recentMedia.length;
      if (updates.follower_count && updates.follower_count > 0) {
        updates.engagement_rate = parseFloat(((avgEngagement / updates.follower_count) * 100).toFixed(2));
      }
      updates.avg_views = Math.round(avgEngagement);
    }

    const existingVideoLinks = creator.raw_data?.video_links || [];
    const mediaLinks = recentMedia.map((item: any) => item.url).filter(Boolean);

    updates.raw_data = {
      ...(creator.raw_data || {}),
      ...(updates.raw_data || {}),
      ig_user_id: user.id || creator.raw_data?.ig_user_id || null,
      scraped_via: 'instagram_public_profile',
      scraped_at: new Date().toISOString(),
      recent_media: recentMedia,
      video_links: [...new Set([...(existingVideoLinks || []), ...mediaLinks])].slice(0, 50),
    };

    return true;
  } catch (e) {
    console.error('Instagram public profile enrichment error:', e);
    return false;
  }
}

function normalizeInstagramMediaUrl(url: string): string {
  const clean = url.trim().replace(/\\/g, '').replace(/[?#].*$/, '');
  return clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

function extractInstagramMediaLinks(text: string): string[] {
  const links = new Set<string>();
  const normalizedText = text.replace(/\\\//g, '/');

  const absolute = normalizedText.match(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|p)\/[A-Za-z0-9_-]+\/?/g) || [];
  for (const link of absolute) {
    links.add(normalizeInstagramMediaUrl(link));
  }

  const partial = normalizedText.match(/instagram\.com\/(?:reel|p)\/[A-Za-z0-9_-]+\/?/g) || [];
  for (const path of partial) {
    links.add(normalizeInstagramMediaUrl(`https://www.${path}`));
  }

  const relativeMatches = [...normalizedText.matchAll(/(?:^|[^A-Za-z0-9_])\/(?:reel|p)\/([A-Za-z0-9_-]{5,})\/?/g)];
  for (const match of relativeMatches) {
    if (match[1]) {
      links.add(normalizeInstagramMediaUrl(`https://www.instagram.com/reel/${match[1]}`));
    }
  }

  return [...links];
}

function applyInstagramDescriptionStats(desc: string, updates: Record<string, any>) {
  if (!desc) return;

  const followerMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Follower|follower)s?\b/i);
  if (followerMatch && !updates.follower_count) {
    updates.follower_count = parseStatNumber(followerMatch[1].replace(',', '.'), followerMatch[2]);
  }

  const followingMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*Following\b/i);
  if (followingMatch && !updates.following_count) {
    updates.following_count = parseStatNumber(followingMatch[1].replace(',', '.'), followingMatch[2]);
  }

  const postMatch = desc.match(/(\d+(?:[.,]\d+)?)\s*([KkMmBb])?\s*(?:Post|post)s?\b/i);
  if (postMatch && !updates.video_count) {
    updates.video_count = parseStatNumber(postMatch[1].replace(',', '.'), postMatch[2]);
  }

  if (!updates.bio) {
    const bioMatch = desc.match(/on Instagram:\s*"([^"]+)"/i);
    if (bioMatch && bioMatch[1]?.length > 3) {
      updates.bio = bioMatch[1].substring(0, 500);
    }
  }
}

function mergeInstagramVideoLinks(creator: any, updates: Record<string, any>, links: string[], max = 50) {
  if (!links.length) return;

  const existing = updates.raw_data?.video_links || creator.raw_data?.video_links || [];
  const combined = [...new Set([...existing, ...links.map(normalizeInstagramMediaUrl)])].slice(0, max);

  updates.raw_data = {
    ...(creator.raw_data || {}),
    ...(updates.raw_data || {}),
    video_links: combined,
    enriched_at: new Date().toISOString(),
  };
}

// Instagram-specific enrichment via Firecrawl when Graph API fails
async function enrichInstagramViaFirecrawl(creator: any, updates: Record<string, any>, firecrawlKey: string) {
  const username = creator.username;
  const profileUrl = `https://www.instagram.com/${username}/`;

  // Step 1: Direct profile scrape (most reliable for avatar + profile stats)
  try {
    console.log('Direct-scraping Instagram profile:', profileUrl);
    const profileRes = await fetch('https://api.firecrawl.dev/v2/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: profileUrl,
        formats: ['markdown'],
        waitFor: 6000,
      }),
    });

    if (profileRes.ok) {
      const profileData = await profileRes.json();
      const metadata = profileData.data?.metadata || profileData.metadata || {};
      const markdown = profileData.data?.markdown || profileData.markdown || '';

      if (!updates.avatar_url && typeof metadata.ogImage === 'string' && metadata.ogImage.startsWith('http')) {
        updates.avatar_url = metadata.ogImage;
        if (!updates.thumbnail_url && !creator.thumbnail_url) {
          updates.thumbnail_url = metadata.ogImage;
        }
      }

      if ((!updates.display_name || updates.display_name === username) && typeof metadata.ogTitle === 'string') {
        const nameMatch = metadata.ogTitle.match(/^([^(@]+)/);
        if (nameMatch && nameMatch[1]?.trim().length > 1 && nameMatch[1].trim() !== username) {
          updates.display_name = nameMatch[1].trim();
        }
      }

      if (typeof metadata.ogDescription === 'string') {
        applyInstagramDescriptionStats(metadata.ogDescription, updates);
      }

      const profileLinks = extractInstagramMediaLinks(markdown);
      mergeInstagramVideoLinks(creator, updates, profileLinks, 50);

      if (!updates.latest_video_url && !creator.latest_video_url && profileLinks.length > 0) {
        updates.latest_video_url = profileLinks[0];
      }
    }
  } catch (e) {
    console.error('Direct IG profile scrape failed:', e);
  }

  // Step 2: Google search fallback for missing metadata
  try {
    console.log('Searching Google for IG profile data:', username);
    const searchRes = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
                'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `"${username}" "instagram photos and videos"`,
        limit: 8,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      const results = firecrawlWebResults(data);
      console.log(`IG Google search returned ${results.length} results`);

      const collectedLinks: string[] = [];

      for (const r of results) {
        const url = r.url || '';
        const titleText = r.title || '';
        const descText = r.description || '';
        const markdown = r.markdown || '';
        const metadata = r.metadata || {};

        const isProfilePage = url.includes(`instagram.com/${username}`) && !url.includes('/reel/') && !url.includes('/p/');

        if (isProfilePage && (!updates.display_name || updates.display_name === username)) {
          const nameMatch = titleText.match(/^([^(@]+)/);
          if (nameMatch && nameMatch[1]?.trim().length > 1 && nameMatch[1].trim() !== username) {
            updates.display_name = nameMatch[1].trim();
          }
        }

        if (isProfilePage) {
          applyInstagramDescriptionStats(`${descText} ${markdown}`.substring(0, 1500), updates);
        }

        if (!updates.avatar_url && isProfilePage && typeof metadata.ogImage === 'string' && metadata.ogImage.startsWith('http')) {
          updates.avatar_url = metadata.ogImage;
          if (!updates.thumbnail_url && !creator.thumbnail_url) {
            updates.thumbnail_url = metadata.ogImage;
          }
        }

        collectedLinks.push(...extractInstagramMediaLinks(`${url}\n${markdown}`));
      }

      mergeInstagramVideoLinks(creator, updates, collectedLinks, 50);
    }
  } catch (e) {
    console.error('IG Google search enrichment error:', e);
  }

  // Step 3: If still no avatar, try broader avatar lookup
  if (!updates.avatar_url) {
    try {
      console.log('Trying third-party for IG avatar...');
      const thirdPartyRes = await fetch('https://api.firecrawl.dev/v2/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
                    'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: `"${username}" instagram profile picture avatar`,
          limit: 6,
          scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
        }),
      });

      if (thirdPartyRes.ok) {
        const data = await thirdPartyRes.json();
        for (const r of (firecrawlWebResults(data))) {
          const metadata = r.metadata || {};
          if (typeof metadata.ogImage === 'string' && metadata.ogImage.startsWith('http')) {
            updates.avatar_url = metadata.ogImage;
            if (!updates.thumbnail_url && !creator.thumbnail_url) {
              updates.thumbnail_url = metadata.ogImage;
            }
            console.log('Found IG avatar from third-party:', metadata.ogImage.substring(0, 80));
            break;
          }
        }
      }
    } catch (e) {
      console.error('Third-party avatar search failed:', e);
    }
  }

  // Step 4: Dedicated post/reel search (if still low media count)
  try {
    const existingCount = (updates.raw_data?.video_links || creator.raw_data?.video_links || []).length;
    if (existingCount < 10) {
      console.log('Searching for IG posts/reels...');
      const queries = [
        `site:instagram.com/${username}/reel`,
        `site:instagram.com/${username}/p/`,
      ];

      const responses = await Promise.all(
        queries.map((query) =>
          fetch('https://api.firecrawl.dev/v2/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
                            'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query, limit: 12 }),
          }).catch(() => null)
        )
      );

      const discovered: string[] = [];
      for (const res of responses) {
        if (!res?.ok) continue;
        const payload = await res.json();
        for (const result of firecrawlWebResults(payload)) {
          const url = typeof result.url === 'string' ? result.url : '';
          if (url.includes('/reel/') || url.includes('/p/')) {
            discovered.push(url);
          }
          discovered.push(...extractInstagramMediaLinks(result.markdown || ''));
        }
      }

      mergeInstagramVideoLinks(creator, updates, discovered, 50);
      if (discovered.length > 0) {
        console.log(`Found ${discovered.length} IG posts/reels`);
      }
    }
  } catch (e) {
    console.error('IG post search failed:', e);
  }

  if (!updates.raw_data) {
    updates.raw_data = { ...(creator.raw_data || {}), scraped_via: 'firecrawl', scraped_at: new Date().toISOString() };
  } else {
    updates.raw_data.scraped_via = 'firecrawl';
    updates.raw_data.scraped_at = new Date().toISOString();
  }

  if (!updates.profile_url && !creator.profile_url) {
    updates.profile_url = profileUrl;
  }
}

// Instagram Graph API enrichment using stored Meta token
async function enrichViaInstagramGraphAPI(creator: any, updates: Record<string, any>, supabase: any): Promise<boolean> {
  try {
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
      console.log('No valid Meta token found, skipping Graph API');
      return false;
    }

    const accessToken = tokenSource.access_token;
    const igAccounts = tokenSource.connection_metadata?.ig_accounts || [];
    if (igAccounts.length === 0) {
      console.log('No IG accounts linked, skipping Graph API');
      return false;
    }

    const searchIgId = igAccounts[0].ig_user_id;
    const searchUrl = `https://graph.facebook.com/v18.0/${searchIgId}?fields=business_discovery.fields(id,username,name,biography,profile_picture_url,followers_count,follows_count,media_count,media.limit(12){id,caption,media_type,media_url,thumbnail_url,timestamp,like_count,comments_count,permalink}).username(${creator.username})&access_token=${accessToken}`;

    console.log('Trying Instagram Graph API for:', creator.username);
    const res = await fetch(searchUrl);
    const data = await res.json();

    if (data.error) {
      console.log('Graph API error:', data.error.message);
      return false;
    }

    const discovery = data.business_discovery;
    if (!discovery) {
      console.log('No business_discovery data returned');
      return false;
    }

    console.log('Graph API success! Followers:', discovery.followers_count, 'Posts:', discovery.media_count);

    if (discovery.name) updates.display_name = discovery.name;
    if (discovery.biography) updates.bio = discovery.biography;
    if (discovery.profile_picture_url) updates.avatar_url = discovery.profile_picture_url;
    if (discovery.followers_count) updates.follower_count = discovery.followers_count;
    if (discovery.follows_count) updates.following_count = discovery.follows_count;
    if (discovery.media_count) updates.video_count = discovery.media_count;

    // Process recent media
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
        updates.engagement_rate = parseFloat(((avgEngagement / discovery.followers_count) * 100).toFixed(2));
      }
      updates.avg_views = Math.round(avgEngagement);
      updates.total_likes = totalLikes;

      // First media as thumbnail
      const firstMedia = media[0];
      updates.thumbnail_url = firstMedia.thumbnail_url || firstMedia.media_url || null;
      updates.latest_video_url = firstMedia.permalink || null;
      updates.latest_video_description = firstMedia.caption?.substring(0, 500) || null;

      updates.raw_data = {
        ...(creator.raw_data || {}),
        ig_user_id: discovery.id,
        scraped_via: 'graph_api',
        scraped_at: new Date().toISOString(),
        recent_media: media.map((m: any) => ({
          id: m.id,
          type: m.media_type,
          url: m.permalink,
          thumbnail: m.thumbnail_url || m.media_url,
          caption: m.caption?.substring(0, 200),
          likes: m.like_count,
          comments: m.comments_count,
          timestamp: m.timestamp,
        })),
      };
    }

    // Extract niches from bio + captions
    const allText = [discovery.biography, ...media.map((m: any) => m.caption)].filter(Boolean).join(' ').toLowerCase();
    const nicheMap: Record<string, string[]> = {
      'fitness': ['fitness', 'workout', 'gym'],
      'beauty': ['beauty', 'makeup', 'skincare'],
      'fashion': ['fashion', 'style', 'outfit', 'ootd'],
      'food': ['food', 'recipe', 'cooking', 'sweets', 'confectionery', 'halal'],
      'travel': ['travel', 'wanderlust', 'explore'],
      'tech': ['tech', 'gadget', 'software', 'saas'],
      'gaming': ['gaming', 'gamer', 'esports'],
      'lifestyle': ['lifestyle', 'daily', 'routine'],
      'business': ['business', 'entrepreneur', 'startup'],
      'education': ['education', 'learn', 'tutorial'],
    };
    const niches: string[] = [];
    for (const [niche, keywords] of Object.entries(nicheMap)) {
      if (keywords.some(k => allText.includes(k))) niches.push(niche);
    }
    if (niches.length > 0) updates.niches = niches.slice(0, 5);

    return true;
  } catch (e) {
    console.error('Instagram Graph API enrichment error:', e);
    return false;
  }
}

// Deep contact enrichment: visit creator's website/Linktree to find email addresses
async function deepContactEnrichment(creator: any, updates: Record<string, any>, firecrawlKey: string) {
  const rawData = updates.raw_data || creator.raw_data || {};
  const contactDetails = rawData.contact_details || {};
  
  if (contactDetails.email) return;

  const urlsToScrape: string[] = [];
  const bio = updates.bio || creator.bio || '';
  const bioUrls = bio.match(/https?:\/\/[^\s\)]+/gi) || [];
  urlsToScrape.push(...bioUrls);

  const linktreeMatch = bio.match(/(?:linktr\.ee|beacons\.ai|linkin\.bio|lnk\.bio|bio\.link|linkpop\.com|hoo\.be|tap\.bio)\/([^\s\)]+)/i);
  if (linktreeMatch) {
    urlsToScrape.push(`https://${linktreeMatch[0]}`);
  }

  if (contactDetails.website) {
    urlsToScrape.push(contactDetails.website);
  }

  if (contactDetails.youtube) {
    const ytHandle = contactDetails.youtube.replace(/^@/, '');
    urlsToScrape.push(`https://www.youtube.com/@${ytHandle}/about`);
  }

  const blocked = /tiktokcdn|muscdn|instagram\.com|tiktok\.com|\.webp|\.jpg|\.jpeg|\.png|\.gif|\.mp4/i;
  const uniqueUrls = [...new Set(urlsToScrape)].filter(u => !blocked.test(u)).slice(0, 3);

  if (uniqueUrls.length === 0) return;

  console.log('Deep contact enrichment - scraping URLs:', uniqueUrls);

  for (const url of uniqueUrls) {
    if (contactDetails.email) break;
    
    try {
      const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${firecrawlKey}`,
                    'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          formats: ['markdown'],
          onlyMainContent: true,
          waitFor: 3000,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const markdown = data.data?.markdown || data.markdown || '';
        
        console.log(`Scraped ${url} - ${markdown.length} chars`);

        const emailMatches = markdown.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi) || [];
        const junkDomains = /noreply|no-reply|example\.com|sentry\.io|wixpress|placeholder|test@|support@linktree/i;
        const validEmails = emailMatches.filter((e: string) => !junkDomains.test(e));
        
        if (validEmails.length > 0) {
          contactDetails.email = validEmails[0].toLowerCase();
          contactDetails.email_source = 'website';
          console.log('Found email via website scrape:', contactDetails.email);
        }

        if (!contactDetails.website && (url.includes('linktr.ee') || url.includes('beacons.ai'))) {
          const websiteLinks = markdown.match(/https?:\/\/(?!linktr\.ee|beacons\.ai|instagram\.com|tiktok\.com|youtube\.com|twitter\.com|facebook\.com)[^\s\)"\]]+/gi) || [];
          if (websiteLinks.length > 0) {
            contactDetails.website = websiteLinks[0];
          }
        }

        if (!updates.website_url && !creator.website_url) {
          updates.website_url = url;
        }
      }
    } catch (e) {
      console.error(`Failed to scrape ${url}:`, e);
    }
  }

  if (!contactDetails.email && bio) {
    const bioEmailMatch = bio.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi);
    if (bioEmailMatch) {
      contactDetails.email = bioEmailMatch[0].toLowerCase();
      contactDetails.email_source = 'bio';
    }
  }

  updates.raw_data = {
    ...(creator.raw_data || {}),
    ...(updates.raw_data || {}),
    contact_details: contactDetails,
  };
}

// Promote contact_details from raw_data into top-level columns
function promoteContactColumns(creator: any, updates: Record<string, any>) {
  const rawData = updates.raw_data || creator.raw_data || {};
  const details = rawData.contact_details || {};

  if (details.email && !creator.contact_email) {
    updates.contact_email = details.email;
    updates.contact_source = details.email_source || 'scraped';
  }

  if (details.website && !creator.website_url && !updates.website_url) {
    const blockedUrl = /tiktokcdn|muscdn|\.(webp|png|jpe?g)/i;
    if (!blockedUrl.test(details.website)) {
      updates.website_url = details.website;
    }
  }
}
