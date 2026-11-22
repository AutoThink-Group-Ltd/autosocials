import { createServerFn } from '@tanstack/react-start';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authorizeResearch } from './research.server';
import { virloDb } from './virlo-db.server';
import { researchBusiness } from './list-research.server';
import type { Json } from '@/integrations/supabase/types';

type Row = Record<string, unknown>;
const obj = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const text = (value: unknown, max: number) => typeof value === 'string' ? value.slice(0, max) : '';
const base = z.object({ workspace_id: z.string().uuid(), request_id: z.string().uuid() });
function perBusinessId(report: string, index: number) {
  const h = createHash('sha256').update(`list-research:${report}:${index}`).digest('hex').slice(0, 32).split(''); h[12] = '4'; h[16] = '8';
  const x = h.join(''); return `${x.slice(0,8)}-${x.slice(8,12)}-${x.slice(12,16)}-${x.slice(16,20)}-${x.slice(20)}`;
}
async function load(workspace: string, id: string) {
  const row = await virloDb().from('virlo_research_results').select('result').eq('workspace_id', workspace).eq('kind', 'list_research').eq('id', id).maybeSingle();
  if (row.error || !row.data) throw new Error('This research report is unavailable in this workspace.');
  const value = obj(row.data['result']);
  if (!Array.isArray(value['businesses'])) throw new Error('This research report is unavailable.');
  return value;
}
export const startListResearch = createServerFn({ method: 'POST' }).inputValidator((input: unknown) => base.extend({ list_id: z.string().uuid(), business_index: z.number().int().min(0).max(99).optional(), business_name: z.string().max(200).optional(), business_address: z.string().max(500).optional(), confirmed: z.literal(true) }).refine(value => value.business_index === undefined || (value.business_name !== undefined && value.business_address !== undefined)).parse(input)).handler(async ({ data }) => {
  const user = await authorizeResearch(data.workspace_id), db = virloDb();
  const source = await db.from('virlo_research_results').select('title,result').eq('workspace_id', data.workspace_id).eq('kind', 'business_list').eq('id', data.list_id).maybeSingle();
  if (source.error || !source.data) throw new Error('This list is unavailable in this workspace.');
  const rows = obj(source.data['result'])['businesses'];
  if (!Array.isArray(rows) || !rows.length) throw new Error('Add businesses to this list before researching it.');
  if (rows.length > 100) throw new Error('This list has more than 100 businesses. Split it into smaller lists before researching.');
  if (data.business_index !== undefined && data.business_index >= rows.length) throw new Error('This business is unavailable in this list.');
  if (data.business_index !== undefined && (text(obj(rows[data.business_index])['name'], 200) !== data.business_name || text(obj(rows[data.business_index])['address'], 500) !== data.business_address)) throw new Error('This list changed. Refresh it before researching this business.');
  const selectedRows = data.business_index === undefined ? rows : [rows[data.business_index]];
  const hash = createHash('sha256').update(data.business_index === undefined ? data.list_id : JSON.stringify({ list_id: data.list_id, business_index: data.business_index })).digest('hex');
  const claim = await db.from('virlo_research_activity').insert({ workspace_id: data.workspace_id, user_id: user.id, request_id: data.request_id, request_hash: hash, operation: 'list_research_start', status: 'started' }).select('id').single();
  if (claim.error?.code === '23505') {
    const previous = await db.from('virlo_research_activity').select('id,request_hash').eq('workspace_id', data.workspace_id).eq('user_id', user.id).eq('request_id', data.request_id).maybeSingle();
    if (!previous.data || previous.data['request_hash'] !== hash) throw new Error('This request identifier is already in use.');
    const saved = await db.from('virlo_research_results').select('id,result').eq('workspace_id', data.workspace_id).eq('activity_id', String(previous.data['id'])).maybeSingle();
    if (saved.data) return { id: String(saved.data['id']), data: saved.data['result'] as Json };
    throw new Error('This research request is already being prepared. Check Saved research before trying again.');
  }
  if (claim.error || !claim.data) throw new Error('Research could not be recorded.');
  const scope = data.business_index === undefined ? 'list' : 'business';
  const result = { list_name: scope === 'business' ? text(obj(selectedRows[0])['name'], 200) : text(source.data['title'], 200), scope, status: 'running', checked_at: new Date().toISOString(), businesses: selectedRows.map((entry: unknown) => { const row = obj(entry); return { name: text(row['name'], 200), address: text(row['address'], 500), ...(text(row['website'], 500) ? { website: text(row['website'], 500) } : {}), status: 'pending', profiles: [], warnings: [] }; }) };
  const saved = await db.from('virlo_research_results').insert({ workspace_id: data.workspace_id, user_id: user.id, activity_id: String(claim.data['id']), kind: 'list_research', title: `${result.list_name} · Social research`.slice(0, 200), result: result as Json, saved: true }).select('id').single();
  if (saved.error || !saved.data) throw new Error('Research could not be saved.');
  await db.from('virlo_research_activity').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('workspace_id', data.workspace_id).eq('id', String(claim.data['id']));
  return { id: String(saved.data['id']), data: result as Json };
});

