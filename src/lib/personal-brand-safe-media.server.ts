import { promises as dns } from "node:dns";
import { request } from "node:https";
import { isIP } from "node:net";

const suffixes = [".fbcdn.net", ".cdninstagram.com", ".tiktokcdn.com", ".tiktokcdn-us.com", ".akamaized.net", ".tiktok.com", ".instagram.com", ".licdn.com"];
function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 && (c === 0 || c === 2) || b === 88 && c === 99) || a === 198 && b === 51 && c === 100 || a === 203 && b === 0 && c === 113 || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19));
  }
  // Reject IPv6 until its full special-purpose ranges can be validated safely.
  return false;
}
/** Pinned DNS resolution prevents a provider CDN hostname rebinding between validation and connection. */
export async function fetchPinnedPublicMedia(raw: string, maxBytes: number, accept: string): Promise<Response> {
  const url = new URL(raw); const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || !suffixes.some((suffix) => host.endsWith(suffix))) throw new Error("Unsupported media URL");
  const addresses = await dns.lookup(host, { all: true });
  const usable = addresses.filter((item) => publicAddress(item.address));
  if (!usable.length || addresses.some((item) => item.family === 4 && !publicAddress(item.address))) throw new Error("Unsafe media host");
  const selected = usable[0]!;
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", headers: { Accept: accept }, lookup: ((_hostname, options, callback) => {
      // Node can request all addresses when automatic address-family selection is enabled.
      // Return the already validated, pinned address in the shape Node requested.
      if (typeof options === "object" && options.all) callback(null, [{ address: selected.address, family: 4 }]);
      else callback(null, selected.address, 4);
    }) as typeof import("node:dns").lookup }, (res) => {
      const headers = new Headers(); for (const [key, value] of Object.entries(res.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
      const chunks: Buffer[] = []; let size = 0;
      if (Number(headers.get("content-length") || 0) > maxBytes) { res.destroy(); reject(new Error("Media exceeds limit")); return; }
      res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) { res.destroy(new Error("Media exceeds limit")); return; } chunks.push(chunk); });
      res.on("error", reject); res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode ?? 500, headers })));
    });
    req.setTimeout(18000, () => req.destroy(new Error("Media request timed out"))); req.on("error", reject); req.end();
  });
}
