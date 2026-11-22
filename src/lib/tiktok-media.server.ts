import { openTikTokMediaCapability } from '../../supabase/functions/_shared/tiktok-media-capability';

type Dependencies = { readSecret: () => Promise<string | null>; supabaseUrl: string; fetcher: typeof fetch; now?: () => number };
const failure = () => new Response('Media unavailable', { status: 404, headers: { 'Cache-Control': 'no-store' } });

/** Streams only a short-lived, encrypted capability for an existing private post asset. */
export async function handleTikTokMedia(request: Request, dependencies?: Dependencies): Promise<Response> {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response(null, { status: 405, headers: { Allow: 'GET, HEAD' } });
  const token = new URL(request.url).searchParams.get('token');
  const range = request.headers.get('range');
  if (!token || token.length > 8192 || (range && !/^bytes=\d+-\d*$/.test(range))) return failure();
  try {
    const deps: Dependencies = dependencies ?? {
      supabaseUrl: process.env['SUPABASE_URL'] ?? process.env['VITE_SUPABASE_URL'] ?? '',
      fetcher: fetch,
      readSecret: async () => {
        const { getAdminClient } = await import('@/lib/supabase-admin.server');
        const { data, error } = await getAdminClient().from('internal_job_secrets').select('secret').eq('name', 'tiktok_media').maybeSingle();
        if (error) throw new Error('Media unavailable');
        return data?.secret ?? null;
      },
    };
    const secret = await deps.readSecret();
    if (!secret) return failure();
    const source = await openTikTokMediaCapability(token, deps.supabaseUrl, secret, deps.now?.() ?? Date.now());
    const upstream = await deps.fetcher(source, { method: request.method, ...(range ? { headers: { Range: range } } : {}), redirect: 'error', signal: AbortSignal.timeout(600_000) });
    if (![200, 206].includes(upstream.status) || !(upstream.headers.get('content-type') ?? '').toLowerCase().startsWith('video/')) return failure();
    const headers = new Headers({ 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
  } catch { return failure(); }
}
