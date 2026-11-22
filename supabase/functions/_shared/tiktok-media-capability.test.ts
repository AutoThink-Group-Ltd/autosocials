import { makeTikTokMediaCapability, openTikTokMediaCapability } from './tiktok-media-capability.ts';
const secret = 'aa'.repeat(32), origin = 'https://example.supabase.co';
const source = `${origin}/storage/v1/object/sign/post-media/workspace/video.mp4?token=private`;

Deno.test('only the intended private media URL is returned during its lifetime', async () => {
  const token = await makeTikTokMediaCapability(source, origin, secret, 100000);
  if (token.includes('private') || await openTikTokMediaCapability(token, origin, secret, 100001) !== source) throw new Error('Invalid token roundtrip');
  for (const [value, target, time] of [[token, origin, 3700001], [token, 'https://other.supabase.co', 100001], [`${token}x`, origin, 100001]] as const) {
    let rejected = false;
    try { await openTikTokMediaCapability(value, target, secret, time); } catch { rejected = true; }
    if (!rejected) throw new Error('Invalid token accepted');
  }
});

Deno.test('rejects untrusted media sources', async () => {
  for (const invalid of ['https://evil.example/file', `${origin}/rest/v1/private?token=x`, `${origin}/storage/v1/object/sign/post-media/x`]) {
    let rejected = false;
    try { await makeTikTokMediaCapability(invalid, origin, secret); } catch { rejected = true; }
    if (!rejected) throw new Error('Invalid URL accepted');
  }
});
