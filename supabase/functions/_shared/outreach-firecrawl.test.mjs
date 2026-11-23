import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { firecrawlWebResults } from './firecrawl.ts';

test('outreach accepts a v2 profile result only and retains lookup safeguards', async () => {
  let handler, saved, request;
  const creator = { id: '22222222-2222-4222-8222-222222222222', workspace_id: '11111111-1111-4111-8111-111111111111', username: 'creator', profile_url: 'https://instagram.com/creator', email: null, version: 1 };
  const chain = { select() { return this; }, eq() { return this; }, is() { return this; }, update(value) { saved = value; return this; }, async maybeSingle() { return { data: saved ? { id: creator.id } : creator, error: null }; } };
  globalThis.__fixtureRows = firecrawlWebResults;
  globalThis.__fixtureClient = () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user' } }, error: null }) }, rpc: async () => ({ data: true, error: null }), from: () => chain });
  globalThis.Deno = { serve(fn) { handler = fn; }, env: { get: () => 'fixture' } };
  const source = await readFile(new URL('../outreach-enrich/index.ts', import.meta.url), 'utf8');
  const isolated = source.replace(/import \{ firecrawlWebResults \}[^\n]+/, 'const firecrawlWebResults = globalThis.__fixtureRows;').replace(/import \{ createClient \}[^\n]+/, 'const createClient = globalThis.__fixtureClient;');
  await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(isolated, { mode: 'strip' })).toString('base64')}`);
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => { request = { url, options }; return Response.json({ data: { web: [{ url: 'https://instagram.com/creator', markdown: 'hello@realbusiness.co.uk' }] } }); };
  try {
    const response = await handler(new Request('https://local.invalid', { method: 'POST', headers: { authorization: 'Bearer user-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: creator.workspace_id, creatorId: creator.id }) }));
    assert.equal(request.url, 'https://api.firecrawl.dev/v2/search');
    assert.deepEqual(JSON.parse(request.options.body).scrapeOptions, { formats: ['markdown'], onlyMainContent: true });
    assert.equal(JSON.parse(request.options.body).limit, 3);
    assert.equal((await response.json()).status, 'found');
    assert.equal(saved.email, 'hello@realbusiness.co.uk');
    saved = undefined;
    globalThis.fetch = async () => Response.json({ data: { web: [{ url: 'https://instagram.com/other', markdown: 'other@realbusiness.co.uk' }] } });
    const rejected = await handler(new Request('https://local.invalid', { method: 'POST', headers: { authorization: 'Bearer user-token', 'Content-Type': 'application/json' }, body: JSON.stringify({ workspaceId: creator.workspace_id, creatorId: creator.id }) }));
    assert.equal((await rejected.json()).status, 'not_found');
    assert.equal(saved, undefined);
  } finally { globalThis.fetch = previous; delete globalThis.Deno; delete globalThis.__fixtureRows; delete globalThis.__fixtureClient; }
});
