import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { extractExportAudio } from "./export-audio.server";

describe("export audio extraction", () => {
  it("extracts a bounded audio track and rejects a silent video", async () => {
    if (!ffmpegPath) throw new Error("FFmpeg unavailable");
    const make = (audio: boolean) => execFileSync(ffmpegPath!, ["-nostdin", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=32x32:d=1", ...(audio ? ["-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "aac"] : []), "-c:v", "mpeg4", "-movflags", "frag_keyframe+empty_moov", "-f", "mp4", "pipe:1"], { maxBuffer: 2_000_000, windowsHide: true });
    const toBuffer = (buf: Buffer) => new Uint8Array(buf).buffer;
    expect((await extractExportAudio(toBuffer(make(true)))).byteLength).toBeGreaterThan(100);
    await expect(extractExportAudio(toBuffer(make(false)))).rejects.toThrow();
  });
});
