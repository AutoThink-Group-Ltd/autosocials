import { describe, expect, it } from "vitest";
import { videoProductionOutcome } from "./video-production-outcome";
describe("video readiness", () => {
 const checked = {status:"done",technical_status:"passed",creative_status:"passed",frame_qa:{narration:{status:"verified"},final_audio:{status:"verified"},after:{status:"passed"}}};
 it("only shows a finished export as ready after narration and exported frame checks", () => { expect(videoProductionOutcome(checked).status).toBe("done"); });
 it("prioritises actual visual defects over unrelated notes", () => {
  const result = videoProductionOutcome({...checked, technical_status:"needs_review", qa_issues:["Voiceover ends early"], frame_qa:{narration:{status:"verified"}, after:{status:"needs_review",issues:["At 3 seconds: caption overlaps the heading"]}}});
  expect(result.message).toContain("caption overlaps");
 });
 it("reports failed, skipped and historical checks as needing attention", () => {
  for (const job of [{...checked,frame_qa:{narration:{status:"verified"},after:{status:"passed"}}},{...checked,technical_status:"unverified"},{...checked,creative_status:"needs_review"},{...checked,frame_qa:{after:{status:"passed"}}},{...checked,frame_qa:{narration:{status:"verified"},after:{status:"skipped"}}}]) expect(videoProductionOutcome(job).status).toBe("needs_attention");
  expect(videoProductionOutcome({status:"done",qa_issues:["Frame preview was skipped"]}).message).toContain("skipped");
  expect(videoProductionOutcome({status:"rendering"}).status).toBe("rendering");
 });
});
