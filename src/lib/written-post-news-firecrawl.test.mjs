import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';

test('written post research consumes v2 web results and fails closed on provider errors', async () => {
  const source = await readFile(new URL('./written-post-news.server.ts', import.meta.url), 'utf8');
  const isolated = source.replace(/import \{ officialCreativeSiteUrl \}[^\n]+/, 'const officialCreativeSiteUrl = (value) => value.startsWith("https://") ? value : null;');
  const { writtenPostNews } = await import(`data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(isolated, { mode: 'strip' })).toString('base64')}`);
  const oldFetch = globalThis.fetch, oldKey = process.env.FIRECRAWL_API_KEY;
  process.env.FIRECRAWL_API_KEY = 'fixture';
  let request;
  globalThis.fetch = async (url, options) => { request = { url, options }; return Response.json({ data: { web: [{ url: 'https://news.co.uk/article', title: 'Headline', description: 'Snippet' }, { url: 'http://unsafe.co.uk', title: 'Unsafe', description: 'Bad' }] } }); };
  try {
    const result = await writtenPostNews('Retail');
    assert.equal(request.url, 'https://api.firecrawl.dev/v2/search');
    assert.equal(JSON.parse(request.options.body).limit, 5);
    assert.deepEqual(result, { status: 'ready', sources: [{ title: 'Headline', url: 'https://news.co.uk/article', snippet: 'Snippet' }] });
    globalThis.fetch = async () => new Response('', { status: 503 });
    assert.deepEqual(await writtenPostNews('Retail'), { status: 'unavailable', sources: [] });
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.FIRECRAWL_API_KEY; else process.env.FIRECRAWL_API_KEY = oldKey; }
});
