// Server-only media ingestion. No provider/user credentials are forwarded.
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

export type CreativeMediaKind = "image" | "video" | "audio";
export type DownloadedCreativeMedia = { bytes: Uint8Array; contentType: string; extension: string };
const MAX_BYTES = 50 * 1024 * 1024;
const TIMEOUT_MS = 45000;
const fail = () => new Error("Creative media could not be downloaded or verified.");

/** Conservative public-address policy, including IPv4-mapped IPv6 and transition ranges. */
export function isPublicCreativeMediaAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    if (a === undefined || b === undefined || c === undefined) return false;
    return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)) || (b === 88 && c === 99))) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes("%") || address.includes(".")) return false;
  const [left, right = ""] = address.toLowerCase().split("::");
  const first = left ? left.split(":") : [], last = right ? right.split(":") : [];
  const words = address.includes("::") ? [...first, ...Array(8 - first.length - last.length).fill("0"), ...last] : first;
  if (words.length !== 8) return false;
  const [a, b] = words.map((w) => parseInt(w, 16));
  if (a === undefined || b === undefined) return false;
  // Only current global unicast 2000::/3; exclude special-use, documentation and 6to4.
  return a >= 0x2000 && a <= 0x3fff && !(a === 0x2001 && (b <= 0x01ff || b === 0x0db8)) && a !== 0x2002 && !(a === 0x3fff && b <= 0x0fff);
}

function ascii(bytes: Uint8Array, start: number, length: number) { return String.fromCharCode(...bytes.subarray(start, start + length)); }
function byte(b: Uint8Array, offset: number): number { const value = b[offset]; if (value === undefined) throw fail(); return value; }
function be32(b: Uint8Array, offset: number) { return ((byte(b, offset) * 0x1000000) + (byte(b, offset + 1) << 16) + (byte(b, offset + 2) << 8) + byte(b, offset + 3)) >>> 0; }
function le32(b: Uint8Array, offset: number) { return (byte(b, offset) + (byte(b, offset + 1) << 8) + (byte(b, offset + 2) << 16) + byte(b, offset + 3) * 0x1000000) >>> 0; }
function hasSequence(bytes: Uint8Array, needle: number[], max = bytes.length): boolean {
  for (let i = 0; i <= Math.min(max, bytes.length) - needle.length; i++) if (needle.every((v, j) => bytes[i + j] === v)) return true;
  return false;
}
function mp3Frame(b: Uint8Array, at: number) {
  if (at < 0 || at + 4 > b.length) return false;
  const first = byte(b, at), second = byte(b, at + 1), third = byte(b, at + 2);
  return first === 0xff && (second & 0xe0) === 0xe0 && ((second >> 3) & 3) !== 1 && ((second >> 1) & 3) !== 0 && (third >> 4) > 0 && (third >> 4) < 15 && ((third >> 2) & 3) !== 3;
}

/** Check signatures and basic container structure, not merely the HTTP Content-Type. */
export function inspectCreativeMediaBytes(bytes: Uint8Array, expected: CreativeMediaKind): { contentType: string; extension: string } {
  let detected: { kind: CreativeMediaKind; contentType: string; extension: string } | undefined;
  if (bytes.length >= 33 && hasSequence(bytes.subarray(0, 8), [137, 80, 78, 71, 13, 10, 26, 10]) && be32(bytes, 8) === 13 && ascii(bytes, 12, 4) === "IHDR" && be32(bytes, 16) > 0 && be32(bytes, 20) > 0 && hasSequence(bytes, [73, 69, 78, 68])) detected = { kind: "image", contentType: "image/png", extension: "png" };
  else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) detected = { kind: "image", contentType: "image/jpeg", extension: "jpg" };
  else if (bytes.length >= 20 && ascii(bytes, 0, 4) === "RIFF" && le32(bytes, 4) + 8 === bytes.length && ascii(bytes, 8, 4) === "WEBP" && ["VP8 ", "VP8L", "VP8X"].includes(ascii(bytes, 12, 4))) detected = { kind: "image", contentType: "image/webp", extension: "webp" };
  else if (bytes.length >= 16 && ascii(bytes, 4, 4) === "ftyp" && be32(bytes, 0) >= 16 && be32(bytes, 0) <= bytes.length) {
    const brands = [ascii(bytes, 8, 4)]; for (let i = 16; i + 4 <= be32(bytes, 0); i += 4) brands.push(ascii(bytes, i, 4));
    if (brands.some((brand) => /^(?:isom|iso[2-9]|mp4[12]|avc1|hvc1|hev1|dash|M4V |F4V |MSNV)$/.test(brand))) detected = { kind: "video", contentType: "video/mp4", extension: "mp4" };
  } else if (bytes.length >= 16 && be32(bytes, 0) === 0x1a45dfa3 && hasSequence(bytes, [119, 101, 98, 109], 4096) && hasSequence(bytes, [0x18, 0x53, 0x80, 0x67], 4096)) detected = { kind: "video", contentType: "video/webm", extension: "webm" };
  else if (bytes.length >= 44 && ascii(bytes, 0, 4) === "RIFF" && le32(bytes, 4) + 8 === bytes.length && ascii(bytes, 8, 4) === "WAVE") {
    let format = false, data = false;
    for (let at = 12; at + 8 <= bytes.length;) { const size = le32(bytes, at + 4); if (at + 8 + size > bytes.length) break; const kind = ascii(bytes, at, 4); if (kind === "fmt " && size >= 16) format = true; if (kind === "data" && size > 0) data = true; at += 8 + size + (size % 2); }
    if (format && data) detected = { kind: "audio", contentType: "audio/wav", extension: "wav" };
  } else {
    let at = 0;
    if (bytes.length >= 10 && ascii(bytes, 0, 3) === "ID3" && [2, 3, 4].includes(byte(bytes, 3)) && bytes.subarray(6, 10).every((v) => v < 128)) at = 10 + (byte(bytes, 6) * 0x200000) + (byte(bytes, 7) * 0x4000) + (byte(bytes, 8) * 0x80) + byte(bytes, 9) + (byte(bytes, 3) === 4 && (byte(bytes, 5) & 0x10) ? 10 : 0);
    if (mp3Frame(bytes, at)) detected = { kind: "audio", contentType: "audio/mpeg", extension: "mp3" };
  }
  if (!detected || detected.kind !== expected) throw fail();
  return { contentType: detected.contentType, extension: detected.extension };
}

