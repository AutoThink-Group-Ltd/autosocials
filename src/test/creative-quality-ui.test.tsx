import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
const mocked = vi.hoisted(() => ({ approve: vi.fn(), send: vi.fn(), playback: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock("@/lib/creative.functions", () => ({ reviewVariant: mocked.approve, sendToPublish: mocked.send, startRender: vi.fn(), reviseVariant: vi.fn(), deleteVariant: vi.fn() }));
vi.mock("@/lib/media.functions", () => ({ getRenderPlayback: mocked.playback }));
vi.mock("@/lib/share.functions", () => ({ downloadVideo: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: vi.fn() } } }));
vi.mock("@/features/create/wizard/BuildAnimation", () => ({ BuildAnimation: () => null }));
vi.mock("@/features/create/wizard/Playbook", () => ({ BuildReportView: () => null }));
vi.mock("@/features/create/wizard/ShareDialog", () => ({ ShareDialog: () => null }));
vi.mock("@/features/brand/BrandedVideo", () => ({ BrandedVideo: () => <video aria-label="Exported video" /> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import { AssetTiles } from "@/features/create/wizard/AssetTiles";
import { QualityReview } from "@/features/create/wizard/QualityReview";
import type { Job, Variant } from "@/features/create/wizard/shared";

const variant: Variant = { id: "v1", angle: "Lunch", hook: "A quiet lunch", format: "Editorial", voiceover: "Take a moment.", caption: "", cta: "See the menu", script: "Actual dish photos.", version: 1, position: 0, planned_for: null, duration_s: 15, size: "1080x1920", review_state: "draft", review_note: null, beats: [], voice_id: null, batch_id: "b1", narrative: "A lunch ritual" };
const job = (overrides: Partial<Job> = {}): Job => ({ id: "r1", variant_id: "v1", status: "done", error: null, storage_path: null, created_at: "2026-11-01T12:00:00Z", technical_status: "unverified", creative_status: "unverified", ...overrides });
const mount = (renderJob: Job) => render(<AssetTiles ws="ours" variants={[variant]} jobs={[renderJob]} review onRefresh={async () => {}} />);
beforeEach(() => { cleanup(); vi.resetAllMocks(); mocked.approve.mockResolvedValue({}); mocked.send.mockResolvedValue({}); mocked.playback.mockResolvedValue({ url: "https://media.example/export.mp4" }); });

describe("distinct automated and human review", () => {
  it("labels legacy checks unverified and never confuses them with human approval", () => {
    render(<QualityReview job={job({ technical_status: null, creative_status: null })} humanStatus="draft" />);
    expect(screen.getAllByText("Unverified")).toHaveLength(2);
    expect(screen.getByText("Awaiting your playback review")).toBeInTheDocument();
    expect(screen.getByText(/Sampled frames do not verify full motion/)).toBeInTheDocument();
  });
  it("retains playback limits and notes even after sampled checks pass", () => {
    render(<QualityReview job={job({ technical_status: "passed", creative_status: "passed", qa_issues: ["Audio has not been inspected."] })} humanStatus="approved" />);
    expect(screen.getAllByText("Passed sampled checks")).toHaveLength(2);
    expect(screen.getByText("Approved this version")).toBeInTheDocument();
    expect(screen.getByText("Audio has not been inspected.")).toBeInTheDocument();
  });
});
describe("approval quality gate", () => {
  it.each(["needs_review", "failed", "pending"])("disables approval for known %s technical findings", (status) => {
    mount(job({ technical_status: status }));
    expect(screen.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Approve", exact: true }));
    expect(mocked.approve).not.toHaveBeenCalled();
  });
  it("blocks creative findings independently from technical success", () => {
    mount(job({ technical_status: "passed", creative_status: "needs_review" }));
    expect(screen.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
  });
  it("blocks approval when a critical finding was saved only in the export notes", () => {
    mount(job({ technical_status: "unverified", creative_status: "unverified", qa_issues: ["Major spelling defect in the exported end card."] }));
    expect(screen.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
    expect(screen.getByText("A known critical visual defect must be resolved before approval.")).toBeInTheDocument();
  });
  it("keeps a completed draft playable while quality findings block approval", async () => {
    mount(job({ technical_status: "needs_review", storage_path: "autotoast:export" }));
    expect(await screen.findByLabelText("Exported video")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();
  });
  it("allows an explicit human decision on unverified legacy output with visible limitations", async () => {
    mount(job());
    const approve = screen.getByRole("button", { name: "Approve", exact: true });
    expect(approve).toBeEnabled();
    expect(screen.getByText(/Automated quality review is incomplete or unverified/)).toBeInTheDocument();
    fireEvent.click(approve);
    await waitFor(() => expect(mocked.approve).toHaveBeenCalledWith({ data: { id: "v1", state: "approved", render_id: "r1" } }));
  });
});
