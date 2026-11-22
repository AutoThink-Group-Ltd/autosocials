/** Pure gates for actual exported-frame review. A still-frame pass never certifies motion or audio. */
export type ExportReviewStatus = "passed" | "needs_review" | "unverified";
export type CreativeExportReview = { status: ExportReviewStatus; issues: string[]; limitations: string[] };
export const STILL_REVIEW_LIMITATIONS = [
  "Sampled stills do not verify audio intelligibility, voice/music balance or sound quality.",
  "Transitions, motion, timing and continuity between sampled frames have not been inspected in playback.",
  "A creative review does not establish advertising effectiveness or asset reuse rights.",
];
export type ExportFrame = { t: number; url: string };
export function exportFrameCoverage(frames: ExportFrame[], durationSeconds?: number): { sufficient: boolean; issues: string[] } {
  const issues: string[] = [];
  if (!Array.isArray(frames) || frames.length < 4 || frames.length > 30) return { sufficient: false, issues: ["A bounded set of at least four temporally distinct exported frames is required."] };
  const validImage = (value: unknown) => typeof value === "string" && (/^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(value) || (() => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
  })());
  if (frames.some((frame) => !frame || typeof frame.t !== "number" || !Number.isFinite(frame.t) || frame.t < 0 || !validImage(frame.url))) issues.push("Exported frames contain missing/invalid timestamps or image references.");
  if (new Set(frames.map((frame) => frame?.t)).size !== frames.length || new Set(frames.map((frame) => frame?.url)).size !== frames.length) issues.push("Duplicate timestamps or image references do not establish distinct temporal coverage.");
  if (!Number.isFinite(durationSeconds) || !durationSeconds || durationSeconds <= 0 || durationSeconds > 300) issues.push("The exported duration is unavailable, so opening-to-ending frame coverage is unverified.");
  if (!issues.length && durationSeconds) {
    const times = frames.map((frame) => frame.t).sort((a, b) => a - b);
    const edge = Math.min(1, durationSeconds * 0.1);
    if (times.some((time) => time > durationSeconds + 0.05) || times[0]! > edge || times[times.length - 1]! < durationSeconds - edge) issues.push("Samples must cover the exported opening and ending inside the actual duration.");
    const maxGap = Math.max(2.5, durationSeconds / 4);
    if (times.some((time, index) => index > 0 && time - times[index - 1]! > maxGap)) issues.push("Exported samples leave a large uninspected gap in the story.");
  }
  return { sufficient: issues.length === 0, issues };
}

type FrameQaLike = { status?: string; issues?: unknown[]; after?: { status?: string; issues?: unknown[] }; creative_review?: { status?: string; issues?: unknown[] } } | null | undefined;
/** This gates explicit human approval. Unknown review is disclosed, never relabelled as machine approval. */
export function qualityApprovalProblem(o: { technicalStatus?: string | null; creativeStatus?: string | null; frameQa?: FrameQaLike; qaIssues?: unknown }): { problem: string | null; limitation: string | null } {
  const states = [o.technicalStatus, o.creativeStatus, o.frameQa?.status, o.frameQa?.after?.status, o.frameQa?.creative_review?.status].filter((status): status is string => Boolean(status)).map((status) => status.toLowerCase());
  if (states.some((status) => ["failed", "error", "needs_review", "critical", "blocked", "rejected"].includes(status))) return { problem: "Resolve the recorded technical or creative quality issues before approving this asset.", limitation: null };
  if (states.some((status) => ["pending", "running", "queued", "reviewing", "in_progress"].includes(status))) return { problem: "Wait for the current quality review to finish before approving this asset.", limitation: null };
  const findings = [...(o.frameQa?.issues ?? []), ...(o.frameQa?.after?.issues ?? []), ...(o.frameQa?.creative_review?.issues ?? []), ...(Array.isArray(o.qaIssues) ? o.qaIssues : [])];
  const critical = findings.some((finding) => typeof finding === "string" ? /\b(?:critical|major|unsafe)\b/i.test(finding) : Boolean(finding && typeof finding === "object" && ["major", "critical"].includes(String((finding as { severity?: unknown }).severity))));
  if (critical) return { problem: "A known critical visual defect must be resolved before approval.", limitation: null };
  const knownPass = (status?: string | null) => status === "passed" || status === "fixed";
  const missing = !knownPass(o.technicalStatus) || !knownPass(o.creativeStatus) || !knownPass(o.frameQa?.after?.status ?? o.frameQa?.status);
  return { problem: null, limitation: missing
    ? "Automated quality review is incomplete or unverified. Explicit human approval is still required; inspect the exported video, including motion and audio."
    : "Automated checks cover sampled frames only. Inspect the exported video for motion, transitions and audio before explicit human approval." };
}
