import { createServerFn } from '@tanstack/react-start';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authorizeResearch } from './research.server';
import { virloDb } from './virlo-db.server';
import { discoverLocalBusinesses } from './local-business.server';
import type { Json } from '@/integrations/supabase/types';

const schema = z.object({ workspace_id: z.string().uuid(), request_id: z.string().uuid(), query: z.string().trim().min(2).max(120), location: z.string().trim().min(2).max(150), radius_miles: z.number().min(1).max(100).optional() });
const listWorkspace = z.object({ workspace_id: z.string().uuid() });
export const listBusinessLists = createServerFn({ method: 'GET' }).inputValidator((input: unknown) => listWorkspace.parse(input)).handler(async ({ data }) => {
  await authorizeResearch(data.workspace_id);
  const rows = await virloDb().from('virlo_research_results').select('id,title,result').eq('workspace_id', data.workspace_id).eq('kind', 'business_list').order('created_at', { ascending: false }).limit(100);
  if (rows.error) throw new Error('Lists are unavailable.');
  return (rows.data ?? []).map(row => ({ id: String(row['id']), title: String(row['title']), data: row['result'] as Json }));
});
export const createBusinessList = createServerFn({ method: 'POST' }).inputValidator((input: unknown) => listWorkspace.extend({ title: z.string().trim().min(1).max(200) }).parse(input)).handler(async ({ data }) => {
  const user = await authorizeResearch(data.workspace_id);
  const saved = await virloDb().from('virlo_research_results').insert({ workspace_id: data.workspace_id, user_id: user.id, kind: 'business_list', title: data.title, result: { businesses: [] }, saved: false }).select('id').single();
  if (saved.error || !saved.data) throw new Error('The list could not be created.');
  return { id: String(saved.data['id']) };
});
export const deleteBusinessList = createServerFn({ method: 'POST' }).inputValidator((input: unknown) => listWorkspace.extend({ list_id: z.string().uuid() }).parse(input)).handler(async ({ data }) => {
  await authorizeResearch(data.workspace_id);
  const deleted = await virloDb().from('virlo_research_results').update({ kind: 'deleted_business_list', saved: false }).eq('workspace_id', data.workspace_id).eq('kind', 'business_list').eq('id', data.list_id).select('id').maybeSingle();
  if (deleted.error || !deleted.data) throw new Error('The list could not be deleted.');
  return { ok: true };
});
/** Remove only the business the caller saw; a concurrent list edit is never overwritten. */
export const removeBusinessFromList = createServerFn({ method: 'POST' }).inputValidator((input: unknown) => listWorkspace.extend({ list_id: z.string().uuid(), index: z.number().int().min(0).max(10000), name: z.string().min(1).max(500), address: z.string().max(500) }).parse(input)).handler(async ({ data }) => {
  await authorizeResearch(data.workspace_id);
  const db = virloDb();
  const existing = await db.from('virlo_research_results').select('result').eq('workspace_id', data.workspace_id).eq('kind', 'business_list').eq('id', data.list_id).maybeSingle();
  if (existing.error || !existing.data) throw new Error('This list is unavailable in this workspace.');
  const previous = existing.data['result'];
  if (!previous || typeof previous !== 'object' || Array.isArray(previous) || !Array.isArray((previous as Record<string, unknown>)['businesses'])) throw new Error('This list is unavailable.');
  const businesses = (previous as Record<string, unknown>)['businesses'] as unknown[];
  const target = businesses[data.index];
  const row = target && typeof target === 'object' && !Array.isArray(target) ? target as Record<string, unknown> : {};
  if (row['name'] !== data.name || String(row['address'] ?? '') !== data.address) throw new Error('The list changed. Refresh before removing this business.');
  const updated = await db.from('virlo_research_results').update({ result: { ...previous, businesses: businesses.filter((_, index) => index !== data.index) } as Json }).eq('workspace_id', data.workspace_id).eq('kind', 'business_list').eq('id', data.list_id).eq('result', JSON.stringify(previous)).select('id').maybeSingle();
  if (updated.error || !updated.data) throw new Error('The list changed or could not be saved. Refresh and try again.');
  return { ok: true };
});
export const saveBusinessList = createServerFn({ method: 'POST' }).inputValidator((input: unknown) => listWorkspace.extend({ result_id: z.string().uuid(), list_id: z.string().uuid().optional(), title: z.string().trim().min(1).max(200).optional(), indexes: z.array(z.number().int().min(0).max(99)).min(1).max(100) }).refine(value => Boolean(value.list_id) !== Boolean(value.title), { message: 'Choose an existing list or name a new list.' }).parse(input)).handler(async ({ data }) => {
  const user = await authorizeResearch(data.workspace_id);
  const db = virloDb();
  const source = await db.from('virlo_research_results').select('result,kind').eq('workspace_id', data.workspace_id).eq('id', data.result_id).eq('kind', 'businesses').maybeSingle();
  if (source.error || !source.data) throw new Error('This business search is unavailable in this workspace.');
  const result = source.data['result'];
  if (!result || typeof result !== 'object' || Array.isArray(result) || !Array.isArray((result as Record<string, unknown>)['businesses'])) throw new Error('This business search is unavailable.');
  const businesses = (result as Record<string, unknown>)['businesses'] as unknown[];
  const indexes = [...new Set(data.indexes)];
  if (indexes.some(index => index >= businesses.length)) throw new Error('The selected businesses are no longer available.');
  const selected = indexes.map(index => businesses[index]);
  if (data.list_id) {
    const existing = await db.from('virlo_research_results').select('result').eq('workspace_id', data.workspace_id).eq('kind', 'business_list').eq('id', data.list_id).maybeSingle();
    if (existing.error || !existing.data) throw new Error('This list is unavailable in this workspace.');
    const previous = existing.data['result'];
    if (!previous || typeof previous !== 'object' || Array.isArray(previous) || !Array.isArray((previous as Record<string, unknown>)['businesses'])) throw new Error('This list is unavailable.');
    const combined = [...((previous as Record<string, unknown>)['businesses'] as unknown[])];
    const key = (item: unknown) => { const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}; return `${String(row['name'] ?? '').toLowerCase()}|${String(row['address'] ?? '').toLowerCase()}`; };
    const seen = new Set(combined.map(key));
    for (const item of selected) { const id = key(item); if (!seen.has(id)) { combined.push(item); seen.add(id); } }
    const updated = await db.from('virlo_research_results').update({ result: { ...previous, businesses: combined } as Json }).eq('workspace_id', data.workspace_id).eq('kind', 'business_list').eq('id', data.list_id).eq('result', JSON.stringify(previous)).select('id').maybeSingle();
    if (updated.error || !updated.data) throw new Error('The list changed or could not be saved. Refresh and try again.');
    return { id: String(updated.data['id']) };
  }
  const saved = await db.from('virlo_research_results').insert({ workspace_id: data.workspace_id, user_id: user.id, kind: 'business_list', title: data.title!, result: { businesses: selected } as Json, saved: false }).select('id').single();
  if (saved.error || !saved.data) throw new Error('The list could not be saved.');
  return { id: String(saved.data['id']) };
});
export const searchLocalBusinesses = createServerFn({ method: 'POST' }).inputValidator((input: unknown) => schema.parse(input)).handler(async ({ data }) => {
  const user = await authorizeResearch(data.workspace_id);
  const key = process.env['SERP_API'];
  if (!key) throw new Error('Local business discovery is not configured yet.');
  const db = virloDb();
  const hash = createHash('sha256').update(JSON.stringify({ query: data.query, location: data.location, radius_miles: data.radius_miles })).digest('hex');
  const claim = await db.from('virlo_research_activity').insert({ workspace_id: data.workspace_id, user_id: user.id, request_id: data.request_id, request_hash: hash, operation: 'serp_local_business_search', operation_meta: { provider: 'serpapi' }, status: 'started' }).select('id').single();
  if (claim.error?.code === '23505') {
    const previous = await db.from('virlo_research_activity').select('id,request_hash').eq('workspace_id', data.workspace_id).eq('user_id', user.id).eq('request_id', data.request_id).maybeSingle();
    if (!previous.data || previous.data['request_hash'] !== hash) throw new Error('This request identifier is already in use.');
    const existing = await db.from('virlo_research_results').select('id,result').eq('workspace_id', data.workspace_id).eq('activity_id', String(previous.data['id'])).maybeSingle();
    if (existing.data) return { id: String(existing.data['id']), data: existing.data['result'] as unknown as Awaited<ReturnType<typeof discoverLocalBusinesses>> };
    throw new Error('This search was already submitted and its outcome needs checking. Contact an administrator before retrying.');
  }
  if (claim.error || !claim.data) throw new Error('Business search could not be recorded.');
  const activityId = String(claim.data['id']);
  try {
    const result = await discoverLocalBusinesses(data, key);
    const saved = await db.from('virlo_research_results').insert({ workspace_id: data.workspace_id, user_id: user.id, activity_id: activityId, kind: 'businesses', title: `${data.query} · ${data.location}`.slice(0, 200), result: result as unknown as Json }).select('id').single();
    if (saved.error || !saved.data) throw new Error('Search completed but could not be saved. Contact an administrator before retrying.');
    const updated = await db.from('virlo_research_activity').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('workspace_id', data.workspace_id).eq('id', activityId);
    if (updated.error) throw new Error('Search completed but its usage needs reconciliation.');
    return { id: String(saved.data['id']), data: result };
  } catch (error) {
    await db.from('virlo_research_activity').update({ status: 'unknown', updated_at: new Date().toISOString() }).eq('workspace_id', data.workspace_id).eq('id', activityId);
    throw error;
  }
});
