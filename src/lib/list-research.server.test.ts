import { describe, expect, it } from 'vitest';
import { normalizeListPosts, safeWebsite } from './list-research.server';

describe('list research public evidence', () => {
  it('rejects unsafe websites before external scraping', () => {
    expect(safeWebsite('http://example.com')).toBeNull();
    expect(safeWebsite('https://127.0.0.1')).toBeNull();
    expect(safeWebsite('https://admin.internal')).toBeNull();
    expect(safeWebsite('https://example.com:443/path')).toBe('https://example.com/path');
    expect(safeWebsite('https://example.com:8080')).toBeNull();
    expect(safeWebsite('https://example.com/#fragment')).toBe('https://example.com/');
  });
  it('retains public post evidence and rejects unrelated or unsafe links', () => {
    const posts = normalizeListPosts({ videos: [{ url: 'https://www.instagram.com/reel/abc/', caption: 'Fresh food', stats: { views: 120, likes: 12 } }, { url: 'https://instagram.com.evil.example/post' }, { url: 'javascript:alert(1)' }] }, 'instagram');
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ caption: 'Fresh food', views: 120, likes: 12 });
  });
  it('preserves safe available media dimensions and rejects untrusted thumbnails', () => {
    const posts = normalizeListPosts({ videos: [
      { url: 'https://www.instagram.com/reel/abc/', thumbnail_url: 'https://auth.virlo.ai/storage/v1/object/public/covers/abc.jpg', media_type: 'video', width: 1080, height: 1920 },
      { url: 'https://www.instagram.com/p/def/', thumbnail_url: 'https://evil.example/image.jpg', media_type: 'image', width: -1, height: 200 },
    ] }, 'instagram');
    expect(posts[0]).toMatchObject({ thumbnail_url: 'https://auth.virlo.ai/storage/v1/object/public/covers/abc.jpg', media_type: 'video', width: 1080, height: 1920 });
    expect(posts[1]).toMatchObject({ media_type: 'image' });
    expect(posts[1]).not.toHaveProperty('thumbnail_url');
    expect(posts[1]).not.toHaveProperty('width');
  });
});
