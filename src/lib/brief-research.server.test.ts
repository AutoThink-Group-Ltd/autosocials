import { describe, expect, it } from 'vitest';
import { normalizeGalleryPosts } from './brief-research.server';
describe('gallery post normalization', () => {
  it('preserves available metrics and permits only safe posts and provider media', () => {
    const posts = normalizeGalleryPosts({ videos: [], result: { posts: [
      { url: 'https://www.tiktok.com/@maker/video/123?share=1', caption: 'Example', stats: { views: 123456, likes: 0, comments: 12 }, thumbnail_url: 'https://auth.virlo.ai/storage/v1/object/public/covers/1.jpg' },
      { url: 'https://www.tiktok.com/@maker/video/456', thumbnail_url: 'https://evil.example/image.jpg', views: '200' },
      { url: 'http://www.tiktok.com/@maker/video/789' }, { url: 'https://tiktok.com.evil.example/@maker/video/123' },
    ] } }, 'tiktok');
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({ url: 'https://www.tiktok.com/@maker/video/123', handle: 'maker', views: 123456, likes: 0, comments: 12, thumbnail_url: 'https://auth.virlo.ai/storage/v1/object/public/covers/1.jpg' });
    expect(posts[1]?.views).toBeNull(); expect(posts[1]).not.toHaveProperty('thumbnail_url');
  });
});
