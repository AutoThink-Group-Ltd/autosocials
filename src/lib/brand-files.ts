// Client-safe helpers for the Brand Assets home.
// Finished carousel manifests belong to Sam's creations, not the uploaded brand evidence library.
export const BRAND_INPUT_FILTER = "source.is.null,source.neq.linkedin_carousel";
export type FileKind = "image" | "video" | "audio" | "doc" | "font" | "logo" | "archive" | "other";

const EXT: Record<string, FileKind> = {
  png: "image", jpg: "image", jpeg: "image", webp: "image", gif: "image", svg: "image", avif: "image",
  mp4: "video", mov: "video", webm: "video", mkv: "video", m4v: "video",
  mp3: "audio", wav: "audio", m4a: "audio", ogg: "audio", aac: "audio", flac: "audio",
  md: "doc", markdown: "doc", txt: "doc", pdf: "doc", json: "doc", csv: "doc", docx: "doc", html: "doc", pptx: "doc", doc: "doc", ppt: "doc",
  woff: "font", woff2: "font", ttf: "font", otf: "font",
  zip: "archive", ico: "image",
};

export function extOf(name: string) {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i + 1).toLowerCase();
}

export function kindOf(name: string): FileKind {
  const k = EXT[extOf(name)] ?? "other";
  if (k === "image" && /(logo|icon|favicon|brandmark|wordmark)/i.test(name)) return "logo";
  return k;
}

/** Text we can read straight into Sam's context. */
export function isReadableText(name: string) {
  return ["md", "markdown", "txt", "json", "csv", "html"].includes(extOf(name));
}

/** Junk entries inside zips that should never be stored. */
export function isJunkPath(path: string) {
  return path.split("/").some((p) => p.startsWith(".") || p === "__MACOSX" || p === "Thumbs.db");
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const MAX_TEXT_CHARS = 60000;

/** Only video and audio go to AutoToast media storage; everything else stays in Lovable Cloud. */
export const AUTOTOAST_EXT = ["mp4", "mov", "webm", "mkv", "m4v", "mp3", "wav", "m4a", "aac", "ogg", "flac"];
export function storesOnAutoToast(name: string) {
  return AUTOTOAST_EXT.includes(extOf(name));
}
export const AUTOTOAST_PREFIX = "autotoast:";
export const isAutoToastPath = (p: string | null | undefined) => !!p && p.startsWith(AUTOTOAST_PREFIX);

export function mimeFor(name: string) {
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", avif: "image/avif", ico: "image/x-icon", mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", m4v: "video/mp4", mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", md: "text/markdown", txt: "text/plain", json: "application/json", csv: "text/csv", html: "text/html", pdf: "application/pdf", woff2: "font/woff2", woff: "font/woff", ttf: "font/ttf", otf: "font/otf", zip: "application/zip" } as Record<string, string>)[extOf(name)] ?? "application/octet-stream";
}

/** "photo.png" -> "photo (2).png" when the name is taken in that folder. */
export function dedupeName(name: string, taken: Iterable<string>) {
  const set = new Set([...taken].map((t) => t.toLowerCase()));
  if (!set.has(name.toLowerCase())) return name;
  const i = name.lastIndexOf(".");
  const base = i > 0 ? name.slice(0, i) : name, ext = i > 0 ? name.slice(i) : "";
  for (let n = 2; ; n++) { const c = `${base} (${n})${ext}`; if (!set.has(c.toLowerCase())) return c; }
}

/** Fast content fingerprint: full SHA-256 up to 200 MB, else first+last 8 MB + size. */
export async function hashBlob(blob: Blob): Promise<string> {
  const MB = 1024 * 1024;
  const read = (b: Blob) => (typeof b.arrayBuffer === "function" ? b.arrayBuffer() : new Promise<ArrayBuffer>((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.onerror = rej; r.readAsArrayBuffer(b); }));
  const data = await read(blob.size <= 200 * MB ? blob : new Blob([blob.slice(0, 8 * MB), blob.slice(blob.size - 8 * MB), String(blob.size)]));
  const d = await crypto.subtle.digest("SHA-256", data);
  return (blob.size > 200 * MB ? "p:" : "") + [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function relativeDate(iso: string, now = new Date()) {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(now) - day(d)) / 86400000);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (diff === 0) return `Today ${time}`;
  if (diff === 1) return `Yesterday ${time}`;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export type DateRange = "any" | "today" | "7d" | "30d" | "year";
export type SizeRange = "any" | "small" | "medium" | "large";
export type SortKey = "name" | "newest" | "oldest" | "largest" | "type";
export type Filterable = { name: string; kind: string; size_bytes: number; created_at: string; ai_label?: string | null; folder_id?: string | null };
export type Filters = { kind: string; date: DateRange; size: SizeRange; folder: string | "any"; term: string };

export function matchesFilters(f: Filterable, x: Filters, folderName = "", now = new Date()) {
  if (x.kind !== "all" && f.kind !== x.kind) return false;
  if (x.folder !== "any" && f.folder_id !== x.folder) return false;
  if (x.date !== "any") {
    const t = new Date(f.created_at).getTime();
    const start = x.date === "today" ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
      : x.date === "year" ? new Date(now.getFullYear(), 0, 1).getTime()
      : now.getTime() - (x.date === "7d" ? 7 : 30) * 86400000;
    if (t < start) return false;
  }
  const MB = 1024 * 1024;
  if (x.size === "small" && f.size_bytes >= MB) return false;
  if (x.size === "medium" && (f.size_bytes < MB || f.size_bytes >= 50 * MB)) return false;
  if (x.size === "large" && f.size_bytes < 50 * MB) return false;
  const term = x.term.trim().toLowerCase();
  if (term && !`${f.name} ${extOf(f.name)} ${f.ai_label ?? ""} ${folderName}`.toLowerCase().includes(term)) return false;
  return true;
}

export function sortFiles<T extends Filterable>(list: T[], key: SortKey): T[] {
  const c = [...list];
  const by: Record<SortKey, (a: T, b: T) => number> = {
    name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }),
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
    oldest: (a, b) => a.created_at.localeCompare(b.created_at),
    largest: (a, b) => b.size_bytes - a.size_bytes,
    type: (a, b) => extOf(a.name).localeCompare(extOf(b.name)) || a.name.localeCompare(b.name),
  };
  return c.sort(by[key]);
}
