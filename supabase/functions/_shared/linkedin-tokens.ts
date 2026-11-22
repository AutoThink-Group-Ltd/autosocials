declare const Deno: { env: { get(name: string): string | undefined } };
const PREFIX = 'linkedin:v1:';
const encoder = new TextEncoder();
async function key(): Promise<CryptoKey> {
  const secret = Deno.env.get('PUBLISH_META_TOKEN_KEY') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('LinkedIn token encryption is not configured.');
  const material = await crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g)!, b => parseInt(b, 16)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'HKDF', hash:'SHA-256', salt:encoder.encode('autosocials-linkedin-token-v1'), info:encoder.encode('linkedin-token-encryption') }, material, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function unb64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function linkedInTokenContext(workspace: string, externalId: string, kind: 'access' | 'refresh') { return `linkedin:${workspace}:${externalId}:${kind}`; }
export async function encryptLinkedInToken(value: string, context: string) {
  if (!value || value.startsWith('linkedin:')) throw new Error('Invalid LinkedIn token');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await key(), encoder.encode(value));
  return `${PREFIX}${b64(iv)}:${b64(new Uint8Array(data))}`;
}
export async function decryptLinkedInToken(value: string, context: string) {
  if (!value.startsWith(PREFIX)) throw new Error('LinkedIn credentials are not encrypted; reconnect this account.');
  try {
    const [iv, ciphertext, extra] = value.slice(PREFIX.length).split(':');
    if (!iv || !ciphertext || extra) throw new Error();
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encoder.encode(context) }, await key(), unb64(ciphertext));
    return new TextDecoder().decode(data);
  } catch { throw new Error('LinkedIn connection credentials could not be opened.'); }
}
