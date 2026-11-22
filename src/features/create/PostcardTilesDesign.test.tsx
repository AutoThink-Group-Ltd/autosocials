import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { defaultSocialDesign } from "@/lib/social-design";
import { productionTileInput } from "./production-tile-input";
const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  check: vi.fn(),
  schedule: vi.fn(),
  trash: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({ useQuery: ({ queryKey }: { queryKey: [string, string, unknown[]] }) => ({ data: queryKey[2].map(() => ({ provider: "openai", credits: 45, rateId: "11111111-1111-4111-8111-111111111111" })), isPending: false, isError: false, isFetching: false }) }));
vi.mock("./PipelineTrash", async (importOriginal) => ({
  ...await importOriginal<typeof import("./PipelineTrash")>(),
  usePipelineTrash: () => ({ ids: [], isLoading: false, isError: false, isPending: false, trashPlans: mocks.trash, setTrashed: mocks.trash }),
}));
vi.mock("./SocialDesignEditor", () => ({ SocialDesignEditor: () => null }));
vi.mock("@/features/schedule/ScheduleDialogHost", () => ({ useScheduleDialog: () => ({ scheduleSelection: mocks.schedule }) }));
vi.mock("@/features/schedule/useAssetPublishingStatus", () => ({ useAssetPublishingStatus: () => ({ data: {}, isPending: false, isError: false }) }));
vi.mock("@/lib/postcard-tiles.functions", () => ({
  generatePostcardTile: mocks.generate,
  checkPostcardTile: mocks.check,
  quotePostcardTile: vi.fn(),
  redesignPostcardTile: vi.fn(),
}));
import { PostcardTileBatch, PostcardTilesDesign } from "./PostcardTilesDesign";
const plan = {
  brand: "Example",
  tiles: [
    {
      headline: "First idea",
      supporting: "A clear angle",
      direction: "A square design with a clean photograph",
    },
  ],
};
const ws = "11111111-1111-4111-8111-111111111111";
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);
it("shows ten square copy sketches and submits the displayed copy only on approval", async () => {
  const previous = Object.getOwnPropertyDescriptor(window.crypto, "subtle");
  Object.defineProperty(window.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  try {
    const tiles = Array.from({ length: 10 }, (_, index) => ({
      headline: `Headline ${index + 1}`,
      supporting: `Supporting line ${index + 1}\nSee AutoTill`,
      direction: "Square editorial composition",
      design: defaultSocialDesign("Typography-led design"),
    }));
    mocks.generate.mockImplementation(async ({ data }) => ({ status: "ready", file_id: data.request_id, data_url: "data:image/png;base64,AAAA" }));
    const view = render(<PostcardTileBatch workspaceId={ws} plan={{ brand: "AutoTill", tiles }} storageKey="canvas:version:2" compact />);
    expect(within(screen.getByRole("list", { name: "Tile previews" })).getAllByRole("listitem")).toHaveLength(10);
    expect(screen.getByLabelText("Tile 10")).toBeVisible();
    expect(within(screen.getByRole("list", { name: "Asset progress" })).getAllByRole("listitem").map(item => item.textContent)).toEqual([
      "Plans", "Production", "Ready to Publish", "Scheduled", "Posted",
    ]);
    expect(screen.getByText("Plans")).toHaveAttribute("aria-current", "step");
    expect(screen.getByText(/Supporting line 10/)).toHaveClass("whitespace-pre-wrap");
    expect(view.container.querySelectorAll(".aspect-square")).toHaveLength(10);
    const approve = screen.getByRole("button", { name: "Approve and design 10 tiles" });
    await waitFor(() => expect(approve).toBeEnabled());
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.schedule).not.toHaveBeenCalled();
    fireEvent.click(approve);
    expect(await screen.findByText("10 of 10 designs ready")).toBeVisible();
    expect(mocks.generate).toHaveBeenCalledTimes(10);
    const payloads = mocks.generate.mock.calls.map(([arg]) => arg.data);
    expect(new Set(payloads.map((payload) => payload.request_id)).size).toBe(10);
    expect(payloads).toEqual(tiles.map((tile, index) => expect.objectContaining(productionTileInput(tile, index))));
    expect(screen.getAllByRole("img")).toHaveLength(10);
    expect(screen.getByText("Ready to Publish")).toHaveAttribute("aria-current", "step");
    expect(mocks.schedule).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Schedule or publish" }));
    expect(mocks.schedule).toHaveBeenCalledWith({ tileIds: payloads.map((payload) => payload.request_id) });
  } finally {
    if (previous) Object.defineProperty(window.crypto, "subtle", previous);
    else Reflect.deleteProperty(window.crypto, "subtle");
  }
});


