// Pure length rules for Sam's films. Length is set on the render job (durationSeconds);
// the narration must still fill most of it.

export const FPS = 30;
/** Natural UK ad delivery, words per second. */
export const WORDS_PER_SECOND = 2.3;
/** Narration ideally fills at least this share of the film. */
export const MIN_FILL = 0.75;
/** Below this share the film is too empty; between this and MIN_FILL visuals hold the rest (render length is set explicitly). */
export const HARD_MIN_FILL = 0.55;

export const exactFrames = (seconds: number) => Math.round(seconds * FPS);

/** Target word range for a voiceover of this length (leaving ~3s for the end-card hold). */
export function wordBudget(seconds: number) {
  const spoken = Math.max(4, seconds - 3);
  return { min: Math.round(spoken * WORDS_PER_SECOND * 0.9), target: Math.round(spoken * WORDS_PER_SECOND), max: Math.round(seconds * WORDS_PER_SECOND) };
}

export const countWords = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Is the recorded narration the right length for the film? "warn" renders, with visuals holding the remainder. */
export function narrationFit(audioSeconds: number, target: number): "ok" | "warn" | "short" | "long" {
  if (audioSeconds > target - 0.5) return "long";
  if (audioSeconds < target * HARD_MIN_FILL) return "short";
  if (audioSeconds < target * MIN_FILL) return "warn";
  return "ok";
}

/** The finished MP4's length must match the ordered length. */
export function lengthMismatch(actual: number | null | undefined, target: number): string | null {
  if (actual == null || !Number.isFinite(actual)) return null;
  if (Math.abs(actual - target) > 0.5) return `The finished video is ${actual.toFixed(1)}s, not the ${target}s that was ordered.`;
  return null;
}

// ---- WAV helpers (audio is padded with a quiet bed so the render is never trimmed short) ----

export function pcmToWav(pcm: Uint8Array, sampleRate: number, channels = 1, bits = 16): ArrayBuffer {
  const out = new ArrayBuffer(44 + pcm.byteLength); const v = new DataView(out); const b = new Uint8Array(out);
  const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) b[o + i] = s.charCodeAt(i); };
  w(0, "RIFF"); v.setUint32(4, 36 + pcm.byteLength, true); w(8, "WAVE"); w(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, channels, true); v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * channels * bits / 8, true); v.setUint16(32, channels * bits / 8, true); v.setUint16(34, bits, true);
  w(36, "data"); v.setUint32(40, pcm.byteLength, true); b.set(pcm, 44);
  return out;
}

/** Parse a PCM WAV: format plus the raw sample bytes. */
export function parseWav(buf: ArrayBuffer) {
  const v = new DataView(buf); const b = new Uint8Array(buf);
  const tag = (o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);
  if (buf.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;
  let rate = 0, ch = 1, bits = 16, o = 12;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o); let len = v.getUint32(o + 4, true);
    if (id === "fmt ") { ch = v.getUint16(o + 10, true); rate = v.getUint32(o + 12, true); bits = v.getUint16(o + 22, true); }
    if (id === "data") { if (len === 0xffffffff || o + 8 + len > buf.byteLength) len = buf.byteLength - o - 8; return { rate, channels: ch, bits, pcm: b.subarray(o + 8, o + 8 + len) }; }
    o += 8 + len + (len % 2);
  }
  return null;
}

export const wavSeconds = (w: { rate: number; channels: number; bits: number; pcm: Uint8Array }) => w.pcm.byteLength / (w.rate * w.channels * w.bits / 8);
