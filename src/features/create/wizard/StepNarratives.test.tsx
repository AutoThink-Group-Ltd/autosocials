import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepNarratives } from "./StepNarratives";

const mocks = vi.hoisted(() => ({ clear: vi.fn(), more: vi.fn(), planningJob: vi.fn(), models: vi.fn(), plan: vi.fn(), success: vi.fn(), error: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/creative.functions", () => ({ clearNarrativesForFreshStart: mocks.clear, moreNarratives: mocks.more, getNarrativePlanningJob: mocks.planningJob, getVideoModelOptions: mocks.models, planFromNarratives: mocks.plan }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: mocks.success, error: mocks.error }) }));
vi.mock("./NarrativeLibrary", () => ({ NarrativeLibrary: ({ onClear, busy }: { onClear: () => Promise<void>; busy: boolean }) => <button type="button" disabled={busy} onClick={() => void onClear()}>Clear narratives</button> }));
vi.mock("./QuickOptions", () => ({ QuickOptions: ({ specs }: { specs: { style_id?: string }[] }) => <div aria-label="Selected video style">{specs[0]?.style_id}</div> }));
vi.mock("./CreativeProgress", () => ({ CreativeProgress: () => <p>Planning</p> }));
vi.mock("../CreateBatches", () => ({ UploadAssetsCard: () => null }));

function mount(ideating = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const refresh = vi.fn().mockResolvedValue(undefined);
  const save = vi.fn().mockResolvedValue(undefined);
  render(<QueryClientProvider client={client}><StepNarratives ws="workspace-a" batchId="batch-a" narratives={[]} library={[]} ideating={ideating} autoOptions={false} onSave={save} onRefresh={refresh} onOptionsExit={vi.fn()} onNewIdeaBatch={vi.fn()} onCreateIdea={vi.fn()} onCreateSelectedIdeas={vi.fn()} onSetIdeaStatus={vi.fn()} onViewAsset={vi.fn()} /></QueryClientProvider>);
  return { refresh, invalidate, save };
}

beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.planningJob.mockResolvedValue(null);
  mocks.models.mockResolvedValue([{ id: "reaction-ugc", availability: "available" }]);
  mocks.clear.mockResolvedValue({ cleared: 3 });
});
afterEach(cleanup);

it("requests goal-led video ideas without starting video production", async () => {
  mocks.more.mockResolvedValue({ batchId: "batch-a", added: 3 });
  mount();
  fireEvent.click(screen.getByRole("button", { name: /Generate from Goals/ }));
  await waitFor(() => expect(mocks.more).toHaveBeenCalledExactlyOnceWith({ data: { batch_id: "batch-a", from_goals: true } }));
  expect(mocks.plan).not.toHaveBeenCalled();
});

it("saves the standalone choice with a new video idea", async () => {
  const scroll = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", { configurable: true, value: scroll });
  const { save } = mount();
  fireEvent.click(screen.getByRole("button", { name: /New Idea/ }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your idea" }), { target: { value: "A story about the night sky" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /Use saved Goals and DNA/ }));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Use this idea" })); });
  await waitFor(() => expect(save).toHaveBeenCalledWith({ narratives: [expect.objectContaining({ message: "A story about the night sky", context_mode: "standalone", selected: true })] }));
  Reflect.deleteProperty(Element.prototype, "scrollIntoView");
});

describe("clear narratives without generating replacements", () => {
  it("lets the user select a video style before choosing a narrative", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Styles" }));
    fireEvent.click(await screen.findByRole("button", { name: /Reaction \+ demo/ }));
    expect(screen.getByRole("tab", { name: "Narratives" })).toHaveAttribute("aria-selected", "true");
    expect(sessionStorage.getItem("as:video-entry-style:workspace-a")).toBe("reaction-ugc");
    expect(mocks.plan).not.toHaveBeenCalled();
  });
  it("offers social tile styles alongside video styles", async () => {
    mount();
    fireEvent.click(screen.getByRole("tab", { name: "Styles" }));
    fireEvent.click(screen.getByRole("button", { name: /Bold typography/ }));
    expect(sessionStorage.getItem("as:unified-tile-style:workspace-a")).toBe("typography");
    expect(screen.getByRole("tab", { name: "Narratives" })).toHaveAttribute("aria-selected", "true");
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("carries a previously chosen style into a selected narrative's setup", async () => {
    Element.prototype.scrollIntoView = vi.fn();
    sessionStorage.setItem("as:video-entry-style:workspace-a", "reaction-ugc");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><StepNarratives ws="workspace-a" batchId="batch-b" narratives={[{ id: "idea", title: "Show the app", message: "A demo", why: "Useful", selected: true, type: "Promotional" }]} library={[]} ideating={false} autoOptions onSave={vi.fn()} onRefresh={vi.fn()} onOptionsExit={vi.fn()} onNewIdeaBatch={vi.fn()} onCreateIdea={vi.fn()} onCreateSelectedIdeas={vi.fn()} onSetIdeaStatus={vi.fn()} onViewAsset={vi.fn()} /></QueryClientProvider>);
    expect(await screen.findByLabelText("Selected video style")).toHaveTextContent("reaction-ugc");
  });
  it("clears the current workspace, refreshes, and never requests more narratives", async () => {
    const { refresh, invalidate } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Clear narratives" }));
    await waitFor(() => expect(mocks.success).toHaveBeenCalled());
    expect(mocks.clear).toHaveBeenCalledExactlyOnceWith({ data: { workspace_id: "workspace-a" } });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["sam-messages", "workspace-a"] });
    expect(mocks.more).not.toHaveBeenCalled();
    expect(mocks.plan).not.toHaveBeenCalled();
  });

  it("clears during background ideation and tells the current workspace that ideation stopped", async () => {
    const stopped = vi.fn();
    const activity = vi.fn();
    window.addEventListener("as:sam-ideation-stopped", stopped);
    window.addEventListener("as:sam-ideation", activity);
    try {
      mount(true);
      fireEvent.click(screen.getByRole("button", { name: "Clear narratives" }));
      await waitFor(() => expect(mocks.success).toHaveBeenCalled());
      expect((stopped.mock.calls[0]![0] as CustomEvent).detail).toEqual({ workspaceId: "workspace-a" });
      expect((activity.mock.calls[0]![0] as CustomEvent).detail).toEqual({ workspaceId: "workspace-a", active: false });
      expect(mocks.more).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener("as:sam-ideation-stopped", stopped);
      window.removeEventListener("as:sam-ideation", activity);
    }
  });

  it("reports clear failure and refreshes without starting replacement work", async () => {
    mocks.clear.mockRejectedValue(new Error("Clear was rejected"));
    const { refresh } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Clear narratives" }));
    await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Clear was rejected"));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(mocks.more).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Clear narratives" })).toBeEnabled();
  });
});
