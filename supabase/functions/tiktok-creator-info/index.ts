// Returns TikTok's current posting options without exposing the account token.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { tiktokAccessToken } from '../_shared/tiktok-tokens.ts';
import { creatorPostingOptions } from '../_shared/tiktok-creator-info.ts';

const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return reply({ error: 'Unauthorized' }, 401);
    const input = await req.json().catch(() => null);
    if (typeof input?.account_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.account_id)) return reply({ error: 'Invalid account' }, 400);
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: account, error } = await admin.from('social_accounts').select('id,workspace_id,external_id,access_token,refresh_token,expires_at,status,is_enabled,metadata').eq('id', input.account_id).eq('platform', 'tiktok').maybeSingle();
    if (error || !account) return reply({ error: 'Account not found' }, 404);
    const access = await admin.rpc('can_access_workspace', { _user_id: user.id, _workspace_id: account.workspace_id });
    if (access.error || !access.data) return reply({ error: 'Forbidden' }, 403);
    if (account.status !== 'connected' || !account.is_enabled) return reply({ error: 'Reconnect TikTok before publishing.' }, 400);
    let token: string;
    try { token = await tiktokAccessToken(admin, account); }
    catch { return reply({ error: 'Reconnect TikTok before publishing.' }, 400); }
    const result = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(12000) });
    const body = await result.json();
    if (!result.ok || body.error?.code !== 'ok') return reply({ error: 'TikTok could not provide posting options. Check the account and try again later.' }, 502);
    try { return reply(creatorPostingOptions(body.data)); }
    catch { return reply({ error: 'TikTok returned incomplete posting options. Please try again later.' }, 502); }
  } catch {
    return reply({ error: 'Could not load TikTok posting options.' }, 500);
  }
});
