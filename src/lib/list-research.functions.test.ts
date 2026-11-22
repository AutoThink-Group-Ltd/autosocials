import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const db = { from: vi.fn(), select: vi.fn(), eq: vi.fn(), insert: vi.fn(), update: vi.fn(), maybeSingle: vi.fn(), single: vi.fn() };
  for (const key of ['from', 'select', 'eq', 'insert', 'update'] as const) db[key].mockReturnValue(db);
  return { db, authorize: vi.fn() };
});
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
vi.mock('./research.server', () => ({ authorizeResearch: mocks.authorize }));
vi.mock('./virlo-db.server', () => ({ virloDb: () => mocks.db }));
vi.mock('./list-research.server', () => ({ researchBusiness: vi.fn() }));
import { startListResearch } from './list-research.functions';
const start = startListResearch as unknown as (arg: { data: Record<string, unknown> }) => Promise<{ data: { scope: string; businesses: unknown[] } }>;
const input = { workspace_id: 'workspace', list_id: 'list', request_id: 'request', confirmed: true, business_index: 1, business_name: 'Second', business_address: 'Leeds' };
describe('individual business research', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockResolvedValue({ id: 'user' }); });
  it('saves only the chosen business in a distinct report', async () => {
    mocks.db.maybeSingle.mockResolvedValueOnce({ data: { title: 'List', result: { businesses: [{ name: 'First', address: 'Bradford' }, { name: 'Second', address: 'Leeds' }] } } });
    mocks.db.single.mockResolvedValueOnce({ data: { id: 'claim' } }).mockResolvedValueOnce({ data: { id: 'report' } });
    const result = await start({ data: input });
    expect(result.data.scope).toBe('business');
    expect(result.data.businesses).toHaveLength(1);
    expect(result.data.businesses[0]).toMatchObject({ name: 'Second', address: 'Leeds' });
  });
  it('rejects a stale business selection before claiming research', async () => {
    mocks.db.maybeSingle.mockResolvedValueOnce({ data: { title: 'List', result: { businesses: [{ name: 'First', address: 'Bradford' }, { name: 'Changed', address: 'Leeds' }] } } });
    await expect(start({ data: input })).rejects.toThrow('list changed');
    expect(mocks.db.insert).not.toHaveBeenCalled();
  });
});