export const researchListBusiness = createServerFn({ method: 'POST' }).inputValidator((input: unknown) => base.extend({ result_id: z.string().uuid(), index: z.number().int().min(0).max(99) }).parse(input)).handler(async ({ data }) => {
  const user = await authorizeResearch(data.workspace_id), db = virloDb();
  const report = await load(data.workspace_id, data.result_id), businesses = report['businesses'] as unknown[];
  if (data.index >= businesses.length) throw new Error('This business is unavailable.');
  const business = obj(businesses[data.index]);
  if (business['status'] !== 'pending') return { id: data.result_id, data: report as Json };
  // The per-report index claim prevents concurrent or cross-session duplicate paid work.
  const claimId = perBusinessId(data.result_id, data.index);
  const claim = await db.from('virlo_research_activity').insert({ workspace_id: data.workspace_id, user_id: user.id, request_id: claimId, request_hash: data.result_id, operation: 'list_research_business', status: 'started' }).select('id').single();
  if (claim.error?.code === '23505') {
    const current = await load(data.workspace_id, data.result_id), entry = obj((current.businesses as unknown[])[data.index]);
    if (entry['status'] !== 'pending') return { id: data.result_id, data: current as Json };
    throw new Error('This business was already submitted; its outcome needs checking before retrying.');
  }
  if (claim.error || !claim.data) throw new Error('Business research could not be recorded.');
  const activityId = String(claim.data['id']);
  try {
    const found = await researchBusiness(business, data.workspace_id, user.id, claimId);
    const nextBusinesses = [...businesses];
    nextBusinesses[data.index] = { ...business, status: found.warnings.length || found.profiles.some(p => p.warning) ? 'partial' : 'complete', profiles: found.profiles, warnings: found.warnings };
    const next = { ...report, businesses: nextBusinesses, status: nextBusinesses.every(item => obj(item)['status'] !== 'pending') ? 'complete' : 'running', checked_at: new Date().toISOString() };
    const updated = await db.from('virlo_research_results').update({ result: next as Json }).eq('workspace_id', data.workspace_id).eq('kind', 'list_research').eq('id', data.result_id).eq('result', JSON.stringify(report)).select('id').maybeSingle();
    if (updated.error || !updated.data) throw new Error('Research finished but the report changed. Contact an administrator before retrying.');
    await db.from('virlo_research_activity').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('workspace_id', data.workspace_id).eq('id', activityId);
    return { id: data.result_id, data: next as Json };
  } catch (error) {
    await db.from('virlo_research_activity').update({ status: 'unknown', updated_at: new Date().toISOString() }).eq('workspace_id', data.workspace_id).eq('id', activityId);
    throw error;
  }
});

/** Skip a previously submitted but unresolved business without issuing any provider calls. */
export const skipListBusiness = createServerFn({ method: 'POST' }).inputValidator((input: unknown) => z.object({ workspace_id: z.string().uuid(), result_id: z.string().uuid(), index: z.number().int().min(0).max(99) }).parse(input)).handler(async ({ data }) => {
  await authorizeResearch(data.workspace_id);
  const db = virloDb(), report = await load(data.workspace_id, data.result_id), businesses = report['businesses'] as unknown[];
  if (data.index >= businesses.length) throw new Error('This business is unavailable.');
  const business = obj(businesses[data.index]);
  if (business['status'] !== 'pending') return { id: data.result_id, data: report as Json };
  const claim = await db.from('virlo_research_activity').select('status,created_at').eq('workspace_id', data.workspace_id).eq('request_id', perBusinessId(data.result_id, data.index)).maybeSingle();
  if (claim.error || !claim.data) throw new Error('This business has not yet been submitted.');
  if (claim.data['status'] === 'started' && Date.now() - Date.parse(String(claim.data['created_at'])) < 180000) throw new Error('This business may still be processing. Wait three minutes after it started before skipping.');
  if (!['started', 'unknown', 'failed'].includes(String(claim.data['status']))) throw new Error('This business is no longer available to skip.');
  const nextBusinesses = [...businesses];
  nextBusinesses[data.index] = { ...business, status: 'partial', profiles: [], warnings: ['Research was skipped because its outcome could not be confirmed. Provider charges may still apply.'] };
  const next = { ...report, businesses: nextBusinesses, status: nextBusinesses.every(item => obj(item)['status'] !== 'pending') ? 'complete' : 'running', checked_at: new Date().toISOString() };
  const updated = await db.from('virlo_research_results').update({ result: next as Json }).eq('workspace_id', data.workspace_id).eq('kind', 'list_research').eq('id', data.result_id).eq('result', JSON.stringify(report)).select('id').maybeSingle();
  if (updated.error || !updated.data) throw new Error('The report changed. Refresh before continuing.');
  return { id: data.result_id, data: next as Json };
});
