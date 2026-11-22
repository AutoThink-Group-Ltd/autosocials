// Pure rules for Sam's films: real-word captions, image inspection, timeline coverage,
// logo/portrait treatment checks and batch diversity. Shared by the server and tests.
import { directionDiversityProblems, type CreativeCandidate } from "./creative-direction";

export type WordTime = { word: string; start: number; end: number };

/** Turn ElevenLabs character alignment into whole words with real timings. */
export function alignmentToWords(a: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): WordTime[] {
  const out: WordTime[] = [];
  let cur = ""; let s = 0; let e = 0;
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) { if (cur) out.push({ word: cur, start: s, end: e }); cur = ""; return; }
    if (!cur) s = a.character_start_times_seconds[i] ?? e;
    cur += ch; e = a.character_end_times_seconds[i] ?? s;
  });
  if (cur) out.push({ word: cur, start: s, end: e });
  return out.map((w) => ({ word: w.word, start: +w.start.toFixed(2), end: +w.end.toFixed(2) }));
}

/** Group words into short caption pages (up to `max` words and about 48 characters), breaking after punctuation once a page has a few words. */
export function captionPages(words: WordTime[], max = 7): { words: WordTime[]; start: number; end: number }[] {
  const pages: WordTime[][] = []; let cur: WordTime[] = [];
  for (const w of words) {
    // Keep each phrase short enough to read in the two-line caption area.
    if (cur.length && cur.map((item) => item.word).join(" ").length + 1 + w.word.length > 48) { pages.push(cur); cur = []; }
    cur.push(w);
    const stop = /[.!?]$/.test(w.word) || (cur.length >= 5 && /[,;:]$/.test(w.word));
    if (cur.length >= max || stop) { pages.push(cur); cur = []; }
  }
  if (cur.length) pages.push(cur);
  return pages.map((p, i) => ({ words: p, start: p[0]!.start, end: i < pages.length - 1 ? pages[i + 1]![0]!.start : p[p.length - 1]!.end + 0.3 }));
}

const escHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Deterministic caption layer built from the script words (never from the model):
 * clean subtitle lines, one phrase per page on a soft backing, faded in. No per-word highlight.
 */
export function buildCaptionLayer(o: { words: WordTime[]; width: number; height: number; synced: boolean; accent: string; font: string; zone?: [number, number] }) {
  const pages = captionPages(o.words);
  const fs = Math.round(Math.min(o.width, o.height * 0.75) * 0.042);
  // Captions live only in the reserved caption strip (safe-zones.ts); z-index (not track) puts them on top.
  const [zt, zb] = o.zone ?? [Math.round(o.height * 0.7), Math.round(o.height * 0.78)];
  const css = `.as-cap{position:absolute;left:${Math.round(o.width * 0.08)}px;right:${Math.round(o.width * 0.08)}px;top:${zt}px;height:${zb - zt}px;display:flex;align-items:center;justify-content:center;z-index:100;pointer-events:none}
.as-cap p{margin:0;max-width:100%;font:600 ${fs}px/1.3 ${o.font};color:#fff;text-align:center;background:rgba(10,10,12,.62);padding:${Math.round(fs * 0.3)}px ${Math.round(fs * 0.6)}px;border-radius:${Math.round(fs * 0.4)}px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;text-wrap:balance}`;
  const html = pages.map((p, i) => `<div id="cap${i}" class="clip as-cap" data-start="${p.start.toFixed(2)}" data-duration="${Math.max(0.2, p.end - p.start).toFixed(2)}" data-track-index="90"><p>${escHtml(p.words.map((w) => w.word).join(" "))}</p></div>`).join("");
  const js = pages.map((p, i) => `t.fromTo("#cap${i} p",{opacity:0},{opacity:1,duration:0.18,ease:"none"},${p.start.toFixed(2)});`).join("");
  return { css, html, js, text: pages.map((p) => p.words.map((w) => w.word).join(" ")).join(" ") };
}

