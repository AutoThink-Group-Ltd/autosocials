const PREFIX = 'x:v1:';
const encoder = new TextEncoder();
async function key(): Promise<CryptoKey> {
  const secret = Deno.env.get('PUBLISH_META_TOKEN_KEY') ?? '';
  if (!/^[a-f0-9]{64}$/i.test(secret)) throw new Error('X token encryption is not configured.');
  const material = await crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g)!, b => parseInt(b, 16)), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name:'HKDF', hash:'SHA-256', salt:encoder.encode('autosocials-x-token-v1'), info:encoder.encode('x-token-encryption') }, material, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']);
}
function b64(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function unb64(value: string) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function xTokenContext(workspace: string, externalId: string, kind: 'access' | 'refresh') { return `x:${workspace}:${externalId}:${kind}`; }
export async function encryptXToken(value: string, context: string) {
  if (!value || value.startsWith('x:')) throw new Error('Invalid X token');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode(context) }, await key(), encoder.encode(value));
  return `${PREFIX}${b64(iv)}:${b64(new Uint8Array(data))}`;
}
export async function decryptXToken(value: string, context: string) {
  if (!value.startsWith(PREFIX)) throw new Error('X credentials are not encrypted; reconnect this account.');
  try {
    const [iv, ciphertext, extra] = value.slice(PREFIX.length).split(':');
    if (!iv || !ciphertext || extra) throw new Error();
    const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: encoder.encode(context) }, await key(), unb64(ciphertext));
    return new TextDecoder().decode(data);
  } catch { throw new Error('X connection credentials could not be opened.'); }
}
export async function exchangeXToken(params: URLSearchParams) {
  const id = Deno.env.get('X_CLIENT_KEY'), secret = Deno.env.get('X_CLIENT_SECRET');
  if (!id || !secret) throw new Error('X OAuth is not configured.');
  const credentials = btoa(`${encodeURIComponent(id)}:${encodeURIComponent(secret)}`);
  const response = await fetch('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  const result = await response.json();
  if (!response.ok || typeof result.access_token !== 'string' || !result.access_token || typeof result.refresh_token !== 'string' || !result.refresh_token || typeof result.expires_in !== 'number' || result.expires_in <= 0) throw new Error('X token exchange failed. Reconnect the account.');
  return result as { access_token: string; refresh_token: string; expires_in: number; scope?: string };
}
export function refreshXToken(refreshToken: string) { return exchangeXToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken })); }
