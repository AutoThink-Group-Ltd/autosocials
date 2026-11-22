// Server-only: AutoToast (HyperFrames) rendering + ElevenLabs voiceover.
import { parseSize } from "./content-rules";
import { fetchOpenAI } from "./openai-quota.server";
import { trackedGenerationFetch } from "./generation-context.server";


function base() {
  const url = process.env["RENDER_SERVER_URL"];
  const key = process.env["RENDER_SERVER_SECRET"];
  if (!url || !key) throw new Error("The video render server isn't connected.");
  return { url: url.replace(/\/$/, ""), key };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function pickPalette(colours: unknown, selected?: { primary?: string | null; accent?: string | null; background?: string | null; text?: string | null } | null): { bg: string; fg: string; primary: string; accent: string } {
  const hex = (Array.isArray(colours) ? colours : []).map((c) => String(c).match(/#[0-9a-f]{6}\b/i)?.[0]).filter(Boolean) as string[];
  const lum = (h: string) => { const n = parseInt(h.slice(1), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };
  const dark = hex.find((h) => lum(h) < 0.35) ?? "#1B1A17";
  const accent = hex.find((h) => h !== dark && lum(h) > 0.35 && lum(h) < 0.85) ?? "#E7A84B";
  const bg = selected?.background ?? dark;
  const fg = selected?.text ?? (lum(bg) > 0.55 ? "#1B1A17" : "#F4EFE6");
  return { bg, fg, primary: selected?.primary ?? selected?.accent ?? accent, accent: selected?.accent ?? selected?.primary ?? accent };
}

export type SceneMedia = { path: string; type: "image" | "video" };

/**
 * A self-contained HyperFrames composition built from the brief and the brand's own files:
 * each scene (hook, storyboard frames, CTA) sits over one brand photo/clip, the logo stays in
 * the corner and closes the video on the end card. Without files it falls back to text on brand colour.
 */
export function buildComposition(o: { size: string; duration: number; hook: string; beats: string[]; cta: string; brand: string; palette: { bg: string; fg: string; accent: string; primary?: string }; logo?: string | null; media?: SceneMedia[] }) {
  const { width, height } = parseSize(o.size);
  const scenes = [o.hook, ...o.beats.slice(0, 5), o.cta || o.brand].filter((s) => s.trim());
  const per = o.duration / scenes.length;
  const media = o.media ?? [];
  const hasMedia = media.length > 0;
  const fontPx = Math.round(Math.min(width, height) * (hasMedia ? 0.072 : 0.085));
  const last = scenes.length - 1;
  const at = (n: number) => n.toFixed(2);
  const mediaEls = hasMedia ? scenes.map((_, i) => {
    if (i === last && o.logo) return "";
    const m = media[i % media.length]!;
    const common = `id="m${i}" class="clip media" data-start="${at(i * per)}" data-duration="${at(per)}" data-track-index="0"`;
    return m.type === "video"
      ? `<video ${common} src="${esc(m.path)}" muted playsinline data-media-start="0"></video>`
      : `<img ${common} src="${esc(m.path)}" alt="">`;
  }).join("") : "";
  const els = scenes.map((t, i) => {
    const endLogo = i === last && o.logo ? `<img class="endlogo" src="${esc(o.logo)}" alt="">` : "";
    return `<div id="s${i}" class="clip scene${hasMedia && !(i === last && o.logo) ? " over" : ""}" data-start="${at(i * per)}" data-duration="${at(per)}" data-track-index="1">${endLogo}<p>${esc(t)}</p></div>`;
  }).join("");
  const tl = scenes.map((_, i) => {
    const s = at(i * per);
    const kb = hasMedia && !(i === last && o.logo) && media[i % media.length]!.type === "image"
      ? `tl.fromTo("#m${i}",{scale:1.0},{scale:1.08,duration:${at(per)},ease:"none"},${s});tl.fromTo("#m${i}",{opacity:0},{opacity:1,duration:0.35},${s});` : "";
    return `${kb}tl.fromTo("#s${i}",{opacity:0,y:60},{opacity:1,y:0,duration:0.6,ease:"power3.out"},${s});tl.to("#s${i}",{opacity:0,y:-40,duration:0.4},${at(i * per + per - 0.45)});`;
  }).join("");
  const logoCorner = o.logo
    ? `<img id="logo" class="clip" src="${esc(o.logo)}" alt="" data-start="0" data-duration="${at(last * per)}" data-track-index="4">`
    : `<div id="brand" class="clip" data-start="0" data-duration="${o.duration}" data-track-index="2">${esc(o.brand)}</div>`;
  return `<!doctype html><html><head><meta charset="UTF-8"><script src="gsap.min.js"></script><style>
html,body{margin:0;width:${width}px;height:${height}px;overflow:hidden;background:${o.palette.bg}}
#root{position:relative;width:100%;height:100%}
.media{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform-origin:center}
.scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:${Math.round(width * 0.09)}px;box-sizing:border-box;opacity:0}
.scene.over{justify-content:flex-end;padding-bottom:${Math.round(height * 0.12)}px;background:linear-gradient(to top,rgba(0,0,0,.78) 0%,rgba(0,0,0,.35) 45%,rgba(0,0,0,0) 70%)}
.scene p{margin:0;color:${o.palette.fg};font:800 ${fontPx}px/1.12 Helvetica,Arial,sans-serif;text-align:center;letter-spacing:-0.02em}
.scene.over p{color:#FFFFFF;text-shadow:0 4px 24px rgba(0,0,0,.45)}
#s0 p{color:${o.palette.primary ?? o.palette.accent}}
.endlogo{max-width:${Math.round(width * 0.42)}px;max-height:${Math.round(height * 0.16)}px;object-fit:contain;margin-bottom:${Math.round(height * 0.04)}px}
#logo{position:absolute;top:${Math.round(height * 0.04)}px;left:${Math.round(width * 0.05)}px;max-width:${Math.round(width * 0.22)}px;max-height:${Math.round(height * 0.06)}px;object-fit:contain}
#bar{position:absolute;left:0;bottom:0;height:${Math.round(height * 0.012)}px;width:100%;background:${o.palette.accent};transform-origin:left;transform:scaleX(0)}
#brand{position:absolute;top:${Math.round(height * 0.05)}px;width:100%;text-align:center;color:${o.palette.fg};opacity:.7;font:600 ${Math.round(fontPx * 0.4)}px Helvetica,Arial,sans-serif}
</style></head><body><div id="root" data-composition-id="main" data-start="0" data-duration="${o.duration}" data-width="${width}" data-height="${height}">
${mediaEls}${logoCorner}${els}
<div id="bar" class="clip" data-start="0" data-duration="${o.duration}" data-track-index="3"></div></div>
<script>window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});${tl}tl.to("#bar",{scaleX:1,duration:${o.duration},ease:"none"},0);window.__timelines["main"]=tl;tl.seek(0);</script></body></html>`;
}

export type ProjectFile = string | { base64: string } | { media_id: string };

export async function synthesiseVoice(key: string, voiceId: string, text: string): Promise<ArrayBuffer> {
  const r = await trackedGenerationFetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!r.ok) throw new Error(r.status === 401 ? "ElevenLabs rejected the key." : `Voiceover failed (${r.status}).`);
  const { pcmToWav } = await import("./film-length");
  return pcmToWav(new Uint8Array(await r.arrayBuffer()), 24000);
}

/** ElevenLabs voice with real character timings, so captions follow the actual speech. */
export async function synthesiseVoiceTimed(key: string, voiceId: string, text: string) {
  const r = await trackedGenerationFetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=pcm_24000`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
  });
  if (!r.ok) throw new Error(r.status === 401 ? "ElevenLabs rejected the key." : `Voiceover failed (${r.status}).`);
  const j = (await r.json()) as { audio_base64: string; alignment?: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] } | null };
  const bin = atob(j.audio_base64); const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  // Raw 24 kHz PCM wrapped as WAV, so it can be padded to the exact film length.
  const { pcmToWav } = await import("./film-length");
  return { audio: pcmToWav(u, 24000), alignment: j.alignment ?? null };
}

/** Built-in narrator voice via OpenAI text-to-speech. Returns a WAV file. */
export async function synthesiseBuiltInVoice(voiceName: string, text: string): Promise<ArrayBuffer> {
  const key = process.env["OPENAI_API_KEY"];
  if (!key) throw new Error("OpenAI text-to-speech isn't configured.");
  const voices: Record<string, string> = {
    Kore: "coral", Aoede: "shimmer", Leda: "nova", Zephyr: "sage",
    Puck: "fable", Charon: "onyx", Fenrir: "echo", Orus: "ash",
  };
  const voice = voices[voiceName] ?? "coral";
  const r = await fetchOpenAI("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, input: text, response_format: "wav" }),
  });
  if (!r.ok) {
    const body = await r.text();
    console.error(`[OpenAI TTS] ${r.status}: ${body.slice(0, 500)}`);
    throw new Error(r.status === 503 ? "AI is temporarily unavailable because the service has run out of credits. Our support team has been notified. You can raise a support request now or try again later." : r.status === 429 ? "OpenAI rate limit reached. Please try again shortly." : `Voiceover failed (${r.status}).`);
  }
  return r.arrayBuffer();
}
/** Point the legacy gsap.min.js reference at the server's built-in GSAP. */
export const useBuiltinGsap = (html: string) => html.replace(/src="gsap\.min\.js"/g, 'src="_lib/gsap/gsap.min.js"');

function projectFiles(html: string, files?: Record<string, ProjectFile>) {
  return { ...(files ?? {}), "index.html": useBuiltinGsap(html) };
}

export async function submitRenderJob(o: { idempotencyKey: string; size: string; html: string; audioUrl: string; durationSeconds: number; files?: Record<string, ProjectFile> }) {
  const { url, key } = base();
  const { width, height } = parseSize(o.size);
  const r = await fetch(`${url}/v1/render-jobs`, {
    method: "POST",
    signal: AbortSignal.timeout(60000), redirect: "error",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": o.idempotencyKey },
    body: JSON.stringify({ width, height, fps: 30, durationSeconds: o.durationSeconds, project: { files: projectFiles(o.html, o.files) }, audio: { url: o.audioUrl } }),
  });
  const body = (await r.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!r.ok || !body.id) throw new Error(`Render server request could not be verified (${r.status}).`);
  return body.id;
}

export type Frame = { t: number; url: string };

/** PNG stills straight from the HTML, no video made (20/min per key, up to 30 frames). */
export async function createPreview(o: { size: string; html: string; durationSeconds: number; timestamps: number[]; files?: Record<string, ProjectFile> }): Promise<Frame[]> {
  const { width, height } = parseSize(o.size);
  const body = await at<{ frames: Frame[] }>("/v1/previews", {
    method: "POST",
    body: JSON.stringify({ width, height, durationSeconds: o.durationSeconds, timestamps: o.timestamps.slice(0, 30), scale: 0.5, project: { files: projectFiles(o.html, o.files) } }),
  });
  return body.frames ?? [];
}

/** Stills from a finished render. */
export async function getJobFrames(id: string, t: number[]): Promise<Frame[]> {
  const body = await at<{ frames: Frame[] }>(`/v1/render-jobs/${encodeURIComponent(id)}/frames?t=${t.map((x) => x.toFixed(2)).join(",")}&scale=0.5`);
  return body.frames ?? [];
}

let capsCache: { at: number; value: unknown } | null = null;
export async function getCapabilities(): Promise<unknown> {
  if (capsCache && Date.now() - capsCache.at < 3600_000) return capsCache.value;
  const value = await at<unknown>("/v1/capabilities");
  capsCache = { at: Date.now(), value };
  return value;
}

export async function getRenderJob(id: string) {
  const { url, key } = base();
  const r = await fetch(`${url}/v1/render-jobs/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(60000), redirect: "error" });
  if (!r.ok) return null;
  return (await r.json()) as { status: string; downloadUrl: string | null; error: string | null; media_id?: string | null; sizeBytes?: number; durationSeconds?: number | null; duration_s?: number | null };
}

// ---- AutoToast media storage ----
export type AtMedia = {
  id: string; workspace_id: string | null; kind?: string; render_job_id?: string | null; status: "processing" | "ready" | "failed"; filename: string; content_type: string;
  size_bytes: number; duration_s: number | null; playback_url: string | null; download_url: string | null; thumbnail_url: string | null;
  transcript_status: string; transcript?: { text: string; segments: { start: number; end: number; text: string }[] } | null;
};

async function at<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { url, key } = base();
  const request = path === "/v1/previews" ? trackedGenerationFetch : fetch;
  const r = await request(`${url}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(60000), headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) } });
  const body = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) {
    throw new Error(r.status === 402 ? "Video storage is full for this month." : `Video storage request failed (${r.status}).`);
  }
  return body;
}

export const createMediaUpload = (o: { workspace_id: string; filename: string; content_type: string; size_bytes: number }) =>
  at<{ id: string; media_id: string; upload_url: string; upload_token: string; chunk_size: number; total_parts: number }>(
    "/v1/uploads", { method: "POST", body: JSON.stringify({ ...o, transcribe: true }) });
export const getMedia = (id: string) => at<AtMedia>(`/v1/media/${encodeURIComponent(id)}`);
export const deleteMedia = (id: string) => at<unknown>(`/v1/media/${encodeURIComponent(id)}`, { method: "DELETE" });
export const getMediaUsage = (workspaceId?: string) =>
  at<{ total_bytes_stored: number; files: number; minutes_transcribed_this_month: number; server?: Record<string, unknown> }>(
    `/v1/usage${workspaceId ? `?workspace_id=${encodeURIComponent(workspaceId)}` : ""}`);

/** Timestamped transcript as readable text for Sam. */
export function transcriptText(t: AtMedia["transcript"]) {
  if (!t) return null;
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return t.segments?.length ? t.segments.map((s) => `[${mmss(s.start)}] ${s.text.trim()}`).join("\n") : t.text;
}