/** Inject the caption layer into a designed composition (after the main timeline is registered). */
export function injectCaptions(html: string, layer: { css: string; html: string; js: string }) {
  let out = html.replace(/<\/style>/i, `${layer.css}</style>`);
  if (out === html) out = html.replace(/<\/head>/i, `<style>${layer.css}</style></head>`);
  out = out.replace(/(<[a-z]+[^>]*data-composition-id="main"[^>]*>)/i, `$1${layer.html}`);
  return out.replace(/<\/body>/i, `<script>(function(){var t=window.__timelines["main"];if(!t)return;${layer.js}t.seek(0);})();</script></body>`);
}

/** Captions on screen must equal the voiceover words exactly, in order. */
export function captionsMatchScript(layerText: string, script: string) {
  const norm = (s: string) => s.split(/\s+/).filter(Boolean).join(" ");
  return norm(layerText) === norm(script);
}

/** Width, height and alpha straight from PNG / JPEG / WebP headers. */
export function imageHeader(buf: ArrayBuffer): { width: number; height: number; hasAlpha: boolean } | null {
  const b = new Uint8Array(buf); const v = new DataView(buf);
  if (b.length > 26 && b[0] === 0x89 && b[1] === 0x50) {
    const ct = b[25]!;
    let trns = false;
    for (let i = 33; i + 8 < Math.min(b.length, 200000);) {
      const len = v.getUint32(i); const type = String.fromCharCode(b[i + 4]!, b[i + 5]!, b[i + 6]!, b[i + 7]!);
      if (type === "tRNS") { trns = true; break; }
      if (type === "IDAT") break;
      i += 12 + len;
    }
    return { width: v.getUint32(16), height: v.getUint32(20), hasAlpha: ct === 4 || ct === 6 || trns };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i + 9 < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { height: v.getUint16(i + 5), width: v.getUint16(i + 7), hasAlpha: false };
      i += 2 + v.getUint16(i + 2);
    }
    return null;
  }
  if (b.length > 30 && String.fromCharCode(...b.subarray(8, 12)) === "WEBP") {
    const fmt = String.fromCharCode(...b.subarray(12, 16));
    if (fmt === "VP8X") return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)), hasAlpha: !!(b[20]! & 0x10) };
    if (fmt === "VP8L") { const n = v.getUint32(21, true); return { width: (n & 0x3fff) + 1, height: ((n >> 14) & 0x3fff) + 1, hasAlpha: !!((n >> 28) & 1) }; }
    if (fmt === "VP8 ") return { width: v.getUint16(26, true) & 0x3fff, height: v.getUint16(28, true) & 0x3fff, hasAlpha: false };
  }
  return null;
}

export type MediaRole = "logo" | "portrait" | "product_ui" | "scene" | "other";
export type Manifest = { width: number | null; height: number | null; has_alpha: boolean | null; bg_tone: "transparent" | "light" | "dark" | "busy" | null; media_role: MediaRole | null; subject: string | null };

/** How the designer must place an image, decided from its inspection (never left to taste). */
export function treatment(m: Manifest): string {
  if (m.media_role === "logo") return 'class="as-logo" (contain, no tile, no border)';
  if (m.media_role === "portrait") return m.has_alpha || m.bg_tone === "transparent" ? 'wrap in class="as-portrait-cut" (transparent cut-out, no frame)' : 'wrap in <div class="as-portrait"> (circle mask, cover, scale 1.15: hides its baked background)';
  if (m.media_role === "product_ui") return 'class="as-shot" (device/card frame, contain)';
  return 'class="as-cover" (full-bleed cover)';
}

/** Fixed CSS for the treatments above, injected into every design. */
export const TREATMENT_CSS = `.as-logo{object-fit:contain;border:0!important;outline:0!important;background:transparent!important;box-shadow:none!important}
.as-portrait{border-radius:50%;overflow:hidden;background:#F3F1EC;aspect-ratio:1/1}
.as-portrait img{width:100%;height:100%;object-fit:cover;transform:scale(1.15);display:block}
.as-portrait-cut img,.as-portrait-cut{object-fit:contain;background:transparent}
.as-shot{object-fit:contain;border-radius:18px}.as-cover{object-fit:cover;width:100%;height:100%}`;

