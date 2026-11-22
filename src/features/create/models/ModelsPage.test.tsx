import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelsPage } from "./ModelsPage";

const mocks = vi.hoisted(() => ({ models: vi.fn(), create: vi.fn(), draft: vi.fn(), upload: vi.fn(), job: vi.fn(), inspect: vi.fn(), workspace: "workspace-a" }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn, createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ currentWorkspace: { id: mocks.workspace } }) }));
vi.mock("@/lib/creative.functions", () => ({ getVideoModelOptions: mocks.models, refreshRenders: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/model-create.functions", () => ({ createModelVideo: mocks.create, draftModelPrompt: mocks.draft, getModelVideoRequest: mocks.inspect, quoteModelVideo: vi.fn().mockResolvedValue({ credits: 400, rateId: "11111111-1111-4111-8111-111111111111", capabilityId: "test" }) }));
vi.mock("@/lib/media.functions", () => ({ getRenderPlayback: vi.fn() }));
vi.mock("@/lib/video-styles", () => ({ getVideoStyle: () => ({ name: "Brand Motion" }) }));
vi.mock("@/lib/integrations", () => ({ BUILTIN_VOICES: [] }));
vi.mock("@/workspace/uploads/uploadStore", () => ({ startUpload: mocks.upload }));
vi.mock("../wizard/BuildAnimation", () => ({ BuildAnimation: () => <div>Tracking saved production job</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  from: () => {
    const query = { select: () => query, eq: () => query, order: () => query, limit: () => query, in: () => Promise.resolve({ data: [{ id: "file-a" }], error: null }), maybeSingle: mocks.job };
    return query;
  },
} }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><ModelsPage /></QueryClientProvider>);
}
async function promptStage() {
  fireEvent.click(await screen.findByRole("button", { name: "Choose Brand Motion" }));
}
beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear(); mocks.workspace = "workspace-a";
  mocks.models.mockResolvedValue([
    { id: "brand-motion", name: "Brand Motion", description: "Branded video", engine: "HyperFrames", availability: "available", output: "video" },
    { id: "illustrated-explainer", name: "Unavailable model", description: "Unavailable", engine: "Golpo", availability: "unavailable", output: "video" },
    { id: "image-model", name: "Image only", description: "Image", engine: "Image", availability: "available", output: "image" },
  ]);
  mocks.inspect.mockResolvedValue({ state: "preparing", batch_id: "batch-a" });
  mocks.draft.mockResolvedValue({ prompt: "An editable Sam draft" });
  mocks.upload.mockResolvedValue({ files: [{ name: "brief.md", fileId: "file-a" }], errors: [] });
  mocks.create.mockResolvedValue({ batch_id: "12345678-1234-4234-8234-123456789001", variant_id: "12345678-1234-4234-8234-123456789002" });
  mocks.job.mockResolvedValue({ data: { id: "job-a", status: "queued", phase: null, storage_path: null }, error: null });
});
afterEach(cleanup);

