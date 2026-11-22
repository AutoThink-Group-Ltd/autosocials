import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DirectVideoBlock, type DirectVideoCard } from "./DirectVideoBlock";

const mocks = vi.hoisted(() => ({ choose: vi.fn(), options: vi.fn(), refresh: vi.fn(), readJob: vi.fn(), sign: vi.fn(), support: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ currentWorkspace: { id: "workspace-a" } }) }));
vi.mock("@/lib/direct-video.functions", () => ({ chooseDirectVideo: mocks.choose, getDirectVideoOptions: mocks.options }));
vi.mock("@/lib/creative.functions", () => ({ refreshRenders: mocks.refresh }));
vi.mock("@/lib/video-support.functions", () => ({ requestVideoSupport: mocks.support }));
vi.mock("@/lib/media.functions", () => ({ getRenderPlayback: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, maybeSingle: mocks.readJob };
    return query;
  },
  storage: { from: () => ({ createSignedUrl: mocks.sign }) },
} }));

const card: DirectVideoCard = { type: "direct_video", title: "Canada Water film", request_id: "request-a", status: "options", reason: "Pick a compatible model", reference_count: 10, duration: 30, aspect_ratio: "9:16", resolution: "1080p", options: [], message: "Animate the photos", thread_id: "thread-a", file_ids: ["photo-a"] };
function mount(b: DirectVideoCard = card) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onRefresh = vi.fn();
  render(<QueryClientProvider client={client}><DirectVideoBlock b={b} canvas={{ id: "canvas-a", version: 3 }} index={2} onRefresh={onRefresh} /></QueryClientProvider>);
  return { onRefresh };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.options.mockResolvedValue({ options: [{ id: "model-a", label: "Reference Model", estimatedUsd: "17.0586", creditCost: 400, creditRateId: "11111111-1111-4111-8111-111111111111" }], reason: "Pick a compatible model" });
  mocks.choose.mockResolvedValue({ variant_id: "variant-a", batch_id: "batch-a" });
  mocks.refresh.mockResolvedValue({ ok: true });
  mocks.readJob.mockResolvedValue({ data: { id: "job-a", status: "queued", phase: "provider_assets", error: null, storage_path: null, created_at: new Date().toISOString() }, error: null });
  mocks.support.mockResolvedValue({ reference: "ABC12345" });
  mocks.sign.mockResolvedValue({ data: { signedUrl: "https://example.com/video.mp4" }, error: null });
});
afterEach(cleanup);

