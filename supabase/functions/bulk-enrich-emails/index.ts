import { firecrawlWebResults } from "../_shared/firecrawl.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const logStep = (step: string, details?: unknown) => {
  console.log(`[BULK-ENRICH] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

const EMAIL_REGEX = /[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/gi;
const JUNK_FILTER = /noreply|no-reply|example\.com|sentry\.io|wixpress|placeholder|test@|support@linktree|email\.com|your@|user@|@tiktok|@instagram|@facebook|@twitter|@youtube|@apple|@google|@microsoft/i;

function extractValidEmails(text: string): string[] {
  const matches = text.match(EMAIL_REGEX) || [];
  return matches.filter(e => !JUNK_FILTER.test(e));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { creator_ids, force } = await req.json();

    if (!creator_ids || !Array.isArray(creator_ids) || creator_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'creator_ids array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cap at 5 per invocation to stay within compute limits
    const MAX_PER_CALL = 5;
    const batchIds = creator_ids.slice(0, MAX_PER_CALL);
    const remainingIds = creator_ids.slice(MAX_PER_CALL);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: creators, error } = await supabase
      .from('creator_profiles')
      .select('id, username, display_name, bio, platform, contact_email, website_url, profile_url, raw_data')
      .in('id', batchIds);

    if (error || !creators) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch creators' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logStep('Processing creators', { total: creators.length, force: !!force });

    const results: { id: string; username: string; email: string | null; source: string | null }[] = [];

    for (const creator of creators) {
      // Skip if already has email UNLESS force mode is on
      if (creator.contact_email && !force) {
        results.push({ id: creator.id, username: creator.username, email: creator.contact_email, source: 'existing' });
        continue;
      }

      let emailFound: string | null = null;
      let emailSource: string | null = null;

      const bio = creator.bio || '';

      // ── Layer 1: Regex on bio ──
      if (bio) {
        const valid = extractValidEmails(bio);
        if (valid.length > 0) {
          emailFound = valid[0].toLowerCase();
          emailSource = 'bio';
          logStep(`Bio email found for ${creator.username}`, { email: emailFound });
        }
      }

      // ── Layer 2: Scrape website_url / bio URLs via Firecrawl ──
      if (!emailFound && firecrawlKey) {
        const urlsToScrape: string[] = [];
        
        if (creator.website_url) urlsToScrape.push(creator.website_url);
        
        // Extract URLs from bio
        const bioUrls = bio.match(/https?:\/\/[^\s\)]+/gi) || [];
        urlsToScrape.push(...bioUrls);

        // Link-in-bio services
        const linktreeMatch = bio.match(/(?:linktr\.ee|beacons\.ai|linkin\.bio|lnk\.bio|bio\.link|linkpop\.com|hoo\.be|tap\.bio|stan\.store)\/([^\s\)]+)/i);
        if (linktreeMatch) urlsToScrape.push(`https://${linktreeMatch[0]}`);

        const rawDetails = (creator.raw_data as any)?.contact_details || {};
        if (rawDetails.website) urlsToScrape.push(rawDetails.website);

        const blocked = /tiktokcdn|muscdn|instagram\.com\/p\/|tiktok\.com\/@|\.webp|\.jpg|\.jpeg|\.png|\.gif|\.mp4/i;
        const uniqueUrls = [...new Set(urlsToScrape)].filter(u => !blocked.test(u)).slice(0, 3);

        for (const url of uniqueUrls) {
          if (emailFound) break;
          try {
            logStep(`Scraping website for ${creator.username}`, { url });
            const res = await fetch('https://api.firecrawl.dev/v2/scrape', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${firecrawlKey}`,
                                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true, waitFor: 3000 }),
            });

            if (res.ok) {
              const data = await res.json();
              const markdown = data.data?.markdown || data.markdown || '';
              const valid = extractValidEmails(markdown);
              if (valid.length > 0) {
                emailFound = valid[0].toLowerCase();
                emailSource = 'website';
                logStep(`Website email found for ${creator.username}`, { email: emailFound, url });
              }
            }
          } catch (e) {
            logStep(`Scrape failed for ${url}`, { error: String(e) });
          }
        }
      }

      // ── Layer 3: Firecrawl web SEARCH for creator email ──
      if (!emailFound && firecrawlKey) {
        try {
          const displayName = creator.display_name || creator.username;
          const platform = creator.platform || 'tiktok';
          const searchQuery = `"${creator.username}" ${platform} email contact`;
          
          logStep(`Web searching for ${creator.username}`, { query: searchQuery });
          
          const res = await fetch('https://api.firecrawl.dev/v2/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${firecrawlKey}`,
                            'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: searchQuery,
              limit: 5,
              scrapeOptions: { formats: ['markdown'] },
            }),
          });

          if (res.ok) {
            const searchData = await res.json();
            const searchResults = firecrawlWebResults(searchData);
            
            for (const result of searchResults) {
              if (emailFound) break;
              const content = (result.markdown || '') + ' ' + (result.description || '');
              const valid = extractValidEmails(content);
              if (valid.length > 0) {
                emailFound = valid[0].toLowerCase();
                emailSource = 'web_search';
                logStep(`Web search email found for ${creator.username}`, { email: emailFound });
              }
            }
          }
        } catch (e) {
          logStep(`Web search failed for ${creator.username}`, { error: String(e) });
        }
      }

      // ── Layer 4: AI extraction from bio (obfuscated emails) ──
      if (!emailFound && openaiApiKey && bio.length > 10) {
        try {
          const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${openaiApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'gpt-4.1-mini',
              messages: [
                {
                  role: 'system',
                  content: 'Extract any email address from the text. People often obfuscate emails like "john [at] gmail [dot] com" or "email: john(at)gmail.com". Return ONLY the email address if found, or "NONE" if no email is present. No explanation.',
                },
                { role: 'user', content: bio },
              ],
              temperature: 0,
            }),
          });

          if (aiRes.ok) {
            const aiData = await aiRes.json();
            const extracted = aiData.choices?.[0]?.message?.content?.trim() || '';
            if (extracted !== 'NONE' && extracted.includes('@') && extracted.includes('.')) {
              const cleaned = extracted.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);
              if (cleaned) {
                emailFound = cleaned[0].toLowerCase();
                emailSource = 'ai_bio';
                logStep(`AI extracted email for ${creator.username}`, { email: emailFound });
              }
            }
          }
        } catch (e) {
          logStep(`AI extraction failed for ${creator.username}`, { error: String(e) });
        }
      }

      // Save result
      if (emailFound) {
        await supabase
          .from('creator_profiles')
          .update({
            contact_email: emailFound,
            contact_source: emailSource,
            updated_at: new Date().toISOString(),
          })
          .eq('id', creator.id);
      }

      results.push({
        id: creator.id,
        username: creator.username,
        email: emailFound,
        source: emailSource,
      });

      // Rate limit pause between creators
      await new Promise(r => setTimeout(r, 300));
    }

    const found = results.filter(r => r.email).length;
    logStep('Enrichment complete', { total: results.length, found, missing: results.length - found });

    return new Response(
      JSON.stringify({ 
        success: true, 
        results, 
        summary: { total: results.length, found, missing: results.length - found },
        remaining_ids: remainingIds.length > 0 ? remainingIds : undefined,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logStep('ERROR', { message: error instanceof Error ? error.message : String(error) });
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
