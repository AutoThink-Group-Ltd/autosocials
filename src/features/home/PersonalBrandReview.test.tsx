vi.mock("@/features/create/PipelineAssets", () => ({ usePipelineAssetCounts: () => ({ counts: { ready: 2, scheduled: 0, published: 0 }, isLoading: false, isError: false }) }));
vi.mock("@/features/create/PipelinePlans", () => ({ usePipelinePlanCounts: () => ({ production: 0 }) }));
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ saved: true, goals: { knownFor: "", audience: "", goal: "", brief: "", ...data } })),
  format: vi.fn(async ({ data }: { data: { brief: string } }) => ({ brief: `## Audience and voice\n\n${data.brief}` })),
  report: vi.fn(async (): Promise<unknown> => null), retry: vi.fn(async () => ({ busy: true })), coverage: vi.fn(async (): Promise<{ accounts: { id: string; platform: string; handle: string | null; status: string; count: number }[] }> => ({ accounts: [] })),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/lib/personal-brand.functions", () => ({
  getPersonalBrandReport: mocks.report,
  getPersonalBrandReviewStatus: async () => ({ status: "not_started", updatedAt: null, generatedAt: null, canEdit: true }),
  refreshStalePersonalBrandReview: async () => ({ queued: false }), generatePersonalBrandReport: vi.fn(), retryPersonalBrandProfile: mocks.retry,
  getPersonalBrandGoals: async () => ({ knownFor: "", audience: "", goal: "", brief: "", canEdit: true }), savePersonalBrandGoals: mocks.save, formatPersonalGoalsBrief: mocks.format,
}));
vi.mock("@/lib/personal-brand-corrections.functions", () => ({ getPersonalBrandCorrections: async () => ({ text: "", canEdit: false }), savePersonalBrandCorrections: vi.fn() }));
vi.mock("@/lib/profile-dna.functions", () => ({ getProfileDna: async () => ({ status: "complete", dna: {
  name: "Example", positioning: "Explain practical commissioning decisions", profileRead: true, postCount: 3,
  interpretation: { knownFor: "Useful procurement checks", audience: "Agency owners", goal: "Help teams choose suppliers" },
} }) }));
vi.mock("@/lib/personal-connected-feeds.functions", () => ({ getConnectedPersonalFeedCoverage: mocks.coverage, collectConnectedPersonalFeeds: async () => ({}) }));
vi.mock("@/lib/personal-content-ideas.functions", () => ({ getPersonalContentIdeas: async () => ({ ideas: [{ title: "A useful idea", angle: "Explain a useful idea." }], needsContext: false }), getPersonalIdeaTrash: async () => ({ ideas: [], canEdit: true }), setPersonalIdeaTrash: async () => ({ saved: true }) }));
vi.mock("@/lib/personal-idea-batch.functions", () => ({ savePersonalIdeaBatch: vi.fn() }));
vi.mock("@/lib/written-posts.functions", () => ({ generateWrittenPosts: vi.fn() }));
vi.mock("@/lib/social-tiles.functions", () => ({ planSocialTiles: vi.fn() }));
vi.mock("@/lib/winners.functions", () => ({ getWinners: async () => ({ findings: [] }) }));
vi.mock("@/integrations/supabase/client", () => { const chain = { select: () => chain, eq: () => chain, then: (resolve: (value: unknown) => void) => resolve({ count: 0, error: null }) }; return { supabase: { from: () => chain } }; });
vi.mock("./HomeContent", () => ({ HomeContent: () => <div>Created content</div> }));
import { PersonalBrandReview } from "./PersonalBrandReview";

it("allows personal goals to be saved when no review or social evidence exists", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonalBrandReview workspaceId="test-workspace" channels={[]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "More" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText(/No personal review has been generated yet/)).toBeInTheDocument();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Goals" }), { button: 0, ctrlKey: false });
  expect(screen.queryByLabelText("What do you want to be known for?")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Complete Interview/ }));
  const knownFor = await screen.findByLabelText("What do you want to be known for?");
  fireEvent.change(knownFor, { target: { value: "Helping founders grow" } });
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByLabelText("Who do you want to reach?")).toBeInTheDocument();
  expect(screen.queryByLabelText("What do you want to be known for?")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  fireEvent.click(screen.getByRole("button", { name: "Save answers" }));
  await waitFor(() => expect(mocks.save).toHaveBeenCalledWith({ data: { workspace_id: "test-workspace", knownFor: "Helping founders grow", audience: "", goal: "" } }));
});

