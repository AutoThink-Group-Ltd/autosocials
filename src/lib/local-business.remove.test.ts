import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const chain = { from: vi.fn(), select: vi.fn(), eq: vi.fn(), update: vi.fn(), maybeSingle: vi.fn() };
  for (const key of ['from', 'select', 'eq', 'update'] as const) chain[key].mockReturnValue(chain);
  return { chain, authorize: vi.fn() };
});
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
vi.mock('./research.server', () => ({ authorizeResearch: mocks.authorize }));
vi.mock('./virlo-db.server', () => ({ virloDb: () => mocks.chain }));
import { removeBusinessFromList } from './local-business.functions';

const call = removeBusinessFromList as unknown as (input: { data: { workspace_id: string; list_id: string; index: number; name: string; address: string } }) => Promise<unknown>;
const data = { workspace_id: 'workspace', list_id: 'list', index: 0, name: 'First', address: 'Bradford' };
const previous = { businesses: [{ name: 'First', address: 'Bradford' }, { name: 'Second', address: 'Leeds' }] };
describe('removing a business from a list', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockResolvedValue({ id: 'user' }); });
  it('requires workspace authorization and compares the original list before updating', async () => {
    mocks.chain.maybeSingle.mockResolvedValueOnce({ data: { result: previous } }).mockResolvedValueOnce({ data: { id: 'list' } });
    await expect(call({ data })).resolves.toEqual({ ok: true });
    expect(mocks.authorize).toHaveBeenCalledWith('workspace');
    expect(mocks.chain.update).toHaveBeenCalledWith({ result: { businesses: [previous.businesses[1]] } });
    expect(mocks.chain.eq).toHaveBeenCalledWith('result', JSON.stringify(previous));
    expect(mocks.chain.eq).toHaveBeenCalledWith('workspace_id', 'workspace');
  });
  it('refuses stale selections and concurrent changes without overwriting data', async () => {
    mocks.chain.maybeSingle.mockResolvedValueOnce({ data: { result: previous } });
    await expect(call({ data: { ...data, name: 'Wrong' } })).rejects.toThrow('list changed');
    expect(mocks.chain.update).not.toHaveBeenCalled();
    mocks.chain.maybeSingle.mockResolvedValueOnce({ data: { result: previous } }).mockResolvedValueOnce({ data: null });
    await expect(call({ data })).rejects.toThrow('list changed');
  });
  it('does not read or mutate the list when workspace access fails', async () => {
    mocks.authorize.mockRejectedValueOnce(new Error('Workspace access denied'));
    await expect(call({ data })).rejects.toThrow('Workspace access denied');
    expect(mocks.chain.from).not.toHaveBeenCalled();
  });
});
