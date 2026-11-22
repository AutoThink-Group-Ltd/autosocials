// Imports one page per invocation. The browser/worker can resume from the saved
// provider cursor without accepting arbitrary URLs or cursors from callers.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { decryptMetaToken } from '../_shared/meta-tokens.ts';
import { tiktokAccessToken } from '../_shared/tiktok-tokens.ts';
import { decryptYouTubeToken, encryptYouTubeToken, youtubeTokenContext } from '../_shared/youtube-tokens.ts';
import { metaPage, youtubePage, tiktokPage, json, ProviderFailure, type Account } from '../_shared/winner-providers.ts';
import { isWinnerWorker } from '../_shared/winner-worker-auth.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
function reply(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers }); }

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL')!, serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const admin = createClient(url, serviceKey);
  const worker = await isWinnerWorker(req, admin);
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
  const user = worker ? null : (await userClient.auth.getUser()).data.user;
  if (!worker && !user) return reply({ error: 'Unauthorized' }, 401);
  let input: any; try { input = await req.json(); } catch { return reply({ error: 'Invalid request' }, 400); }
  if (typeof input?.account_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.account_id)) return reply({ error: 'Invalid account' }, 400);
  const { data: raw } = await admin.from('social_accounts').select('id,workspace_id,platform,external_id,access_token,refresh_token,expires_at,scopes,status,is_enabled,metadata').eq('id', input.account_id).maybeSingle();
  if (!raw) return reply({ error: 'Account not found' }, 404);
  const account = raw as Account;
  if (!worker) {
    const { data: allowed, error } = await admin.rpc('can_access_workspace', { _user_id: user!.id, _workspace_id: account.workspace_id });
    if (error || !allowed) return reply({ error: 'Forbidden' }, 403);
  }
  if (!account.is_enabled || account.status !== 'connected') return reply({ error: 'Reconnect this account before syncing.' }, 400);
  const { data: lease, error: leaseError } = await admin.rpc('claim_winner_sync', { _account_id: account.id });
  if (leaseError) return reply({ error: 'Could not start account sync.' }, 500);
  if (!lease) return reply({ status: 'syncing', has_more: false, imported: 0 });
  const { data: previous } = await admin.from('winner_syncs').select('cursor,last_success_at').eq('account_id', account.id).maybeSingle();
  try {
    let token = account.access_token;
    if (account.platform === 'facebook' || account.platform === 'instagram') token = await decryptMetaToken(token, `account:${account.workspace_id}:${account.platform}:${account.external_id}`);
    else if (account.platform === 'youtube') {
      token = await decryptYouTubeToken(token, youtubeTokenContext(account.workspace_id, account.external_id, 'access'));
      if (account.expires_at && Date.parse(account.expires_at) <= Date.now() + 60_000) {
        if (!account.refresh_token) throw new ProviderFailure('Reconnect YouTube to refresh access.', 'reconnect');
        const refresh = await decryptYouTubeToken(account.refresh_token, youtubeTokenContext(account.workspace_id, account.external_id, 'refresh'));
        const refreshed = await json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: Deno.env.get('GOOGLE_OAUTH_CLIENT_ID') ?? '', client_secret: Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET') ?? '', refresh_token: refresh, grant_type: 'refresh_token' }) });
        if (typeof refreshed.access_token !== 'string') throw new ProviderFailure('Reconnect YouTube to refresh access.', 'reconnect');
        token = refreshed.access_token;
        const saved = await admin.from('social_accounts').update({ access_token: await encryptYouTubeToken(token, youtubeTokenContext(account.workspace_id, account.external_id, 'access')), expires_at: new Date(Date.now() + Number(refreshed.expires_in ?? 3600) * 1000).toISOString() }).eq('id', account.id).eq('workspace_id', account.workspace_id).eq('access_token', account.access_token);
        if (saved.error) throw new ProviderFailure('Could not save refreshed YouTube access.');
      }
    } else if (account.platform === 'tiktok') {
      if (!account.scopes?.includes('video.list')) throw new ProviderFailure('TikTok video history needs the video.list permission and provider approval. Reconnect when that permission is available.', 'reconnect');
      try { token = await tiktokAccessToken(admin, account); }
      catch { throw new ProviderFailure('TikTok access could not be renewed safely. Reconnect the account.', 'reconnect'); }
    } else throw new ProviderFailure('Intelligence is not supported for this account.', 'unsupported');
    const page = account.platform === 'youtube' ? await youtubePage(account, token, previous?.cursor ?? null) : account.platform === 'tiktok' ? await tiktokPage(token, previous?.cursor ?? null) : await metaPage(account, token, previous?.cursor ?? null);
    const current = await admin.from('social_accounts').select('status,is_enabled').eq('id', account.id).eq('workspace_id', account.workspace_id).maybeSingle();
    if (current.error || !current.data || current.data.status !== 'connected' || !current.data.is_enabled) throw new ProviderFailure('The account was disconnected during sync.', 'reconnect');
    const externalIds = page.rows.map(p => p.external_id);
    const { data: targets, error: targetError } = externalIds.length ? await admin.from('post_targets').select('id,platform_post_id').eq('social_account_id', account.id).in('platform_post_id', externalIds) : { data: [], error: null };
    if (targetError) throw new ProviderFailure('Could not match the imported posts.');
    const targetsById = new Map((targets ?? []).map((t: any) => [t.platform_post_id, t.id]));
    const now = new Date().toISOString();
    const rows = page.rows.map(p => ({ ...p, account_id: account.id, workspace_id: account.workspace_id, platform: account.platform, post_target_id: targetsById.get(p.external_id) ?? null, measured_at: now }));
    if (rows.length) { const saved = await admin.from('winner_posts').upsert(rows, { onConflict: 'account_id,external_id' }); if (saved.error) throw new ProviderFailure('Could not save imported posts.'); }
    const missingInsights = account.platform === 'instagram' ? !account.scopes?.includes('instagram_manage_insights') : account.platform === 'facebook' ? !account.scopes?.includes('read_insights') : false;
    const partial = page.cursor !== null || missingInsights || rows.some(p => p.comments_status === 'unavailable');
    const status = partial ? 'partial' : 'ready';
    const notices = [page.cursor ? 'More account history is waiting to sync.' : '', missingInsights ? 'Some reach and view metrics need additional insights permissions in Connected accounts.' : '', rows.some(p => p.comments_status === 'unavailable') ? 'Some comments are unavailable with the current platform permissions.' : '', account.platform === 'tiktok' ? 'TikTok comment text is unavailable through this connection.' : ''].filter(Boolean);
    const message = notices.length ? notices.join(' ') : null;
    const update = await admin.from('winner_syncs').update({ status, message, cursor: page.cursor, last_success_at: now, lease_until: now }).eq('account_id', account.id).eq('workspace_id', account.workspace_id).eq('lease_token', lease);
    if (update.error) throw new ProviderFailure('Could not save sync progress.');
    return reply({ status, has_more: !!page.cursor, imported: rows.length });
  } catch (error) {
    const failure = error instanceof ProviderFailure ? error : new ProviderFailure('Could not sync this account. Try again later.');
    await admin.from('winner_syncs').update({ status: failure.status, message: failure.message, lease_until: new Date().toISOString() }).eq('account_id', account.id).eq('workspace_id', account.workspace_id).eq('lease_token', lease);
    return reply({ error: failure.message, status: failure.status }, 502);
  }
});
