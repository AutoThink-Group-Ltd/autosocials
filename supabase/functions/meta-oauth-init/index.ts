// Initiates Meta (Facebook + Instagram Business) OAuth for the Publishing pillar.
// Creates a row in oauth_states and returns the authorization URL.

import { assertMetaTokenKey } from '../_shared/meta-tokens.ts';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const META_APP_ID = Deno.env.get('META_APP_ID');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!META_APP_ID) throw new Error('META_APP_ID not configured');

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { workspace_id, redirect_to, analytics, analytics_platform } = await req.json();
    if (!workspace_id) return json({ error: 'workspace_id required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (!await canManageMetaAccounts(admin, user.id, workspace_id)) return json({ error: 'Forbidden' }, 403);
    await assertMetaTokenKey();
    const origin = Deno.env.get('SITE_ORIGIN') ?? 'https://autosocials.com';
    const allowedOrigins = new Set([new URL(origin).origin, 'https://autosocials.com', 'https://www.autosocials.com', 'http://127.0.0.1:4177', 'http://localhost:4177']);
    let redirect = origin + '/oauth/bridge';
    if (redirect_to) {
      const parsed = new URL(redirect_to);
      if (!allowedOrigins.has(parsed.origin) || !['/oauth/bridge', '/app/settings/connections'].includes(parsed.pathname) || parsed.username || parsed.password) return json({ error: 'Invalid redirect destination' }, 400);
      redirect = parsed.origin + parsed.pathname;
    }
    const state = crypto.randomUUID();
    const { error: stateError } = await admin.from('oauth_states').insert({
      state,
      user_id: user.id,
      workspace_id,
      platform: 'meta',
      redirect_to: redirect,
    });

    if (stateError) throw new Error('Could not start secure connection session');

    const redirectUri = `${SUPABASE_URL}/functions/v1/meta-oauth-callback`;
    const scopes = [
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_manage_engagement',
      'instagram_basic',
      'instagram_content_publish',
      'business_management',
      ...(analytics === true && analytics_platform === 'instagram' ? ['instagram_manage_comments', 'instagram_manage_insights'] : []),
      ...(analytics === true && analytics_platform === 'facebook' ? ['read_insights'] : []),
    ].join(',');

    const authUrl =
      `https://www.facebook.com/v21.0/dialog/oauth?client_id=${META_APP_ID}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${state}&response_type=code`;

    return json({ authUrl });
  } catch (e) {
    console.error('meta-oauth-init failed');
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