describe("direct photo video progress", () => {
  it("does not start when an engine has no active credit price", async () => {
    mocks.options.mockResolvedValue({ options: [{ id: "model-a", label: "Reference Model", estimatedUsd: "17.0586", creditCost: null, creditRateId: null }], reason: "Choose a model" });
    mount();
    const create = await screen.findByRole("button", { name: "Create video with Reference Model" });
    expect(create).toBeDisabled();
    expect(screen.getByText("Credit price unavailable for these settings")).toBeInTheDocument();
    expect(mocks.choose).not.toHaveBeenCalled();
  });
  it("shows immediate indeterminate progress during submission, then polls the returned job without a canvas refresh", async () => {
    let finish!: (value: { variant_id: string; batch_id: string }) => void;
    mocks.choose.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { onRefresh } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Create video with Reference Model" }));
    const progress = screen.getByRole("status", { name: "Animation progress" });
    expect(progress).toHaveTextContent("Submitting your animation");
    expect(within(progress).getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(mocks.readJob).not.toHaveBeenCalled();
    finish({ variant_id: "variant-a", batch_id: "batch-a" });
    await waitFor(() => expect(mocks.readJob).toHaveBeenCalled());
    await waitFor(() => expect(progress).toHaveTextContent("Your request is in the production queue"));
    expect(onRefresh).toHaveBeenCalled();
    expect(mocks.choose).toHaveBeenCalledWith({ data: expect.objectContaining({ index: 2, expected_version: 3, expected_credits: 400, expected_rate_id: "11111111-1111-4111-8111-111111111111" }) });
    expect(screen.queryByRole("button", { name: "Create video with Reference Model" })).not.toBeInTheDocument();
  });

  it("shows the persisted provider failure even when worker refresh fails, and recovers status in this view", async () => {
    mocks.refresh.mockRejectedValue(new Error("Worker could not refresh"));
    mocks.readJob.mockResolvedValueOnce({ data: { id: "job-a", status: "failed", phase: "provider_assets", error: "Provider rejected the reference payload", storage_path: null }, error: null });
    mount({ ...card, status: "queued", reason: "Your animation is queued. Progress below comes from the production job.", variant_id: "variant-a" });
    const progress = await screen.findByRole("status", { name: "Animation progress" });
    await waitFor(() => expect(progress).toHaveTextContent("Animation failed"));
    expect(within(progress).getByRole("alert")).toHaveTextContent("Provider rejected the reference payload");
    expect(screen.queryByText("Your animation is queued. Progress below comes from the production job.")).not.toBeInTheDocument();
    expect(progress).toHaveTextContent("Review the provider connection and request settings");
    expect(within(progress).queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open video in Create/ })).not.toBeInTheDocument();
    mocks.readJob.mockResolvedValue({ data: { id: "job-a", status: "done", phase: "done", error: null, storage_path: "workspace-a/renders/job-a/video.mp4" }, error: null });
    fireEvent.click(await screen.findByRole("button", { name: "Refresh job status" }));
    await waitFor(() => expect(progress).toHaveTextContent("Your video is ready"));
    await waitFor(() => expect(screen.getByLabelText("Canada Water film")).toHaveAttribute("src", "https://example.com/video.mp4"));
    expect(mocks.choose).not.toHaveBeenCalled();
  });

  it("uses the persisted running phase rather than inventing a completion estimate", async () => {
    mocks.readJob.mockResolvedValue({ data: { id: "job-a", status: "rendering", phase: "provider_ingestion", error: null, storage_path: null }, error: null });
    mount({ ...card, status: "queued", variant_id: "variant-a" });
    await waitFor(() => expect(screen.getByRole("status", { name: "Animation progress" })).toHaveTextContent("Saving generated video"));
    expect(screen.getByRole("progressbar")).not.toHaveAttribute("aria-valuenow");
    expect(screen.queryByText(/\d+%/)).not.toBeInTheDocument();
  });

  it("uses a completed persisted job over an old failed card", async () => {
    mocks.readJob.mockResolvedValue({ data: { id: "job-a", status: "done", phase: "done", error: null, storage_path: "workspace-a/renders/job-a/video.mp4" }, error: null });
    mount({ ...card, status: "failed", error: "An old attempt failed", variant_id: "variant-a" });
    await waitFor(() => expect(screen.getByRole("status", { name: "Animation progress" })).toHaveTextContent("Your video is ready"));
    expect(screen.queryByText("An old attempt failed")).not.toBeInTheDocument();
  });

  it("identifies credential failures as a provider connection issue", async () => {
    mocks.readJob.mockResolvedValue({ data: { id: "job-a", status: "failed", phase: "provider_assets", error: "Creative provider API credentials are invalid or expired.", storage_path: null }, error: null });
    mount({ ...card, status: "queued", variant_id: "variant-a" });
    await waitFor(() => expect(screen.getByRole("status", { name: "Animation progress" })).toHaveTextContent("The Higgsfield API connection needs valid credentials"));
    expect(screen.queryByText(/Review the provider connection and request settings/)).not.toBeInTheDocument();
  });

  it("refreshes the saved card after submission fails", async () => {
    mocks.choose.mockRejectedValue(new Error("Creative provider API credentials are invalid or expired."));
    const { onRefresh } = mount();
    fireEvent.click(await screen.findByRole("button", { name: "Create video with Reference Model" }));
    await waitFor(() => expect(onRefresh).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("alert")).toHaveTextContent("Creative provider API credentials are invalid or expired.");
  });
  it("offers one-click support for a failed provider job and shows its reference", async () => {
    mocks.readJob.mockResolvedValue({ data: { id: "job-a", status: "failed", phase: "provider", error: "Provider capacity unavailable", storage_path: null }, error: null });
    mount({ ...card, status: "queued", variant_id: "variant-a" });
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/your available credits do not guarantee/i)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Send support ticket" }));
    await waitFor(() => expect(mocks.support).toHaveBeenCalledExactlyOnceWith({ data: { canvas_id: "canvas-a" } }));
    expect(await within(dialog).findByText(/Reference ABC12345/)).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "Send support ticket" })).not.toBeInTheDocument();
  });

});
