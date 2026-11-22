import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const callback = 'https://autosocials.com/api/oauth/x/callback';
function base64url(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replaceAll('=',''); }
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const url = Deno.env.get('SUPABASE_URL')!, id = Deno.env.get('X_CLIENT_KEY');
    if (!id || !Deno.env.get('X_CLIENT_SECRET') || !/^[a-f0-9]{64}$/i.test(Deno.env.get('PUBLISH_META_TOKEN_KEY') ?? '')) throw new Error('X OAuth is not configured.');
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await client.auth.getUser(); if (!user) return json({ error: 'Unauthorized' }, 401);
    const { workspace_id, redirect_to } = await req.json();
    if (typeof workspace_id !== 'string') return json({ error: 'Workspace required' }, 400);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (!await canManageMetaAccounts(admin, user.id, workspace_id)) return json({ error: 'Workspace management access required' }, 403);
    if (redirect_to) { const target = new URL(redirect_to); if (!['https://autosocials.com','https://www.autosocials.com'].includes(target.origin) || !['/oauth/bridge','/app/settings/connections'].includes(target.pathname)) return json({ error: 'Invalid return destination' }, 400); }
    const state = base64url(crypto.getRandomValues(new Uint8Array(32))), verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    const { error } = await admin.from('x_oauth_states').insert({ state, verifier, user_id: user.id, workspace_id, redirect_to: redirect_to ?? null });
    if (error) throw new Error('Could not create a secure X connection session.');
    const params = new URLSearchParams({ response_type:'code', client_id:id, redirect_uri:callback, scope:'tweet.read tweet.write users.read offline.access media.write', state, code_challenge:challenge, code_challenge_method:'S256' });
    return json({ authUrl: `https://x.com/i/oauth2/authorize?${params}` });
  } catch (e) { console.error('x-oauth-init', e instanceof Error ? e.message : 'failed'); return json({ error: 'Could not start X connection.' }, 500); }
});
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type':'application/json', 'Cache-Control':'no-store' } }); }