it.each(["paste", "upload"])("organizes and saves a %s brief without taking the interview", async (method) => {
  render(<QueryClientProvider client={new QueryClient()}><PersonalBrandReview workspaceId={`brief-${method}`} channels={[]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Goals" }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole("button", { name: /Drop your prompt/ }));
  const input = await screen.findByLabelText("Paste your prompt");
  const brief = "Write in **conversational British English**.\n\n- Help business owners solve a useful problem.";
  if (method === "paste") {
    fireEvent.change(input, { target: { value: brief } });
    fireEvent.click(screen.getByRole("button", { name: "Organize and preview" }));
  } else {
    const file = new File([brief], "goals.md", { type: "text/markdown" });
    Object.defineProperty(file, "text", { value: async () => brief });
    fireEvent.change(screen.getByLabelText("Upload Markdown file"), { target: { files: [file] } });
  }
  expect(await screen.findByRole("heading", { name: "Audience and voice" })).toBeInTheDocument();
  expect(screen.getByText("conversational British English", { selector: "strong" })).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspace_id: `brief-${method}` }) }));
  fireEvent.click(screen.getByRole("button", { name: "Save brief" }));
  expect(await screen.findByText("Brief saved.")).toBeInTheDocument();
  expect(mocks.save).toHaveBeenCalledWith({ data: { workspace_id: `brief-${method}`, brief: `## Audience and voice\n\n${brief}` } });
});

it("shows the Profile DNA interpretation by default without saving it as the user's goals", async () => {
  render(<QueryClientProvider client={new QueryClient()}><PersonalBrandReview workspaceId="inferred-goals" profileUrl="https://www.linkedin.com/in/example/" channels={[]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Goals" }), { button: 0, ctrlKey: false });
  expect(screen.getByRole("button", { name: /Our Interpretation/ })).toHaveAttribute("aria-pressed", "true");
  const panel = await screen.findByRole("region", { name: "Personal goals interpretation" });
  expect(within(panel).getByText("Useful procurement checks")).toBeInTheDocument();
  expect(within(panel).getByText(/3 authored LinkedIn posts/)).toBeInTheDocument();
  expect(mocks.save).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ workspace_id: "inferred-goals" }) }));
});

it("shows an unavailable post feed even when the profile description was reviewed", async () => {
  mocks.report.mockResolvedValueOnce({ generatedAt: "2026-11-14T12:00:00Z", evidence: [{ id: "profile-1", platform: "linkedin", url: "https://www.linkedin.com/in/example/", date: null, caption: "Profile", attribution: "self_description", basis: ["profile"] }], impression: [], themes: [], strengths: [], mixedSignals: [], opportunities: [], channels: [] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonalBrandReview workspaceId="coverage-test" channels={[{ platform: "linkedin", handle: "example", status: "unavailable", posts: [] }]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "More" }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByText("Saved public profiles", { selector: "summary" }));
  expect(await screen.findByText(/No recent content available · 0 posts used across this platform · profile description reviewed/)).toBeInTheDocument();
});


it("preserves unsaved input while switching sections", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonalBrandReview workspaceId="tabs-test" channels={[]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Goals" }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByRole("button", { name: /Complete Interview/ }));
  const field = await screen.findByLabelText("What do you want to be known for?");
  fireEvent.change(field, { target: { value: "My draft goal" } });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "More" }), { button: 0, ctrlKey: false });
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Goals" }), { button: 0, ctrlKey: false });
  expect(screen.getByLabelText("What do you want to be known for?")).toHaveValue("My draft goal");
});

