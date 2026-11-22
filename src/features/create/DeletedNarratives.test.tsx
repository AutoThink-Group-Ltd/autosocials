import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { useDeletedNarratives } from "./DeletedNarratives";

const { update, query } = vi.hoisted(() => ({
  update: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => update }));
vi.mock("@/lib/creative.functions", () => ({
  setNarrativeLibraryStatus: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: () => ({ eq: query }) }) },
}));

it("restores a cleared narrative from the selected workspace", async () => {
  query.mockImplementation((column: string, workspace: string) => {
    expect([column, workspace]).toEqual(["workspace_id", "workspace-a"]);
    return {
      order: () => ({
        range: async () => ({
          data: [
            {
              id: "batch-a",
              goal: "",
              created_at: "2026-01-01",
              narratives: [
                {
                  id: "idea-a",
                  title: "Cleared idea",
                  libraryStatus: "binned",
                },
                {
                  id: "idea-b",
                  title: "Rejected idea",
                  libraryStatus: "rejected",
                },
              ],
            },
          ],
          error: null,
        }),
      }),
    };
  });
  update.mockResolvedValue({ ok: true });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const { result } = renderHook(() => useDeletedNarratives("workspace-a"), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() =>
    expect(result.current.items.map((item) => item.title)).toEqual([
      "Cleared idea",
    ]),
  );
  await act(() => result.current.items[0]!.restore());
  expect(update).toHaveBeenCalledWith({
    data: { batch_id: "batch-a", narrative_id: "idea-a", status: "available" },
  });
});
