import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { PipelineAssets, usePipelineAssetCounts } from "./PipelineAssets";

vi.mock("@tanstack/react-start", async (importOriginal) => ({ ...(await importOriginal<typeof import("@tanstack/react-start")>()), useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/content-trash", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/content-trash")>()),
  setContentTrashed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/features/schedule/useAssetPublishingStatus", () => ({
  useAssetPublishingStatus: () => ({ data: {}, isPending: false, isError: false }),
}));
vi.mock("@/features/schedule/ScheduleDialogHost", () => ({ useScheduleDialog: () => ({ scheduleSelection: vi.fn() }) }));
vi.mock("@/components/publishing/ComposerDrawer", () => ({ ComposerDrawer: () => null }));

function View() {
  const { counts } = usePipelineAssetCounts("workspace");
  return <><output aria-label="Ready count">{counts.ready}</output><PipelineAssets workspaceId="workspace" stage="ready" onItem={() => {}} /></>;
}

it("hides previously deleted assets and updates the grid and count after a confirmed deletion", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } });
  client.setQueryData(["pipeline-assets", "workspace"], [
    { type: "tile", id: "deleted-tile", title: "Big AI marketing missions start with discovery" },
    { type: "written", id: "deleted-post", title: "A VC’s checklist" },
    { type: "tile", id: "remaining", title: "Remaining asset" },
  ]);
  client.setQueryData(["linkedin-carousels", "workspace"], []);
  for (const [kind, ids] of Object.entries({ tile: ["deleted-tile"], written: ["deleted-post"], video: [], carousel: [] }))
    client.setQueryData(["content-trash", "workspace", kind], ids);
  render(<QueryClientProvider client={client}><View /></QueryClientProvider>);
  expect(screen.queryByText("Big AI marketing missions start with discovery")).not.toBeInTheDocument();
  expect(screen.queryByText("A VC’s checklist")).not.toBeInTheDocument();
  expect(screen.getByText("Remaining asset")).toBeInTheDocument();
  expect(screen.getByLabelText("Ready count")).toHaveTextContent("1");
  fireEvent.click(screen.getByRole("button", { name: "Delete asset Remaining asset" }));
  fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete asset" }));
  await waitFor(() => expect(screen.queryByText("Remaining asset")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Ready count")).toHaveTextContent("0");
});
