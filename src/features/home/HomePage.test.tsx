vi.mock("@/features/create/PipelineAssets", () => ({ usePipelineAssetCounts: () => ({ counts: { ready: 0, scheduled: 0, published: 0 }, isLoading: false, isError: false }) }));
vi.mock("@/features/create/PipelinePlans", () => ({ usePipelinePlanCounts: () => ({ production: 0 }) }));
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ overview: vi.fn(), inspect: vi.fn(), create: vi.fn(), retry: vi.fn(), navigate: vi.fn(), trash: vi.fn(), restore: vi.fn(), planning: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn, createServerOnlyFn: (fn: unknown) => fn, createServerFn: () => ({ inputValidator: () => ({ handler: (fn: unknown) => fn }) }) }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate, Outlet: () => null, Link: ({ to, children, ...props }: { to: string; children: React.ReactNode }) => <a href={to} {...props}>{children}</a> }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ currentWorkspace: { id: ws, name: "Our business" } }) }));
vi.mock("@/lib/home-overview.functions", () => ({ getHomeOverview: mocks.overview }));
vi.mock("@/lib/home-actions.functions", () => ({ trashHomeItems: mocks.trash, restoreHomeItems: mocks.restore, retryHomePlanning: mocks.planning }));
vi.mock("@/lib/model-create.functions", async () => ({ ...await vi.importActual("@/lib/model-create.functions"), getModelVideoRequest: mocks.inspect, createModelVideo: mocks.create, quoteModelVideo: vi.fn().mockResolvedValue({ credits: 40, rateId: "11111111-1111-4111-8111-111111111111" }) }));
vi.mock("@/lib/creative.functions", () => ({ retryFailedProduction: mocks.retry, getRetryProductionQuote: vi.fn().mockResolvedValue({ creditCost: 20, creditVersion: 1, creditLines: [], completedStepIds: [] }) }));
vi.mock("@/lib/supabase-admin.server", () => ({ requireUser: vi.fn() }));
import { HomePage } from "./HomePage";
import type { HomeOverviewItem } from "@/lib/home-overview";
import type { ModelCreateRequest } from "@/lib/model-create.functions";
const ws = "11111111-1111-4111-8111-111111111111";
const batch = "22222222-2222-4222-8222-222222222222";
const variant = "33333333-3333-4333-8333-333333333333";
const request: ModelCreateRequest = { workspace_id: ws, request_id: batch, prompt: "Show an illustrative London story", file_ids: [], style_id: "cinematic-scene", duration: 30, size: "1080x1920", voice: "Kore", captions: "off", note: "Natural lighting" };
const failed = (): HomeOverviewItem => ({ id: batch, batch_id: batch, kind: "batch", trashed: false, can_trash: true, title: "London story", source: "models", updated_at: "2026-11-05T01:00:00Z", stages: { narrative: "complete", storyboard: "failed", video: "pending" }, status: "Planning failed", action: "retry_model", resume_request: request });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><HomePage workOverview /></QueryClientProvider>);
}
async function confirmRetry() {
  const confirm = await screen.findByRole("button", { name: "Confirm retry" });
  await waitFor(() => expect(confirm).toBeEnabled());
  fireEvent.click(confirm);
}

beforeEach(() => {
  vi.clearAllMocks(); sessionStorage.clear();
  mocks.overview.mockResolvedValue([failed()]);
  mocks.inspect.mockResolvedValue({ state: "failed", batch_id: batch });
  mocks.create.mockResolvedValue({ batch_id: "44444444-4444-4444-8444-444444444444", variant_id: variant });
  mocks.retry.mockResolvedValue({ render_id: "render-next", reused_assets: 1 });
  mocks.planning.mockResolvedValue({ job_id: "plan-next", status: "queued" });
  mocks.trash.mockImplementation(async ({ data }: { data: { item_ids: string[] } }) => ({ updated_ids: data.item_ids }));
  mocks.restore.mockImplementation(async ({ data }: { data: { item_ids: string[] } }) => ({ updated_ids: data.item_ids }));
});
afterEach(cleanup);

