import { describe, expect, it, vi } from 'vitest';
import { encryptMetaToken, decryptMetaToken } from '../../supabase/functions/_shared/meta-tokens.ts';
import { tiktokAccessToken } from '../../supabase/functions/_shared/tiktok-tokens.ts';

const context = 'account:w:tiktok:e';
async function fixture() {
  vi.stubGlobal('Deno', { env: { get: () => 'ab'.repeat(32) } });
  const account = { id: 'a', workspace_id: 'w', external_id: 'e', access_token: await encryptMetaToken('old-access', context), refresh_token: await encryptMetaToken('old-refresh', `${context}:refresh`), expires_at: '2020-01-01T00:00:00Z', status: 'connected', is_enabled: true };
  let stored = { ...account }, locked = false;
  const admin = {
    rpc: vi.fn(async (name: string, args: any) => {
      if (name === 'claim_tiktok_refresh') {
        if (locked || stored.refresh_token !== args._refresh_token) return { data: false };
        locked = true; return { data: true };
      }
      if (name === 'complete_tiktok_refresh') {
        if (!locked || stored.refresh_token !== args._old_refresh) return { data: false };
        stored = { ...stored, access_token: args._access, refresh_token: args._refresh, expires_at: args._expires_at }; locked = false;
        return { data: true };
      }
      throw new Error('Unexpected RPC');
    }),
    from: () => ({ select: () => ({ eq() { return this; }, maybeSingle: async () => ({ data: stored }) }) }),
  };
  return { account, admin, get stored() { return stored; }, get locked() { return locked; }, reconnect: async () => { stored = { ...stored, access_token: await encryptMetaToken('reconnected', context), refresh_token: await encryptMetaToken('reconnected-refresh', `${context}:refresh`), expires_at: new Date(Date.now() + 3_600_000).toISOString() }; locked = false; } };
}
const env = () => 'configured';

describe('TikTok refresh rotation', () => {
  it('rotates once while a concurrent claimant fails closed', async () => {
    const f = await fixture(); let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const request = vi.fn(async () => { await waiting; return new Response(JSON.stringify({ access_token: 'new', refresh_token: 'new-refresh', expires_in: 3600 })); });
    const first = tiktokAccessToken(f.admin, f.account, { request, env });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    await expect(tiktokAccessToken(f.admin, f.account, { request, env })).rejects.toThrow('renewed safely');
    release(); expect(await first).toBe('new');
    expect(await decryptMetaToken(f.stored.refresh_token, `${context}:refresh`)).toBe('new-refresh');
    expect(await tiktokAccessToken(f.admin, f.account, { request, env })).toBe('new');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not overwrite a reconnect that occurs while refresh is in flight', async () => {
    const f = await fixture();
    const request = vi.fn(async () => { await f.reconnect(); return new Response(JSON.stringify({ access_token: 'stale', refresh_token: 'stale-refresh', expires_in: 3600 })); });
    await expect(tiktokAccessToken(f.admin, f.account, { request, env })).rejects.toThrow('renewed safely');
    expect(await decryptMetaToken(f.stored.access_token, context)).toBe('reconnected');
  });
  it('retains the lock when refresh outcome is ambiguous', async () => {
    const f = await fixture(); const request = vi.fn(async () => { throw new Error('network'); });
    await expect(tiktokAccessToken(f.admin, f.account, { request, env })).rejects.toThrow('renewed safely');
    expect(f.locked).toBe(true);
    await expect(tiktokAccessToken(f.admin, f.account, { request, env })).rejects.toThrow('renewed safely');
    expect(request).toHaveBeenCalledTimes(1);
  });
});
