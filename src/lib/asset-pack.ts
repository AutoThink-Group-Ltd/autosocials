import { isJunkPath, kindOf, mimeFor } from "./brand-files";
export const ASSET_PACK_LIMITS = { archiveBytes: 100 * 1024 ** 2, fileBytes: 50 * 1024 ** 2, totalBytes: 250 * 1024 ** 2, files: 100 };
export type AssetPackEntry = { name: string; dir: string; blob: Blob };
export function safeAssetPackPath(path: string) {
  if (!path || path.length > 240 || /[\\\x00-\x1f:]/.test(path) || path.startsWith("/") || path.split("/").some(p => p === ".." || p === ".")) throw new Error("The ZIP contains an unsafe file path.");
  return path;
}
/** Inspect metadata before inflating; never recursively unpack archives. */
export async function expandAssetPack(blob: Blob, name: string, dir = ""): Promise<AssetPackEntry[]> {
  if (!name.toLowerCase().endsWith(".zip")) return [{ name, dir, blob: blob.type ? blob : new Blob([blob], { type: mimeFor(name) }) }];
  if (blob.size > ASSET_PACK_LIMITS.archiveBytes) throw new Error("ZIP packs must be 100 MB or smaller.");
  const buffer = blob.arrayBuffer ? await blob.arrayBuffer() : await new Promise<ArrayBuffer>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result as ArrayBuffer); reader.onerror = () => reject(new Error("This ZIP could not be read.")); reader.readAsArrayBuffer(blob); });
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 22) throw new Error("This ZIP could not be read.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) if (view.getUint32(end, true) === 0x06054b50) break;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error("This ZIP could not be read.");
  const count = view.getUint16(end + 10, true), offset = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || count > ASSET_PACK_LIMITS.files || count === 65535 || offset === 0xffffffff) throw new Error("Use a single ZIP with at most 100 files; split or ZIP64 archives are not supported.");
  let cursor = offset, total = 0;
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== 0x02014b50) throw new Error("This ZIP directory is invalid.");
    if (view.getUint16(cursor + 8, true) & 1) throw new Error("Encrypted ZIP packs are not supported.");
    const size = view.getUint32(cursor + 24, true), length = view.getUint16(cursor + 28, true);
    const path = new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + length));
    safeAssetPackPath(path); total += size;
    if (size > ASSET_PACK_LIMITS.fileBytes || total > ASSET_PACK_LIMITS.totalBytes) throw new Error("ZIP contents exceed the 50 MB per-file or 250 MB total limit.");
    if (!path.endsWith("/") && !isJunkPath(path) && ["archive", "other"].includes(kindOf(path))) throw new Error(`Unsupported file in ZIP: ${path}. Remove nested archives and executable files.`);
    cursor += 46 + length + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const base = [dir, name.replace(/\.zip$/i, "")].filter(Boolean).join("/");
  const out: AssetPackEntry[] = [];
  let actualTotal = 0;
  for (const entry of Object.values(zip.files)) {
    if (entry.dir || isJunkPath(entry.name)) continue;
    safeAssetPackPath((entry as unknown as { unsafeOriginalName?: string }).unsafeOriginalName ?? entry.name);
    const data = await new Promise<Uint8Array>((resolve, reject) => {
      const chunks: Uint8Array[] = []; let size = 0;
      const stream = entry.internalStream("uint8array");
      stream.on("data", (chunk: Uint8Array) => { size += chunk.length; actualTotal += chunk.length; if (size > ASSET_PACK_LIMITS.fileBytes || actualTotal > ASSET_PACK_LIMITS.totalBytes) { stream.pause(); reject(new Error("Expanded ZIP exceeds the safe import limit.")); } else chunks.push(chunk); });
      stream.on("error", reject); stream.on("end", () => { const joined = new Uint8Array(size); let at = 0; for (const chunk of chunks) { joined.set(chunk, at); at += chunk.length; } resolve(joined); }); stream.resume();
    });
    const parts = entry.name.split("/"), leaf = parts.pop()!;
    out.push({ name: leaf, dir: [base, ...parts].join("/"), blob: new Blob([data as BlobPart], { type: mimeFor(leaf) }) });
  }
  return out;
}