describe("workspace Home overview", () => {
  it("keeps the work-management button out of the default Home toolbar", () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><HomePage /></QueryClientProvider>);
    expect(screen.queryByRole("button", { name: "Work in progress" })).toBeNull();
  });
  it("opens Sam's social tile planning for the current workspace without starting generation", async () => {
    mount();
    expect(screen.queryByRole("link", { name: "Browse models" })).not.toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Create social tiles" }));
    expect(JSON.parse(sessionStorage.getItem(`as:social-tiles:${ws}`)!)).toEqual({ brief: "" });
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/app/create", search: { wizard: "tiles" } });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("shows the actual failed stage without marking a video complete or generating on mount", async () => {
    mount();
    const card = await screen.findByRole("article", { name: "London story" });
    expect(within(card).getByLabelText("Narrative: Complete")).toBeInTheDocument();
    expect(within(card).getByLabelText("Storyboard: Failed")).toBeInTheDocument();
    expect(within(card).getByLabelText("Video: Not started")).toBeInTheDocument();
    expect(within(card).getByRole("button", { name: "Retry", exact: true })).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.inspect).not.toHaveBeenCalled();
  });
  it("retries a confirmed failed plan with saved settings and a new UUID, once per click sequence", async () => {
    let accept: ((value: unknown) => void) | undefined;
    mocks.create.mockImplementation(() => new Promise((resolve) => { accept = resolve; }));
    mount();
    const retry = await screen.findByRole("button", { name: "Retry", exact: true });
    fireEvent.click(retry); fireEvent.click(retry);
    await confirmRetry();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    const sent = mocks.create.mock.calls[0][0].data;
    expect(sent).toEqual({ ...request, request_id: expect.any(String), expected_credits: 40, expected_rate_id: "11111111-1111-4111-8111-111111111111" });
    expect(sent.request_id).not.toBe(batch);
    expect(mocks.inspect).toHaveBeenCalledWith({ data: { workspace_id: ws, request_id: batch } });
    expect(JSON.parse(sessionStorage.getItem(`as:home-model-retry:${ws}:${batch}`)!).request_id).toBe(sent.request_id);
    accept?.({ batch_id: sent.request_id, variant_id: variant });
    await screen.findByText("Your video is queued. Production continues if you leave Home.");
    expect(await screen.findByRole("button", { name: "View retry" })).toBeInTheDocument();
  });
  it("protects a preparing request and never resubmits it", async () => {
    mocks.inspect.mockResolvedValue({ state: "preparing", batch_id: batch });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Retry", exact: true })); await confirmRetry();
    await screen.findByText(/This request is still preparing/);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("safely retries Models admission failure after its storyboard was saved", async () => {
    mocks.overview.mockResolvedValue([{ ...failed(), variant_id: variant, stages: { narrative: "complete", storyboard: "complete", video: "failed" }, status: "Video could not start", action: "retry_model" }]);
    let resolveStatus: ((value: unknown) => void) | undefined;
    mocks.inspect.mockImplementation(() => new Promise((resolve) => { resolveStatus = resolve; }));
    mount();
    const card = await screen.findByRole("article", { name: "London story" });
    expect(within(card).getByLabelText("Storyboard: Complete")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Retry", exact: true }));
    await confirmRetry();
    expect(mocks.inspect).toHaveBeenCalledWith({ data: { workspace_id: ws, request_id: batch } });
    expect(mocks.create).not.toHaveBeenCalled();
    resolveStatus?.({ state: "failed", batch_id: batch, variant_id: variant });
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].data.request_id).not.toBe(batch);
  });
  it("recovers queued work without requeueing", async () => {
    mocks.inspect.mockResolvedValue({ state: "queued", batch_id: batch, variant_id: variant });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Retry", exact: true })); await confirmRetry();
    await screen.findByText(/already queued or finished/);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(JSON.parse(sessionStorage.getItem(`as:models-video:${ws}`)!)).toEqual({ batch_id: batch, variant_id: variant });
  });
  it("retains the UUID if the original request has not reached the server", async () => {
    mocks.inspect.mockResolvedValue({ state: "not_found" });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Retry", exact: true })); await confirmRetry();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith({ data: { ...request, expected_credits: 40, expected_rate_id: "11111111-1111-4111-8111-111111111111" } }));
  });
  it("uses the exact legacy browser request for a failed Models card", async () => {
    mocks.overview.mockResolvedValue([{ ...failed(), action: "resume", resume_request: undefined, can_resume_model: true }]);
    sessionStorage.setItem(`as:models-video:${ws}:pending`, JSON.stringify(request));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Retry", exact: true })); await confirmRetry();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.create.mock.calls[0][0].data.prompt).toBe(request.prompt);
    expect(mocks.create.mock.calls[0][0].data.duration).toBe(request.duration);
  });
  it("does not invent retry settings when the saved request is unavailable", async () => {
    mocks.overview.mockResolvedValue([{ ...failed(), action: "resume", resume_request: undefined, saved_prompt: request.prompt }]);
    mount();
    fireEvent.click(await screen.findByText("Review saved prompt"));
    expect(screen.getByText(request.prompt)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry", exact: true })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resume", exact: true })).not.toBeInTheDocument();
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Choose video model" })).toHaveAttribute("href", "/app/models");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not offer another user's stale browser request as Retry", async () => {
    mocks.overview.mockResolvedValue([{ ...failed(), action: "resume", resume_request: undefined, saved_prompt: request.prompt, can_resume_model: false }]);
    sessionStorage.setItem(`as:models-video:${ws}:pending`, JSON.stringify(request));
    mount(); await screen.findByText("Review saved prompt");
    expect(screen.queryByRole("button", { name: "Retry", exact: true })).not.toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("refreshes Home after a failed retry so its newly saved attempt is visible", async () => {
    mocks.create.mockImplementation(async ({ data }: { data: ModelCreateRequest }) => {
      mocks.overview.mockResolvedValue([failed(), { ...failed(), id: data.request_id, batch_id: data.request_id, title: "London retry", resume_request: data }]);
      throw new Error("A revised plan needs attention.");
    });
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Retry", exact: true })); await confirmRetry();
    await screen.findByRole("article", { name: "London retry" });
    expect(screen.getByRole("alert")).toHaveTextContent("A revised plan needs attention.");
    expect(mocks.overview.mock.calls.length).toBeGreaterThan(1);
  });
  it("keeps completed narrative/storyboard visible for a failed video and confirms render retry", async () => {
    mocks.overview.mockResolvedValue([{ ...failed(), source: "create", variant_id: variant, render_id: "55555555-5555-4555-8555-555555555555", resume_request: undefined, stages: { narrative: "complete", storyboard: "complete", video: "failed" }, status: "Video failed", action: "retry_render" }]);
    mount();
    const card = await screen.findByRole("article", { name: "London story" });
    expect(within(card).getByLabelText("Narrative: Complete")).toBeInTheDocument();
    expect(within(card).getByLabelText("Storyboard: Complete")).toBeInTheDocument();
    expect(within(card).getByLabelText("Video: Failed")).toBeInTheDocument();
    fireEvent.click(within(card).getByRole("button", { name: "Retry", exact: true }));
    expect(mocks.retry).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm retry", exact: true })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Confirm retry", exact: true }));
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledWith({ data: { variant_id: variant, render_id: "55555555-5555-4555-8555-555555555555", confirmed: true, expected_version: 1, expected_credits: 20, expected_lines: [], expected_completed_step_ids: [] } }));
  });
  it("offers inspection instead of retry for uncertain paid work", async () => {
    mocks.overview.mockResolvedValue([{ ...failed(), action: "reconcile", variant_id: variant, render_id: "uncertain", resume_request: undefined, stages: { narrative: "complete", storyboard: "complete", video: "failed" } }]);
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Inspect saved work" }));
    expect(screen.queryByRole("button", { name: "Retry", exact: true })).not.toBeInTheDocument();
    expect(sessionStorage.getItem(`as:create-batch:${ws}`)).toBe(batch);
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("retains a previous uncertain retry identity across reload and only opens it", async () => {
    const next = { ...request, request_id: "66666666-6666-4666-8666-666666666666" };
    sessionStorage.setItem(`as:home-model-retry:${ws}:${batch}`, JSON.stringify(next));
    mount(); fireEvent.click(await screen.findByRole("button", { name: "View retry" }));
    expect(screen.getByText("Previous attempt")).toBeInTheDocument();
    expect(JSON.parse(sessionStorage.getItem(`as:models-video:${ws}:pending`)!)).toEqual(next);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/app/models" });
  });
});

