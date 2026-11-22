import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

/** Extract bounded audio locally; FFmpeg never receives a remote URL. */
export async function extractExportAudio(video: ArrayBuffer): Promise<ArrayBuffer> {
  if (!ffmpegPath || !video.byteLength || video.byteLength > 100 * 1024 * 1024) throw new Error("Export audio cannot be extracted for checking.");
  const dir = await fs.mkdtemp(join(tmpdir(), "autosocials-export-audio-"));
  const input = join(dir, "export.mp4"), output = join(dir, "audio.mp3");
  try {
    await fs.writeFile(input, Buffer.from(video));
    await new Promise<void>((resolve, reject) => execFile(ffmpegPath!, ["-nostdin", "-loglevel", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", input, "-t", "300", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", output], { timeout: 30000, maxBuffer: 100000, windowsHide: true }, (error) => error ? reject(error) : resolve()));
    const audio = await fs.readFile(output);
    if (!audio.byteLength || audio.byteLength > 24 * 1024 * 1024) throw new Error("Export audio is unavailable for checking.");
    return new Uint8Array(audio).buffer;
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
