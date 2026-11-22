import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StageView } from "@/workspace/live-view/StageView";

const rows = vi.hoisted(() => ({ value: [] as { id: string; title: string }[] }));

class Chain {
  select() { return this; }
  eq() { return this; }
  order() { return this; }
  limit() { return this; }
  then<T>(onFulfilled: (v: { data: unknown[] }) => T) {
    return Promise.resolve({ data: rows.value }).then(onFulfilled);
  }
}

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => new Chain() } }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ currentWorkspace: { id: "ws-1" } }) }));
vi.mock("@/workspace/WorkspaceUi", () => { const ui = () => ({ activeCanvas: null, setActiveCanvas: vi.fn() }); return { useWorkspaceUi: ui, useWorkspaceUiOptional: ui }; });

afterEach(() => {
  cleanup();
  rows.value = [];
  window.localStorage.clear();
});

function show() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <StageView module="create"><p>create surface</p></StageView>
    </QueryClientProvider>,
  );
}

describe("stage surface tab", () => {
  it("stays hidden while the stage has nothing saved to switch to", async () => {
    show();
    await waitFor(() => expect(screen.getByText("create surface")).toBeInTheDocument());
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Current batch")).toBeNull();
  });

  it("appears once there is a saved canvas to switch back from", async () => {
    rows.value = [{ id: "c-1", title: "Launch week" }];
    show();
    await waitFor(() => expect(screen.getByRole("tablist")).toBeInTheDocument());
    expect(screen.getByRole("tab", { name: "Current batch" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Launch week" })).toBeInTheDocument();
  });
});
