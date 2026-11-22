import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DeletedItemsPage from "./DeletedItemsPage";
import { listPipelineTrash, setPipelineTrashed } from "@/lib/pipeline-trash";
import { listContentTrash, setContentTrashed } from "@/lib/content-trash";

const workspace = "workspace";
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({ currentWorkspace: { id: "workspace" } }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/features/create/PipelinePlans", () => ({
  usePipeline: () => ({
    data: {
      entries: [
        { id: "carousel:deck", title: "My deck", subtitle: "Saved plan" },
        { id: "narrative:older:idea", title: "My deck", subtitle: "Narrative" },
      ],
    },
  }),
}));
vi.mock("@/features/create/PipelineAssets", () => ({
  usePipelineAssetLibrary: () => ({
    assets: {},
    carousels: {},
    rows: [{ id: "deck", type: "carousel", title: "Exported deck" }],
  }),
}));
vi.mock("@/features/home/DeletedIdeas", () => ({
  useDeletedIdeas: () => ({ items: [], query: {} }),
  useDeletedHomeWork: () => ({ items: [], query: {} }),
}));
vi.mock("@/features/create/DeletedNarratives", () => ({
  useDeletedNarratives: () => ({ items: [], query: {} }),
}));
vi.mock("@/lib/pipeline-trash", () => ({
  pipelineTrashKey: (ws: string) => ["pipeline-trash", ws],
  listPipelineTrash: vi.fn(),
  setPipelineTrashed: vi.fn(),
}));
vi.mock("@/lib/content-trash", () => ({
  contentTrashKey: (ws: string, kind: string) => ["content-trash", ws, kind],
  listContentTrash: vi.fn(),
  setContentTrashed: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

it("restores an existing plan independently of its exported carousel, including after a failed restore", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.mocked(listPipelineTrash)
    .mockResolvedValueOnce(["carousel:deck"])
    .mockResolvedValue([]);
  vi.mocked(listContentTrash).mockImplementation(async (_, kind) =>
    kind === "carousel" ? ["deck"] : [],
  );
  vi.mocked(setPipelineTrashed)
    .mockRejectedValueOnce(new Error("denied"))
    .mockResolvedValueOnce(undefined);
  render(
    <QueryClientProvider client={client}>
      <DeletedItemsPage />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "Restore My deck" });
  fireEvent.click(screen.getByRole("button", { name: "Assets", exact: true }));
  expect(screen.queryByRole("button", { name: "Restore My deck" })).toBeNull();
  expect(
    screen.getByRole("button", { name: "Restore Exported deck" }),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "missing item" },
  });
  expect(
    screen.getByText("No deleted items match your search."),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "my DECK" },
  });
  expect(
    screen.queryByRole("button", { name: "Restore Exported deck" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Plans", exact: true }));
  fireEvent.click(
    await screen.findByRole("button", { name: "Restore My deck" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t restore",
  );
  fireEvent.click(screen.getByRole("button", { name: "Restore My deck" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Restore My deck" }),
    ).toBeNull(),
  );
  expect(setPipelineTrashed).toHaveBeenLastCalledWith(
    workspace,
    "carousel:deck",
    false,
  );
  expect(setContentTrashed).not.toHaveBeenCalled();
  vi.mocked(listContentTrash).mockResolvedValue([]);
  fireEvent.click(screen.getByRole("button", { name: "Assets", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "Restore Exported deck" }),
  );
  expect(await screen.findByText("No deleted items.")).toBeInTheDocument();
  expect(setContentTrashed).toHaveBeenCalledWith(
    workspace,
    "carousel",
    "deck",
    false,
  );
});

it("keeps a narrative and a same-named saved plan in their own sections", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  vi.mocked(listPipelineTrash).mockResolvedValue([
    "carousel:deck",
    "narrative:older:idea",
  ]);
  vi.mocked(listContentTrash).mockResolvedValue([]);
  render(
    <QueryClientProvider client={client}>
      <DeletedItemsPage />
    </QueryClientProvider>,
  );
  await screen.findByRole("button", { name: "Restore My deck" });
  expect(
    screen.queryByRole("region", { name: "Ideas & narratives" }),
  ).toBeNull();
  expect(
    within(screen.getByRole("region", { name: "Plans" })).getByRole("button", {
      name: "Restore My deck",
    }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Ideas & narratives" }));
  expect(
    within(
      screen.getByRole("region", { name: "Ideas & narratives" }),
    ).getByText("Narrative"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Plans" })).toBeNull();
  expect(screen.queryByRole("region", { name: "Assets" })).toBeNull();
});

it("keeps a long category on one page at a time and searches beyond the first page", async () => {
  vi.mocked(listPipelineTrash).mockResolvedValue(
    Array.from({ length: 9 }, (_, i) => `canvas:deleted-${i}`),
  );
  vi.mocked(listContentTrash).mockResolvedValue([]);
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <DeletedItemsPage />
    </QueryClientProvider>,
  );
  await screen.findByText("1–6 of 9");
  expect(screen.getAllByRole("button", { name: /^Restore / })).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  expect(screen.getByText("7–9 of 9")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Assets", exact: true }));
  fireEvent.change(screen.getByRole("searchbox"), {
    target: { value: "leted-8" },
  });
  expect(
    within(screen.getByRole("region", { name: "Search results" })).getAllByRole(
      "button",
      { name: /^Restore / },
    ),
  ).toHaveLength(1);
});
