import { qualityApprovalProblem } from "@/lib/export-review";
import type { Job } from "./shared";

const label = (status: string | null | undefined) => status === "passed" || status === "fixed" ? "Passed sampled checks" : status === "needs_review" ? "Needs review" : status === "failed" || status === "error" ? "Failed" : ["pending", "queued", "running", "reviewing", "in_progress"].includes(status ?? "") ? "Pending" : "Unverified";
/** Machine checks and a person's decision are separate evidence states. Playback remains available. */
export function QualityReview({ job, humanStatus }: { job: Job; humanStatus: string }) {
  const gate = qualityApprovalProblem({ technicalStatus: job.technical_status ?? "unverified", creativeStatus: job.creative_status ?? "unverified", frameQa: job.frame_qa, qaIssues: job.qa_issues });
  const notes = Array.isArray(job.qa_issues) ? job.qa_issues.filter((note): note is string => typeof note === "string" && Boolean(note.trim())) : [];
  const visual = job.frame_qa?.after ?? job.frame_qa;
  const findings = [...new Set([...notes, ...(visual?.issues ?? [])])];
  return (
    <div className="space-y-1 rounded-[10px] border border-border-control bg-canvas p-2.5 text-[12px]" aria-label="Quality review">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="font-semibold">Technical</dt><dd>{label(job.technical_status)}</dd>
        <dt className="font-semibold">Creative</dt><dd>{label(job.creative_status)}</dd>
        <dt className="font-semibold">Human</dt><dd>{humanStatus === "approved" ? "Approved this version" : humanStatus === "needs_revision" ? "Changes requested" : "Awaiting your playback review"}</dd>
      </dl>
      <p className={gate.problem ? "font-medium text-destructive" : "text-muted-foreground"}>{gate.problem ?? gate.limitation}</p>
      <p className="text-muted-foreground">Sampled frames do not verify full motion, transitions or audio balance. Watch and listen to the exported video.</p>
      {findings.length > 0 ? <details><summary className="cursor-pointer font-medium">Review notes ({findings.length})</summary><ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">{findings.map((finding, index) => <li key={index}>{finding}</li>)}</ul></details> : null}
    </div>
  );
}
