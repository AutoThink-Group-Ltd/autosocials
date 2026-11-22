// Short-lived encrypted capability for serving a single signed private media URL.
// Shared by the publishing worker and the verified-domain media route.
const encoder = new TextEncoder();
const context = encoder.encode('autosocials:tiktok-media:v1');
const maxLifetime = 60 * 60 * 1000;

function encode(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decode(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > 8192) throw new Error('Invalid capability');
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}
async function key(secret: string): Promise<CryptoKey> {
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('Invalid media key');
  const bytes = Uint8Array.from(secret.match(/../g)!, part => parseInt(part, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function validSource(source: string, supabaseUrl: string): boolean {
  try {
    const url = new URL(source), origin = new URL(supabaseUrl);
    return origin.protocol === 'https:' && url.origin === origin.origin && !url.username && !url.password &&
      url.pathname.startsWith('/storage/v1/object/sign/post-media/') && !!url.searchParams.get('token');
  } catch { return false; }
}
export async function makeTikTokMediaCapability(source: string, supabaseUrl: string, secret: string, now = Date.now()): Promise<string> {
  if (!validSource(source, supabaseUrl)) throw new Error('Invalid media source');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const body = encoder.encode(JSON.stringify({ source, expires: now + maxLifetime }));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: context }, await key(secret), body));
  return `${encode(iv)}.${encode(encrypted)}`;
}
export async function openTikTokMediaCapability(token: string, supabaseUrl: string, secret: string, now = Date.now()): Promise<string> {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid capability');
  const iv = new Uint8Array(decode(parts[0]!)), ciphertext = new Uint8Array(decode(parts[1]!));
  if (iv.length !== 12 || ciphertext.length < 17) throw new Error('Invalid capability');
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: context }, await key(secret), ciphertext);
  const data = JSON.parse(new TextDecoder().decode(plaintext));
  if (typeof data.source !== 'string' || !validSource(data.source, supabaseUrl) || typeof data.expires !== 'number' ||
      !Number.isSafeInteger(data.expires) || data.expires <= now || data.expires > now + maxLifetime) throw new Error('Expired or invalid capability');
  return data.source;
}