it("shows the active tile and waits for it before starting the next", async () => {
  const previous = Object.getOwnPropertyDescriptor(window.crypto, "subtle");
  Object.defineProperty(window.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  try {
    let finish!: (result: unknown) => void;
    mocks.generate.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }))
      .mockResolvedValueOnce({ status: "ready", file_id: "second", data_url: "data:image/png;base64,AAAA" });
    const two = { ...plan, tiles: [...plan.tiles, { headline: "Second idea", supporting: "Next", direction: "Square" }] };
    render(<PostcardTileBatch workspaceId={ws} plan={two} storageKey="canvas:sequential" compact />);
    const approve = screen.getByRole("button", { name: "Approve and design 2 tiles" });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    expect(await screen.findByRole("status", { name: "Designing tile 1" })).toHaveTextContent("First idea");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    finish({ status: "ready", file_id: "first", data_url: "data:image/png;base64,AAAA" });
    expect(await screen.findByText("2 of 2 designs ready")).toBeVisible();
    expect(mocks.generate).toHaveBeenCalledTimes(2);
  } finally {
    if (previous) Object.defineProperty(window.crypto, "subtle", previous);
    else Reflect.deleteProperty(window.crypto, "subtle");
  }
});

it("checks a pending tile before submitting the next approved tile", async () => {
  const previous = Object.getOwnPropertyDescriptor(window.crypto, "subtle");
  Object.defineProperty(window.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  try {
    mocks.generate.mockResolvedValueOnce({ status: "pending", message: "Processing" })
      .mockResolvedValueOnce({ status: "ready", file_id: "second", data_url: "data:image/png;base64,AAAA" });
    mocks.check.mockResolvedValueOnce({ status: "ready", file_id: "first", data_url: "data:image/png;base64,AAAA" });
    const two = { ...plan, tiles: [...plan.tiles, { headline: "Second idea", supporting: "Next", direction: "Square" }] };
    render(<PostcardTileBatch workspaceId={ws} plan={two} storageKey="canvas:pending" compact />);
    const approve = screen.getByRole("button", { name: "Approve and design 2 tiles" });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(1));
    expect(mocks.check).not.toHaveBeenCalled();
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2), { timeout: 8000 });
    expect(mocks.check.mock.calls[0]![0].data.request_id).toBe(mocks.generate.mock.calls[0]![0].data.request_id);
  } finally {
    if (previous) Object.defineProperty(window.crypto, "subtle", previous);
    else Reflect.deleteProperty(window.crypto, "subtle");
  }
}, 10000);

