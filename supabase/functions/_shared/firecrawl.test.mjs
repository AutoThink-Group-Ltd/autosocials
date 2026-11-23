import test from 'node:test';
import assert from 'node:assert/strict';
import { firecrawlWebResults } from './firecrawl.ts';

test('reads v2 web search results and preserves fields for callers', () => {
  const row = { url: 'https://example.com', title: 'Example', description: 'snippet', markdown: 'person@example.com', metadata: { sourceURL: 'https://example.com' } };
  assert.deepEqual(firecrawlWebResults({ success: true, data: { web: [row], news: [{ title: 'not web' }] } }), [row]);
});
test('empty and malformed v2 responses do not become iterable results', () => {
  for (const input of [null, {}, { data: null }, { data: [] }, { data: { web: null } }, { data: { web: ['bad', null, [], 1] } }]) {
    assert.deepEqual(firecrawlWebResults(input), []);
  }
});
