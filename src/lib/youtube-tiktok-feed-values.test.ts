import { describe, expect, it } from 'vitest';
import { feedCount } from '../../supabase/functions/_shared/youtube-tiktok-feed-values';

describe('feedCount', () => {
  it('preserves observed zero and valid provider counts', () => {
    expect(feedCount(0)).toBe(0);
    expect(feedCount('42')).toBe(42);
  });
  it('keeps unavailable or invalid counts unavailable', () => {
    for (const value of [undefined, null, '', false, -1, 'not a number']) expect(feedCount(value)).toBeNull();
  });
});
