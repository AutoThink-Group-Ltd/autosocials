import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.99.1';

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const errorParam = url.searchParams.get('error');

    if (errorParam) {
      console.error('OAuth error from Facebook:', errorParam, url.searchParams.get('error_description'));
      return htmlResponse('Authorization was denied or failed. You can close this window.');
    }

    if (!code) {
      return htmlResponse('Missing authorization code. You can close this window.');
    }

    const metaAppId = Deno.env.get('META_APP_ID')!;
    const metaAppSecret = Deno.env.get('META_APP_SECRET')!;
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const redirectUri = `${supabaseUrl}/functions/v1/instagram-oauth-callback`;

    // Decode state
    let stateData: Record<string, any> = {};
    if (state) {
      try { stateData = JSON.parse(atob(state)); } catch (_) {}
    }
    console.log('OAuth callback, state:', stateData);

    // Step 1: Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?client_id=${metaAppId}&client_secret=${metaAppSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${code}`;
    const tokenRes = await fetch(tokenUrl);
    const tokenData = await tokenRes.json();

    if (!tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return htmlResponse('Failed to get access token. You can close this window.');
    }

    console.log('Got short-lived token, exchanging for long-lived...');

    // Step 2: Exchange for long-lived token (60 days)
    const longTokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${metaAppId}&client_secret=${metaAppSecret}&fb_exchange_token=${tokenData.access_token}`;
    const longTokenRes = await fetch(longTokenUrl);
    const longTokenData = await longTokenRes.json();

    const accessToken = longTokenData.access_token || tokenData.access_token;
    const expiresIn = longTokenData.expires_in || 5184000; // default 60 days

    console.log('Got long-lived token, expires in:', expiresIn, 'seconds');

    // Step 3: Fetch user's Instagram accounts and Facebook Pages
    const accountsRes = await fetch(`https://graph.facebook.com/v18.0/me/accounts?fields=id,name,access_token,instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}&access_token=${accessToken}`);
    const accountsData = await accountsRes.json();
    const pages = accountsData.data || [];

    console.log(`Found ${pages.length} Facebook Pages`);

    const igAccounts: any[] = [];
    for (const page of pages) {
      if (page.instagram_business_account) {
        igAccounts.push({
          ig_user_id: page.instagram_business_account.id,
          ig_username: page.instagram_business_account.username,
          ig_name: page.instagram_business_account.name,
          ig_profile_picture: page.instagram_business_account.profile_picture_url,
          ig_followers: page.instagram_business_account.followers_count,
          ig_media_count: page.instagram_business_account.media_count,
          page_id: page.id,
          page_name: page.name,
          page_access_token: page.access_token,
        });
      }
    }

    console.log(`Found ${igAccounts.length} Instagram Business accounts`);

    // Step 4: Store in database
    const supabase = createClient(supabaseUrl, supabaseKey);

    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { data: source, error: insertError } = await supabase
      .from('meta_data_sources')
      .insert({
        source_type: 'instagram_temp',
        access_token: accessToken,
        token_expires_at: tokenExpiresAt,
        is_connected: igAccounts.length > 0,
        connection_status: igAccounts.length > 0 ? 'connected' : 'pending_selection',
        connection_metadata: {
          pages,
          ig_accounts: igAccounts,
          connected_at: new Date().toISOString(),
        },
      })
      .select('id')
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
    } else {
      console.log('Stored data source:', source?.id);
    }

    // Return HTML that posts message to opener and closes
    return htmlResponse(null, igAccounts.length);
  } catch (error) {
    console.error('Callback error:', error);
    return htmlResponse('An error occurred. You can close this window.');
  }
});

function htmlResponse(errorMessage: string | null, accountCount = 0) {
  const html = errorMessage
    ? `<!DOCTYPE html><html><body><h2>Error</h2><p>${errorMessage}</p><script>setTimeout(()=>window.close(),3000);</script></body></html>`
    : `<!DOCTYPE html><html><body>
        <h2>Connected!</h2>
        <p>Found ${accountCount} Instagram account(s). This window will close automatically.</p>
        <script>
          if (window.opener) {
            window.opener.postMessage({ type: 'instagram-connected', accountCount: ${accountCount} }, '*');
          }
          setTimeout(() => window.close(), 2000);
        </script>
      </body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
}
