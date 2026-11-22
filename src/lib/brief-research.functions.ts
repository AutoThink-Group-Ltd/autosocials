import { createServerFn } from '@tanstack/react-start';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { authorizeResearch } from './research.server';
import { virloDb } from './virlo-db.server';
import { researchBrief, type BriefResearchData, type GalleryData, type LegacyBriefResearchData } from './brief-research.server';
import type { Json } from '@/integrations/supabase/types';

const input = z.object({ workspace_id: z.string().uuid(), request_id: z.string().uuid(), brief: z.string().trim().min(1).max(20000), confirmed: z.literal(true) });
export const runBriefResearch = createServerFn({ method: 'POST' }).inputValidator((value: unknown) => input.parse(value)).handler(async ({ data }) => {
  const user = await authorizeResearch(data.workspace_id), db = virloDb();
  const hash = createHash('sha256').update(JSON.stringify({ operation: 'brief_research', brief: data.brief })).digest('hex');
  const claim = await db.from('virlo_research_activity').insert({ workspace_id: data.workspace_id, user_id: user.id, request_id: data.request_id, request_hash: hash, operation: 'brief_research', status: 'started' }).select('id').single();
  if (claim.error?.code === '23505') {
    const previous = await db.from('virlo_research_activity').select('id,request_hash,user_id').eq('workspace_id', data.workspace_id).eq('request_id', data.request_id).maybeSingle();
    if (previous.error || !previous.data || previous.data['request_hash'] !== hash || previous.data['user_id'] !== user.id) throw new Error('This request identifier is already in use.');
    const found = await db.from('virlo_research_results').select('id,title,result').eq('workspace_id', data.workspace_id).eq('activity_id', String(previous.data['id'])).eq('kind', 'brief_research').maybeSingle();
    if (found.data && !found.error) return { id: String(found.data['id']), title: String(found.data['title']), data: found.data['result'] as BriefResearchData };
    throw new Error('This research was already submitted and its outcome needs checking. Contact an administrator before retrying.');
  }
  if (claim.error || !claim.data) throw new Error('Research usage could not be recorded.');
  const activity = String(claim.data['id']);
  try {
    const result = await researchBrief(data.brief, data.workspace_id, user.id, data.request_id);
    const saved = await db.from('virlo_research_results').insert({ workspace_id: data.workspace_id, user_id: user.id, activity_id: activity, kind: 'brief_research', title: result.title, result: result.data as Json, saved: false }).select('id').single();
    if (saved.error || !saved.data) throw new Error('Research completed but the draft could not be saved; contact an administrator before retrying.');
    const updated = await db.from('virlo_research_activity').update({ status: 'completed', updated_at: new Date().toISOString() }).eq('workspace_id', data.workspace_id).eq('id', activity);
    if (updated.error) throw new Error('Research completed but its usage record needs reconciliation.');
    return { id: String(saved.data['id']), ...result };
  } catch (error) {
    await db.from('virlo_research_activity').update({ status: 'unknown', updated_at: new Date().toISOString() }).eq('workspace_id', data.workspace_id).eq('id', activity);
    throw error;
  }
});

export const saveBriefList = createServerFn({ method: 'POST' }).inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid(), result_id: z.string().uuid(), list_index: z.number().int().min(0).max(9) }).parse(value)).handler(async ({ data }) => {
  const user = await authorizeResearch(data.workspace_id), db = virloDb();
  const source = await db.from('virlo_research_results').select('title,result').eq('workspace_id', data.workspace_id).eq('id', data.result_id).eq('kind', 'brief_research').maybeSingle();
  if (source.error || !source.data) throw new Error('Research report is unavailable.');
  const report = source.data['result'] as BriefResearchData;
  const gallery = 'mode' in report && report.mode === 'gallery';
  const list = gallery ? (report as GalleryData).groups?.[data.list_index] : (report as LegacyBriefResearchData).lists?.[data.list_index];
  if (!list) throw new Error('This list is unavailable.');
  const result = gallery ? { ...report, groups: [list] } : { ...report, summary: `Saved list: ${list.title}`, summary_sources: [], lists: [list] };
  const saved = await db.from('virlo_research_results').insert({ workspace_id: data.workspace_id, user_id: user.id, kind: 'brief_research', title: list.title.slice(0, 200), result: result as Json, saved: true }).select('id').single();
  if (saved.error || !saved.data) throw new Error('This list could not be saved.');
  return { id: String(saved.data['id']) };
});

export const discardBriefResearch = createServerFn({ method: 'POST' }).inputValidator((value: unknown) => z.object({ workspace_id: z.string().uuid(), result_id: z.string().uuid() }).parse(value)).handler(async ({ data }) => {
  const user = await authorizeResearch(data.workspace_id), db = virloDb();
  const result = await db.from('virlo_research_results').update({ title: 'Discarded research', result: { discarded: true } }).eq('workspace_id', data.workspace_id).eq('user_id', user.id).eq('id', data.result_id).eq('kind', 'brief_research').eq('saved', false).select('id').maybeSingle();
  if (result.error || !result.data) throw new Error('This unsaved draft is unavailable or already saved.');
  return { ok: true };
});
