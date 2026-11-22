import { imageHeader } from "./film-qa";

const hosts = ["fbcdn.net", "cdninstagram.com", "ytimg.com", "tiktokcdn.com", "tiktokcdn-us.com", "tiktokcdn-eu.com"];
const limit = 1_500_000;

export function allowedWinnerThumbnail(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 4096) return false;
  try {
    const url = new URL(value), host = url.hostname.toLowerCase().replace(/\.$/, "");
    return url.protocol === "https:" && !url.username && !url.password && !url.port && hosts.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  } catch { return false; }
}

/** Provider CDN only, no redirects, bounded bytes, and no remote URL sent to the model. */
export async function inspectableWinnerThumbnail(url: unknown): Promise<string | null> {
  if (!allowedWinnerThumbnail(url)) return null;
  try {
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(8000) });
    if (!response.ok || !response.body || Number(response.headers.get("content-length") ?? 0) > limit) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) { await reader.cancel(); return null; }
      chunks.push(part.value);
    }
    const bytes = Buffer.concat(chunks.map(chunk => Buffer.from(chunk)));
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    if (!imageHeader(data)) return null;
    const mime = bytes[0] === 0x89 ? "image/png" : bytes[0] === 0xff ? "image/jpeg" : "image/webp";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch { return null; }
}
