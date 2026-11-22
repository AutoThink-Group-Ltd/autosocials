import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), research: vi.fn(), rows: [] as Record<string, unknown>[], activities: [] as Record<string, unknown>[] }));
vi.mock('@tanstack/react-start', () => ({ createServerFn: () => ({ inputValidator: (validate: (v: unknown) => unknown) => ({ handler: (fn: (v: unknown) => unknown) => async (arg: { data: unknown }) => fn({ data: validate(arg.data) }) }) }) }));
vi.mock('./research.server', () => ({ authorizeResearch: mocks.authorize }));
vi.mock('./brief-research.server', () => ({ researchBrief: mocks.research }));
vi.mock('./virlo-db.server', () => ({ virloDb: () => ({ from: (table: string) => {
  const rows = table === 'virlo_research_activity' ? mocks.activities : mocks.rows;
  let mode = 'read', patch: Record<string, unknown> = {}, filters: [string, unknown][] = [];
  const query: any = {
    insert(value: Record<string, unknown>) { mode = 'insert'; patch = value; return query; },
    update(value: Record<string, unknown>) { mode = 'update'; patch = value; return query; },
    select() { return query; }, eq(key: string, value: unknown) { filters.push([key, value]); return query; },
    async single() { return finish(); }, async maybeSingle() { return finish(); },
    then(resolve: (v: unknown) => void) { return Promise.resolve(finish()).then(resolve); },
  };
  function finish() {
    if (mode === 'insert') {
      if (table === 'virlo_research_activity' && rows.some(r => r['workspace_id'] === patch['workspace_id'] && r['request_id'] === patch['request_id'])) return { data: null, error: { code: '23505' } };
      const row = { id: `row-${rows.length + 1}`, ...patch }; rows.push(row); return { data: row, error: null };
    }
    const row = rows.find(r => filters.every(([key, value]) => r[key] === value));
    if (row && mode === 'update') Object.assign(row, patch);
    return { data: row ?? null, error: null };
  }
  return query;
} }) }));
import { runBriefResearch, saveBriefList, discardBriefResearch } from './brief-research.functions';
const invoke = (fn: unknown, data: Record<string, unknown>) => (fn as (arg: {data: unknown}) => Promise<any>)({ data });
const workspace = '11111111-1111-4111-8111-111111111111', request = '22222222-2222-4222-8222-222222222222', reportId = '33333333-3333-4333-8333-333333333333';
const report = { summary: 'All lists', lists: [{ title: 'First', description: '', items: [] }, { title: 'Second', description: '', items: [] }], limitations: [], checked_at: '2026-01-01' };
beforeEach(() => { mocks.rows.length = 0; mocks.activities.length = 0; mocks.authorize.mockReset().mockResolvedValue({ id: 'user' }); mocks.research.mockReset().mockResolvedValue({ title: 'Report', data: report }); });
describe('brief research actions', () => {
  it('requires confirmation and workspace access before research', async () => {
    await expect(invoke(runBriefResearch, { workspace_id: workspace, request_id: request, brief: 'Research' })).rejects.toThrow();
    expect(mocks.authorize).not.toHaveBeenCalled();
    mocks.authorize.mockRejectedValue(new Error('Workspace access denied'));
    await expect(invoke(runBriefResearch, { workspace_id: workspace, request_id: request, brief: 'Research', confirmed: true })).rejects.toThrow('Workspace access denied');
    expect(mocks.research).not.toHaveBeenCalled();
  });
  it('reuses a completed request and rejects a changed brief', async () => {
    const input = { workspace_id: workspace, request_id: request, brief: 'Research', confirmed: true };
    const first = await invoke(runBriefResearch, input), second = await invoke(runBriefResearch, input);
    expect(second).toEqual(first); expect(mocks.research).toHaveBeenCalledTimes(1);
    await expect(invoke(runBriefResearch, { ...input, brief: 'Different' })).rejects.toThrow('already in use');
  });
  it('saves only the selected list, without unrelated report summary', async () => {
    mocks.rows.push({ id: reportId, workspace_id: workspace, user_id: 'user', kind: 'brief_research', result: report, saved: false });
    await invoke(saveBriefList, { workspace_id: workspace, result_id: reportId, list_index: 1 });
    expect(mocks.rows[1]).toMatchObject({ saved: true, result: { summary: 'Saved list: Second', lists: [report.lists[1]] } });
  });
  it('saves one gallery group while retaining gallery metadata', async () => {
    const gallery = { mode: 'gallery', checked_at: '2026-01-01', warnings: ['partial'], groups: [{ title: 'One', posts: [] }, { title: 'Two', posts: [{ url: 'https://www.instagram.com/p/abc' }] }] };
    mocks.rows.push({ id: reportId, workspace_id: workspace, user_id: 'user', kind: 'brief_research', result: gallery, saved: false });
    await invoke(saveBriefList, { workspace_id: workspace, result_id: reportId, list_index: 1 });
    expect(mocks.rows[1]).toMatchObject({ saved: true, title: 'Two', result: { mode: 'gallery', warnings: ['partial'], groups: [gallery.groups[1]] } });
  });
  it('only discards an unsaved draft owned by the user in the requested workspace', async () => {
    const row = { id: reportId, workspace_id: workspace, user_id: 'someone-else', kind: 'brief_research', result: report, saved: false }; mocks.rows.push(row);
    await expect(invoke(discardBriefResearch, { workspace_id: workspace, result_id: reportId })).rejects.toThrow();
    row.user_id = 'user'; row.saved = true;
    await expect(invoke(discardBriefResearch, { workspace_id: workspace, result_id: reportId })).rejects.toThrow();
    expect(row.result).toEqual(report);
    row.saved = false; await invoke(discardBriefResearch, { workspace_id: workspace, result_id: reportId });
    expect(row.result).toEqual({ discarded: true });
  });
});
