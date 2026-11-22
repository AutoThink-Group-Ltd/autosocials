import { expandAssetPack } from "@/lib/asset-pack";
// Module-level upload queue: survives route changes, tab switches and component unmounts.
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import { kindOf, isJunkPath, isReadableText, MAX_TEXT_CHARS, storesOnAutoToast, mimeFor, hashBlob, dedupeName } from "@/lib/brand-files";
import { uploadToAutoToast } from "./autotoastUpload";

export const ASSET_BUCKET = "brand-assets-private";
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;
const PRIVATE_BUCKET_LIMIT = 5 * 1024 ** 3;

export type UploadJob = {
  id: string;
  workspaceId: string;
  phase: "unpacking" | "uploading" | "sorting" | "done" | "error";
  filesDone: number;
  filesTotal: number;
  bytesDone: number;
  bytesTotal: number;
  current: string;
  errors: string[];
  skipped?: number;
  folderLabel?: string | undefined;
  samRead?: boolean;
};
type Entry = { name: string; dir: string; blob: Blob };
export type UploadOptions = {
  folderId?: string | null;
  folderLabel?: string | undefined;
  /** Creates/finds a sub-folder for a path inside a ZIP; returns its id. */
  resolveFolder?: (dir: string) => Promise<string | null>;
};
const failed = new Map<string, { entries: Entry[]; after?: AfterUpload | undefined; opts: UploadOptions }>();
export const canRetry = (id: string) => failed.has(id);
export function retryUpload(id: string) {
  const f = failed.get(id); const j = jobs.find((x) => x.id === id);
  if (!f || !j) return;
  failed.delete(id); dismissUpload(id);
  void run(j.workspaceId, f.entries, f.after, f.opts, false);
}

let jobs: UploadJob[] = [];
const listeners = new Set<() => void>();
const emit = () => { jobs = [...jobs]; listeners.forEach((l) => l()); };
const patch = (id: string, p: Partial<UploadJob>) => { jobs = jobs.map((j) => (j.id === id ? { ...j, ...p } : j)); listeners.forEach((l) => l()); };

export function useUploads() {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => jobs, () => jobs);
}
export const dismissUpload = (id: string) => { jobs = jobs.filter((j) => j.id !== id); emit(); };
export const hasActiveUploads = () => jobs.some((j) => j.phase !== "done" && j.phase !== "error");

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", (e) => { if (hasActiveUploads()) { e.preventDefault(); e.returnValue = ""; } });
}

const expand = expandAssetPack;
export const expandForUpload = expand;

/** Small files use a single request; larger files use Storage's resumable protocol. */
async function putObject(path: string, blob: Blob, token: string, onBytes: (n: number) => void) {
  if (blob.size > PRIVATE_BUCKET_LIMIT) throw new Error("exceeds the 5 GB private storage limit");
  if (blob.size > RESUMABLE_THRESHOLD) {
    const { Upload } = await import("tus-js-client");
    const base = new URL(import.meta.env.VITE_SUPABASE_URL as string);
    if (base.hostname.endsWith(".supabase.co")) base.hostname = base.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
    const endpoint = `${base.origin}/storage/v1/upload/resumable`;
    const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
    await new Promise<void>((resolve, reject) => {
      const upload = new Upload(blob, {
        endpoint,
        chunkSize: 6 * 1024 * 1024,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: ASSET_BUCKET, objectName: path, contentType: blob.type || "application/octet-stream", cacheControl: "3600" },
        headers: { apikey: key, authorization: `Bearer ${token}`, "x-upsert": "false" },
        onBeforeRequest: async (request) => {
          const { data } = await supabase.auth.getSession();
          if (!data.session?.access_token) throw new Error("Please sign in again.");
          request.setHeader("authorization", `Bearer ${data.session.access_token}`);
        },
        onProgress: (sent) => onBytes(sent),
        onError: reject,
        onSuccess: () => resolve(),
      });
      upload.start();
    });
    return;
  }
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/storage/v1/object/${ASSET_BUCKET}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", key);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("Content-Type", blob.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(xhr.status === 413 ? "too large" : `upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("connection dropped"));
    xhr.timeout = 120_000;
    xhr.ontimeout = () => reject(new Error("upload timed out"));
    xhr.send(blob);
  });
}

