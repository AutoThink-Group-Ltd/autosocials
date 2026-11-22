// Handles Meta OAuth callback: exchanges code for long-lived token,
// fetches the user's Facebook Pages and connected Instagram Business accounts,
// upserts each as a row in social_accounts, then 302-redirects back to the app.

import { assertMetaTokenKey, encryptMetaToken } from '../_shared/meta-tokens.ts';
import { canManageMetaAccounts } from '../_shared/meta-workspace-access.ts';

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APP_ORIGIN = Deno.env.get('SITE_ORIGIN') ?? 'https://autosocials.com';

function popupResponse(params: Record<string, string>, fallbackUrl: string) {
  const search = new URLSearchParams(params).toString();
  const fallback = `${fallbackUrl}${fallbackUrl.includes('?') ? '&' : '?'}${search}`;
  // Edge function HTML is served with a restrictive sandbox in this environment,
  // so redirect the popup to the app-owned bridge page where JS can run and close
  // the popup reliably.
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
  const META_APP_ID = Deno.env.get('META_APP_ID')!;
  const META_APP_SECRET = Deno.env.get('META_APP_SECRET')!;

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Default redirect target if anything goes wrong before we resolve state
  let appRedirect = `${APP_ORIGIN}/app/settings/connections`;

  try {
    if (!state) throw new Error('Missing state');
    const { data: stateRow, error: stateErr } = await admin
      .from('oauth_states').delete().eq('state', state).eq('platform', 'meta').gt('expires_at', new Date().toISOString()).select('*').maybeSingle();
    if (stateErr || !stateRow) throw new Error('Invalid or expired state');
    if (!await canManageMetaAccounts(admin, stateRow.user_id, stateRow.workspace_id)) throw new Error('Workspace access changed. Please reconnect.');
    if (stateRow.redirect_to) {
      const target = new URL(stateRow.redirect_to);
      const allowed = new Set([new URL(APP_ORIGIN).origin, 'https://autosocials.com', 'https://www.autosocials.com', 'http://127.0.0.1:4177', 'http://localhost:4177']);
      if (!allowed.has(target.origin) || !['/oauth/bridge', '/app/settings/connections'].includes(target.pathname) || target.username || target.password) throw new Error('Invalid redirect destination');
      appRedirect = target.origin + target.pathname;
    }

    await assertMetaTokenKey();
    if (errorParam) throw new Error(errorParam);
    if (!code) throw new Error('Missing code');

    const redirectUri = `${SUPABASE_URL}/functions/v1/meta-oauth-callback`;

    // Exchange code → short-lived token
    const tokenRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${META_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&client_secret=${META_APP_SECRET}&code=${code}`,
    );
    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokenJson.error?.message ?? 'Token exchange failed');
    const shortToken = tokenJson.access_token as string;

    // Exchange short → long-lived (60 days)
    const longRes = await fetch(
      `https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token` +
        `&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${shortToken}`,
    );
    const longJson = await longRes.json();
    if (!longRes.ok || !longJson.access_token) throw new Error('Could not establish a long-lived Meta connection');
    const userToken: string = longJson.access_token;
    const expiresIn: number | undefined = longJson.expires_in;
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;

    const permissionResponse = await fetch('https://graph.facebook.com/v21.0/me/permissions?access_token=' + encodeURIComponent(userToken));
    const permissionData = await permissionResponse.json();
    if (!permissionResponse.ok) throw new Error('Could not verify Meta permissions. Please reconnect.');
    const grantedScopes: string[] = (permissionData.data ?? []).filter((entry: { status: string }) => entry.status === 'granted').map((entry: { permission: string }) => entry.permission);

    // Traverse all Page cursors without exposing provider URLs or credentials.
    type Page = { id: string; name: string; access_token: string; tasks?: string[]; instagram_business_account?: { id: string; username?: string; profile_picture_url?: string; name?: string } };
    const pages: Page[] = [];
    let after: string | undefined;
    const cursors = new Set<string>();
    do {
      const params = new URLSearchParams({ fields: 'id,name,access_token,tasks,instagram_business_account{id,username,profile_picture_url,name}', limit: '100', access_token: userToken });
      if (after) params.set('after', after);
      const response = await fetch('https://graph.facebook.com/v21.0/me/accounts?' + params);
      const result = await response.json();
      if (!response.ok || result.error) throw new Error('Could not retrieve all Facebook Pages. Please reconnect.');
      pages.push(...(result.data ?? []));
      after = result.paging?.next ? result.paging?.cursors?.after : undefined;
      if (after && cursors.has(after)) throw new Error('Meta returned an incomplete Page list. Please retry.');
      if (after) cursors.add(after);
    } while (after);

    if (pages.length === 0) throw new Error('No Facebook Pages found on this account');

    // Stash pages for the user to pick from — nothing is saved to social_accounts yet.
    const { data: pending, error: pendingErr } = await admin
      .from('meta_oauth_pending')
      .insert({
        workspace_id: stateRow.workspace_id,
        user_id: stateRow.user_id,
        user_access_token: await encryptMetaToken(userToken, `pending:${stateRow.workspace_id}:${stateRow.user_id}:user`),
        pages: await Promise.all(pages.map(async (p) => ({
          id: p.id,
          name: p.name,
          access_token: await encryptMetaToken(p.access_token, `pending:${stateRow.workspace_id}:${stateRow.user_id}:page:${p.id}`),
          instagram_business_account: p.instagram_business_account ?? null,
          tasks: p.tasks ?? [],
          granted_scopes: grantedScopes,
          token_expires_at: expiresAt,
        }))),
        expires_at: expiresAt
          ? new Date(Math.min(Date.now() + 30 * 60 * 1000, new Date(expiresAt).getTime())).toISOString()
          : new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();
    if (pendingErr || !pending) throw new Error(pendingErr?.message ?? 'Failed to stash pages');

    await admin.from('oauth_states').delete().eq('state', state);

    return popupResponse({ status: 'meta_select', meta_select: pending.id }, appRedirect);
  } catch (e) {
    console.error('meta-oauth-callback failed');
    const msg = e instanceof Error ? e.message : String(e);
    return popupResponse({ status: 'error', error: msg }, appRedirect);
  }
});
