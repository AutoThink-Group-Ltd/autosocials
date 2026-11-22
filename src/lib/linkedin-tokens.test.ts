import { afterEach, describe, expect, it, vi } from 'vitest';
import { decryptLinkedInToken, encryptLinkedInToken, linkedInTokenContext } from '../../supabase/functions/_shared/linkedin-tokens';

afterEach(() => vi.unstubAllGlobals());
describe('LinkedIn token protection', () => {
  it('binds encrypted credentials to their workspace and account', async () => {
    vi.stubGlobal('Deno', { env: { get: () => 'ab'.repeat(32) } });
    const context = linkedInTokenContext('workspace-a', 'member', 'access');
    const sealed = await encryptLinkedInToken('private-token', context);
    expect(sealed).not.toContain('private-token');
    expect(await decryptLinkedInToken(sealed, context)).toBe('private-token');
    await expect(decryptLinkedInToken(sealed, linkedInTokenContext('workspace-b', 'member', 'access'))).rejects.toThrow();
  });
  it('rejects plaintext tokens', async () => {
    await expect(decryptLinkedInToken('plain', 'context')).rejects.toThrow('not encrypted');
  });
});
