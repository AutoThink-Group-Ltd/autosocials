import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { contentTrashKey, listContentTrash, setContentTrashed } from "@/lib/content-trash";
import { listPipelineTrash, pipelineTrashKey, setPipelineTrashed } from "@/lib/pipeline-trash";
import { useCarouselTrash } from "./use-carousel-trash";

vi.mock("@/lib/content-trash", () => ({
  contentTrashKey: (workspace: string, kind: string) => ["content-trash", workspace, kind],
  listContentTrash: vi.fn(),
  setContentTrashed: vi.fn(),
}));
vi.mock("@/lib/pipeline-trash", () => ({
  pipelineTrashKey: (workspace: string) => ["pipeline-trash", workspace],
  listPipelineTrash: vi.fn(),
  setPipelineTrashed: vi.fn(),
}));

it("keeps a restored carousel visible in Plans while its export is still binned", async () => {
  vi.mocked(listPipelineTrash).mockResolvedValue([]);
  vi.mocked(listContentTrash).mockResolvedValue(["deck"]);
  const workspace = "workspace";
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender, unmount } = renderHook(({ assetView }) => useCarouselTrash(workspace, assetView), { wrapper, initialProps: { assetView: false } });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.includes("deck")).toBe(false);
  await act(() => result.current.moveToBin("deck"));
  expect(setPipelineTrashed).toHaveBeenCalledWith(workspace, "carousel:deck", true);
  expect(invalidate).toHaveBeenLastCalledWith({ queryKey: pipelineTrashKey(workspace) });
  expect(setContentTrashed).not.toHaveBeenCalled();

  rerender({ assetView: true });
  await waitFor(() => expect(result.current.includes("deck")).toBe(true));
  await act(() => result.current.moveToBin("deck"));
  expect(setContentTrashed).toHaveBeenCalledWith(workspace, "carousel", "deck", true);
  expect(invalidate).toHaveBeenLastCalledWith({ queryKey: contentTrashKey(workspace, "carousel") });
  unmount();
});
