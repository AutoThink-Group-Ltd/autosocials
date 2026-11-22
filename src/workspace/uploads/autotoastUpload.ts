// Browser side of AutoToast resumable uploads: 8 MB parts with a one-upload token.
import { startMediaUpload, recordMedia } from "@/lib/media.functions";

function putPart(url: string, token: string, blob: Blob, onBytes: (n: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let watchdog: ReturnType<typeof setTimeout>;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watchdog);
      if (error) reject(error); else resolve();
    };
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => { xhr.abort(); finish(new Error("upload stalled")); }, 120_000);
    };
    xhr.open("PUT", url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => { onBytes(e.loaded); arm(); };
    xhr.onload = () => finish(xhr.status < 300 ? undefined : new Error(xhr.status === 402 ? "video storage is full" : xhr.status === 410 ? "upload expired" : `upload failed (${xhr.status})`));
    xhr.onerror = () => finish(new Error("connection dropped"));
    xhr.onabort = () => finish(new Error("upload stalled"));
    arm();
    xhr.send(blob);
  });
}

async function received(url: string, token: string): Promise<Set<number>> {
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return new Set();
    return new Set(((await r.json()) as { received_parts?: number[] }).received_parts ?? []);
  } catch { return new Set(); }
}

/** Uploads one video/audio blob to AutoToast and records it in Brand Assets. Retries dropped parts. */
export async function uploadToAutoToast(o: {
  workspaceId: string; blob: Blob; name: string; folderId: string | null; source: string; onBytes: (n: number) => void; contentHash?: string | null;
}) {
  const type = o.blob.type || "application/octet-stream";
  const up = await startMediaUpload({ data: { workspace_id: o.workspaceId, filename: o.name, content_type: type, size_bytes: o.blob.size } });
  const done = new Map<number, number>();
  const report = (part: number, n: number) => { done.set(part, n); o.onBytes([...done.values()].reduce((a, b) => a + b, 0)); };
  for (let attempt = 0; attempt < 4; attempt++) {
    const have = attempt ? await received(up.upload_url, up.upload_token) : new Set<number>();
    try {
      for (let n = 1; n <= up.total_parts; n++) {
        const start = (n - 1) * up.chunk_size;
        const part = o.blob.slice(start, Math.min(start + up.chunk_size, o.blob.size));
        if (have.has(n)) { report(n, part.size); continue; }
        await putPart(`${up.upload_url}/parts/${n}`, up.upload_token, part, (b) => report(n, b));
        report(n, part.size);
      }
      break;
    } catch (e) {
      if (attempt === 3 || (e instanceof Error && /full|expired/.test(e.message))) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  const c = await fetch(`${up.upload_url}/complete`, { method: "POST", headers: { Authorization: `Bearer ${up.upload_token}` } });
  if (!c.ok) throw new Error(`couldn't finish upload (${c.status})`);
  return recordMedia({ data: { workspace_id: o.workspaceId, media_id: up.media_id, name: o.name, mime: o.blob.type || null, size_bytes: o.blob.size, folder_id: o.folderId, source: o.source, content_hash: o.contentHash ?? null } });
}