const lum = (hex: string) => { let h = hex.replace("#", ""); if (h.length === 3) h = h.split("").map((c) => c + c).join(""); const n = parseInt(h.slice(0, 6), 16); return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; };

/** Catch the observed faults: dark tiles/borders around logos and portraits, contain on portraits, model-built captions. */
export function mediaTreatmentProblems(html: string): string[] {
  const p: string[] = [];
  const css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n").replace(/\.as-[\w-]+[^{]*\{[^}]*\}/g, "");
  for (const r of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const sel = r[1]!.toLowerCase(); const body = r[2]!.toLowerCase();
    if (!/(logo|icon|brand-mark|portrait|avatar|leo)/.test(sel)) continue;
    const bg = body.match(/background(?:-color)?\s*:\s*(#[0-9a-f]{3,8})/)?.[1];
    if (bg && lum(bg) < 0.35) p.push(`Dark background behind ${sel.trim()}: use the as-logo / as-portrait treatment instead.`);
    if (/(^|;)\s*(border|outline)\s*:\s*(?!0|none)/.test(body) && /(logo|icon|brand-mark)/.test(sel)) p.push(`Border around ${sel.trim()}: logos never get a frame.`);
    if (/(portrait|avatar|leo)/.test(sel) && /object-fit\s*:\s*contain/.test(body)) p.push(`${sel.trim()} uses object-fit:contain, which shows the photo's baked background.`);
  }
  if (/(id|class)="[^"]*(caption|subtitle)/i.test(html)) p.push("Don't build captions; the caption layer is added automatically.");
  return p;
}

/** Gaps where no scene-level clip is on screen (captions and progress bars don't count). */
export function coverageGaps(html: string, duration: number, maxGap = 0.35): [number, number][] {
  const spans = [...html.matchAll(/<[a-z]+[^>]*class="[^"]*\bclip\b[^"]*"[^>]*>/gi)]
    .map((m) => m[0]).filter((t) => !/as-cap|id="(bar|progress)/.test(t))
    .map((t) => [Number(t.match(/data-start="([\d.]+)"/)?.[1]), Number(t.match(/data-duration="([\d.]+)"/)?.[1])] as const)
    .filter(([s, d]) => Number.isFinite(s) && Number.isFinite(d) && d < duration - 0.01)
    .map(([s, d]) => [s, s + d] as [number, number]).sort((a, b) => a[0] - b[0]);
  const gaps: [number, number][] = []; let t = 0;
  for (const [s, e] of spans) { if (s - t > maxGap) gaps.push([t, s]); t = Math.max(t, e); }
  if (spans.length && duration - t > maxGap) gaps.push([t, duration]);
  return gaps;
}

/** Spoken audio must fit the ordered length: too long or too short are both problems. */
export function durationProblem(audio: number, target: number): string | null {
  if (audio > target - 0.5) return `The voiceover runs ${audio.toFixed(1)}s, too long for the ${target}s video. Shorten the script.`;
  if (audio < target * 0.75) return `The voiceover is only ${audio.toFixed(1)}s for a ${target}s video. Lengthen the script.`;
  return null;
}

/** A batch can't recycle the same hook, opening line, CTA or argument. */
export function diversityProblems(v: (CreativeCandidate & { cta: string; angle?: string })[], history: CreativeCandidate[] = []): string[] {
  const p: string[] = [];
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").split(/\s+/).filter((w) => w.length > 3).slice(0, 6).join(" ");
  const dupe = (label: string, xs: string[]) => { const k = xs.map(key).filter(Boolean); if (new Set(k).size < k.length) p.push(`Two assets share the same ${label}.`); };
  if (v.length < 2) return directionDiversityProblems(v, history);
  dupe("hook", v.map((x) => x.hook));
  dupe("opening frame", v.map((x) => x.beats?.[0] ?? ""));
  dupe("argument", v.map((x) => x.argument ?? ""));
  const ctas = v.map((x) => key(x.cta)); if (ctas.length >= 3 && new Set(ctas).size === 1) p.push("All assets end on the same CTA.");
  return [...new Set([...p, ...directionDiversityProblems(v, history)])];
}
