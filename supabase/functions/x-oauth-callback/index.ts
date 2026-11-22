import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
import { encryptXToken, exchangeXToken, xTokenContext } from '../_shared/x-tokens.ts';
const origin = 'https://autosocials.com';
const callback = `${origin}/api/oauth/x/callback`;
function redirect(query: Record<string,string>, dest: string) { const url = new URL(dest); for (const [k,v] of Object.entries(query)) url.searchParams.set(k,v); return new Response(null, { status:302, headers:{ Location:url.toString(), 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' } }); }
Deno.serve(async req => {
  const url = new URL(req.url), state = url.searchParams.get('state'), code = url.searchParams.get('code');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let dest = `${origin}/oauth/bridge`;
  try {
    if (!state) throw new Error('Invalid X connection session.');
    const { data: session, error } = await admin.from('x_oauth_states').delete().eq('state',state).gt('expires_at',new Date().toISOString()).select('*').maybeSingle();
    if (error || !session) throw new Error('X connection session expired. Please reconnect.');
    if (session.redirect_to) { const target = new URL(session.redirect_to); if (!['https://autosocials.com','https://www.autosocials.com'].includes(target.origin) || !['/oauth/bridge','/app/settings/connections'].includes(target.pathname)) throw new Error('Invalid return destination.'); dest = target.toString(); }
    if (!await canManageMetaAccounts(admin, session.user_id, session.workspace_id)) throw new Error('Workspace management access changed. Please reconnect.');
    if (!code || url.searchParams.has('error')) throw new Error('X authorization was declined.');
    const tokens = await exchangeXToken(new URLSearchParams({ grant_type:'authorization_code', code, redirect_uri:callback, code_verifier:session.verifier }));
    const scopes = (tokens.scope ?? '').split(' ').filter(Boolean);
    if (!['tweet.read','tweet.write','users.read','offline.access','media.write'].every(scope => scopes.includes(scope))) throw new Error('X did not grant the required permissions. Please reconnect.');
    const profileResponse = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url', { headers:{ Authorization:`Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json();
    const user = profile?.data;
    if (!profileResponse.ok || typeof user?.id !== 'string' || typeof user?.username !== 'string') throw new Error('Could not identify the X account.');
    const { error: saveError } = await admin.rpc('save_x_oauth_account', { _account:{ workspace_id:session.workspace_id, external_id:user.id, handle:user.username, display_name:user.name ?? null, avatar_url:user.profile_image_url ?? null, access_token:await encryptXToken(tokens.access_token,xTokenContext(session.workspace_id,user.id,'access')), refresh_token:await encryptXToken(tokens.refresh_token,xTokenContext(session.workspace_id,user.id,'refresh')), scopes, expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(), connected_by:session.user_id } });
    if (saveError) throw new Error('Could not save the X connection.');
    return redirect({ status:'connected', connected:'x' },dest);
  } catch (e) { console.error('x-oauth-callback',e instanceof Error ? e.message : 'failed'); return redirect({ status:'error', error:e instanceof Error ? e.message : 'X connection failed.' },dest); }
});
