import { describe, expect, it } from 'vitest';
import { normalizeXPosts } from '../../supabase/functions/x-fetch-feed/normalize';

describe('X feed normalization', () => {
  it('maps the requested media key, the highest-quality mp4 and public metrics', () => {
    const [post] = normalizeXPosts({
      data: [{ id: '123', text: 'A post', created_at: '2026-01-01T00:00:00Z', attachments: { media_keys: ['video'] }, public_metrics: { like_count: 4, reply_count: 2, retweet_count: 1 } }],
      includes: { media: [{ media_key: 'other', type: 'photo', url: 'https://example.com/wrong.jpg' }, { media_key: 'video', type: 'video', preview_image_url: 'https://example.com/preview.jpg', variants: [{ content_type: 'video/mp4', bit_rate: 100, url: 'https://example.com/low.mp4' }, { content_type: 'video/mp4', bit_rate: 200, url: 'https://example.com/high.mp4' }, { content_type: 'application/x-mpegURL', url: 'https://example.com/stream' }] }] },
    });
    expect(post).toMatchObject({ id: '123', platform: 'x', media_type: 'video', media_url: 'https://example.com/high.mp4', thumbnail_url: 'https://example.com/preview.jpg', like_count: 4, comment_count: 2, share_count: 1, permalink: 'https://x.com/i/status/123' });
  });
  it('handles text posts and empty timelines', () => {
    expect(normalizeXPosts({})).toEqual([]);
    expect(normalizeXPosts({ data: [{ id: '1' }] })[0]).toMatchObject({ media_type: 'text', media_url: null, like_count: null });
  });
});
