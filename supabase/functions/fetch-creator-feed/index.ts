import { firecrawlWebResults } from "../_shared/firecrawl.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

function extractInstagramShortcode(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:reel|p)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

function normalizeInstagramMediaUrl(url: string): string {
  const clean = url.trim().replace(/\\/g, '').replace(/[?#].*$/, '');
  // Always normalize to canonical /p/{shortcode} form to prevent duplicates
  const shortcode = extractInstagramShortcode(clean);
  if (shortcode) {
    return `https://www.instagram.com/p/${shortcode}`;
  }
  return clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

async function fetchInstagramOEmbed(postUrl: string, appId: string, appSecret: string): Promise<{ thumbnail_url: string | null; title: string | null; author_name: string | null }> {
  try {
    const accessToken = `${appId}|${appSecret}`;
    const res = await fetch(
      `https://graph.facebook.com/v21.0/instagram_oembed?url=${encodeURIComponent(postUrl)}&access_token=${accessToken}&fields=thumbnail_url,title,author_name`,
      { headers: { 'Accept': 'application/json' } }
    );
    if (!res.ok) {
      const errorBody = await res.text().catch(() => 'no body');
      console.log(`Instagram oEmbed failed for ${postUrl}: ${res.status} — ${errorBody}`);
      return { thumbnail_url: null, title: null, author_name: null };
    }
    const data = await res.json();
    return {
      thumbnail_url: data.thumbnail_url || null,
      title: data.title || null,
      author_name: data.author_name || null,
    };
  } catch (e) {
    console.error('Instagram oEmbed error:', e);
    return { thumbnail_url: null, title: null, author_name: null };
  }
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

  const relative = [...normalizedText.matchAll(/(?:^|[^A-Za-z0-9_])\/(?:reel|p)\/([A-Za-z0-9_-]{5,})\/?/g)];
  for (const match of relative) {
    if (match[1]) {
      links.add(normalizeInstagramMediaUrl(`https://www.instagram.com/reel/${match[1]}`));
    }
  }

  return [...links];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTikTokVideoLinks(text: string, username?: string): string[] {
  const links = new Set<string>();
  const normalizedText = text.replace(/\\\//g, '/').replace(/\\u002F/gi, '/');

  const absolute = normalizedText.match(/https?:\/\/(?:www\.)?tiktok\.com\/@[A-Za-z0-9._-]+\/video\/\d{8,}/g) || [];
  for (const link of absolute) {
    links.add(link.replace(/\?.*$/, ''));
  }

  if (username) {
    const cleanUsername = username.replace(/^@/, '');
    const escaped = escapeRegExp(cleanUsername);

    const relativeRegex = new RegExp(`(?:^|[^A-Za-z0-9_])/@?${escaped}/video/(\\d{8,})`, 'gi');
    const relativeMatches = [...normalizedText.matchAll(relativeRegex)];
    for (const match of relativeMatches) {
      if (match[1]) {
        links.add(`https://www.tiktok.com/@${cleanUsername}/video/${match[1]}`);
      }
    }

    const itemListRegex = /"itemList"\s*:\s*\[([^\]]+)\]/gi;
    let itemListMatch;
    while ((itemListMatch = itemListRegex.exec(normalizedText)) !== null) {
      const idMatches = [...itemListMatch[1].matchAll(/"(\d{8,})"/g)];
      for (const idMatch of idMatches) {
        if (idMatch[1]) {
          links.add(`https://www.tiktok.com/@${cleanUsername}/video/${idMatch[1]}`);
        }
      }
    }
  }

  return [...links];
}

async function fetchTikTokEmbedProfileLinks(username: string) {
  const cleanUsername = username.replace(/^@/, '');
  const url = `https://www.tiktok.com/embed/@${encodeURIComponent(cleanUsername)}`;

  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'referer': `https://www.tiktok.com/@${cleanUsername}`,
    },
  });

  if (!res.ok) {
    console.log('TikTok embed profile request failed with status:', res.status);
    return [];
  }

  const html = await res.text();
  return extractTikTokVideoLinks(html, cleanUsername);
}

async function firecrawlScrape(url: string, firecrawlKey: string, waitFor = 4000) {
  const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${firecrawlKey}`,
            'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown'],
      waitFor,
    }),
  });

  if (!res.ok) return null;
  const payload = await res.json();
  return {
    markdown: payload.data?.markdown || payload.markdown || '',
    metadata: payload.data?.metadata || payload.metadata || {},
  };
}

async function fetchInstagramPublicProfile(username: string) {
  try {
    const res = await fetch(
      `https://i.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`,
      {
        headers: {
          'x-ig-app-id': '936619743392459',
          'x-asbd-id': '129477',
          'x-ig-www-claim': '0',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'accept': 'application/json',
          'accept-language': 'en-US,en;q=0.9',
        },
      }
    );

    if (!res.ok) {
      console.log('Instagram public profile feed request failed with status:', res.status);
      return null;
    }
    const payload = await res.json();
    return payload?.data?.user || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { username, platform = 'tiktok', limit = 20 } = await req.json();

    if (!username) {
      return new Response(
        JSON.stringify({ success: false, error: 'username is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`Fetching feed for @${username} on ${platform}, limit=${limit}`);

    // 1. Gather media URLs from DB (enrichment stores recent media for Instagram)
    const allVideoUrls = new Set<string>();

    const { data: creator } = await supabase
      .from('creator_profiles')
      .select('raw_data, latest_video_url, thumbnail_url, avatar_url')
      .eq('platform', platform)
      .eq('username', username)
      .single();

    const instagramSeedItems: Array<{ url: string; thumbnail_url: string | null; title: string | null }> = [];

    if (platform === 'instagram') {
      const igUser = await fetchInstagramPublicProfile(username);
      if (igUser) {
        const edges = Array.isArray(igUser.edge_owner_to_timeline_media?.edges)
          ? igUser.edge_owner_to_timeline_media.edges
          : [];

        for (const edge of edges.slice(0, Math.max(limit, 12))) {
          const node = edge?.node;
          const shortcode = node?.shortcode;
          if (!shortcode) continue;

          const mediaUrl = normalizeInstagramMediaUrl(`https://www.instagram.com/p/${shortcode}/`);
          const caption = node?.edge_media_to_caption?.edges?.[0]?.node?.text || null;
          const thumb = node?.display_url || node?.thumbnail_src || null;

          allVideoUrls.add(mediaUrl);
          instagramSeedItems.push({
            url: mediaUrl,
            thumbnail_url: thumb,
            title: caption ? String(caption).substring(0, 120) : null,
          });
        }

        const recentMedia = instagramSeedItems.map((item, idx) => ({
          id: `${username}_${idx}`,
          type: 'POST',
          url: item.url,
          thumbnail: item.thumbnail_url,
          caption: item.title,
        }));

        const freshAvatar = igUser.profile_pic_url_hd || igUser.profile_pic_url || creator?.avatar_url || null;
        const freshThumbnail = instagramSeedItems[0]?.thumbnail_url || creator?.thumbnail_url || null;

        await supabase
          .from('creator_profiles')
          .update({
            avatar_url: freshAvatar,
            thumbnail_url: freshThumbnail,
            raw_data: {
              ...(creator?.raw_data || {}),
              scraped_via: 'instagram_public_profile',
              scraped_at: new Date().toISOString(),
              recent_media: recentMedia,
              video_links: [...new Set([...(creator?.raw_data?.video_links || []), ...instagramSeedItems.map((item) => item.url)])].slice(0, 50),
            },
          })
          .eq('platform', 'instagram')
          .eq('username', username);
      }
    }

    const instagramRecentMedia = platform === 'instagram' && Array.isArray(creator?.raw_data?.recent_media)
      ? creator.raw_data.recent_media
          .filter((item: any) => item && typeof item.url === 'string')
          .map((item: any) => ({
            url: normalizeInstagramMediaUrl(item.url as string),
            thumbnail_url: typeof item.thumbnail === 'string' ? item.thumbnail : null,
            title: typeof item.caption === 'string' ? item.caption.substring(0, 120) : null,
          }))
      : [];

    for (const media of instagramRecentMedia) {
      allVideoUrls.add(media.url);
    }

    for (const media of instagramSeedItems) {
      allVideoUrls.add(normalizeInstagramMediaUrl(media.url));
    }

    if (creator?.raw_data?.video_links) {
      for (const v of creator.raw_data.video_links) {
        if (typeof v !== 'string') continue;

        const isTikTokVideo = platform === 'tiktok' && v.includes('/video/');
        const isInstagramMedia = platform === 'instagram' && (v.includes('/reel/') || v.includes('/p/'));

        if (isTikTokVideo) {
          allVideoUrls.add(v);
        }

        if (isInstagramMedia) {
          allVideoUrls.add(normalizeInstagramMediaUrl(v));
        }
      }
    }

    if (creator?.latest_video_url) {
      allVideoUrls.add(platform === 'instagram' ? normalizeInstagramMediaUrl(creator.latest_video_url) : creator.latest_video_url);
    }

    console.log(`Found ${allVideoUrls.size} stored media links`);

    // 2. Supplement with Firecrawl search if we still need more
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    if (allVideoUrls.size < limit && platform === 'tiktok') {
      // Step 2a: Pull recent links from TikTok embed profile page (usually exposes itemList)
      try {
        const embedLinks = await fetchTikTokEmbedProfileLinks(username);
        for (const link of embedLinks) {
          allVideoUrls.add(link);
        }
        console.log(`TikTok embed profile found ${embedLinks.length} video refs, total now: ${allVideoUrls.size}`);
      } catch (e) {
        console.error('TikTok embed profile fetch failed:', e);
      }
    }

    if (allVideoUrls.size < limit && firecrawlKey && platform === 'tiktok') {
      // Step 2b: Direct scrape TikTok profile page for video links
      try {
        console.log('Direct-scraping TikTok profile page for video links...');
        const profileScrapeRes = await fetch('https://api.firecrawl.dev/v2/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${firecrawlKey}`,
                        'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: `https://www.tiktok.com/@${username}`,
            formats: ['markdown'],
            waitFor: 5000,
          }),
        });

        if (profileScrapeRes.ok) {
          const scrapeData = await profileScrapeRes.json();
          const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';
          const discovered = extractTikTokVideoLinks(markdown, username);
          for (const link of discovered) {
            allVideoUrls.add(link);
          }
          console.log(`Profile scrape found ${discovered.length} video refs, total now: ${allVideoUrls.size}`);
        } else {
          console.log('TikTok profile scrape request failed with status:', profileScrapeRes.status);
        }
      } catch (e) {
        console.error('Profile page scrape failed:', e);
      }

      // Step 2c: Google search for more video links
      if (allVideoUrls.size < limit) {
        try {
          const queries = [
            `site:tiktok.com/@${username} video`,
            `site:tiktok.com/@${username}/video`,
          ];

          const responses = await Promise.all(
            queries.map((query) =>
              fetch('https://api.firecrawl.dev/v2/search', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${firecrawlKey}`,
                                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  query,
                  limit: 20,
                  scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
                }),
              }).catch(() => null)
            )
          );

          let resultCount = 0;
          for (const res of responses) {
            if (!res?.ok) continue;
            const searchData = await res.json();
            const results = firecrawlWebResults(searchData);
            resultCount += results.length;

            for (const result of results) {
              const mergedText = `${result.url || ''}\n${result.markdown || ''}\n${result.description || ''}`;
              const discovered = extractTikTokVideoLinks(mergedText, username);
              for (const link of discovered) {
                allVideoUrls.add(link);
              }
            }
          }
          console.log(`Google search returned ${resultCount} results`);
        } catch (e) {
          console.error('Google search for videos failed:', e);
        }
      }
    } else if (allVideoUrls.size < limit && firecrawlKey && platform === 'instagram') {
      // For Instagram, scrape profile directly first
      try {
        const profile = await firecrawlScrape(`https://www.instagram.com/${username}/`, firecrawlKey, 6000);
        if (profile) {
          const discovered = extractInstagramMediaLinks(profile.markdown);
          for (const link of discovered) {
            allVideoUrls.add(link);
          }
          console.log(`IG direct scrape found ${discovered.length} post links`);
        }
      } catch (e) {
        console.error('IG direct profile scrape failed:', e);
      }

      // Then broaden with search queries
      if (allVideoUrls.size < limit) {
        try {
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
                body: JSON.stringify({
                  query,
                  limit: 20,
                  scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
                }),
              }).catch(() => null)
            )
          );

          let resultCount = 0;
          for (const res of responses) {
            if (!res?.ok) continue;
            const payload = await res.json();
            const results = firecrawlWebResults(payload);
            resultCount += results.length;
            for (const result of results) {
              if (typeof result.url === 'string' && (result.url.includes('/reel/') || result.url.includes('/p/'))) {
                allVideoUrls.add(normalizeInstagramMediaUrl(result.url));
              }
              for (const link of extractInstagramMediaLinks(result.markdown || '')) {
                allVideoUrls.add(link);
              }
            }
          }
          console.log(`IG search returned ${resultCount} results`);
        } catch (e) {
          console.error('IG search for posts failed:', e);
        }
      }
    }

    const videoUrls = [...allVideoUrls].slice(0, limit);
    console.log(`Total unique media URLs: ${videoUrls.length}`);

    // 3. Get oEmbed data for each video (thumbnails + embed HTML)
    const feedItems: any[] = [];

    if (platform === 'tiktok') {
      // Process in batches of 5 to avoid rate limiting
      for (let i = 0; i < videoUrls.length; i += 5) {
        const batch = videoUrls.slice(i, i + 5);
        const oembedPromises = batch.map(async (videoUrl) => {
          try {
            const res = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(videoUrl)}`);
            if (res.ok) {
              const oembed = await res.json();
              return {
                url: videoUrl,
                thumbnail_url: oembed.thumbnail_url || null,
                title: oembed.title || null,
                author_name: oembed.author_name || null,
                embed_html: oembed.html || null,
                thumbnail_width: oembed.thumbnail_width || null,
                thumbnail_height: oembed.thumbnail_height || null,
              };
            }
            // oEmbed failed but we still have the URL — include it without thumbnail
            return {
              url: videoUrl,
              thumbnail_url: null,
              title: null,
              author_name: null,
              embed_html: null,
              thumbnail_width: null,
              thumbnail_height: null,
            };
          } catch (e) {
            console.error('oEmbed failed for:', videoUrl);
            return {
              url: videoUrl,
              thumbnail_url: null,
              title: null,
              author_name: null,
              embed_html: null,
              thumbnail_width: null,
              thumbnail_height: null,
            };
          }
        });

        const batchResults = await Promise.all(oembedPromises);
        feedItems.push(...batchResults.filter(r => r !== null));
      }
    } else {
      const byUrl = new Map<string, { url: string; thumbnail_url: string | null; title: string | null }>();

      const toInstagramKey = (url: string) => extractInstagramShortcode(url) || normalizeInstagramMediaUrl(url);

      for (const media of instagramSeedItems) {
        const normalized = normalizeInstagramMediaUrl(media.url);
        byUrl.set(toInstagramKey(normalized), {
          url: normalized,
          thumbnail_url: media.thumbnail_url,
          title: media.title,
        });
      }

      for (const media of instagramRecentMedia) {
        const normalized = normalizeInstagramMediaUrl(media.url);
        byUrl.set(toInstagramKey(normalized), {
          url: normalized,
          thumbnail_url: media.thumbnail_url,
          title: media.title,
        });
      }

      for (const url of videoUrls) {
        const normalized = normalizeInstagramMediaUrl(url);
        const key = toInstagramKey(normalized);
        if (!byUrl.has(key)) {
          byUrl.set(key, { url: normalized, thumbnail_url: null, title: null });
        }
      }

      // Use Meta's Instagram oEmbed API for stable, non-expiring thumbnails
      const metaAppId = Deno.env.get('META_APP_ID');
      const metaAppSecret = Deno.env.get('META_APP_SECRET');

      if (metaAppId && metaAppSecret) {
        const allItems = [...byUrl.values()];
        // Process in batches of 5
        for (let i = 0; i < allItems.length; i += 5) {
          const batch = allItems.slice(i, i + 5);
          const results = await Promise.all(
            batch.map(async (item) => {
              const oembed = await fetchInstagramOEmbed(item.url, metaAppId, metaAppSecret);
              if (oembed.thumbnail_url) {
                return { ...item, thumbnail_url: oembed.thumbnail_url, title: oembed.title || item.title };
              }
              return item;
            })
          );
          for (const result of results) {
            byUrl.set(result.url, result);
          }
        }
        console.log('Instagram oEmbed enrichment complete');
      } else {
        console.log('META_APP_ID/META_APP_SECRET not set, skipping oEmbed enrichment');

        // Fallback to Firecrawl for missing thumbnails
        if (firecrawlKey) {
          const missingThumbnails = [...byUrl.values()]
            .filter((item) => !item.thumbnail_url)
            .slice(0, Math.max(0, Math.min(limit, 12)));

          const enriched = await Promise.all(
            missingThumbnails.map(async (item) => {
              try {
                const scraped = await firecrawlScrape(item.url, firecrawlKey, 3000);
                if (!scraped) return null;
                const thumb = typeof scraped.metadata.ogImage === 'string' ? scraped.metadata.ogImage : null;
                const title = typeof scraped.metadata.ogTitle === 'string'
                  ? scraped.metadata.ogTitle
                  : (scraped.markdown.split('\n').find((line: string) => line.trim().length > 0) || null);
                return { ...item, thumbnail_url: thumb, title: title?.substring(0, 140) || null };
              } catch {
                return null;
              }
            })
          );

          for (const entry of enriched) {
            if (entry?.url && byUrl.has(entry.url)) {
              byUrl.set(entry.url, entry);
            }
          }
        }
      }

      // Do NOT use avatar as blanket fallback — it makes all posts look identical.
      // Items without thumbnails will show embed or gradient placeholders in the UI.

      feedItems.push(...[...byUrl.values()].slice(0, limit));
    }

    // 4. Save newly discovered video links back to DB
    if (creator && allVideoUrls.size > (creator.raw_data?.video_links?.length || 0)) {
      await supabase
        .from('creator_profiles')
        .update({
          raw_data: {
            ...(creator.raw_data || {}),
            video_links: [...allVideoUrls].slice(0, 50),
          },
        })
        .eq('platform', platform)
        .eq('username', username);
    }

    console.log(`Returning ${feedItems.length} feed items`);

    return new Response(
      JSON.stringify({ success: true, data: feedItems }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Feed fetch error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
