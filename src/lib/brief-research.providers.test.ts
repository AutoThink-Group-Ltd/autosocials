import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ ai: vi.fn(), execute: vi.fn(), cleanup: vi.fn() }));
vi.mock('./openai-quota.server', () => ({ fetchOpenAI: mocks.ai }));
vi.mock('./virlo-execute.server', () => ({ executeVirloOperation: mocks.execute }));
vi.mock('./virlo-db.server', () => ({ virloDb: () => ({ from: () => { const chain: any = { update: () => chain, eq: () => chain, then: (resolve: (v: unknown) => void) => Promise.resolve(mocks.cleanup()).then(resolve) }; return chain; } }) }));
import { researchBrief } from './brief-research.server';
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetAllMocks(); });
describe('gallery research', () => {
  it('plans once, searches both platforms, deduplicates posts and reports failures', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test');
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    mocks.ai.mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify({ title: 'Examples', groups: [{ title: 'Families', query: 'printed shirts for families' }] }) } }] }));
    mocks.execute.mockImplementation(async ({ operation }: { operation: { platform: string } }) => {
      if (operation.platform === 'instagram') throw new Error('unavailable');
      return { id: 'child', data: { result: { posts: [{ url: 'https://www.tiktok.com/@maker/video/123', stats: { views: 42 } }, { url: 'https://www.tiktok.com/@maker/video/123?duplicate=1' }] } } };
    });
    mocks.cleanup.mockReturnValue({ error: null });
    const result = await researchBrief('A long brief', 'workspace', 'user', '22222222-2222-4222-8222-222222222222');
    expect(result.data.mode).toBe('gallery'); expect(result.data.groups[0]?.posts).toHaveLength(1);
    expect(result.data.groups[0]?.posts[0]?.views).toBe(42);
    expect(result.data.warnings.join(' ')).toContain('1 of 2');
    expect(mocks.ai).toHaveBeenCalledTimes(1); expect(mocks.execute).toHaveBeenCalledTimes(2); expect(mocks.cleanup).toHaveBeenCalledTimes(1); expect(fetch).not.toHaveBeenCalled();
    expect(mocks.execute.mock.calls.every(call => call[0].operation.operation === 'raw_search')).toBe(true);
  });
});