it("pauses the batch on an uncertain request instead of starting the next tile", async () => {
  const previous = Object.getOwnPropertyDescriptor(window.crypto, "subtle");
  Object.defineProperty(window.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  try {
    mocks.generate.mockResolvedValueOnce({ status: "reconciliation_required", message: "Check this request" });
    const two = { ...plan, tiles: [...plan.tiles, { headline: "Second idea", supporting: "Next", direction: "Square" }] };
    render(<PostcardTileBatch workspaceId={ws} plan={two} storageKey="canvas:uncertain" compact />);
    const approve = screen.getByRole("button", { name: "Approve and design 2 tiles" });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    await screen.findByText(/A design is still processing or needs checking/);
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    const remaining = screen.getByRole("button", { name: "Approve and design 1 tile" });
    expect(remaining).toBeEnabled();
    mocks.generate.mockResolvedValueOnce({ status: "ready", file_id: "second", data_url: "data:image/png;base64,AAAA" });
    fireEvent.click(remaining);
    await waitFor(() => expect(mocks.generate).toHaveBeenCalledTimes(2));
    expect(mocks.generate.mock.calls[1]?.[0].data.headline).toBe("Second idea");
    expect(mocks.generate.mock.calls[1]?.[0].data.request_id).not.toBe(mocks.generate.mock.calls[0]?.[0].data.request_id);
  } finally {
    if (previous) Object.defineProperty(window.crypto, "subtle", previous);
    else Reflect.deleteProperty(window.crypto, "subtle");
  }
});

it.each([
  ["insufficient", "Not enough content credits", "View upgrade options"],
  ["allowance_unavailable", "Content credits need attention", "View billing"],
])("shows the %s credit block and pauses before submitting more tiles", async (creditIssue, title, action) => {
  const original = Object.getOwnPropertyDescriptor(window.crypto, "subtle");
  Object.defineProperty(window.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  try {
    const two = { ...plan, tiles: [...plan.tiles, { ...plan.tiles[0]!, headline: "Second tile" }] };
    mocks.generate.mockResolvedValueOnce({ status: "limit_reached", creditIssue, message: "Credit allowance could not cover this tile." });
    render(<PostcardTileBatch workspaceId={ws} plan={two} compact />);
    const approve = screen.getByRole("button", { name: "Approve and design 2 tiles" });
    await waitFor(() => expect(approve).toBeEnabled());
    fireEvent.click(approve);
    const dialog = await screen.findByRole("dialog", { name: title });
    expect(within(dialog).getByText(/Tile 1 couldn’t start/)).toBeVisible();
    expect(within(dialog).getByRole("link", { name: action })).toHaveAttribute("href", "/app/billing");
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  } finally {
    if (original) Object.defineProperty(window.crypto, "subtle", original);
    else Reflect.deleteProperty(window.crypto, "subtle");
  }
});

describe("Postcards tile design", () => {
  it("shows studio progress while a design request is in flight", async () => {
    let finish!: (result: unknown) => void;
    mocks.generate.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<PostcardTilesDesign workspaceId={ws} plan={plan} onBack={vi.fn()} />);
    expect(screen.getByText("Selected designs: 45 credits")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create designs" }));
    expect(screen.getByRole("region", { name: "Design creation progress" })).toHaveTextContent("0 of 1 selected designs ready");
    expect(screen.getByRole("progressbar", { name: "Creating designs" })).toBeInTheDocument();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ expected_provider: "openai", expected_credits: 45 }) }));
    finish({ status: "ready", file_id: "file", data_url: "data:image/png;base64,AAAA" });
    expect(await screen.findByText("Ready and saved")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close and review" }));
    expect(await screen.findByRole("img", { name: "Designed tile: First idea" })).toBeInTheDocument();
  });
  it("toggles from the card body and skips a pending request when creating other selections", async () => {
    const multiple = { ...plan, tiles: [...plan.tiles, { headline: "Second idea", supporting: "Another angle", direction: "A second square design" }] };
    const saved = { plan: multiple, draftsDone: false, entries: [
      { requestId: "first", postId: "one", status: "pending" },
      { requestId: "second", postId: "two", status: "not_started" },
    ] };
    sessionStorage.setItem(`as:postcard-tile-run:${ws}`, JSON.stringify(saved));
    mocks.generate.mockResolvedValue({ status: "ready", file_id: "file", data_url: "data:image/png;base64,AAAA" });
    render(<PostcardTilesDesign workspaceId={ws} plan={multiple} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText("Another angle"));
    expect(screen.getByRole("checkbox", { name: "Select Second idea" })).not.toBeChecked();
    fireEvent.click(screen.getByText("Another angle"));
    expect(screen.getByRole("button", { name: "Create designs" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Create designs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close and review" }));
    await screen.findByRole("img", { name: "Designed tile: Second idea" });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0]![0].data.request_id).toBe("second");
  });
  it("allows a previously rejected allowance request to be started again", async () => {
    const saved = { plan, draftsDone: false, entries: [{ requestId: "first", postId: "one", status: "limit_reached", message: "This workspace has reached its monthly image allowance." }] };
    sessionStorage.setItem(`as:postcard-tile-run:${ws}`, JSON.stringify(saved));
    mocks.generate.mockResolvedValue({ status: "ready", file_id: "file", data_url: "data:image/png;base64,AAAA" });
    render(<PostcardTilesDesign workspaceId={ws} plan={plan} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Create designs" }));
    await screen.findByText("Ready and saved");
    expect(mocks.generate).toHaveBeenCalledOnce();
    expect(mocks.generate.mock.calls[0]![0].data.request_id).toBe("first");
  });
  it("creates only selected narratives and prevents an empty selection", async () => {
    const multiple = { ...plan, tiles: [...plan.tiles, { headline: "Second idea", supporting: "Another angle", direction: "A second square design" }] };
    mocks.generate.mockResolvedValue({ status: "ready", file_id: "file", data_url: "data:image/png;base64,AAAA" });
    render(<PostcardTilesDesign workspaceId={ws} plan={multiple} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Select First idea" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Second idea" }));
    expect(screen.getByRole("button", { name: "Create designs" })).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Second idea" }));
    fireEvent.click(screen.getByRole("button", { name: "Create designs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close and review" }));
    await screen.findByRole("img", { name: "Designed tile: Second idea" });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0]![0].data.headline).toBe("Second idea");
  });
  it("only starts Postcards when requested and displays the finished tile", async () => {
    mocks.generate.mockResolvedValue({
      status: "ready",
      file_id: "file",
      data_url: "data:image/png;base64,AAAA",
    });
    render(
      <PostcardTilesDesign workspaceId={ws} plan={plan} onBack={vi.fn()} />,
    );
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Send to Publish" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create designs" }));
    fireEvent.click(await screen.findByRole("button", { name: "Close and review" }));
    await screen.findByRole("img", { name: "Designed tile: First idea" });
    expect(mocks.generate).toHaveBeenCalledTimes(1);
    expect(mocks.generate.mock.calls[0]![0].data.direction).toBe(
      plan.tiles[0]!.direction,
    );

  });
  it("checks an uncertain request without submitting it a second time", async () => {
    mocks.generate.mockResolvedValue({
      status: "pending",
      message: "Still processing",
    });
    mocks.check.mockResolvedValue({
      status: "pending",
      message: "Still processing",
    });
    render(
      <PostcardTilesDesign workspaceId={ws} plan={plan} onBack={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Create designs" }));
    expect(await screen.findByRole("button", { name: "Close and review" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close and review" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Check design status" }),
    );
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    expect(mocks.generate).toHaveBeenCalledTimes(1);
  });
});