describe("Home selection, Trash and bulk actions", () => {
  const renderFailure = (): HomeOverviewItem => ({ ...failed(), id: variant, kind: "variant", batch_id: "77777777-7777-4777-8777-777777777777", title: "Rendered story", source: "create", variant_id: variant, render_id: "88888888-8888-4888-8888-888888888888", action: "retry_render", resume_request: undefined, stages: { narrative: "complete", storyboard: "complete", video: "failed" } });
  const active = (): HomeOverviewItem => ({ ...failed(), id: "99999999-9999-4999-8999-999999999999", title: "Active story", resume_request: undefined, action: "resume", can_trash: false, stages: { narrative: "complete", storyboard: "complete", video: "active" } });
  const planning = (): HomeOverviewItem => ({ ...failed(), id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", kind: "planning", title: "Failed storyboard", source: "create", resume_request: undefined, action: "retry_planning" });
  it("confirms a single reversible Trash action before any mutation", async () => {
    let hidden = false;
    mocks.overview.mockImplementation(async ({ data }: { data: { view: string } }) => data.view === "trash" ? [{ ...failed(), trashed: true }] : hidden ? [] : [failed()]);
    mocks.trash.mockImplementation(async ({ data }: { data: { item_ids: string[] } }) => { hidden = true; return { updated_ids: data.item_ids }; });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: "Move London story to Trash" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Move 1 item to Trash?" })).toBeInTheDocument();
    expect(within(dialog).getByText("London story")).toBeInTheDocument();
    expect(within(dialog).getByText(/restore these items/)).toBeInTheDocument();
    expect(mocks.trash).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole("button", { name: "Move to Trash", exact: true });
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.trash).toHaveBeenCalledTimes(1));
    expect(mocks.trash).toHaveBeenCalledWith({ data: { workspace_id: ws, item_ids: [batch] } });
    await screen.findByText("1 item moved to Trash.");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("selects and clears visible work without starting actions", async () => {
    mocks.overview.mockResolvedValue([failed(), renderFailure()]);
    mount();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Select all shown work" }));
    expect(screen.getByRole("checkbox", { name: "Select London story" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Rendered story" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Retry selected", exact: true })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByRole("checkbox", { name: "Select London story" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Retry selected", exact: true })).toBeDisabled();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.trash).not.toHaveBeenCalled(); expect(mocks.planning).not.toHaveBeenCalled();
  });
  it("bulk Trash skips protected active work and confirms only eligible titles", async () => {
    mocks.overview.mockResolvedValue([failed(), active()]);
    mount(); fireEvent.click(await screen.findByRole("checkbox", { name: "Select all shown work" }));
    const blocked = screen.getByRole("button", { name: "Move Active story to Trash" });
    expect(blocked).toBeDisabled(); expect(blocked).toHaveAttribute("title", "Work in progress cannot be moved to Trash.");
    fireEvent.click(screen.getByRole("button", { name: "Move selected to Trash" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("London story")).toBeInTheDocument();
    expect(within(dialog).queryByText("Active story")).not.toBeInTheDocument();
    expect(mocks.trash).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Move to Trash", exact: true }));
    await waitFor(() => expect(mocks.trash).toHaveBeenCalledWith({ data: { workspace_id: ws, item_ids: [batch] } }));
    expect(screen.getByRole("checkbox", { name: "Select Active story" })).toBeChecked();
  });
  it("confirms mixed bulk retry, runs eligible work sequentially, and skips active/uncertain/draft work", async () => {
    const protectedItem: HomeOverviewItem = { ...active(), id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Uncertain story", action: "reconcile", stages: { narrative: "complete", storyboard: "complete", video: "failed" } };
    const draft: HomeOverviewItem = { ...active(), id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", title: "Ready draft", action: "resume", stages: { narrative: "complete", storyboard: "complete", video: "pending" } };
    mocks.overview.mockResolvedValue([failed(), renderFailure(), active(), protectedItem, draft]);
    let accept: ((value: unknown) => void) | undefined;
    mocks.create.mockImplementation(() => new Promise((resolve) => { accept = resolve; }));
    mount(); fireEvent.click(await screen.findByRole("checkbox", { name: "Select all shown work" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry selected", exact: true }));
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByRole("heading", { name: "Retry 2 selected items?" })).toBeInTheDocument();
    expect(await within(dialog).findByText(/Retry costs/)).toBeInTheDocument();
    expect(within(dialog).getByText(/3 selected items cannot be retried/)).toBeInTheDocument();
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
    const confirm = within(dialog).getByRole("button", { name: "Confirm retry" }); await waitFor(() => expect(confirm).toBeEnabled());
    fireEvent.click(confirm); fireEvent.click(confirm);
    await waitFor(() => expect(mocks.create).toHaveBeenCalledTimes(1));
    expect(mocks.retry).not.toHaveBeenCalled();
    accept?.({ batch_id: "44444444-4444-4444-8444-444444444444", variant_id: variant });
    await waitFor(() => expect(mocks.retry).toHaveBeenCalledTimes(1));
    await screen.findByText("2 retried; 0 already active or finished; 3 skipped; 0 failed.");
    expect(screen.getByRole("checkbox", { name: "Select London story" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Active story" })).toBeChecked();
  });
  it("reports partial bulk retry failure and keeps failed work selected", async () => {
    mocks.overview.mockResolvedValue([failed(), renderFailure(), planning()]);
    mocks.retry.mockRejectedValue(new Error("Provider connection needs attention."));
    mount(); fireEvent.click(await screen.findByRole("checkbox", { name: "Select all shown work" }));
    fireEvent.click(screen.getByRole("button", { name: "Retry selected", exact: true }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm retry" })).toBeEnabled()); fireEvent.click(screen.getByRole("button", { name: "Confirm retry" }));
    await screen.findByText("2 retried; 0 already active or finished; 0 skipped; 1 failed. Failed and skipped items remain selected.");
    expect(screen.getByRole("alert")).toHaveTextContent("Rendered story: Provider connection needs attention.");
    expect(screen.getByRole("checkbox", { name: "Select Rendered story" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select London story" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select Failed storyboard" })).not.toBeChecked();
    expect(mocks.create).toHaveBeenCalledTimes(1); expect(mocks.retry).toHaveBeenCalledTimes(1); expect(mocks.planning).toHaveBeenCalledTimes(1);
  });
  it("retries a failed storyboard through the planning queue without rendering", async () => {
    mocks.overview.mockResolvedValue([planning()]);
    mount(); fireEvent.click(await screen.findByRole("button", { name: "Retry", exact: true })); await confirmRetry();
    await waitFor(() => expect(mocks.planning).toHaveBeenCalledWith({ data: { workspace_id: ws, job_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" } }));
    await screen.findByText("Storyboard planning is queued again. No video render was started.");
    expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.retry).not.toHaveBeenCalled();
  });
  it("retains unsuccessful Trash selections while reporting saved changes", async () => {
    mocks.overview.mockResolvedValue([failed(), renderFailure()]);
    mocks.trash.mockResolvedValue({ updated_ids: [batch], errors: [{ id: variant, message: "Status changed; refresh first." }] });
    mount(); fireEvent.click(await screen.findByRole("checkbox", { name: "Select all shown work" }));
    fireEvent.click(screen.getByRole("button", { name: "Move selected to Trash" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move to Trash", exact: true }));
    await screen.findByText("1 item moved to Trash.");
    expect(screen.getByRole("alert")).toHaveTextContent("Rendered story: Status changed; refresh first.");
    expect(screen.getByRole("checkbox", { name: "Select Rendered story" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select London story" })).not.toBeChecked();
  });
  it("chunks more than twenty selected Trash items into bounded requests", async () => {
    const work = Array.from({ length: 21 }, (_, index) => {
      const id = `dddddddd-dddd-4ddd-8ddd-${String(index + 1).padStart(12, "0")}`;
      return { ...failed(), id, batch_id: id, title: `Saved ${index + 1}`, resume_request: { ...request, request_id: id } };
    });
    mocks.overview.mockResolvedValue(work);
    mount(); fireEvent.click(await screen.findByRole("checkbox", { name: "Select all shown work" }));
    fireEvent.click(screen.getByRole("button", { name: "Move selected to Trash" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move to Trash", exact: true }));
    await screen.findByText("21 items moved to Trash.");
    expect(mocks.trash).toHaveBeenCalledTimes(2);
    expect(mocks.trash.mock.calls[0][0].data.item_ids).toHaveLength(20);
    expect(mocks.trash.mock.calls[1][0].data.item_ids).toHaveLength(1);
  });
});
