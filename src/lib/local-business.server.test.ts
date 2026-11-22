import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverLocalBusinesses } from './local-business.server';

afterEach(() => vi.unstubAllGlobals());
describe('local business discovery', () => {
  it('filters by actual distance, excludes unknown coordinates, and avoids duplicate places', async () => {
    const replies = [
      { place_results: { title: 'Bradford, UK', gps_coordinates: { latitude: 53.796, longitude: -1.759 } } },
      { local_results: [
        { title: 'Nearby', place_id: 'one', gps_coordinates: { latitude: 53.8, longitude: -1.76 } },
        { title: 'Nearby', place_id: 'one', gps_coordinates: { latitude: 53.8, longitude: -1.76 } },
        { title: 'Far', gps_coordinates: { latitude: 53.8, longitude: -1.3 } },
        { title: 'Unknown' },
      ] },
    ];
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(replies.shift()), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await discoverLocalBusinesses({ query: 'restaurants', location: 'Bradford', radius_miles: 5 }, 'key');
    expect(result.businesses.map(x => x.name)).toEqual(['Nearby']);
    expect(result.location_label).toBe('Bradford, UK');
    expect(result.warnings.join(' ')).toContain('without coordinates');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it('does not guess a radius centre from a business result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ local_results: [{ title: 'Some business', gps_coordinates: { latitude: 53, longitude: -1 } }] }), { status: 200 })));
    await expect(discoverLocalBusinesses({ query: 'restaurants', location: 'Bradford', radius_miles: 5 }, 'key')).rejects.toThrow('centre could not be resolved');
  });
});
