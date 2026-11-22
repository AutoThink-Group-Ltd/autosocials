import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
import { encryptLinkedInToken, linkedInTokenContext } from '../_shared/linkedin-tokens.ts';
import { hasRequiredLinkedInScopes } from '../_shared/linkedin-scopes.ts';
import { COMPANY_SCOPES, listLinkedInPages } from '../_shared/linkedin-company.ts';
import { linkedInOAuthClient } from '../_shared/linkedin-oauth-client.ts';

const publicOrigins = () => {
  const configured = Deno.env.get('LINKEDIN_OAUTH_APP_ORIGIN');
  if (!configured) return ['https://autosocials.com', 'https://www.autosocials.com'];
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('LinkedIn return origin is not configured correctly.');
  return [url.origin];
};
function redirect(query: Record<string, string>, dest: string) { const url = new URL(dest); for (const [k,v] of Object.entries(query)) url.searchParams.set(k,v); return new Response(null, { status: 302, headers: { Location: url.toString(), 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' } }); }
Deno.serve(async req => {
  const url = new URL(req.url), state = url.searchParams.get('state'), code = url.searchParams.get('code');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const callback = `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/linkedin-oauth-callback`;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let dest = `${publicOrigins()[0]}/oauth/bridge`;
  try {
    if (!state) throw new Error('Invalid LinkedIn connection session.');
    const { data: session, error } = await admin.from('linkedin_oauth_states').delete().eq('state', state).gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
    if (error || !session) throw new Error('LinkedIn connection session expired. Please reconnect.');
    if (session.redirect_to) { const target = new URL(session.redirect_to); if (!publicOrigins().includes(target.origin) || !['/oauth/bridge','/app/settings/connections'].includes(target.pathname)) throw new Error('Invalid return destination.'); dest = target.toString(); }
    if (!await canManageMetaAccounts(admin, session.user_id, session.workspace_id)) throw new Error('Workspace management access changed. Please reconnect.');
    const company = session.account_kind === 'company';
    if (!code || url.searchParams.has('error')) {
      if (company && ['unauthorized_scope_error','invalid_scope'].includes(url.searchParams.get('error') ?? ''))
        throw new Error('LinkedIn has not granted this app Community Management access for Company Pages.');
      throw new Error('LinkedIn authorization was declined.');
    }
    const oauth = linkedInOAuthClient(company ? 'company' : 'profile', name => Deno.env.get(name));
    const response = await fetch('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type:'authorization_code', code, redirect_uri:callback, client_id:oauth.id, client_secret:oauth.secret }) });
    const tokens = await response.json().catch(() => null);
    if (!response.ok || typeof tokens?.access_token !== 'string' || !tokens.access_token || typeof tokens.expires_in !== 'number' || tokens.expires_in <= 0) throw new Error('LinkedIn token exchange failed. Please reconnect.');
    if (!hasRequiredLinkedInScopes(tokens.scope, company ? COMPANY_SCOPES : undefined)) throw new Error('LinkedIn did not grant the required permissions. Please reconnect.');
    if (company) {
      const pages = await listLinkedInPages(tokens.access_token);
      if (!pages.length) throw new Error('LinkedIn returned no eligible Company Pages. Connect with a LinkedIn account that is a Page super admin.');
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error: cleanupError } = await admin.from('linkedin_pending_pages').delete().lt('expires_at', now);
      if (cleanupError) throw new Error('Could not prepare LinkedIn Page selection.');
      const { error: pendingError } = await admin.from('linkedin_pending_pages').insert({
        id, workspace_id:session.workspace_id, user_id:session.user_id, pages,
        encrypted_token:await encryptLinkedInToken(tokens.access_token, linkedInTokenContext(session.workspace_id, 'pending:' + id, 'access')),
        token_expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(),
      });
      if (pendingError) throw new Error('Could not prepare LinkedIn Page selection.');
      return redirect({ status:'linkedin_select', linkedin_select:id }, dest);
    }
    const profileResponse = await fetch('https://api.linkedin.com/v2/userinfo', { headers: { Authorization: `Bearer ${tokens.access_token}` } });
    const profile = await profileResponse.json();
    if (!profileResponse.ok || typeof profile.sub !== 'string' || !/^[A-Za-z0-9_-]+$/.test(profile.sub)) throw new Error('Could not identify the LinkedIn account.');
    const { error: saveError } = await admin.from('social_accounts').upsert({ workspace_id:session.workspace_id, platform:'linkedin', external_id:profile.sub, handle:null, display_name:typeof profile.name === 'string' ? profile.name : null, avatar_url:typeof profile.picture === 'string' ? profile.picture : null, access_token:await encryptLinkedInToken(tokens.access_token, linkedInTokenContext(session.workspace_id, profile.sub, 'access')), refresh_token:null, scopes:['openid','profile','w_member_social'], expires_at:new Date(Date.now()+tokens.expires_in*1000).toISOString(), token_encrypted_at:new Date().toISOString(), status:'connected', is_enabled:true, last_error:null, connected_by:session.user_id, metadata:{} }, { onConflict:'workspace_id,platform,external_id' });
    if (saveError) throw new Error('Could not save the LinkedIn connection.');
    return redirect({ status:'connected', connected:'linkedin' }, dest);
  } catch (e) { console.error('linkedin-oauth-callback', e instanceof Error ? e.message : 'failed'); return redirect({ status:'error', error:e instanceof Error ? e.message : 'LinkedIn connection failed.' }, dest); }
});
