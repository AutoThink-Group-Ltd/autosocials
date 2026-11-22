import { beforeEach, describe, expect, it, vi } from "vitest";
const mocked = vi.hoisted(() => ({ stream: vi.fn() }));
vi.mock("@/lib/composition.server", () => ({ streamResponses: mocked.stream }));
import { exportFrameCoverage, qualityApprovalProblem } from "@/lib/export-review";
import { reviewCreativeExport } from "@/lib/export-review.server";

const frames = () => [0.1, 3, 6, 9, 12, 14.9].map((t, index) => ({ t, url: `https://media.example/frame-${index}.jpg` }));
const input = () => ({ frames: frames(), durationSeconds: 15, brand: "Example Brand", evidence: "Approved website facts and authorised product stills only.", brief: { hook: "A considered lunch moment", script: "Real product detail and an editorial invitation.", voiceover: "Take a moment for lunch.", argument: "A small daily ritual" } });
beforeEach(() => vi.resetAllMocks());

describe("exported temporal coverage", () => {
  it("requires opening, intermediate and ending coverage within known duration", () => {
    expect(exportFrameCoverage(frames(), 15)).toEqual({ sufficient: true, issues: [] });
    expect(exportFrameCoverage(frames()).sufficient).toBe(false);
    expect(exportFrameCoverage(frames().slice(1), 15).sufficient).toBe(false);
    expect(exportFrameCoverage(frames().slice(0, -1), 15).sufficient).toBe(false);
  });
  it("rejects missing timestamps, duplicate times/images and malformed images", () => {
    const missing = frames(); missing[2]!.t = Number.NaN;
    const duplicateTime = frames(); duplicateTime[2]!.t = duplicateTime[1]!.t;
    const duplicateImage = frames(); duplicateImage[2]!.url = duplicateImage[1]!.url;
    const bad = frames(); bad[2]!.url = "not-an-image-url";
    for (const value of [missing, duplicateTime, duplicateImage, bad]) expect(exportFrameCoverage(value, 15).sufficient).toBe(false);
  });
  it("rejects temporal gaps and out-of-duration timestamps", () => {
    expect(exportFrameCoverage([0.1, 1, 2, 14.9].map((t, n) => ({ t, url: `https://media.example/${n}.jpg` })), 15).sufficient).toBe(false);
    const beyond = frames(); beyond[5]!.t = 20;
    expect(exportFrameCoverage(beyond, 15).sufficient).toBe(false);
  });
});

describe("actual exported-frame creative critique", () => {
  it("uses actual images in a separate critic and preserves uninspected playback limitations on a pass", async () => {
    mocked.stream.mockResolvedValue('{"issues":[]}');
    const result = await reviewCreativeExport(input());
    expect(result.status).toBe("passed");
    expect(result.limitations.join(" ")).toMatch(/audio|transitions/i);
    expect(result.limitations.join(" ")).toContain("originality");
    expect(mocked.stream.mock.calls[0]![0][1].content.filter((c: { type: string }) => c.type === "input_image")).toHaveLength(6);
    expect(mocked.stream.mock.calls[0]![2]).toBe("export_creative_review");
  });
  it("keeps specific creative concerns as needs_review", async () => {
    mocked.stream.mockResolvedValue('{"issues":["At 6s the generic container claim is unsupported by the supplied evidence."]}');
    const result = await reviewCreativeExport(input());
    expect(result.status).toBe("needs_review");
    expect(result.issues[0]).toContain("6s");
  });
  it("cannot pass insufficient or malformed temporal samples", async () => {
    mocked.stream.mockResolvedValue('{"issues":[]}');
    const result = await reviewCreativeExport({ ...input(), frames: frames().slice(0, 2) });
    expect(result.status).toBe("unverified");
    expect(mocked.stream).not.toHaveBeenCalled();
  });
  it("cannot pass missing context or a missing duration", async () => {
    expect((await reviewCreativeExport({ ...input(), evidence: "" })).status).toBe("unverified");
    expect((await reviewCreativeExport({ ...input(), durationSeconds: undefined })).status).toBe("unverified");
    expect(mocked.stream).not.toHaveBeenCalled();
  });
  it.each(['{}', '{"issues":null}', '{"issues":[""]}', 'bad json'])("does not turn malformed critique %s into approval", async (raw) => {
    mocked.stream.mockResolvedValue(raw);
    expect((await reviewCreativeExport(input())).status).toBe("unverified");
  });
  it("does not turn reviewer error into approval", async () => {
    mocked.stream.mockRejectedValue(new Error("Unavailable"));
    expect((await reviewCreativeExport(input())).status).toBe("unverified");
  });
});

describe("explicit human approval gate", () => {
  it("blocks known failed or needs-review findings", () => {
    expect(qualityApprovalProblem({ technicalStatus: "failed", creativeStatus: "passed" }).problem).toBeTruthy();
    expect(qualityApprovalProblem({ technicalStatus: "passed", creativeStatus: "needs_review" }).problem).toBeTruthy();
    expect(qualityApprovalProblem({ technicalStatus: "passed", creativeStatus: "passed", frameQa: { status: "needs_review", issues: [] } }).problem).toBeTruthy();
    expect(qualityApprovalProblem({ technicalStatus: "passed", creativeStatus: "passed", frameQa: { status: "passed", issues: [{ severity: "major", detail: "Unreadable" }] } }).problem).toBeTruthy();
  });
  it("permits explicit human approval for unverified checks while disclosing limitations", () => {
    const result = qualityApprovalProblem({ technicalStatus: "unverified", creativeStatus: "unverified", frameQa: { status: "skipped", issues: [] } });
    expect(result.problem).toBeNull();
    expect(result.limitation).toMatch(/incomplete or unverified/);
  });
  it("keeps motion and audio limitations even when sampled-frame checks pass", () => {
    const result = qualityApprovalProblem({ technicalStatus: "passed", creativeStatus: "passed", frameQa: { status: "fixed", issues: [] } });
    expect(result.problem).toBeNull();
    expect(result.limitation).toMatch(/motion, transitions and audio/);
  });
});
