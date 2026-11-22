import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { PipelinePlans, usePipelinePlanCounts } from "./PipelinePlans";
import {
  listPipelineTrash,
  pipelineTrashKey,
  setPipelineTrashed,
  setTilePlanReturned,
} from "@/lib/pipeline-trash";
import { pipelineEntries, type PipelineCanvas, type PipelineEntry } from "./pipeline-plans";
import { findSocialTilePlan } from "@/workspace/live-view/social-tile-plan";
import type { Block } from "@/lib/sam.blocks";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/pipeline-records.functions", () => ({
  getPipelineRecords: vi.fn(),
}));
vi.mock("@/lib/linkedin-carousel.functions", () => ({
  listLinkedInCarousels: vi.fn(),
}));
vi.mock("@/lib/personal-idea-batch.functions", () => ({
  savePersonalIdeaBatch: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/workspace/WorkspaceUi", () => ({
  useWorkspaceUiOptional: () => null,
}));
vi.mock("@/workspace/live-view/BlockRenderer", () => ({
  BlockRenderer: ({ blocks }: { blocks: Block[] }) => (
    <ol aria-label="Tile previews">
      {findSocialTilePlan(blocks)?.plan.tiles.map(tile => <li key={tile.headline}>{tile.headline}<p>{tile.supporting}</p></li>)}
    </ol>
  ),
}));
vi.mock("./LinkedInCarousels", () => ({ LinkedInCarousels: () => null }));
vi.mock("@/features/sam/CampaignCard", () => ({ CampaignCard: () => null }));
vi.mock("./CreatePage", () => ({
  CreatePage: ({ search }: { search: { ideaBatch?: string } }) => (
    <p>Reviewing batch {search.ideaBatch}</p>
  ),
}));

vi.mock("@/lib/pipeline-trash", async (original) => ({
  ...(await original<typeof import("@/lib/pipeline-trash")>()),
  listPipelineTrash: vi.fn(),
  setPipelineTrashed: vi.fn(),
  setTilePlanReturned: vi.fn(),
  listReturnedTilePlans: vi.fn(),
}));

afterEach(cleanup);
const ws = "workspace";
const plan: PipelineEntry = {
  id: "campaign:calendar",
  sourceId: "calendar",
  title: "LinkedIn calendar",
  updated: "",
  stage: "plans",
  kind: "campaign",
  subtitle: "Content campaign",
  formats: ["tiles"],
  usage: { planned: 12, created: 12, scheduled: 11, published: 1 },
};
const production: PipelineEntry = {
  id: "personal:batch",
  sourceId: "batch",
  title: "Agency software",
  updated: "",
  stage: "production",
  kind: "personal",
  subtitle: "2/3 ready",
  formats: ["video", "written"],
};

function open(
  stage: "plans" | "production",
  trash: string[] = [],
  extra: PipelineEntry[] = [],
  canvases: PipelineCanvas[] = [],
) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  });
  client.setQueryData(["pipeline-plans", ws], {
    entries: [plan, production, ...extra],
    canvases,
    batches: [],
  });
  client.setQueryData(pipelineTrashKey(ws), trash);
  function Page() {
    const [item, setItem] = useState<string>();
    const counts = usePipelinePlanCounts(ws);
    return (
      <>
        <output aria-label="Plan count">{counts.plans}</output>
        <PipelinePlans
          workspaceId={ws}
          workspaceName="Agency"
          stage={stage}
          item={item}
          onItem={setItem}
          onNavigate={vi.fn()}
        />
      </>
    );
  }
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

it("shows calendar creation and delivery counts on its plan", () => {
  open("plans");
  const card = within(screen.getByRole("article"));
  expect(card.getByText("Social tiles")).toBeInTheDocument();
  expect(card.getByText("12/12 created")).toBeInTheDocument();
  expect(card.getByText("11 scheduled")).toBeInTheDocument();
  expect(card.getByText("1/12 published")).toBeInTheDocument();
  expect(card.getByLabelText("Creation complete")).toBeInTheDocument();
});

it("opens the saved production review in one click", () => {
  open("production");
  fireEvent.click(
    screen.getByRole("button", { name: /Agency software.*2\/3 ready/ }),
  );
  expect(screen.getByText("Reviewing batch batch")).toBeInTheDocument();
});

it("excludes trashed plans from counts and keeps recovery out of the plans list", () => {
  open("plans", [plan.id]);
  expect(screen.getByLabelText("Plan count")).toHaveTextContent("0");
  expect(screen.queryByText(plan.title)).toBeNull();
  expect(screen.queryByRole("button", { name: /Trash/ })).not.toBeInTheDocument();
});

