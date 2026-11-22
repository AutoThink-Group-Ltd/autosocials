import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StopSamButton } from "./StopSamButton";

const mocks = vi.hoisted(() => ({ cancel: vi.fn(), error: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/creative.functions", () => ({ stopSamIdeation: mocks.cancel }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

function mount(background: boolean, stopChat?: () => void | Promise<void>) {
  const client = new QueryClient();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  render(<QueryClientProvider client={client}><StopSamButton workspaceId="workspace-a" background={background} stopChat={stopChat} /></QueryClientProvider>);
  return { invalidate };
}
beforeEach(() => { vi.clearAllMocks(); mocks.cancel.mockResolvedValue({ stopped: true }); });
afterEach(cleanup);

describe("Stop Sam", () => {
  it("stops chat and background work, emits scoped events and refreshes progress", async () => {
    const stopChat = vi.fn();
    const stopped = vi.fn();
    const activity = vi.fn();
    window.addEventListener("as:sam-ideation-stopped", stopped);
    window.addEventListener("as:sam-ideation", activity);
    try {
      const { invalidate } = mount(true, stopChat);
      fireEvent.click(screen.getByRole("button", { name: "Stop Sam" }));
      await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(4));
      expect(stopChat).toHaveBeenCalledTimes(1);
      expect(mocks.cancel).toHaveBeenCalledExactlyOnceWith({ data: { workspace_id: "workspace-a" } });
      expect(stopChat.mock.invocationCallOrder[0]).toBeLessThan(mocks.cancel.mock.invocationCallOrder[0]!);
      expect((stopped.mock.calls[0]![0] as CustomEvent).detail).toEqual({ workspaceId: "workspace-a" });
      expect((activity.mock.calls[0]![0] as CustomEvent).detail).toEqual({ workspaceId: "workspace-a", active: false });
      for (const key of ["sam-messages", "create-ideation", "narrative-library", "batches"]) expect(invalidate).toHaveBeenCalledWith({ queryKey: [key, "workspace-a"] });
    } finally {
      window.removeEventListener("as:sam-ideation-stopped", stopped);
      window.removeEventListener("as:sam-ideation", activity);
    }
  });

  it("stops a chat-only response without cancelling unrelated background work", async () => {
    const stopChat = vi.fn();
    const { invalidate } = mount(false, stopChat);
    fireEvent.click(screen.getByRole("button", { name: "Stop Sam" }));
    await waitFor(() => expect(stopChat).toHaveBeenCalledTimes(1));
    expect(mocks.cancel).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("keeps a failed cancellation visible without claiming that background work stopped", async () => {
    mocks.cancel.mockRejectedValue(new Error("Could not cancel this job"));
    const stopped = vi.fn();
    window.addEventListener("as:sam-ideation-stopped", stopped);
    try {
      const { invalidate } = mount(true, vi.fn());
      fireEvent.click(screen.getByRole("button", { name: "Stop Sam" }));
      await waitFor(() => expect(mocks.error).toHaveBeenCalledWith("Could not cancel this job"));
      expect(stopped).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: "Stop Sam" })).toBeEnabled();
    } finally { window.removeEventListener("as:sam-ideation-stopped", stopped); }
  });

  it("disables repeated stop requests while background cancellation is pending", async () => {
    let finish!: () => void;
    mocks.cancel.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    mount(true);
    fireEvent.click(screen.getByRole("button", { name: "Stop Sam" }));
    await waitFor(() => expect(mocks.cancel).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Stopping…" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Stopping…" }));
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
    finish();
    await waitFor(() => expect(screen.getByRole("button", { name: "Stop Sam" })).toBeEnabled());
  });
});
