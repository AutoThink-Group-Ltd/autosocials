// Initiates TikTok Login Kit OAuth (Content Posting API).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
import { assertMetaTokenKey } from '../_shared/meta-tokens.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);

    const { workspace_id, redirect_to, analytics, sandbox } = await req.json();
    if (!workspace_id) return json({ error: 'workspace_id required' }, 400);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    if (!await canManageMetaAccounts(admin, user.id, workspace_id)) return json({ error: 'Forbidden' }, 403);
    if (sandbox === true) {
      const { data: role, error: roleError } = await admin.from('user_roles').select('role').eq('user_id', user.id).eq('role', 'super_admin').maybeSingle();
      if (roleError || !role) return json({ error: 'Sandbox connections are restricted to administrators' }, 403);
    }
    const clientKey = Deno.env.get(sandbox === true ? 'TIKTOK_SANDBOX_CLIENT_KEY' : 'TIKTOK_CLIENT_KEY');
    if (!clientKey) throw new Error('TikTok connection is not configured');
    await assertMetaTokenKey();
    const origin = Deno.env.get('SITE_ORIGIN') ?? 'https://autosocials.com';
    const allowedOrigins = new Set([new URL(origin).origin, 'https://autosocials.com', 'https://www.autosocials.com', 'http://127.0.0.1:4177', 'http://localhost:4177']);
    let redirect = `${origin}/oauth/bridge`;
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
      platform: sandbox === true ? 'tiktok_sandbox' : 'tiktok',
      redirect_to: redirect,
    });
    if (stateError) throw new Error('Could not start secure connection session');

    const redirectUri = `${SUPABASE_URL}/functions/v1/tiktok-oauth-callback`;
    const scopes = ['user.info.basic', 'video.publish', 'video.upload', ...(analytics === true ? ['video.list'] : [])].join(',');

    const authUrl =
      `https://www.tiktok.com/v2/auth/authorize/?client_key=${encodeURIComponent(clientKey)}` +
      `&scope=${encodeURIComponent(scopes)}&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

    return json({ authUrl });
  } catch (e) {
    console.error('tiktok-oauth-init', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
