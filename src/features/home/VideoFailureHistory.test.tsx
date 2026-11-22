import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VideoFailureHistory } from "./VideoFailureHistory";

const mocks = vi.hoisted(() => ({ getHistory: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => mocks.getHistory }));
vi.mock("@/lib/video-failure-history.functions", () => ({ getVideoFailureHistory: vi.fn() }));

describe("VideoFailureHistory", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("loads the workspace history on request and exposes provider diagnostics", async () => {
    mocks.getHistory.mockResolvedValue([{ id: "event", job_id: "job-1", stage: "planning", style: "branded-motion", cause: "Planning was interrupted.", provider: "autotoast", model: "hyperframes", provider_job_id: null, provider_request_id: null, error_code: null, retry_of_event_id: "previous-event", occurred_at: "2026-11-09T11:30:00Z" }]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(<QueryClientProvider client={client}><VideoFailureHistory workspaceId="workspace-1" /></QueryClientProvider>);
    expect(mocks.getHistory).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Video failure history" }));
    expect(await screen.findByText("Planning was interrupted.")).toBeInTheDocument();
    expect(screen.getByText("Planning · Branded motion")).toBeInTheDocument();
    expect(mocks.getHistory).toHaveBeenCalledWith({ data: { workspace_id: "workspace-1" } });
    fireEvent.click(screen.getByText("Details for support"));
    expect(screen.getByText("hyperframes")).toBeInTheDocument();
    expect(screen.getByText("previous-event")).toBeInTheDocument();
  });
});
