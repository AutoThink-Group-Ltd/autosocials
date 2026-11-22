import { decryptMetaToken, encryptMetaToken } from './meta-tokens.ts';

type TikTokAccount = { id: string; workspace_id: string; external_id: string; access_token: string; refresh_token?: string | null; expires_at?: string | null; status?: string | null; is_enabled?: boolean | null; metadata?: Record<string, unknown> | null };
type Dependencies = { request?: typeof fetch; env?: (name: string) => string | undefined };
const message = 'TikTok access could not be renewed safely. Reconnect the account.';
const valid = (a: TikTokAccount) => a.status !== 'disconnected' && a.is_enabled !== false && !!a.expires_at && Number.isFinite(Date.parse(a.expires_at)) && Date.parse(a.expires_at) > Date.now() + 60_000;

/** Rotating refresh credentials are guarded by a persistent, non-expiring account lock. */
export async function tiktokAccessToken(admin: any, account: TikTokAccount, deps: Dependencies = {}): Promise<string> {
  const tokenContext = `account:${account.workspace_id}:tiktok:${account.external_id}`;
  if (valid(account)) return decryptMetaToken(account.access_token, tokenContext);
  if (!account.refresh_token) throw new Error(message);
  const lockId = crypto.randomUUID();
  const claim = await admin.rpc('claim_tiktok_refresh', { _account_id: account.id, _workspace_id: account.workspace_id, _refresh_token: account.refresh_token, _lock_id: lockId });
  if (claim.error || !claim.data) {
    const current = await admin.from('social_accounts').select('access_token,refresh_token,expires_at,status,is_enabled').eq('id', account.id).eq('workspace_id', account.workspace_id).maybeSingle();
    if (!current.error && current.data && current.data.refresh_token !== account.refresh_token && valid(current.data))
      return decryptMetaToken(current.data.access_token, tokenContext);
    throw new Error(message);
  }
  // Re-read after claiming; do not consume credentials changed by reconnect.
  const current = await admin.from('social_accounts').select('access_token,refresh_token,expires_at,status,is_enabled').eq('id', account.id).eq('workspace_id', account.workspace_id).maybeSingle();
  if (current.error || !current.data || current.data.refresh_token !== account.refresh_token || current.data.status === 'disconnected' || current.data.is_enabled === false) throw new Error(message);
  try {
    const refresh = await decryptMetaToken(current.data.refresh_token, `${tokenContext}:refresh`);
    const env = deps.env ?? ((name: string) => Deno.env.get(name));
    const sandbox = account.metadata?.tiktok_sandbox === true;
    const clientKey = env(sandbox ? 'TIKTOK_SANDBOX_CLIENT_KEY' : 'TIKTOK_CLIENT_KEY');
    const clientSecret = env(sandbox ? 'TIKTOK_REVIEW_SANDBOX_SECRET' : 'TIKTOK_CLIENT_SECRET');
    if (!clientKey || !clientSecret) throw new Error();
    const response = await (deps.request ?? fetch)('https://open.tiktokapis.com/v2/oauth/token/', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refresh }), signal: AbortSignal.timeout(20_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.access_token !== 'string' || !body.access_token || typeof body.refresh_token !== 'string' || !body.refresh_token || typeof body.expires_in !== 'number' || !Number.isFinite(body.expires_in) || body.expires_in <= 0) throw new Error();
    const expires = new Date(Date.now() + body.expires_in * 1000).toISOString();
    const completed = await admin.rpc('complete_tiktok_refresh', { _account_id: account.id, _workspace_id: account.workspace_id, _old_refresh: account.refresh_token, _lock_id: lockId,
      _access: await encryptMetaToken(body.access_token, tokenContext), _refresh: await encryptMetaToken(body.refresh_token, `${tokenContext}:refresh`), _expires_at: expires });
    if (completed.error || !completed.data) throw new Error();
    return body.access_token;
  } catch { throw new Error(message); }
}
