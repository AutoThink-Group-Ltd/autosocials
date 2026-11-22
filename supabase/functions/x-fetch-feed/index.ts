import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { decryptXToken, encryptXToken, refreshXToken, xTokenContext } from '../_shared/x-tokens.ts';
import { normalizeXPosts } from './normalize.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

// Share the publisher's persistent rotation lock. An ambiguous refresh keeps its
// lock until reconnect; retrying a potentially consumed refresh token is unsafe.
async function accessToken(admin: any, account: any): Promise<string> {
  const context = (kind: 'access' | 'refresh') => xTokenContext(account.workspace_id, account.external_id, kind);
  const valid = (a: any) => a?.status === 'connected' && a?.is_enabled !== false && a?.expires_at && new Date(a.expires_at).getTime() > Date.now() + 60_000;
  if (valid(account)) return decryptXToken(account.access_token, context('access'));
  if (!account.refresh_token) throw new Error('Reconnect this X account to renew its permission.');
  const lockId = crypto.randomUUID();
  const { data: claimed, error: lockError } = await admin.rpc('claim_x_refresh', { _account_id: account.id, _workspace_id: account.workspace_id, _refresh_token: account.refresh_token, _lock_id: lockId });
  if (lockError || !claimed) {
    const { data: current } = await admin.from('social_accounts').select('access_token, refresh_token, expires_at, status, is_enabled').eq('id', account.id).eq('workspace_id', account.workspace_id).maybeSingle();
    if (current?.refresh_token !== account.refresh_token && valid(current)) return decryptXToken(current.access_token, context('access'));
    throw new Error('X token renewal is in progress or needs reconnection. Try again shortly; reconnect if it persists.');
  }
  const { data: current, error: readError } = await admin.from('social_accounts').select('access_token, refresh_token, expires_at, status, is_enabled').eq('id', account.id).eq('workspace_id', account.workspace_id).maybeSingle();
  if (readError || !current || current.status !== 'connected' || current.is_enabled === false) throw new Error('X account is unavailable. Reconnect this account.');
  if (current.refresh_token !== account.refresh_token) {
    await admin.from('x_refresh_locks').delete().eq('social_account_id', account.id).eq('lock_id', lockId);
    if (valid(current)) return decryptXToken(current.access_token, context('access'));
    throw new Error('X account credentials changed. Try again.');
  }
  try {
    const rotated = await refreshXToken(await decryptXToken(current.refresh_token, context('refresh')));
    const { data: saved, error } = await admin.rpc('complete_x_refresh', {
      _account_id: account.id, _workspace_id: account.workspace_id, _old_refresh: current.refresh_token, _lock_id: lockId,
      _access: await encryptXToken(rotated.access_token, context('access')),
      _refresh: await encryptXToken(rotated.refresh_token, context('refresh')),
      _expires_at: new Date(Date.now() + rotated.expires_in * 1000).toISOString(),
    });
    if (error || !saved) throw new Error('Cannot safely save rotated credentials');
    return rotated.access_token;
  } catch { throw new Error('X permission could not be renewed safely. Reconnect this account.'); }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const body = await req.json().catch(() => null);
    if (!body || typeof body.social_account_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.social_account_id)) return json({ error: 'Invalid social account' }, 400);
    if (body.cursor != null && (typeof body.cursor !== 'string' || body.cursor.length > 4096 || !body.cursor)) return json({ error: 'Invalid feed cursor' }, 400);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: account, error } = await admin.from('social_accounts').select('id, workspace_id, platform, external_id, handle, display_name, avatar_url, access_token, refresh_token, expires_at, status, is_enabled').eq('id', body.social_account_id).eq('platform', 'x').maybeSingle();
    if (error || !account) return json({ error: 'Account not found' }, 404);
    const { data: allowed, error: authError } = await admin.rpc('can_access_workspace', { _user_id: user.id, _workspace_id: account.workspace_id });
    if (authError || !allowed) return json({ error: 'Forbidden' }, 403);
    if (account.status !== 'connected' || account.is_enabled === false) return json({ error: 'This X account is disconnected or disabled.' }, 400);
    const token = await accessToken(admin, account);
    const params = new URLSearchParams({ max_results: '25', 'tweet.fields': 'created_at,public_metrics,attachments', expansions: 'attachments.media_keys', 'media.fields': 'url,preview_image_url,type,variants' });
    if (body.cursor) params.set('pagination_token', body.cursor);
    const response = await fetch(`https://api.x.com/2/users/${encodeURIComponent(account.external_id)}/tweets?${params}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      if (response.status === 401) return json({ error: 'X rejected this connection. Reconnect the account.' }, 401);
      if (response.status === 429) return json({ error: 'X rate limit reached. Try again later.' }, 429);
      return json({ error: 'Could not load posts from X. Check account access and try again.' }, 502);
    }
    const result = await response.json();
    const posts = normalizeXPosts(result);
    // Do not deliver results if the account was disconnected during the request.
    const { data: current, error: currentError } = await admin.from('social_accounts')
      .select('status, is_enabled, external_id').eq('id', account.id).eq('workspace_id', account.workspace_id).eq('platform', 'x').maybeSingle();
    if (currentError || !current || current.status !== 'connected' || current.is_enabled === false || current.external_id !== account.external_id)
      return json({ error: 'This X account is disconnected or disabled.' }, 400);
    return json({ account: { handle: account.handle ?? '', display_name: account.display_name ?? account.handle ?? '', avatar_url: account.avatar_url ?? null, platform: 'x' }, posts, next_cursor: result.meta?.next_token ?? null, fetched_at: new Date().toISOString() });
  } catch (error) {
    console.error('x-fetch-feed failed');
    return json({ error: error instanceof Error && /^(Reconnect|X token renewal|X account|X permission)/.test(error.message) ? error.message : 'Could not load posts from X.' }, 500);
  }
});
