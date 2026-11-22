/** A completed export is not ready until its own narration and exported frames have been checked. */
export function videoProductionOutcome(job: { status: string; technical_status?: string | null; creative_status?: string | null; frame_qa?: unknown; qa_issues?: unknown; error?: string | null }) {
  if (job.status !== "done") return { status: job.status, ...(job.error ? { message: job.error } : {}) };
  const qa = job.frame_qa && typeof job.frame_qa === "object" && !Array.isArray(job.frame_qa) ? job.frame_qa as { narration?: { status?: string }; final_audio?: { status?: string }; after?: { status?: string; issues?: unknown }; creative_review?: { status?: string; issues?: unknown }; issues?: unknown } : null;
  if (job.technical_status === "passed" && job.creative_status === "passed" && qa?.narration?.status === "verified" && qa.after?.status === "passed" && qa.final_audio?.status === "verified") return { status: "done" as const, message: "Narration and sampled exported-frame checks passed. Review the full playback, including audio and motion." };
  const firstIssue = (issues: unknown) => Array.isArray(issues) ? issues.find((value): value is string => typeof value === "string" && !!value.trim()) : undefined;
  const issue = firstIssue(qa?.after?.issues) ?? firstIssue(qa?.creative_review?.issues) ?? firstIssue(qa?.issues) ?? firstIssue(job.qa_issues);
  return { status: "needs_attention" as const, message: issue ? `Video quality needs attention: ${issue}` : "The video was exported, but its narration or visual quality checks are incomplete. Review the full playback before use." };
}
