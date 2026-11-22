import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  plan: vi.fn(),
  generate: vi.fn(),
  check: vi.fn(),
  save: vi.fn(),
  drafts: vi.fn(),
  get: vi.fn(),
  files: vi.fn(),
}));
vi.mock("@/lib/brand-dna.functions", () => ({ getCreativeDnaKit: vi.fn().mockResolvedValue(null) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }: { queryKey: unknown[] }) => queryKey[0] === "social-background-credit-quote" ? ({ data: { provider: "openai", credits: 45, rateId: "11111111-1111-4111-8111-111111111111" }, isError: false, isFetching: false }) : ({ data: undefined }),
}));
vi.mock("@/contexts/WorkspaceContext", () => ({
  useWorkspace: () => ({
    currentWorkspace: { id: "a1c2d3e4-1111-4111-8111-111111111111" },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/social-tiles.functions", () => ({
  planSocialTiles: mocks.plan,
}));
vi.mock("@/lib/social-tile-image.functions", () => ({
  getSocialTileImage: mocks.get,
  generateSocialTileImage: mocks.generate,
  checkSocialTileImage: mocks.check,
  quoteSocialTileImage: vi.fn(),
}));
vi.mock("@/lib/social-tile-storage.functions", () => ({
  saveSocialTiles: mocks.save,
  createSocialTileDrafts: mocks.drafts,
}));
vi.mock("@/lib/studio.functions", () => ({ listPickableFiles: mocks.files }));
vi.mock("./social-tile-canvas", () => ({
  drawSocialTile: vi.fn(),
  loadTileImage: vi.fn(),
}));
vi.mock("@/features/home/HomeSocialTiles", () => ({ HomeSocialTiles: () => <div>Completed gallery</div> }));
vi.mock("./DesignReferencePicker", () => ({ DesignReferencePicker: ({ onChange }: { onChange: (ids: string[]) => void }) => <button type="button" onClick={() => onChange(["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"])}>Choose reference</button> }));
vi.mock("./PostcardTilesDesign", () => {
  const Batch = ({
    plan,
  }: {
    plan: { tiles: { headline: string; direction?: string; design?: { treatment: string } }[] };
  }) => (
    <div aria-label="Postcards design stage">
      {plan.tiles.map((tile) => (
        <span key={tile.headline} data-direction={tile.direction} data-treatment={tile.design?.treatment}>{tile.headline}</span>
      ))}
    </div>
  );
  return { PostcardTileBatch: Batch, PostcardTilesDesign: Batch };
});
import { SocialTiles } from "./SocialTiles";
const tiles = Array.from({ length: 5 }, (_, i) => ({
  headline: `Headline ${i + 1}`,
  supporting: `Copy ${i + 1}`,
}));
beforeEach(() => {
  sessionStorage.clear();
  vi.clearAllMocks();
  mocks.plan.mockResolvedValue({ brand: "Example", tiles });
  mocks.save.mockImplementation(async ({ data }) => ({
    results: data.tiles.map((t: { id: string }) => ({ id: t.id, ok: true })),
  }));
  mocks.drafts.mockImplementation(async ({ data }) => ({
    results: data.tiles.map((t: { post_id: string }) => ({
      id: t.post_id,
      ok: true,
    })),
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    "data:image/jpeg;base64,YWJj",
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("social tile workflow", () => {
  it("applies an optional style to the whole plan", async () => {
    render(<SocialTiles requestedCount={5} initialEntry="styles" />);
    fireEvent.click(screen.getByRole("button", { name: /Bold typography/ }));
    expect(await screen.findByLabelText("Postcards design stage")).toHaveTextContent("Headline 1");
    expect(screen.getByText("Headline 1")).toHaveAttribute("data-direction", expect.stringContaining("Typography-led"));
    expect(screen.getByText("Headline 1")).toHaveAttribute("data-treatment", "typography");
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("passes optional reference IDs to the planner when the user drafts copy", async () => {
    render(<SocialTiles requestedCount={5} autoGenerate={false} />);
    fireEvent.click(screen.getByRole("button", { name: /New Idea/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your idea" }), { target: { value: "New campaign" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose reference" }));
    expect(mocks.plan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Draft tile copy" }));
    await screen.findByText("Headline 1");
    expect(mocks.plan).toHaveBeenCalledWith({ data: expect.objectContaining({ context_mode: "idea", reference_ids: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"] }) });
  });
  it("keeps earlier requests available alongside a new brief", async () => {
    const workspace = "a1c2d3e4-1111-4111-8111-111111111111";
    sessionStorage.setItem(`as:postcard-tile-run:${workspace}`, JSON.stringify({ plan: { brand: "Example", tiles: [{ headline: "Old idea", supporting: "Old copy" }] }, entries: [{ requestId: "saved", postId: "saved", status: "pending" }] }));
    render(<SocialTiles requestedCount={5} autoGenerate={false} />);
    fireEvent.click(await screen.findByText("Previous requests"));
    expect(screen.getByRole("button", { name: "Review: Old idea" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Generate from Goals/ }));
    await screen.findByText("Headline 1");
    expect(mocks.plan).toHaveBeenCalledWith({ data: expect.objectContaining({ brief: "", context_mode: "goals", previous_titles: ["Old idea"] }) });
  });
  it("reuses drafted ideas when reopening in the same workspace", async () => {
    const first = render(<SocialTiles requestedCount={5} />);
    await screen.findByText("Headline 1");
    first.unmount();
    render(<SocialTiles requestedCount={5} />);
    await screen.findByText("Headline 1");
    expect(mocks.plan).toHaveBeenCalledTimes(1);
  });
  it("shares an in-flight idea request across remounts", async () => {
    let finish!: (value: { brand: string; tiles: typeof tiles }) => void;
    mocks.plan.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const first = render(<SocialTiles requestedCount={5} />);
    await waitFor(() => expect(mocks.plan).toHaveBeenCalledTimes(1));
    first.unmount();
    render(<SocialTiles requestedCount={5} />);
    finish({ brand: "Example", tiles });
    await screen.findByText("Headline 1");
    expect(mocks.plan).toHaveBeenCalledTimes(1);
  });
  it("takes all ten sketches straight to the review step", async () => {
    const tenTiles = Array.from({ length: 10 }, (_, i) => ({ headline: `Headline ${i + 1}`, supporting: `Copy ${i + 1}` }));
    mocks.plan.mockResolvedValue({ brand: "Example", tiles: tenTiles });
    render(<SocialTiles initialBrief="Campaign" requestedCount={10} />);
    const review = await screen.findByLabelText("Postcards design stage");
    expect(review.children).toHaveLength(10);
    expect(review).toHaveTextContent("Headline 10");
    expect(mocks.plan.mock.calls[0][0].data.count).toBe(10);
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.drafts).not.toHaveBeenCalled();
  });
  it("restores interrupted request IDs and checks status without spending again", async () => {
    const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
    sessionStorage.setItem(
      "as:social-tile-run:a1c2d3e4-1111-4111-8111-111111111111",
      JSON.stringify({
        plan: { brand: "Example", tiles },
        requestIds: ids,
        postIds: ids,
        background: "#111111",
        accent: "#333333",
      }),
    );
    mocks.check.mockResolvedValue({ status: "pending" });
    render(<SocialTiles requestedCount={5} />);
    await screen.findByText(/previous image request was restored/i);
    fireEvent.click(
      screen.getByRole("button", { name: "Check AI background status" }),
    );
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(5));
    expect(
      mocks.check.mock.calls.map((call) => call[0].data.request_id),
    ).toEqual(ids);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it("restores an interrupted single-tile request", async () => {
    const id = crypto.randomUUID();
    sessionStorage.setItem(
      "as:social-tile-run:a1c2d3e4-1111-4111-8111-111111111111",
      JSON.stringify({
        plan: { brand: "Example", tiles: [tiles[0]] },
        requestIds: [id],
        postIds: [crypto.randomUUID()],
      }),
    );
    mocks.check.mockResolvedValue({ status: "pending" });
    render(<SocialTiles requestedCount={5} />);
    await screen.findByText(/previous image request was restored/i);
    fireEvent.click(
      screen.getByRole("button", { name: "Check AI background status" }),
    );
    await waitFor(() => expect(mocks.check).toHaveBeenCalledTimes(1));
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