function declaredMimeMatches(declared: string | undefined, detected: string) {
  if (!declared) return true;
  const mime = (declared.split(";", 1)[0] ?? "").trim().toLowerCase();
  if (mime === "application/octet-stream" || mime === "binary/octet-stream") return true;
  if (detected === "audio/wav") return ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"].includes(mime);
  if (detected === "audio/mpeg") return ["audio/mpeg", "audio/mp3", "audio/x-mp3"].includes(mime);
  return mime === detected;
}

export async function downloadCreativeMedia(rawUrl: string, options: { maxBytes?: number; expected: CreativeMediaKind; allowSvg?: boolean; timeoutMs?: number }): Promise<DownloadedCreativeMedia> {
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > 100 * 1024 * 1024 || !["image", "video", "audio"].includes(options.expected)) throw fail();
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw fail(); }
  if (rawUrl.length > 8192 || url.protocol !== "https:" || url.username || url.password || url.port || url.hash || url.hostname.endsWith(".")) throw fail();
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (!hostname || /(?:^|\.)(?:localhost|local|internal|lan|home|onion)$/i.test(hostname)) throw fail();
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > TIMEOUT_MS) throw fail();
  const deadline = Date.now() + timeoutMs;
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  let records: Awaited<ReturnType<typeof dnsLookup>>[];
  try {
    const addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await Promise.race([
      dnsLookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { dnsTimer = setTimeout(() => reject(fail()), timeoutMs); }),
    ]);
    records = addresses;
    if (!records.length || records.some((r) => !isPublicCreativeMediaAddress(r.address))) throw fail();
  } catch { throw fail(); } finally { if (dnsTimer) clearTimeout(dnsTimer); }
  const pinned = records[0];
  if (!pinned) throw fail();
  if (deadline <= Date.now()) throw fail();
  return new Promise((resolve, reject) => {
    let done = false;
    let req: ReturnType<typeof httpsRequest> | undefined;
    const timer = setTimeout(() => finish(), Math.max(1, deadline - Date.now()));
    function finish(result?: DownloadedCreativeMedia) {
      if (done) return; done = true; clearTimeout(timer);
      if (result) resolve(result); else { req?.destroy(); reject(fail()); }
    }
    try {
      req = httpsRequest(url, {
        // Node passes this through to net.connect; spread avoids older https typings omitting it.
        method: "GET", agent: false, ...{ autoSelectFamily: false }, family: pinned.family,
        lookup: (_host, _lookupOptions, callback) => callback(null, pinned.address, pinned.family),
        headers: { Accept: options.expected === "image" ? "image/png,image/jpeg,image/webp" : options.expected === "video" ? "video/mp4,video/webm" : "audio/mpeg,audio/wav", "Accept-Encoding": "identity" },
      }, (response) => {
        if (response.statusCode !== 200 || (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity")) { response.destroy(); finish(); return; }
        const size = response.headers["content-length"];
        if (size && (!/^\d+$/.test(size) || Number(size) > maxBytes)) { response.destroy(); finish(); return; }
        const chunks: Buffer[] = []; let total = 0;
        response.on("data", (chunk: Buffer) => { if (done) return; total += chunk.length; if (total > maxBytes) { response.destroy(); finish(); } else chunks.push(chunk); });
        response.on("error", () => finish()); response.on("aborted", () => finish());
        response.on("end", () => {
          if (done) return;
          try {
            if (!response.complete || !total || (size && Number(size) !== total)) throw fail();
            const bytes = Buffer.concat(chunks, total);
            // SVG bytes are opt-in and must be sanitized by the requesting caller before use.
            const declared = (response.headers["content-type"] ?? "").split(";", 1)[0]?.trim().toLowerCase();
            const detected = options.expected === "image" && options.allowSvg && declared === "image/svg+xml"
              ? { contentType: "image/svg+xml", extension: "svg" }
              : inspectCreativeMediaBytes(bytes, options.expected);
            if (!declaredMimeMatches(response.headers["content-type"], detected.contentType)) throw fail();
            finish({ bytes: new Uint8Array(bytes), ...detected });
          } catch { finish(); }
        });
      });
      req.on("error", () => finish()); req.setTimeout(Math.max(1, deadline - Date.now()), () => finish()); req.end();
    } catch { finish(); }
  });
}
