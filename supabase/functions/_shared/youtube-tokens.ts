/** Google credentials are sealed server-side and bound to one social account. */
const PREFIX = 'youtube:v1:';
const encoder = new TextEncoder();

async function key(): Promise<CryptoKey> {
  const secret = Deno.env.get('YOUTUBE_TOKEN_ENCRYPTION_KEY') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('YouTube token encryption is not configured. Contact your administrator.');
  return crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g)!, b => parseInt(b, 16)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function unb64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function youtubeTokenContext(workspace: string, externalId: string, kind: 'access' | 'refresh') { return `youtube:${workspace}:${externalId}:${kind}`; }
export async function encryptYouTubeToken(value: string, context: string) {
  if (!value || value.startsWith('youtube:')) throw new Error('Invalid Google token');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await key(), encoder.encode(value));
  return `${PREFIX}${b64(iv)}:${b64(new Uint8Array(data))}`;
}
export async function decryptYouTubeToken(value: string, context: string) {
  if (!value.startsWith(PREFIX)) throw new Error('YouTube credentials are not encrypted; reconnect this channel.');
  try {
    const [ivText, cipherText, extra] = value.slice(PREFIX.length).split(':');
    if (!ivText || !cipherText || extra) throw new Error();
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(ivText), additionalData: encoder.encode(context) }, await key(), unb64(cipherText));
    return new TextDecoder().decode(plain);
  } catch { throw new Error('YouTube connection credentials could not be opened. Contact your administrator.'); }
}
