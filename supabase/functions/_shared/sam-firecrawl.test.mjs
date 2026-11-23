import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { firecrawlWebResults } from './firecrawl.ts';

test('Sam consumes v2 web results, preserves request limits and rejects unsafe sources', async () => {
  globalThis.__fixtureRows = firecrawlWebResults;
  globalThis.Deno = { serve() {} };
  const source = await readFile(new URL('../sam-social-evidence/index.ts', import.meta.url), 'utf8');
  const isolated = source.replace(/import \{ firecrawlWebResults \}[^\n]+/, 'const firecrawlWebResults = globalThis.__fixtureRows;').replace(/import \{ createClient \}[^\n]+/, 'const createClient = () => { throw new Error("not used"); };') + '\nexport { fetchMarketSearch };';
  const js = stripTypeScriptTypes(isolated, { mode: 'strip' });
  const { fetchMarketSearch } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
  const previous = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => { request = { url, options }; return Response.json({ success: true, data: { web: [
    { url: 'https://news.example.co.uk/item', title: 'Report', description: 'Useful evidence' },
    { url: 'http://insecure.example.co.uk', title: 'Unsafe', description: 'Ignore' },
    { url: 'https://news.example.co.uk/missing', title: 'No description' },
  ] } }); };
  try {
    const results = await fetchMarketSearch('Company', 'https://company.co.uk', { industry: 'Retail' }, 'test-key');
    assert.equal(request.url, 'https://api.firecrawl.dev/v2/search');
    assert.equal(JSON.parse(request.options.body).limit, 5);
    assert.deepEqual(results, [{ title: 'Report', url: 'https://news.example.co.uk/item', snippet: 'Useful evidence' }]);
    globalThis.fetch = async () => new Response('', { status: 503 });
    await assert.rejects(fetchMarketSearch('Company', null, {}, 'test-key'), /Provider unavailable/);
  } finally { globalThis.fetch = previous; delete globalThis.Deno; delete globalThis.__fixtureRows; }
});
