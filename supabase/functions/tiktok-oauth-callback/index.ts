// Handles TikTok OAuth callback, exchanges code for tokens, fetches profile info,
// stores in social_accounts, then redirects back to the app.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { encryptMetaToken } from '../_shared/meta-tokens.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_ORIGIN = 'https://autosocials.com';

function popupResponse(params: Record<string, string>, fallbackUrl: string) {
  const search = new URLSearchParams(params).toString();
  const fallback = `${fallbackUrl}${fallbackUrl.includes('?') ? '&' : '?'}${search}`;
  return new Response(null, {
    status: 302,
    headers: {
      ...corsHeaders,
      Location: fallback,
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error_description') ?? url.searchParams.get('error');

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  let appRedirect = `${APP_ORIGIN}/app/settings/connections`;

  try {
    if (!state) throw new Error('Missing state');
    // Consume the short-lived state atomically so callbacks cannot be replayed
    // or borrow an OAuth state issued for a different provider.
    const { data: stateRow } = await admin
      .from('oauth_states').delete().eq('state', state).in('platform', ['tiktok', 'tiktok_sandbox']).gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
    if (!stateRow) throw new Error('Invalid or expired state');
    if (stateRow.redirect_to) appRedirect = stateRow.redirect_to;

    if (errorParam) throw new Error(errorParam);
    if (!code) throw new Error('Missing code');

    const sandbox = stateRow.platform === 'tiktok_sandbox';
    if (sandbox) {
      const { data: role, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', stateRow.user_id).eq('role', 'super_admin').maybeSingle();
      if (roleError || !role) throw new Error('Sandbox access is no longer available');
    }
    const CLIENT_KEY = Deno.env.get(sandbox ? 'TIKTOK_SANDBOX_CLIENT_KEY' : 'TIKTOK_CLIENT_KEY');
    const CLIENT_SECRET = Deno.env.get(sandbox ? 'TIKTOK_REVIEW_SANDBOX_SECRET' : 'TIKTOK_CLIENT_SECRET');
    if (!CLIENT_KEY || !CLIENT_SECRET) throw new Error('TikTok connection is not configured');

    const redirectUri = `${SUPABASE_URL}/functions/v1/tiktok-oauth-callback`;

    const tokenRes = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: CLIENT_KEY,
        client_secret: CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || tokenJson.error) {
      throw new Error(tokenJson.error_description ?? tokenJson.error ?? 'Token exchange failed');
    }
    const accessToken: string = tokenJson.access_token;
    const refreshToken: string | undefined = tokenJson.refresh_token;
    const expiresIn: number = tokenJson.expires_in ?? 86400;
    const openId: string = tokenJson.open_id;
    const grantedScopes: string[] = (tokenJson.scope ?? '').split(',').filter(Boolean);
    if (!accessToken || !openId) throw new Error('TikTok did not return a valid account');

    // Separate provider environments even if TikTok returns the same open ID.
    const accountId = sandbox ? `sandbox:${openId}` : openId;

    // Fetch profile info
    const infoRes = await fetch(
      'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const infoJson = await infoRes.json();
    const userInfo = infoJson?.data?.user ?? {};

    const tokenContext = `account:${stateRow.workspace_id}:tiktok:${accountId}`;
    const { error: saveError } = await admin.rpc('save_tiktok_oauth_account', { _account: {
      workspace_id: stateRow.workspace_id,
      platform: 'tiktok',
      external_id: accountId,
      handle: userInfo.username ?? null,
      display_name: sandbox ? `${userInfo.display_name ?? 'TikTok'} (Sandbox)` : userInfo.display_name ?? null,
      avatar_url: userInfo.avatar_url ?? null,
      access_token: await encryptMetaToken(accessToken, tokenContext),
      refresh_token: refreshToken ? await encryptMetaToken(refreshToken, `${tokenContext}:refresh`) : null,
      token_encrypted_at: new Date().toISOString(),
      scopes: grantedScopes,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      status: 'connected',
      is_enabled: true,
      last_error: null,
      connected_by: stateRow.user_id,
      metadata: { open_id: openId, union_id: userInfo.union_id ?? null, tiktok_sandbox: sandbox },
    } });
    if (saveError) throw new Error('Could not save the TikTok account. Please reconnect.');

    return popupResponse({ status: 'connected', connected: 'tiktok' }, appRedirect);
  } catch (e) {
    console.error('tiktok-oauth-callback', e);
    const msg = e instanceof Error ? e.message : String(e);
    return popupResponse({ status: 'error', error: msg }, appRedirect);
  }
});
