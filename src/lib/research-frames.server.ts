import { execFile } from "node:child_process";
import { fetchPinnedPublicMedia } from "./personal-brand-safe-media.server";
import { promises as fs } from "node:fs";

import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const MAX_VIDEO_BYTES = 25_000_000;
export async function fetchResearchVideo(rawUrl: string, path: string): Promise<void> {
  let next = rawUrl;
  for (let hop = 0; hop < 4; hop++) {
    const url = new URL(next);
    const response = await fetchPinnedPublicMedia(next, MAX_VIDEO_BYTES, "video/mp4,video/*;q=0.8");
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Video redirect had no location");
      next = new URL(location, url).toString();
      continue;
    }
    if (!response.ok || !response.body) throw new Error("Video unavailable");
    const type = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (type && !type.includes("video/") && !type.includes("octet-stream")) throw new Error("Unexpected video content type");
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > MAX_VIDEO_BYTES) throw new Error("Video exceeds inspection limit");
    const file = await fs.open(path, "w");
    try {
      let total = 0;
      const reader = response.body.getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        total += chunk.byteLength;
        if (total > MAX_VIDEO_BYTES) throw new Error("Video exceeds inspection limit");
        await file.write(chunk);
      }
    } finally { await file.close(); }
    return;
  }
  throw new Error("Too many video redirects");
}

async function frameAt(path: string, seconds: number): Promise<string> {
  const executable = ffmpegPath;
  if (!executable) throw new Error("FFmpeg unavailable");
  const args = ["-nostdin", "-loglevel", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-ss", seconds.toFixed(2), "-f", "mov", "-i", path, "-frames:v", "1", "-vf", "scale=384:-2", "-q:v", "8", "-f", "image2pipe", "-vcodec", "mjpeg", "-"];
  const bytes = await new Promise<Buffer>((resolve, reject) => {
    execFile(executable, args, { encoding: "latin1", timeout: 12_000, maxBuffer: 1_500_000, windowsHide: true }, (error, stdout) => {
      if (error) reject(error);
      else resolve(Buffer.from(stdout, "latin1"));
    });
  });
  if (!bytes.length || bytes.length > 100_000) throw new Error("Frame unavailable");
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

/** Returns no frames when media is unavailable; no remote URL is passed to FFmpeg. */
export async function sampleResearchFrames(videoUrl: string, durationSeconds: number | null): Promise<string[]> {
  const dir = await fs.mkdtemp(join(tmpdir(), "autosocials-research-"));
  const file = join(dir, "source.mp4");
  try {
    await fetchResearchVideo(videoUrl, file);
    const times = durationSeconds && durationSeconds > 2 ? [0.25, 0.75].map((fraction) => Math.max(0.5, durationSeconds * fraction)) : [1, 3];
    const frames: string[] = [];
    for (const second of times) {
      try { frames.push(await frameAt(file, second)); } catch { /* Partial frame coverage is valid. */ }
    }
    return frames;
  } catch { return []; }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** Downloads through the same allowlisted, bounded video path and extracts only the first five minutes. */
export async function extractResearchAudio(videoUrl: string, durationSeconds: number | null): Promise<Uint8Array | null> {
  if (!durationSeconds || durationSeconds <= 0 || durationSeconds > 300 || !ffmpegPath) return null;
  const dir = await fs.mkdtemp(join(tmpdir(), "autosocials-audio-"));
  const input = join(dir, "source.mp4"); const output = join(dir, "audio.mp3");
  try {
    await fetchResearchVideo(videoUrl, input);
    await new Promise<void>((resolve, reject) => execFile(ffmpegPath!, ["-nostdin", "-loglevel", "error", "-threads", "1", "-protocol_whitelist", "file,pipe", "-i", input, "-t", "300", "-vn", "-ac", "1", "-ar", "16000", "-b:a", "32k", "-f", "mp3", output], { timeout: 30000, maxBuffer: 100000, windowsHide: true }, (error) => error ? reject(error) : resolve()));
    const bytes = await fs.readFile(output);
    return bytes.length && bytes.length <= 2500000 ? bytes : null;
  } catch { return null; } finally { await fs.rm(dir, { recursive: true, force: true }); }
}