export type AfterUpload = (workspaceId: string) => Promise<void>;
export type UploadResult = { files: { name: string; fileId: string | null; error?: string }[]; errors: string[] };

export function startUpload(workspaceId: string, files: File[], after?: AfterUpload, opts: UploadOptions = {}): Promise<UploadResult> {
  if (!files.length) return Promise.resolve({ files: [], errors: [] });
  return run(workspaceId, files, after, opts, files.some((f) => f.name.toLowerCase().endsWith(".zip")));
}

async function run(workspaceId: string, input: (File | Entry)[], after: AfterUpload | undefined, opts: UploadOptions, fromZip: boolean) {
  let entries: Entry[] = [];
  const saved = new Map<Entry, string>();
  const failures = new Map<Entry, string>();
  const savedHashes = new Map<string, string>();
  const hashes = new Map<Entry, string>();
  const result = (errors: string[]): UploadResult => ({ files: entries.map((entry) => ({ name: entry.name, fileId: saved.get(entry) ?? savedHashes.get(hashes.get(entry) ?? "") ?? null, ...(failures.has(entry) ? { error: failures.get(entry)! } : {}) })), errors });
  const id = crypto.randomUUID();
  jobs = [...jobs, { id, workspaceId, phase: "unpacking", filesDone: 0, filesTotal: 0, bytesDone: 0, bytesTotal: 0, current: "", errors: [], folderLabel: opts.folderLabel }];
  emit();
  try {
    entries = (await Promise.all(input.map((f) => ("blob" in f ? Promise.resolve([f as Entry]) : expand(f as File, (f as File).name))))).flat();
    const bad: Entry[] = [];
    const folderCache = new Map<string, Promise<string | null>>();
    const folderFor = (dir: string) => {
      if (!dir || !opts.resolveFolder) return Promise.resolve(opts.folderId ?? null);
      if (!folderCache.has(dir)) folderCache.set(dir, opts.resolveFolder(dir));
      return folderCache.get(dir)!;
    };
    const bytesTotal = entries.reduce((s, e) => s + e.blob.size, 0);
    patch(id, { phase: "uploading", filesTotal: entries.length, bytesTotal });
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    const userId = sess.session?.user.id ?? null;
    if (!token) throw new Error("Please sign in again.");
    const inflight = new Map<string, number>();
    const live = () => doneBytes + [...inflight.values()].reduce((a, b) => a + b, 0);
    let doneBytes = 0; let filesDone = 0; const errors: string[] = [];
    const source = fromZip || entries.some((e) => e.dir) ? "zip" : "upload";
    // Skip files already in the library (same content), or repeated in this batch.
    await Promise.all(entries.map(async (e) => { try { hashes.set(e, await hashBlob(e.blob)); } catch { /* no hash */ } }));
    const known = new Set<string>();
    const all = [...new Set(hashes.values())];
    for (let i = 0; i < all.length; i += 200) {
      const { data, error } = await supabase.from("brand_files").select("id,content_hash").eq("workspace_id", workspaceId).in("content_hash", all.slice(i, i + 200));
      if (error) throw new Error("Couldn't check existing brand assets. Please try again.");
      (data ?? []).forEach((r) => { if (r.content_hash) { known.add(r.content_hash); savedHashes.set(r.content_hash, r.id); } });
    }
    let skipped = 0;
    const fresh = entries.filter((e) => { const h = hashes.get(e); if (!h) return true; if (known.has(h)) { skipped++; return false; } known.add(h); return true; });
    patch(id, { skipped, filesTotal: fresh.length, bytesTotal: fresh.reduce((s, e) => s + e.blob.size, 0) });
    const names = new Map<string, Promise<Set<string>>>();
    const takenIn = (folderId: string | null) => {
      const k = folderId ?? "root";
      if (!names.has(k)) names.set(k, (async () => {
        let q = supabase.from("brand_files").select("name").eq("workspace_id", workspaceId);
        q = folderId ? q.eq("folder_id", folderId) : q.is("folder_id", null);
        return new Set(((await q.limit(5000)).data ?? []).map((r) => r.name));
      })());
      return names.get(k)!;
    };
    const queue = [...fresh];
    await Promise.all(Array.from({ length: 3 }, async () => {
      while (queue.length) {
        const e = queue.shift()!;
        const key = crypto.randomUUID();
        try {
          patch(id, { current: e.name });
          const folderId = await folderFor(e.dir);
          const taken = await takenIn(folderId);
          const name = dedupeName(e.name, taken); taken.add(name);
          const contentHash = hashes.get(e) ?? null;
          const onBytes = (n: number) => { inflight.set(key, n); patch(id, { bytesDone: live() }); };
          if (storesOnAutoToast(e.name)) {
            try {
              const uploaded = await uploadToAutoToast({ workspaceId, blob: e.blob, name, folderId, source, onBytes, contentHash });
              saved.set(e, uploaded.file_id);
              if (contentHash) savedHashes.set(contentHash, uploaded.file_id);
              inflight.delete(key); doneBytes += e.blob.size; filesDone++;
              patch(id, { filesDone, bytesDone: doneBytes, errors: [...errors] });
              continue;
            } catch (atErr) {
              if (atErr instanceof Error && /full/.test(atErr.message)) throw atErr;
              if (e.blob.size > PRIVATE_BUCKET_LIMIT) throw new Error("video upload failed; the 5 GB backup storage limit cannot hold this file");
              console.warn("AutoToast upload failed, falling back to private storage", atErr);
              inflight.set(key, 0);
            }
          }
          const path = `${workspaceId}/${crypto.randomUUID()}/${e.name.replace(/[^\w.\- ]+/g, "_")}`;
          await putObject(path, e.blob, token, onBytes);
          const text = isReadableText(e.name) ? (await e.blob.text()).slice(0, MAX_TEXT_CHARS) : null;
          const { data: inserted, error } = await supabase.from("brand_files").insert({
            workspace_id: workspaceId, folder_id: folderId, name, kind: kindOf(e.name), content_hash: contentHash, mime: e.blob.type || null,
            size_bytes: e.blob.size, storage_path: path, source, extracted_text: text, created_by: userId,
          }).select("id").single();
          if (error) throw new Error(error.message);
          saved.set(e, inserted.id);
          if (contentHash) savedHashes.set(contentHash, inserted.id);
        } catch (err) { bad.push(e); const message = `${e.name}: ${err instanceof Error ? err.message : String(err)}`; failures.set(e, message); errors.push(message); }
        inflight.delete(key); doneBytes += e.blob.size; filesDone++;
        patch(id, { filesDone, bytesDone: doneBytes, errors: [...errors] });
      }
    }));
    if (!fresh.length) { patch(id, { phase: "done", current: "" }); return result([]); }
    if (bad.length) failed.set(id, { entries: bad, after, opts });
    // Files are saved — finish the upload now; Sam keeps reading in the background
    // (progress shows on the Brand Assets page), so a slow read never looks "stuck".
    patch(id, { phase: errors.length === fresh.length ? "error" : "done", current: "", samRead: false });
    if (filesDone > errors.length && after) void after(workspaceId).catch((e) => console.warn("Sam reading failed", e));
    if (!errors.length) setTimeout(() => dismissUpload(id), 6000);
    return result(errors);
  } catch (err) {
    const errors = [err instanceof Error ? err.message : "Upload failed"];
    patch(id, { phase: "error", errors });
    return result(errors);
  }
}
