export function decode64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), c => c.charCodeAt(0));
}

// WebCrypto verifies ECDSA in P1363 form; SendGrid sends a DER signature.
export function derToRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30 || der[1] !== der.length - 2 || der[2] !== 2) throw new Error("invalid signature");
  const rLength = der[3];
  if (rLength === undefined) throw new Error("invalid signature");
  const sTag = 4 + rLength;
  if (der[sTag] !== 2 || sTag + 2 + (der[sTag + 1] ?? -1) !== der.length) throw new Error("invalid signature");
  const trim = (x: Uint8Array) => x.length === 33 && x[0] === 0 ? x.slice(1) : x;
  const r = trim(der.slice(4, sTag)), s = trim(der.slice(sTag + 2));
  if (!r.length || !s.length || r.length > 32 || s.length > 32) throw new Error("invalid signature");
  const raw = new Uint8Array(64);
  raw.set(r, 32 - r.length);
  raw.set(s, 64 - s.length);
  return raw;
}
