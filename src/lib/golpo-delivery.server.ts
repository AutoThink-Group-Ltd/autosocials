import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { parseSize, VIDEO_SIZES } from "./content-rules";

/** Golpo's timing and orientation controls are hints, not an exact export contract. */
export function golpoDeliveryArgs(input: string, output: string, size: string, seconds: number): string[] {
  if (!(VIDEO_SIZES as readonly string[]).includes(size)) throw new Error("Invalid finished film size.");
  const { width, height } = parseSize(size);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) throw new Error("Invalid finished film duration.");
  return ["-nostdin", "-y", "-loglevel", "error", "-threads", "2", "-i", input,
    "-map", "0:v:0", "-map", "0:a?", "-vf", `fps=30,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,tpad=stop_mode=clone:stop_duration=${seconds}`,
    "-af", "apad", "-t", String(seconds), "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", output];
}

export async function normalizeGolpoFilm(source: Blob, size: string, seconds: number): Promise<Uint8Array> {
  if (!ffmpegPath) throw new Error("Golpo delivery cannot be normalized because FFmpeg is unavailable.");
  const dir = await fs.mkdtemp(join(tmpdir(), "autosocials-golpo-"));
  const input = join(dir, "source.mp4"), output = join(dir, "delivery.mp4");
  try {
    await fs.writeFile(input, Buffer.from(await source.arrayBuffer()));
    await new Promise<void>((resolve, reject) => execFile(ffmpegPath, golpoDeliveryArgs(input, output, size, seconds), { timeout: 180_000, maxBuffer: 1_000_000, windowsHide: true }, (error) => error ? reject(error) : resolve()));
    const bytes = await fs.readFile(output);
    if (!bytes.length || bytes.length > 100 * 1024 * 1024) throw new Error("Normalized Golpo film exceeds the delivery limit.");
    return bytes;
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
