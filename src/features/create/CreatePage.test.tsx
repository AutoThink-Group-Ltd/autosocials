import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreatePage } from "./CreatePage";
import { createSearch } from "@/lib/create-pipeline";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn(),
  invalidate: vi.fn(),
  handoff: vi.fn(),
}));
vi.mock("@/lib/agent-content.functions", () => ({
  getAgentTileHandoff: mocks.handoff,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ upsert: mocks.upsert }) },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));

vi.mock("./wizard/CreateWizard", () => ({
  CreateWizard: ({
    onTileIdea,
  }: {
    onTileIdea: (idea: unknown, style: unknown) => void;
  }) => (
    <button
      onClick={() =>
        onTileIdea(
          {
            title: "An idea",
            message: "What changed",
            treatment: "Show the benefit",
          },
          { direction: "Typography-led poster" },
        )
      }
    >
      Choose tile
    </button>
  ),
}));
vi.mock("./SocialTiles", () => ({
  SocialTiles: ({
    initialPlan,
    onReviewPlan,
  }: {
    initialPlan?: { tiles: { headline: string }[] };
    onReviewPlan: (plan: unknown, brief: string, id: string) => Promise<void>;
  }) => (
    <>
      <p>{initialPlan?.tiles[0]?.headline ?? "New tiles"}</p>
      <button
        onClick={() =>
          void onReviewPlan(
            {
              brand: "AutoTill",
              tiles: [{ headline: "Tile", supporting: "Full copy" }],
            },
            "Brief",
            "canvas-id",
          )
        }
      >
        Draft copy
      </button>
    </>
  ),
}));
vi.mock("./WrittenPosts", () => ({ WrittenPosts: () => <p>Written brief</p> }));
const nav = vi.fn();
const props = {
  workspaceId: "one",
  workspaceName: "Agency",
  onNavigate: nav,
  onBatch: vi.fn(),
  onBack: vi.fn(),
};
describe("Create navigation", () => {
  beforeEach(() => {
    sessionStorage.clear();
    nav.mockReset();
  });
  afterEach(cleanup);
  it("preserves the origin while opening a saved batch and validates old links", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    expect(
      createSearch({
        stage: "production",
        item: "personal:" + id,
        wizard: "video",
        batch: id,
      }),
    ).toEqual({
      stage: "production",
      item: "personal:" + id,
      wizard: "video",
      batch: id,
    });
    expect(createSearch({ production: id, group: 20 })).toEqual({
      production: id,
      group: 20,
    });
    expect(
      createSearch({
        stage: "unknown",
        carousel: "invalid",
        item: "https://somewhere",
      }),
    ).toEqual({});
  });
  it("opens the requested wizard regardless of an earlier workspace workflow", () => {
    sessionStorage.setItem("as:create-format:one", "video");
    render(<CreatePage {...props} search={{ wizard: "written" }} />);
    expect(screen.getByText("Written brief")).toBeVisible();
  });
  it("opens saved carousel item links directly from Plans and Production", () => {
    const id = "eaddd44d-8128-4737-a839-424a1ce04ff7";
    const item = `carousel:${id}`;
    expect(createSearch({ stage: "plans", item })).toEqual({ stage: "plans", item, carousel: id });
    expect(createSearch({ stage: "production", item })).toEqual({ stage: "production", item, carousel: id });
    expect(createSearch({ stage: "ready", item })).toEqual({ stage: "ready", item });
  });
  it("carries the reviewed video idea into tiles and restores it only in its workspace", () => {
    const view = render(<CreatePage {...props} search={{ wizard: "video" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Choose tile" }));
    expect(nav).toHaveBeenCalledWith({ wizard: "tiles" });
    view.unmount();
    const second = render(
      <CreatePage {...props} search={{ wizard: "tiles" }} />,
    );
    expect(screen.getByText("An idea")).toBeVisible();
    second.unmount();
    render(
      <CreatePage {...props} workspaceId="two" search={{ wizard: "tiles" }} />,
    );
    expect(screen.getByText("New tiles")).toBeVisible();
  });
  it("opens an authenticated tile handoff in the selected workspace", async () => {
    mocks.handoff.mockResolvedValueOnce({
      brief: "A brief",
      referenceIds: [],
      plan: {
        brand: "Brand",
        tiles: [{ headline: "Prepared idea", supporting: "" }],
      },
    });
    render(
      <CreatePage
        {...props}
        search={{ wizard: "tiles", agentTile: "a".repeat(64) }}
      />,
    );
    expect(await screen.findByText("Prepared idea")).toBeVisible();
    expect(mocks.handoff).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { workspace_id: "one", handoff_id: "a".repeat(64) },
      }),
    );
  });
  it("opens the saved tile plan in the hub", async () => {
    mocks.upsert.mockResolvedValue({ error: null });
    render(<CreatePage {...props} search={{ wizard: "tiles" }} />);
    fireEvent.click(screen.getByRole("button", { name: "Draft copy" }));
    await waitFor(() =>
      expect(nav).toHaveBeenCalledWith({
        stage: "plans",
        item: "canvas:canvas-id",
      }),
    );
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "canvas-id",
        workspace_id: "one",
        blocks: [
          expect.objectContaining({
            type: "social_tiles",
            plan: expect.objectContaining({ brand: "AutoTill" }),
          }),
        ],
      }),
      { onConflict: "id", ignoreDuplicates: true },
    );
  });
});
