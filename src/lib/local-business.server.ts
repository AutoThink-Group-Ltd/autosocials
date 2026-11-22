import { distanceMiles } from './local-business-distance';

type Point = { latitude: number; longitude: number };
type Row = Record<string, unknown>;
const obj = (x: unknown): Row => x && typeof x === 'object' && !Array.isArray(x) ? x as Row : {};
const text = (x: unknown) => typeof x === 'string' ? x.trim().slice(0, 500) : '';
function point(x: unknown): Point | undefined {
  const p = obj(x), latitude = p.latitude, longitude = p.longitude;
  return typeof latitude === 'number' && Number.isFinite(latitude) && Math.abs(latitude) <= 90 && typeof longitude === 'number' && Number.isFinite(longitude) && Math.abs(longitude) <= 180 ? { latitude, longitude } : undefined;
}
function safeUrl(value: unknown): string | undefined {
  try { const url = new URL(text(value)); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; } catch { return undefined; }
}

async function maps(params: Record<string, string>, key: string): Promise<Row> {
  const url = new URL('https://serpapi.com/search.json');
  for (const [name, value] of Object.entries({ engine: 'google_maps', hl: 'en', ...params, api_key: key })) url.searchParams.set(name, value);
  let response: Response;
  try { response = await fetch(url, { signal: AbortSignal.timeout(25000), redirect: 'error' }); }
  catch { throw new Error('Business search could not complete; the provider may still have charged for the request.'); }
  if (!response.ok) throw new Error('Business search provider is unavailable. Please try again later.');
  const data = obj(await response.json());
  if (data.error || obj(data.search_metadata).status === 'Error') throw new Error('Business search provider could not complete this search.');
  return data;
}

export async function discoverLocalBusinesses(input: { query: string; location: string; radius_miles?: number }, key: string) {
  let center: Point | undefined;
  let locationLabel = input.location;
  const warnings = ['Results are a limited selection, not a complete directory. Verify businesses and their social accounts before comparing them.'];
  if (input.radius_miles !== undefined) {
    const locationResult = await maps({ q: input.location, type: 'search' }, key);
    const place = obj(locationResult.place_results);
    // Require a resolved place, rather than silently choosing the first business result.
    center = point(place.gps_coordinates);
    if (!center) throw new Error('The search centre could not be resolved. Enter a more specific town, postcode or address.');
    locationLabel = text(place.title) || input.location;
    warnings.push(`Distances are straight-line miles from ${locationLabel}. Check the centre is correct.`);
  }
  const zoom = input.radius_miles === undefined ? undefined : input.radius_miles <= 3 ? 13 : input.radius_miles <= 10 ? 11 : input.radius_miles <= 30 ? 9 : 7;
  const result = await maps({ q: `${input.query} ${input.location}`, type: 'search', ...(center ? { ll: `@${center.latitude},${center.longitude},${zoom}z` } : {}) }, key);
  const list = Array.isArray(result.local_results) ? result.local_results : result.place_results ? [result.place_results] : [];
  let missingCoordinates = 0;
  const seen = new Set<string>();
  const businesses = list.slice(0, 100).flatMap((item: unknown) => {
    const row = obj(item), name = text(row.title), address = text(row.address), coords = point(row.gps_coordinates);
    if (!name) return [];
    if (center && !coords) { missingCoordinates++; return []; }
    const distance = center && coords ? distanceMiles(center, coords) : undefined;
    if (distance !== undefined && input.radius_miles !== undefined && distance > input.radius_miles) return [];
    const id = text(row.place_id) || `${name.toLowerCase()}|${address.toLowerCase()}`;
    if (seen.has(id)) return []; seen.add(id);
    const mapsUrl = text(row.place_id) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address)}&query_place_id=${encodeURIComponent(text(row.place_id))}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + ' ' + address)}`;
    return [{ name, address, website: safeUrl(row.website), maps_url: mapsUrl, ...(coords || {}), ...(distance === undefined ? {} : { distance_miles: Math.round(distance * 10) / 10 }) }];
  });
  if (missingCoordinates) warnings.push(`${missingCoordinates} result(s) without coordinates were excluded from the radius search.`);
  return { businesses, location_label: locationLabel, ...(input.radius_miles === undefined ? {} : { radius_miles: input.radius_miles }), warnings };
}
