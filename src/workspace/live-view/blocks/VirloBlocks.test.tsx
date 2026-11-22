import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VirloActionBlock } from "./VirloActionBlock";
import { VirloResearchBlock } from "./VirloResearchBlock";

const mocks = vi.hoisted(() => ({ run: vi.fn(), get: vi.fn(), tracking: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/virlo.functions", () => ({ runVirloOperation: mocks.run, getVirloResearchResult: mocks.get, getVirloTrackingResource: mocks.tracking }));
vi.mock("@/features/virlo/VirloResearchPage", () => ({ ResultCards: ({ result }: { result: { title: string } }) => <div>Cards: {result.title}</div> }));
const workspaceId = "11111111-1111-4111-8111-111111111111";
const requestId = "22222222-2222-4222-8222-222222222222";
function withClient(node: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>{node}</QueryClientProvider>); }
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.clearAllMocks(); });
describe("Virlo Live View", () => {
  it("loads the selected saved result in the current workspace", async () => {
    mocks.get.mockResolvedValue({ id: requestId, title: "videos", kind: "videos", data: { videos: [] } });
    withClient(<VirloResearchBlock workspaceId={workspaceId} b={{ type: "virlo_research", title: "Creators for skincare", result_id: requestId }} />);
    expect(await screen.findByText("Cards: Creators for skincare")).toBeInTheDocument();
    expect(mocks.get).toHaveBeenCalledWith({ data: { workspace_id: workspaceId, result_id: requestId } });
  });
  it("requires confirmation for irreversible removal and identifies the item", async () => {
    mocks.tracking.mockResolvedValue({ label: "Skincare agent", status: "active", cadence: "weekly" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    withClient(<VirloActionBlock workspaceId={workspaceId} b={{ type: "virlo_action", title: "Delete research", request_id: requestId, operation: { operation: "research_delete", id: requestId } }} />);
    expect(await screen.findByText(/Skincare agent/)).toHaveTextContent("cannot be undone");
    fireEvent.click(screen.getByRole("button", { name: "Confirm removal" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("discloses recurring research cost before confirmation", () => {
    const operation = { operation: "research_start" as const, intent: "skincare", keywords: ["skincare"], platforms: ["tiktok" as const], recurring: true, cadence: "weekly" as const, intelligence: true, ads: false };
    withClient(<VirloActionBlock workspaceId={workspaceId} b={{ type: "virlo_action", title: "Start research", request_id: requestId, operation }} />);
    expect(screen.getByText(/US\$1.50 per run/)).toBeInTheDocument();
    expect(mocks.run).not.toHaveBeenCalled();
  });
  it("requires a user confirmation before starting a recurring operation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    mocks.run.mockResolvedValue({ id: requestId, data: { videos: [] } });
    const operation = { operation: "track_creator" as const, handle: "creator", platform: "tiktok" as const, cadence: "weekly" as const };
    withClient(<VirloActionBlock workspaceId={workspaceId} b={{ type: "virlo_action", title: "Track creator", request_id: requestId, operation }} />);
    expect(screen.getByText(/US\$0.25 per check/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Confirm research" }));
    expect(mocks.run).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Confirm research" }));
    await waitFor(() => expect(mocks.run).toHaveBeenCalledWith({ data: { workspace_id: workspaceId, request_id: requestId, operation, confirmed: true } }));
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