it("presents concise insight cards with expandable findings and evidence", async () => {
  mocks.report.mockResolvedValueOnce({ generatedAt: "2026-11-14T12:00:00Z", evidence: [{ id: "p1", platform: "linkedin", url: "https://www.linkedin.com/in/example/", date: null, caption: "Profile", attribution: "self_description", basis: ["profile"] }], impression: [{ text: "A clear professional voice", evidenceIds: ["p1"] }, { text: "A second insight", evidenceIds: ["p1"] }], themes: [], strengths: [], mixedSignals: [], opportunities: [], channels: [] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonalBrandReview workspaceId="cards-test" channels={[]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "More" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText("2 insights")).toBeInTheDocument();
  expect(within(screen.getByLabelText("Evidence sources")).getByLabelText("linkedin")).toBeInTheDocument();
  expect(within(screen.getByLabelText("Evidence sources")).queryByLabelText("x")).not.toBeInTheDocument();
  const details = screen.getByText("Explore insights").closest("details")!;
  expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Explore insights"));
  expect(details).toHaveAttribute("open");
  expect(within(details).getByText("A second insight")).toBeInTheDocument();
  expect(within(details).getAllByRole("link", { name: /linkedin profile/ })).toHaveLength(2);
});

it("distinguishes public profile failures from connected posts and does not treat empty profiles as failures", async () => {
  mocks.report.mockResolvedValueOnce({ generatedAt: "2026-11-14T12:00:00Z", evidence: [{ id: "p1", platform: "x", url: "https://x.com/i/status/1", date: "2026-11-01", caption: "Post", attribution: "authored", basis: ["caption"] }], impression: [], themes: [], strengths: [], mixedSignals: [], opportunities: [], channels: [] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonalBrandReview workspaceId="source-test" channels={[{ platform: "x", handle: "example", url: "https://x.com/example", status: "unavailable", posts: [] }, { platform: "tiktok", handle: "example", url: "https://www.tiktok.com/@example", status: "empty", posts: [] }]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "More" }), { button: 0, ctrlKey: false });
  fireEvent.click(screen.getByText("Saved public profiles", { selector: "summary" }));
  expect(await screen.findByText(/No recent content available · 1 post used across this platform/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry x" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Retry tiktok" })).not.toBeInTheDocument();
});

it("shows connected accounts even when Sam has no channel findings", async () => {
  mocks.coverage.mockResolvedValue({ accounts: [{ id: "tiktok-1", platform: "tiktok", handle: "example", status: "empty", count: 0 }, { id: "linkedin-1", platform: "linkedin", handle: null, status: "unsupported", count: 0 }] });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonalBrandReview workspaceId="channel-test" channels={[{ platform: "instagram", handle: "example", status: "empty", posts: [] }]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  expect(screen.getAllByRole("tab").map(tab => tab.textContent)).toEqual(["Content", "Schedule", "Ideas", "Goals", "Channels", "More"]);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Channels" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText(/Connected · No recent posts returned/)).toBeInTheDocument();
  expect(screen.getByText(/Connected · Connected feed collection not supported/)).toBeInTheDocument();
  expect(screen.getByText("Saved public profile · no connected account")).toBeInTheDocument();
  expect(screen.getAllByText(/No channel insights yet/)).toHaveLength(3);
  mocks.coverage.mockResolvedValue({ accounts: [] });
});

it("keeps content ideas available without a review and separates performance opportunities", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><PersonalBrandReview workspaceId="ideas-test" channels={[]} onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Ideas" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText("A useful idea")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("checkbox", { name: "Select A useful idea" }));
  fireEvent.click(screen.getByRole("button", { name: "Choose formats (1)" }));
  expect(screen.getByLabelText("Format for A useful idea")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create content" })).toBeDisabled();
  fireEvent.mouseDown(screen.getByRole("tab", { name: "More" }), { button: 0, ctrlKey: false });
  expect(await screen.findByText(/No measured performance opportunities yet/)).toBeInTheDocument();
});


it("opens Content by default when created content exists", () => {
  render(<QueryClientProvider client={new QueryClient()}><PersonalBrandReview workspaceId="with-content" channels={[]} hasContent onDiscoveryUpdated={() => {}} /></QueryClientProvider>);
  expect(screen.getByRole("tab", { name: "Content" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("link", { name: /^Ready/ })).toHaveAttribute("href", "/app/create?stage=ready");
});
