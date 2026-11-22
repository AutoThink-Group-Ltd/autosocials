import { describe, expect, it } from "vitest";
import { golpoDeliveryArgs } from "./golpo-delivery.server";
import { resolvedStepSettings } from "./production.server";
import { normalizeGolpoFilm } from "./golpo-delivery.server";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { Blob as NodeBlob } from "node:buffer";
import type { ProductionStep } from "./production-plan";
import type { getAdminClient } from "./supabase-admin.server";

describe("Golpo delivery", () => {
  it.skipIf(process.env.RUN_MEDIA_INTEGRATION !== "1")("normalizes a short provider film with audio", async () => {
    if (!ffmpegPath) throw new Error("FFmpeg is unavailable");
    const dir = await fs.mkdtemp(join(tmpdir(), "golpo-delivery-test-"));
    const source = join(dir, "source.mp4"), result = join(dir, "result.mp4");
    const run = (args: string[]) => new Promise<string>((resolve, reject) => execFile(ffmpegPath, args, { timeout: 180_000, maxBuffer: 1_000_000 }, (error, stdout, stderr) => error ? reject(error) : resolve(stdout + stderr)));
    try {
      await run(["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=white:s=160x280:r=30:d=1", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:v", "libx264", "-c:a", "aac", "-shortest", source]);
      const output = await normalizeGolpoFilm(new NodeBlob([await fs.readFile(source)]) as Blob, "1080x1920", 15);
      await fs.writeFile(result, output);
      const inspection = await run(["-hide_banner", "-i", result, "-f", "null", "-"]);
      expect(inspection).toContain("1080x1920");
      expect(inspection).toContain("Duration: 00:00:15.00");
      expect(inspection).toContain("Audio:");
    } finally { await fs.rm(dir, { recursive: true, force: true }); }
  }, 200_000);
  it("renders the approved frame size and exact duration with original audio", () => {
    const args = golpoDeliveryArgs("in.mp4", "out.mp4", "1080x1920", 15);
    expect(args).toContain("-t");
    expect(args[args.indexOf("-t") + 1]).toBe("15");
    expect(args.join(" ")).toContain("scale=1080:1920");
    expect(args.join(" ")).toContain("tpad=stop_mode=clone");
    expect(args.join(" ")).toContain("-map 0:a?");
    expect(() => golpoDeliveryArgs("in", "out", "bad", 15)).toThrow("size");
  });

  it("never resolves selected brand images into the Golpo API request", async () => {
    const step = { id: "golpo", capability_id: "golpo-canvas", role: "finished_video", settings: { prompt: "Draw a pet care explanation", canvas_style_variant: "playful", custom_images: ["https://example.com/packshot.jpg"], custom_images_description: ["packshot"] }, reference_file_ids: [], reference_step_ids: [], reference_roles: [], illustrative: true, purpose: "Explain" } as ProductionStep;
    const settings = await resolvedStepSettings({} as ReturnType<typeof getAdminClient>, "workspace", step, { outputs: {} }, 15, "A clear explanation.", "1080x1920");
    expect(settings).toMatchObject({ canvas_style_variant: "playful", timing: "0.25", video_orientation: "vertical" });
    expect(settings).not.toHaveProperty("custom_images");
    expect(settings).not.toHaveProperty("custom_images_description");
  });
});
