// Pure rules for Sam's look check on rendered frames. Shared by server and tests.
import { z } from "zod";

export const MAX_FIX_ROUNDS = 2;

export const FrameIssue = z.object({
  t: z.number(),
  kind: z.enum(["text_overlap", "clipped_text", "caption_zone", "logo", "portrait", "legibility", "empty_frame", "off_brand", "spelling", "timing", "layout_shift", "other"]),
  severity: z.enum(["major", "minor"]),
  detail: z.string().min(1).max(400),
});
export type FrameIssue = z.infer<typeof FrameIssue>;
export const FrameReview = z.object({ issues: z.array(FrameIssue).max(30) });

export type FrameQa = {
  status: "passed" | "fixed" | "needs_review" | "skipped";
  rounds: number;
  issues: string[];
  after?: { status: "passed" | "needs_review" | "skipped"; issues: string[] };
  sample_times?: number[];
  narration?: { status: "verified"; source: "transcribed_audio"; word_count: number; word_times?: number[][] };
  final_audio?: { status: "verified" };
  creative_review?: { status: "passed" | "needs_review" | "unverified"; issues: string[]; limitations: string[] };
};

/** Reconstruct only measured word timing belonging to the saved version's narration. */
export function measuredNarrationTimeline(script: string, times: unknown): string | null {
  const words = script.trim().split(/\s+/).filter(Boolean);
  if (!words.length || !Array.isArray(times) || times.length !== words.length) return null;
  let previousEnd = 0;
  const timeline: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const pair = times[i];
    if (!Array.isArray(pair) || pair.length !== 2 || !pair.every((value) => typeof value === "number" && Number.isFinite(value)) || pair[0] < 0 || pair[1] <= pair[0] || pair[0] < previousEnd - 0.05) return null;
    previousEnd = pair[1];
    timeline.push(`${words[i]} (${pair[0]}–${pair[1]}s)`);
  }
  return timeline.join(" ");
}

/** Parse a model reply; anything malformed counts as no verdict (null), never as a pass. */
export function parseReview(raw: string): FrameIssue[] | null {
  try { const r = FrameReview.safeParse(JSON.parse(raw)); return r.success ? r.data.issues : null; } catch { return null; }
}

export const majorIssues = (issues: FrameIssue[]) => issues.filter((i) => i.severity === "major");
export const describe = (i: FrameIssue) => `At ${i.t.toFixed(1)}s (${i.kind.replace(/_/g, " ")}): ${i.detail}`;

/** Every ~2.5s plus each scene start (+0.6s so entrances have landed) and the held end card. Max 30. */
export function sampleTimes(duration: number, sceneStarts: number[] = [], every = 2.5): number[] {
  const set = new Set<number>();
  for (let t = 0.5; t < duration - 0.2; t += every) set.add(Math.round(t * 10) / 10);
  for (const s of sceneStarts) if (s + 0.6 < duration) set.add(Math.round((s + 0.6) * 10) / 10);
  set.add(Math.round((duration - 0.5) * 10) / 10);
  return [...set].filter((t) => t >= 0 && t < duration).sort((a, b) => a - b).slice(0, 30);
}

/** Scene start times from the composition's top-level clips. */
export function sceneStarts(html: string): number[] {
  return [...html.matchAll(/class="[^"]*\bscene\b[^"]*"[^>]*data-start="([\d.]+)"|data-start="([\d.]+)"[^>]*class="[^"]*\bscene\b/g)]
    .map((m) => Number(m[1] ?? m[2])).filter((n) => Number.isFinite(n));
}

/** Outcome after the pre-render loop. */
export function loopOutcome(roundsUsed: number, remaining: FrameIssue[] | null): FrameQa["status"] {
  if (remaining === null) return "skipped";
  if (majorIssues(remaining).length) return "needs_review";
  return roundsUsed > 0 ? "fixed" : "passed";
}

/** Temporal samples include opening/closing and intermediate action, bounded to 24 frames. */
export const finishedSampleTimes = (duration: number) => [...new Set([0.1, ...sampleTimes(duration, [], Math.max(1.25, duration / 20)), Math.max(0, duration - 0.1)])].sort((a, b) => a - b).slice(0, 24);
