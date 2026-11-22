import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptXToken, encryptXToken, exchangeXToken, refreshXToken, xTokenContext } from '../../supabase/functions/_shared/x-tokens';

const env: Record<string, string> = {
  PUBLISH_META_TOKEN_KEY: 'ab'.repeat(32),
  X_CLIENT_KEY: 'client-id',
  X_CLIENT_SECRET: 'client-secret',
};

beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('Deno', { env: { get: (name: string) => env[name] } });
});
afterEach(() => vi.unstubAllGlobals());

describe('X token envelopes', () => {
  it('round-trips tokens while binding them to workspace, account and token kind', async () => {
    const context = xTokenContext('workspace-1', 'account-1', 'access');
    const sealed = await encryptXToken('secret-access-token', context);
    expect(sealed).toMatch(/^x:v1:/);
    expect(sealed).not.toContain('secret-access-token');
    await expect(decryptXToken(sealed, context)).resolves.toBe('secret-access-token');
    for (const other of [
      xTokenContext('workspace-2', 'account-1', 'access'),
      xTokenContext('workspace-1', 'account-2', 'access'),
      xTokenContext('workspace-1', 'account-1', 'refresh'),
    ]) await expect(decryptXToken(sealed, other)).rejects.toThrow();
    await expect(decryptXToken('plaintext-token', context)).rejects.toThrow();
    const [prefix, version, iv, ciphertext] = sealed.split(':');
    if (!ciphertext) throw new Error('Missing ciphertext');
    const altered = `${prefix}:${version}:${iv}:${ciphertext[0] === 'A' ? 'B' : 'A'}${ciphertext.slice(1)}`;
    await expect(decryptXToken(altered, context)).rejects.toThrow();
    expect(await encryptXToken('secret-access-token', context)).not.toBe(sealed);
  });

  it('rejects malformed encryption configuration', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'not-a-key' } });
    await expect(encryptXToken('token', 'context')).rejects.toThrow('encryption is not configured');
  });
});

describe('X token exchange', () => {
  it('sends refresh credentials with client authentication and returns rotated tokens', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 7200, scope: 'tweet.write media.write' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(refreshXToken('old-refresh')).resolves.toMatchObject({ access_token: 'new-access', refresh_token: 'new-refresh' });
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('Missing token request');
    const [url, request] = call;
    expect(url).toBe('https://api.x.com/2/oauth2/token');
    expect(request.headers.Authorization).toBe(`Basic ${btoa('client-id:client-secret')}`);
    expect(request.body.get('grant_type')).toBe('refresh_token');
    expect(request.body.get('refresh_token')).toBe('old-refresh');
  });

  it.each([
    [400, { access_token: 'a', refresh_token: 'r', expires_in: 60 }],
    [200, { access_token: 'a', expires_in: 60 }],
    [200, { access_token: 'a', refresh_token: 'r', expires_in: 0 }],
  ])('rejects HTTP %s or an incomplete token response', async (status, body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));
    await expect(exchangeXToken(new URLSearchParams({ grant_type: 'authorization_code' }))).rejects.toThrow('X token exchange failed');
  });
});