describe("manual Models creation", () => {
  it("filters images, keeps unavailable models disabled, and generates only on explicit Create", async () => {
    mount();
    expect(await screen.findByRole("button", { name: "Choose Unavailable model" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Choose Image only" })).not.toBeInTheDocument();
    await promptStage();
    fireEvent.change(screen.getByRole("textbox", { name: "Your video prompt" }), { target: { value: "Animate my brand story" } });
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByRole("heading", { name: "Add your media" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(screen.getByRole("heading", { name: "What shape?" })).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(screen.queryByLabelText("Narrative for video 1")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Prepare storyboard" }); await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({ prompt: "Animate my brand story", style_id: "brand-motion", file_ids: [], duration: 30, size: "1080x1920" }) });
    expect(mocks.create.mock.calls[0][0].data).not.toHaveProperty("voice");
    await screen.findByText("Tracking saved production job");
  });
  it("uploads pasted Markdown and media through the queue and lets Sam draft without generation", async () => {
    mount(); await promptStage();
    const file = new File(["# My brief"], "brief.md", { type: "text/markdown" });
    fireEvent.paste(screen.getByRole("textbox", { name: "Your video prompt" }), { clipboardData: { files: [file] } });
    await screen.findByText("Saved privately in Brand Assets");
    expect(mocks.upload).toHaveBeenCalledWith("workspace-a", [file]);
    fireEvent.click(screen.getByRole("button", { name: "Ask Sam to draft my prompt" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Your video prompt" })).toHaveValue("An editable Sam draft"));
    expect(mocks.draft).toHaveBeenCalledWith({ data: { workspace_id: "workspace-a", prompt: "", file_ids: ["file-a"], style_id: "brand-motion" } });
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Remove brief.md" }));
    expect(screen.queryByText("brief.md")).not.toBeInTheDocument();
  });
  it("blocks Next on failed uploads and allows removing the failed file", async () => {
    mocks.upload.mockResolvedValue({ files: [{ name: "clip.mp4", fileId: null, error: "Upload failed" }], errors: [] });
    mount(); await promptStage();
    fireEvent.change(screen.getByRole("textbox", { name: "Your video prompt" }), { target: { value: "My prompt" } });
    fireEvent.change(screen.getByLabelText("Upload reference files"), { target: { files: [new File(["clip"], "clip.mp4", { type: "video/mp4" })] } });
    await screen.findByText("Upload failed");
    expect(screen.getByRole("button", { name: "Next →" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Remove clip.mp4" }));
    expect(screen.getByRole("button", { name: "Next →" })).toBeEnabled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("recovers the saved job without starting generation on mount", async () => {
    sessionStorage.setItem("as:models-video:workspace-a", JSON.stringify({ batch_id: "12345678-1234-4234-8234-123456789001", variant_id: "12345678-1234-4234-8234-123456789002" }));
    mount();
    await screen.findByText("Tracking saved production job");
    await waitFor(() => expect(mocks.job).toHaveBeenCalled());
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("shows immediate build progress and preserves the same request for read-only recovery", async () => {
    mocks.create.mockReturnValue(new Promise(() => {}));
    mount(); await promptStage();
    fireEvent.change(screen.getByRole("textbox", { name: "Your video prompt" }), { target: { value: "My saved direction" } });
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Prepare storyboard" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Prepare storyboard" }));
    expect(screen.getByLabelText("Preparing storyboard")).toHaveTextContent("Preparing your storyboard for review");
    const pending = JSON.parse(sessionStorage.getItem("as:models-video:workspace-a:pending")!);
    expect(pending.prompt).toBe("My saved direction");
    expect(pending.request_id).toBe(mocks.create.mock.calls[0][0].data.request_id);
    cleanup(); mount();
    expect(await screen.findByRole("button", { name: "Check saved request" })).toBeInTheDocument();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Check saved request" }));
    await waitFor(() => expect(mocks.inspect).toHaveBeenCalledWith({ data: { workspace_id: "workspace-a", request_id: pending.request_id } }));
    expect(mocks.create).toHaveBeenCalledTimes(1);
  });
  it("restores a server-confirmed failed request for revision and uses a new creation identity", async () => {
    const request = { workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", file_ids: ["file-a"], style_id: "brand-motion", duration: 15, size: "1920x1080", captions: "off", note: "My note" };
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify(request));
    mocks.inspect.mockResolvedValue({ state: "failed", batch_id: "batch-a" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Revise setup" }));
    expect(await screen.findByRole("textbox", { name: "Your video prompt" })).toHaveValue(request.prompt);
    expect(screen.getByText("Attached file 1")).toBeInTheDocument();
    expect(sessionStorage.getItem("as:models-video:workspace-a:pending")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Prepare storyboard" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Prepare storyboard" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].data.request_id).not.toBe(request.request_id);
    expect(mocks.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ prompt: request.prompt, file_ids: request.file_ids, duration: 15, size: "1920x1080", captions: "off", note: "My note" }));
  });
  it("keeps a preparing request blocked when revision is requested", async () => {
    const request = { workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", file_ids: [], style_id: "brand-motion", duration: 15, size: "1920x1080", captions: "off", note: "" };
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify(request));
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Revise setup" }));
    await screen.findByText(/Your saved request is still preparing/);
    expect(screen.queryByRole("textbox", { name: "Your video prompt" })).not.toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem("as:models-video:workspace-a:pending")!)).toEqual(request);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Open editing tools →" })).toBeInTheDocument();
  });
  it("retains an unclaimed request identity across revision and reload", async () => {
    const request = { workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", file_ids: [], style_id: "brand-motion", duration: 15, size: "1920x1080", captions: "off", note: "" };
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify(request));
    mocks.inspect.mockResolvedValue({ state: "not_found" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Revise setup" }));
    await screen.findByRole("textbox", { name: "Your video prompt" });
    expect(JSON.parse(sessionStorage.getItem("as:models-video:workspace-a:pending")!).request_id).toBe(request.request_id);
    cleanup(); mount();
    fireEvent.click(await screen.findByRole("button", { name: "Revise setup" }));
    await screen.findByRole("textbox", { name: "Your video prompt" });
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Prepare storyboard" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Prepare storyboard" }));
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].data.request_id).toBe(request.request_id);
  });
  it("recovers accepted pending requests using inspection without generation", async () => {
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify({ workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", style_id: "brand-motion", duration: 30 }));
    mocks.inspect.mockResolvedValue({ state: "queued", batch_id: "12345678-1234-4234-8234-123456789003", variant_id: "12345678-1234-4234-8234-123456789002" });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Revise setup" }));
    await screen.findByText("Tracking saved production job");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("protects failed renders awaiting provider reconciliation", async () => {
    sessionStorage.setItem("as:models-video:workspace-a", JSON.stringify({ batch_id: "12345678-1234-4234-8234-123456789001", variant_id: "12345678-1234-4234-8234-123456789002" }));
    mocks.job.mockResolvedValue({ data: { id: "job-a", status: "failed", phase: "reconciliation_required", error: "Provider status uncertain" }, error: null });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Create another video" }));
    await screen.findByText(/This request still needs its production history checked/);
    expect(screen.getByRole("heading", { name: "Video creation failed" })).toBeInTheDocument();
    expect(sessionStorage.getItem("as:models-video:workspace-a")).not.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it.each(["failed", "not_found"])("explicit Retry preserves the complete setup after %s inspection", async (state) => {
    const request = { workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", file_ids: ["file-a"], style_id: "brand-motion", duration: 60, size: "1920x1080", voice: "Kore", captions: "off", note: "Keep the product visible" };
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify(request));
    mocks.inspect.mockResolvedValue({ state });
    mount();
    const retry = await screen.findByRole("button", { name: "Retry" }); await waitFor(() => expect(retry).toBeEnabled());
    expect(mocks.inspect).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    fireEvent.click(retry);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.inspect).toHaveBeenCalledWith({ data: { workspace_id: request.workspace_id, request_id: request.request_id } });
    const retried = mocks.create.mock.calls[0][0].data;
    expect(retried).toEqual(expect.objectContaining({ ...request, request_id: expect.any(String), expected_credits: 400, expected_rate_id: "11111111-1111-4111-8111-111111111111" }));
    if (state === "failed") expect(retried.request_id).not.toBe(request.request_id);
    else expect(retried.request_id).toBe(request.request_id);
    await screen.findByText("Tracking saved production job");
  });
  it("explicit Retry recovers a queued request without creating another video", async () => {
    const request = { workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", style_id: "brand-motion", duration: 30 };
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify(request));
    mocks.inspect.mockResolvedValue({ state: "queued", batch_id: request.request_id, variant_id: "12345678-1234-4234-8234-123456789002" });
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Tracking saved production job");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(sessionStorage.getItem("as:models-video:workspace-a:pending")).toBeNull();
  });
  it("explicit Retry keeps a preparing request protected", async () => {
    const request = { workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", style_id: "brand-motion", duration: 30 };
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify(request));
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText(/Your saved request is still preparing/);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem("as:models-video:workspace-a:pending")!)).toEqual(request);
    expect(screen.getByRole("button", { name: "Revise setup" })).toBeEnabled();
  });
  it("ignores duplicate Retry clicks during inspection and production acceptance", async () => {
    const request = { workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", file_ids: [], style_id: "brand-motion", duration: 15, size: "1920x1080", captions: "off", note: "" };
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify(request));
    let finishInspection!: (result: { state: string }) => void;
    mocks.inspect.mockReturnValue(new Promise((resolve) => { finishInspection = resolve; }));
    mocks.create.mockReturnValue(new Promise(() => {}));
    mount();
    const retry = await screen.findByRole("button", { name: "Retry" }); await waitFor(() => expect(retry).toBeEnabled());
    fireEvent.click(retry); fireEvent.click(retry);
    expect(mocks.inspect).toHaveBeenCalledTimes(1);
    expect(retry).toBeDisabled();
    expect(screen.getByRole("button", { name: "Revise setup" })).toBeDisabled();
    finishInspection({ state: "failed" });
    await screen.findByLabelText("Preparing storyboard");
    fireEvent.click(retry);
    expect(mocks.inspect).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem("as:models-video:workspace-a:pending")!).request_id).toBe(mocks.create.mock.calls[0][0].data.request_id);
  });
  it("never retries when saved request inspection fails", async () => {
    sessionStorage.setItem("as:models-video:workspace-a:pending", JSON.stringify({ workspace_id: "workspace-a", request_id: "12345678-1234-4234-8234-123456789003", prompt: "My original brief", style_id: "brand-motion", duration: 30 }));
    mocks.inspect.mockRejectedValue(new Error("Status unavailable"));
    mount();
    await waitFor(() => expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await screen.findByText("Status unavailable");
    expect(mocks.create).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });
});
