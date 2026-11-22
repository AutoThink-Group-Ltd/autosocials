import { z } from "zod";
import { pcmToWav } from "./film-length";

export const AssembledDelivery = z.object({ mode: z.literal("assembled_ad"), music_file_id: z.string().uuid().optional(), music_rights_confirmed: z.literal(true).optional() }).refine((v) => !v.music_file_id || v.music_rights_confirmed === true, "Confirm soundtrack usage rights before creating this video.");
export function readAssembledDelivery(plan: unknown) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan) || !("delivery" in plan)) return null;
  return AssembledDelivery.parse((plan as Record<string, unknown>).delivery);
}

/** Bounded PCM decoder: reject compressed/float WAV rather than mixing arbitrary bytes. */
export function readMusicWav(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const tag = (i: number) => String.fromCharCode(...bytes.subarray(i, i + 4));
  if (buffer.byteLength < 44 || buffer.byteLength > 20 * 1024 * 1024 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("Choose a PCM WAV soundtrack up to 20 MB.");
  let rate = 0, channels = 0, data: Uint8Array | null = null;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const length = view.getUint32(offset + 4, true), start = offset + 8;
    if (start + length > bytes.length) throw new Error("The soundtrack WAV is incomplete.");
    if (tag(offset) === "fmt ") {
      if (length < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16) throw new Error("Use a 16-bit PCM WAV soundtrack.");
      channels = view.getUint16(start + 2, true); rate = view.getUint32(start + 4, true);
    }
    if (tag(offset) === "data") data = bytes.subarray(start, start + length);
    offset = start + length + (length % 2);
  }
  if (!data?.length || ![1, 2].includes(channels) || rate < 8000 || rate > 96000 || data.length % (channels * 2)) throw new Error("Use a valid mono or stereo PCM WAV soundtrack.");
  const samples = new DataView(data.buffer, data.byteOffset, data.byteLength), frames = data.length / (channels * 2);
  return { rate, channels, frames, sample: (frame: number, channel: number) => samples.getInt16((frame * channels + Math.min(channel, channels - 1)) * 2, true) / 32768 };
}

/** Narration remains dominant; soundtrack loops and fades over the exact approved duration. */
export function mixNarrationAndMusic(narration: ArrayBuffer, music: ArrayBuffer, seconds: number): ArrayBuffer {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 60) throw new Error("Unsupported soundtrack duration.");
  const voice = readMusicWav(narration), bed = readMusicWav(music);
  const rate = voice.rate, frames = Math.ceil(rate * seconds), pcm = new Uint8Array(frames * 2), out = new DataView(pcm.buffer);
  for (let i = 0; i < frames; i++) {
    const time = i / rate, voiceSample = i < voice.frames ? Array.from({ length: voice.channels }, (_, channel) => voice.sample(i, channel)).reduce((a, b) => a + b, 0) / voice.channels : 0;
    const position = time * bed.rate, frame = Math.floor(position) % bed.frames, next = (frame + 1) % bed.frames, fraction = position % 1;
    let musicSample = 0;
    for (let channel = 0; channel < bed.channels; channel++) musicSample += bed.sample(frame, channel) * (1 - fraction) + bed.sample(next, channel) * fraction;
    const fade = Math.max(0, Math.min(1, time / 0.4, (seconds - time) / 1.2));
    const mixed = voiceSample * 0.85 + musicSample / bed.channels * 0.12 * fade;
    out.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, mixed)) * 32767), true);
  }
  return pcmToWav(pcm, rate);
}
