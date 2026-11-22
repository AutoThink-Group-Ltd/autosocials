import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
import { YOUTUBE_SCOPES } from '../_shared/youtube-oauth.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  try {
    const url = Deno.env.get('SUPABASE_URL')!, adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID');
    if (!clientId || !Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')) throw new Error('Google YouTube OAuth is not configured.');
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await userClient.auth.getUser(); if (!user) return json({ error: 'Unauthorized' }, 401);
    const { workspace_id, redirect_to } = await req.json();
    const admin = createClient(url, adminKey);
    if (!await canManageMetaAccounts(admin, user.id, workspace_id)) return json({ error: 'Workspace management access required' }, 403);
    const state = crypto.randomUUID();
    const { error } = await admin.from('oauth_states').insert({ state, user_id: user.id, workspace_id, platform: 'youtube', redirect_to: redirect_to ?? null });
    if (error) throw new Error('Could not create a secure Google connection session.');
    const callback = `${url}/functions/v1/youtube-oauth-callback`;
    const params = new URLSearchParams({ client_id: clientId, redirect_uri: callback, response_type: 'code', scope: YOUTUBE_SCOPES.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'false', state });
    return json({ authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (e) { console.error('youtube-oauth-init', e); return json({ error: e instanceof Error ? e.message : 'OAuth setup failed' }, 500); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