it("confirms bulk trash, retains failed selections for retry and skips hidden and production rows", async () => {
  const canvas: PipelineEntry = {
    ...plan,
    kind: "canvas",
    id: "canvas:idea",
    title: "Draft idea",
  };
  const hidden = { ...plan, id: "canvas:duplicate", hidden: true };
  open("plans", [], [canvas, hidden]);
  const marks: string[] = [];
  let fail = true;
  vi.mocked(listPipelineTrash).mockImplementation(async () => [...marks]);
  vi.mocked(setPipelineTrashed).mockImplementation(async (_, id) => {
    if (id === canvas.id && fail) throw new Error("Upload failed");
    marks.push(id);
  });
  fireEvent.click(screen.getByLabelText("Select all plans"));
  fireEvent.click(
    screen.getByRole("button", { name: "Move 2 selected plans to Trash" }),
  );
  fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Cancel"));
  expect(setPipelineTrashed).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole("button", { name: "Move 2 selected plans to Trash" }),
  );
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByText("Delete plan"),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Couldn’t move 1 selected plan",
  );
  expect(screen.getByLabelText("Plan count")).toHaveTextContent("1");
  fail = false;
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByText("Delete plan"),
  );
  await waitFor(() =>
    expect(screen.getByLabelText("Plan count")).toHaveTextContent("0"),
  );
  expect(marks).toEqual([plan.id, canvas.id]);
  expect(setPipelineTrashed).toHaveBeenCalledTimes(3);
});

it("opens all ten saved tile previews on the Plans route without an item selected", () => {
  const items = Array.from({length: 10}, (_, index) => ({
    angle: "Website conversion",
    hook: `AutoTill tile ${index + 1}`,
    format: "Social tile",
    notes: `Support copy: Approved supporting line ${index + 1}\nCTA: See AutoTill in action`,
  }));
  const canvas: PipelineCanvas = {
    id: "saved-tiles",
    version: 1,
    updated_at: "",
    title: "AutoTill social tile concepts",
    blocks: [{ type: "variants", title: "AutoTill social tiles", items }],
  };
  const oldBatch = {
    id: "old-batch",
    title: "Saved narratives",
    goal: "sam-thread:sam",
    stage: "narratives",
    narratives: items.map(({ hook, format }, index) => ({ id: String(index), title: hook, format })),
    created_at: "",
    updated_at: "",
  };
  const entries = pipelineEntries([canvas], [oldBatch], [], [{ canvas_id: canvas.id, thread_id: "sam" }]);
  open("plans", [plan.id], entries, [canvas]);
  const previews = within(screen.getByRole("list", { name: "Tile previews" }));
  expect(previews.getAllByRole("listitem")).toHaveLength(10);
  expect(previews.getByText("AutoTill tile 10")).toBeInTheDocument();
  expect(previews.getByText(/Approved supporting line 10 See AutoTill in action/)).toBeInTheDocument();
  expect(screen.getByLabelText("Plan count")).toHaveTextContent("1");
});

it("returns a tile production to Plans without deleting it", async () => {
  const canvas: PipelineCanvas = { id: "tile-canvas", version: 1, updated_at: "", title: "Tile plan", blocks: [{ type: "variants", title: "Social tiles", items: [{ hook: "Tile idea", angle: "Angle", format: "Social tile", notes: "Support copy: Text" }] }] };
  const productionTile: PipelineEntry = { id: "canvas:tile-canvas", sourceId: "tile-canvas", title: "Tile plan", updated: "", stage: "production", kind: "canvas", subtitle: "1 of 2 designs ready", formats: ["tiles"] };
  vi.mocked(setTilePlanReturned).mockResolvedValue(undefined);
  open("production", [], [productionTile], [canvas]);
  fireEvent.click(screen.getByRole("button", { name: /Tile plan.*1 of 2/ }));
  fireEvent.click(screen.getByRole("button", { name: "Return to Plans Tile plan" }));
  expect(screen.getByRole("alertdialog")).toHaveTextContent("Existing designs remain available");
  fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Return to Plans"));
  await waitFor(() => expect(setTilePlanReturned).toHaveBeenCalledWith(ws, productionTile.id, true));
  expect(setPipelineTrashed).not.toHaveBeenCalledWith(ws, productionTile.id, true);
});