it("selects all tile cards by default and trashes only the chosen card", async () => {
  const previous = Object.getOwnPropertyDescriptor(window.crypto, "subtle");
  Object.defineProperty(window.crypto, "subtle", { configurable: true, value: webcrypto.subtle });
  try {
    const two = { ...plan, tiles: [...plan.tiles, { headline: "Second idea", supporting: "Next", direction: "Square" }] };
    render(<PostcardTileBatch workspaceId={ws} canvasId={ws} plan={two} storageKey="canvas:trash" compact />);
    const first = screen.getByRole("checkbox", { name: /Select tile 1/ });
    const second = screen.getByRole("checkbox", { name: /Select tile 2/ });
    await waitFor(() => expect(first).toBeEnabled());
    expect(first).toBeChecked();
    expect(second).toBeChecked();
    fireEvent.click(first);
    expect(screen.getByRole("button", { name: "Approve and design 1 tile" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Move 1 selected tile to Trash" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByText("Trash selected tiles"));
    await waitFor(() => expect(mocks.trash).toHaveBeenCalledWith([expect.stringContaining(`production-item:canvas:${ws}:tile:`)]));
    expect(mocks.generate).not.toHaveBeenCalled();
  } finally {
    if (previous) Object.defineProperty(window.crypto, "subtle", previous);
    else Reflect.deleteProperty(window.crypto, "subtle");
  }
});
