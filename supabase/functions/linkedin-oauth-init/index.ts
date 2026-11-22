import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';
import { COMPANY_SCOPES } from '../_shared/linkedin-company.ts';
import { linkedInOAuthClient } from '../_shared/linkedin-oauth-client.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const publicOrigins = () => {
  const configured = Deno.env.get('LINKEDIN_OAUTH_APP_ORIGIN');
  if (!configured) return ['https://autosocials.com', 'https://www.autosocials.com'];
  const url = new URL(configured);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('LinkedIn return origin is not configured correctly.');
  return [url.origin];
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    const url = Deno.env.get('SUPABASE_URL')!;
    const callback = `${url.replace(/\/+$/, '')}/functions/v1/linkedin-oauth-callback`;
    if (!/^[a-f0-9]{64}$/i.test(Deno.env.get('PUBLISH_META_TOKEN_KEY') ?? '')) throw new Error('LinkedIn OAuth is not configured.');
    const client = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const { workspace_id, redirect_to, account_kind = 'profile' } = await req.json();
    if (account_kind !== 'profile' && account_kind !== 'company') return json({error:'Invalid LinkedIn account type'},400);
    if (typeof workspace_id !== 'string') return json({ error: 'Workspace required' }, 400);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (!await canManageMetaAccounts(admin, user.id, workspace_id)) return json({ error: 'Workspace management access required' }, 403);
    const { id } = linkedInOAuthClient(account_kind, name => Deno.env.get(name));
    if (redirect_to) { const target = new URL(redirect_to); if (!publicOrigins().includes(target.origin) || !['/oauth/bridge','/app/settings/connections'].includes(target.pathname)) return json({ error: 'Invalid return destination' }, 400); }
    const state = Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('');
    const { error } = await admin.from('linkedin_oauth_states').insert({ state, user_id: user.id, workspace_id, redirect_to: redirect_to ?? null, account_kind });
    if (error) throw new Error('Could not create a secure LinkedIn connection session.');
    const scope = account_kind === 'company' ? COMPANY_SCOPES.join(' ') : 'openid profile w_member_social';
    const params = new URLSearchParams({ response_type: 'code', client_id: id, redirect_uri: callback, scope, state });
    return json({ authUrl: `https://www.linkedin.com/oauth/v2/authorization?${params}` });
  } catch (e) { console.error('linkedin-oauth-init', e instanceof Error ? e.message : 'failed'); return json({ error: 'Could not start LinkedIn connection.' }, 500); }
});
