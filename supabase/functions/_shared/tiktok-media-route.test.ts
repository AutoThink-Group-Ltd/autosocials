import { makeTikTokMediaCapability } from './tiktok-media-capability.ts';
import { handleTikTokMedia } from '../../../src/lib/tiktok-media.server.ts';
const secret = 'bb'.repeat(32), origin = 'https://project.supabase.co';

Deno.test('streams only capability-authorised video and forwards a single range', async () => {
  const source = `${origin}/storage/v1/object/sign/post-media/w/v.mp4?token=private`;
  const token = await makeTikTokMediaCapability(source, origin, secret, 1000);
  let calls = 0;
  const deps = { supabaseUrl: origin, readSecret: async () => secret, now: () => 2000, fetcher: async (url: RequestInfo | URL, init?: RequestInit) => {
    calls++;
    if (url !== source || (init?.headers as Record<string, string>).Range !== 'bytes=0-9' || init?.redirect !== 'error') throw new Error('Wrong upstream request');
    return new Response('0123456789', { status: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-9/100' } });
  } };
  const result = await handleTikTokMedia(new Request(`https://autosocials.com/api/public/tiktok-media?token=${token}`, { headers: { Range: 'bytes=0-9' } }), deps);
  if (result.status !== 206 || await result.text() !== '0123456789' || calls !== 1 || result.headers.get('cache-control') !== 'private, no-store') throw new Error('Invalid proxy response');
  const bad = await handleTikTokMedia(new Request(`https://autosocials.com/api/public/tiktok-media?token=${token}x`), deps);
  if (bad.status !== 404 || calls !== 1) throw new Error('Invalid token reached upstream');
});
