import { createFileRoute } from '@tanstack/react-router';

// X redirects to this public URL; the edge function consumes one-use state.
export async function handleXOAuthCallback(request: Request): Promise<Response> {
  try {
    const { supabaseUrl } = await import('@/lib/supabase-admin.server');
    const base = new URL(supabaseUrl());
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Invalid Supabase URL');
    const target = new URL(`${base.toString().replace(/\/+$/, '')}/functions/v1/x-oauth-callback`);
    const incoming = new URL(request.url);
    for (const name of ['code', 'state', 'error', 'error_description']) {
      const value = incoming.searchParams.get(name);
      if (value) target.searchParams.set(name, value);
    }
    return new Response(null, { status:302, headers:{ Location:target.toString(), 'Cache-Control':'no-store', 'Referrer-Policy':'no-referrer' } });
  } catch { return new Response('OAuth callback unavailable', {status:503, headers:{'Cache-Control':'no-store'}}); }
}
export const Route = createFileRoute('/api/oauth/x/callback')({ server:{ handlers:{ GET:({request})=>handleXOAuthCallback(request) } } });
