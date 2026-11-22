import { describe, expect, it } from "vitest";
import { pcmToWav } from "./film-length";
import { mixNarrationAndMusic, readAssembledDelivery, readMusicWav } from "./production-audio";
const tone = (seconds: number, rate = 8000, channels = 1) => {
  const pcm = new Uint8Array(seconds * rate * channels * 2), view = new DataView(pcm.buffer);
  for (let i = 0; i < pcm.length / 2; i++) view.setInt16(i * 2, 10000, true);
  return pcmToWav(pcm, rate, channels);
};
describe("approved production audio", () => {
  it("does not alter legacy delivery, and requires explicit soundtrack rights", () => {
    expect(readAssembledDelivery({ steps: [] })).toBeNull();
    expect(() => readAssembledDelivery({ delivery: { mode: "assembled_ad", music_file_id: "11111111-1111-4111-8111-111111111111" } })).toThrow();
  });
  it("mixes a quiet looping soundtrack across the exact target including a narration-free tail", () => {
    const mixed = readMusicWav(mixNarrationAndMusic(tone(2), tone(1, 16000, 2), 5));
    expect(mixed.frames / mixed.rate).toBe(5);
    expect(mixed.sample(8000, 0)).toBeGreaterThan(0.25);
    expect(mixed.sample(24000, 0)).toBeGreaterThan(0);
    expect(mixed.sample(24000, 0)).toBeLessThan(0.05);
    expect(mixed.sample(mixed.frames - 1, 0)).toBeLessThan(0.001);
  });
  it("rejects compressed, malformed and excessive-duration tracks", () => {
    const bad = tone(1); new DataView(bad).setUint16(20, 3, true);
    expect(() => readMusicWav(bad)).toThrow("16-bit PCM");
    expect(() => readMusicWav(new ArrayBuffer(8))).toThrow();
    expect(() => mixNarrationAndMusic(tone(1), tone(1), 100000)).toThrow();
  });
});
