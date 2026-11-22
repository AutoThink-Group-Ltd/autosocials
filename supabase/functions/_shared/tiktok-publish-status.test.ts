import { parseTikTokPublishStatus } from './tiktok-publish-status.ts';

Deno.test('only confirms direct posting when TikTok reports completion', () => {
  for (const status of ['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX', 'FAILED', 'unknown']) {
    const result = parseTikTokPublishStatus({ error: { code: 'ok' }, data: { status } });
    if (result.kind === 'published') throw new Error(`${status} must not be reported as published`);
  }
  if (parseTikTokPublishStatus({ data: { status: 'PUBLISH_COMPLETE' } }).kind !== 'unknown') throw new Error('Missing provider status must not succeed');
  const result = parseTikTokPublishStatus({ error: { code: 'ok' }, data: { status: 'PUBLISH_COMPLETE', publicaly_available_post_id: ['12345'] } });
  if (result.kind !== 'published' || result.publicPostId !== '12345') throw new Error('Published ID was not retained');
});

Deno.test('does not invent an ID for private posts or expose arbitrary provider errors', () => {
  const privatePost = parseTikTokPublishStatus({ error: { code: 'ok' }, data: { status: 'PUBLISH_COMPLETE' } });
  if (privatePost.kind !== 'published' || privatePost.publicPostId !== null) throw new Error('Private post ID was invented');
  const failure = parseTikTokPublishStatus({ error: { code: 'ok' }, data: { status: 'FAILED', fail_reason: '<sensitive details>' } });
  if (failure.kind !== 'failed' || failure.reason !== 'unknown') throw new Error('Unsafe provider details were retained');
});
