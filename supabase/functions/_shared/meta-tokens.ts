/** Meta provider tokens are sealed server-side; this module must never be bundled into the client. */
const PREFIX = 'meta:v1:';
const encoder = new TextEncoder();

async function tokenKey(): Promise<CryptoKey> {
  const secret = Deno.env.get('PUBLISH_META_TOKEN_KEY') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('Meta connection encryption is not configured. Contact your administrator.');
  const bytes = Uint8Array.from(secret.match(/../g)!, byte => parseInt(byte, 16));
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function assertMetaTokenKey(): Promise<void> { await tokenKey(); }
export function isEncryptedMetaToken(value: string): boolean { return value.startsWith(PREFIX); }

function base64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function fromBase64(value: string): Uint8Array { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }

export async function encryptMetaToken(value: string, context: string): Promise<string> {
  if (!value || value.startsWith('meta:')) throw new Error('Invalid Meta token for encryption');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await tokenKey(), encoder.encode(value));
  return PREFIX + base64(iv) + ':' + base64(new Uint8Array(encrypted));
}

export async function decryptMetaToken(value: string, context: string): Promise<string> {
  // Temporary read compatibility: legacy values are sealed on a successful server read/backfill.
  if (!value.startsWith('meta:')) return value;
  if (!isEncryptedMetaToken(value)) throw new Error('Unsupported Meta token encryption version');
  try {
    const parts = value.slice(PREFIX.length).split(':');
    if (parts.length !== 2) throw new Error('Invalid envelope');
    const iv = fromBase64(parts[0]), ciphertext = fromBase64(parts[1]);
    if (iv.byteLength !== 12 || ciphertext.byteLength < 17) throw new Error('Invalid envelope');
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await tokenKey(), ciphertext);
    return new TextDecoder().decode(decrypted);
  } catch { throw new Error('Meta connection credentials could not be opened. Contact your administrator.'); }
}
