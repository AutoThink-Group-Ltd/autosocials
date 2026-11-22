import { createContext } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseBlocks, type Block } from "@/lib/sam.blocks";
import { BlockRenderer } from "./BlockRenderer";
import type { TilePlan } from "@/lib/social-tiles";

vi.mock("./DirectVideoBlock", () => ({ DirectVideoBlock: ({ index }: { index: number }) => <section aria-label="Animation progress" data-original-index={index}>Current generation</section> }));
vi.mock("./blocks/usePreviews", () => ({ StudioCtx: createContext({}), usePreviewMap: () => ({ previews: new Map(), loading: false }) }));
vi.mock("./blocks/ConceptPreview", () => ({ ConceptPreview: () => null }));
vi.mock("@/features/create/PostcardTilesDesign", () => ({
  PostcardTileBatch: ({ plan }: { plan: TilePlan }) => <ol aria-label="Tile sketches">{plan.tiles.map(tile => (
    <li key={tile.headline} data-aspect={tile.design?.aspect}>{tile.headline}<pre>{tile.supporting}</pre></li>
  ))}</ol>,
}));
vi.mock("./blocks/Studio", () => ({ AssetsBlock: () => <p>Large reference gallery</p>, CompareBlock: () => null, ConfirmBlock: () => null, DocumentBlock: () => null, Lightbox: () => null, PaletteBlock: () => null, ShotListBlock: () => null, StoryboardBlock: () => null, TypeSpecimenBlock: () => null }));
afterEach(cleanup);

it("opens a saved AutoTill tile concept as ten square sketches with the full on-tile copy", () => {
  const supporting = "AutoTill gives your website a business-grounded agent that can help shoppers, answer questions and move visitors towards a clear next step.";
  const blocks = parseBlocks([
    { type: "variants", title: "10 plug-and-play social tile ideas", items: Array.from({ length: 10 }, (_, index) => ({
      angle: "Fast setup",
      format: "Social tile",
      hook: `Put an AI agent on your website ${index + 1}`,
      notes: `Support copy: ${supporting}\nCTA: See the product\nDesign: {"aspect":"portrait","treatment":"typography","composition":"full","medium":"Bold black-and-white layout","typeface":"sans","accent":"#ffffff","emphasis":""}`,
    })) },
    { type: "assets", title: "Reference brand files for these tiles", file_ids: ["photo"] },
  ]);
  const useVideo = vi.fn();
  const { container } = render(<BlockRenderer blocks={blocks} onChange={vi.fn()} workspaceId="workspace" canvas={{ id: "canvas", version: 1, title: "AutoTill social tile concepts" }} onUseVariants={useVideo} />);
  const grid = within(screen.getByRole("list", { name: "Tile sketches" }));
  expect(grid.getAllByRole("listitem")).toHaveLength(10);
  expect(grid.getAllByRole("listitem").every(tile => tile.dataset["aspect"] === "square")).toBe(true);
  expect(grid.getAllByText(/See the product/)).toHaveLength(10);
  expect(grid.getAllByText(/move visitors towards a clear next step/)).toHaveLength(10);
  expect(screen.queryByText("Large reference gallery")).not.toBeInTheDocument();
  expect(container).not.toHaveTextContent("Fast setup");
  expect(useVideo).not.toHaveBeenCalled();
});

describe("direct video canvas layout", () => {
  it("puts generation above collapsed photos and preserves the original action index", () => {
    const blocks: Block[] = [
      { type: "assets", title: "Saved photos", file_ids: ["photo-a", "photo-b"], layout: "grid" },
      { type: "direct_video", title: "Film", request_id: "request-a", status: "queued", reason: "Queued", reference_count: 2, duration: 30, aspect_ratio: "9:16", resolution: "1080p", options: [], message: "Animate", thread_id: "thread-a", file_ids: ["photo-a", "photo-b"] },
    ];
    const { container } = render(<BlockRenderer blocks={blocks} onChange={vi.fn()} canvas={{ id: "canvas-a", version: 3 }} />);
    const progress = screen.getByRole("region", { name: "Animation progress" });
    expect(progress).toHaveAttribute("data-original-index", "1");
    const gallery = screen.getByText("2 reference photos · View gallery").closest("details")!;
    expect(gallery).not.toHaveAttribute("open");
    expect(progress.compareDocumentPosition(gallery) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container.querySelector("details p")).toHaveTextContent("Large reference gallery");
  });
});

describe("LinkedIn carousel canvas", () => {
  it("shows saved slide copy and the caption when an older plan lives in a document", () => {
    const blocks = parseBlocks([
      { type: "variants", title: "Carousel concept", items: [
        { angle: "Own the systems that matter", hook: "What we built", format: "LinkedIn carousel" },
      ] },
      { type: "document", title: "Slide-by-slide draft", markdown: [
        "# LinkedIn carousel draft", "## Slide 1", "What we replaced this year",
        "## Slide 2", "Asana £650, AgencyAnalytics £500, CallRail £600 and Mailchimp £2K a month.",
        "## Slide 3", "Example Calls instead of CallRail and ExampleMailer instead of Mailchimp.",
        "## Suggested LinkedIn caption", "Build what makes you different.",
      ].join("\n\n") },
    ]);
    const { container } = render(<BlockRenderer blocks={blocks} onChange={vi.fn()} workspaceId="workspace" onOpenCarousel={vi.fn()} onUseVariants={vi.fn()} />);
    const plan = within(screen.getByRole("region", { name: "LinkedIn carousel slide plan" }));
    expect(plan.getByRole("heading", { name: "Slide 3" })).toBeVisible();
    expect(plan.getByText(/Mailchimp £2K a month/)).toBeVisible();
    expect(plan.getByText(/Example Calls instead of CallRail/)).toBeVisible();
    expect(plan.getByRole("heading", { name: "Suggested LinkedIn caption" })).toBeVisible();
    expect(plan.getByRole("button", { name: "Prepare plan for editor" })).toBeVisible();
    expect(container.querySelector("details")).toBeNull();
  });

  it("shows the saved outline instead of the video reel", () => {
    const blocks: Block[] = [{
      type: "variants", title: "LinkedIn carousel idea", items: [{
        angle: "Start with a control layer", hook: "Your missing control layer", format: "LinkedIn carousel",
        notes: "Opening visual: type on black. Suggested slide arc: 1) hook, 2) why tools create chaos, 3) point of failure, 4) control layer, 5) handover, 6) audit, 7) CTA.",
      }],
    }];
    const useVideo = vi.fn();
    const { container } = render(<BlockRenderer blocks={blocks} onChange={vi.fn()} workspaceId="workspace" onOpenCarousel={vi.fn()} onUseVariants={useVideo} />);
    const outline = screen.getByRole("region", { name: "LinkedIn carousel outline" });
    expect(within(outline).getAllByRole("listitem")).toHaveLength(7);
    expect(within(outline).getByText("why tools create chaos")).toBeVisible();
    expect(within(outline).getByText("Opening visual: type on black.")).toBeVisible();
    expect(within(outline).getByRole("button", { name: "Draft slide copy" })).toBeEnabled();
    expect(container.querySelector("details")).toBeNull();
    expect(useVideo).not.toHaveBeenCalled();
  });

  it("renders all validated slide copy and uses the exact plan when opening the editor", () => {
    const plan = {
      title: "Make AI accountable", promise: "Map your approvals", brand: "Acme",
      slides: [
        { headline: "Find the gap", supporting: "Start with one automated decision.", direction: "Large headline on a quiet cover." },
        { headline: "Assign an owner", supporting: "Name a person for every exception.", direction: "Stack the takeaway in two lines." },
      ],
    };
    const blocks = parseBlocks([{
      type: "variants", title: "LinkedIn carousel idea",
      items: [{ angle: "Map your approvals", hook: "Find the gap", format: "LinkedIn carousel", carousel_plan: plan }],
    }]);
    const open = vi.fn();
    const useVideo = vi.fn();
    render(<BlockRenderer blocks={blocks} onChange={vi.fn()} onOpenCarousel={open} onUseVariants={useVideo} />);
    const content = within(screen.getByRole("region", { name: "LinkedIn carousel slide plan" }));
    expect(content.getAllByRole("listitem")).toHaveLength(2);
    expect(content.getByText("Start with one automated decision.")).toBeVisible();
    expect(content.getByText("Name a person for every exception.")).toBeVisible();
    expect(content.getByText(/Stack the takeaway/)).toBeVisible();
    expect(content.getAllByRole("button")).toHaveLength(1);
    fireEvent.click(content.getByRole("button", { name: "Open in carousel editor" }));
    expect(open).toHaveBeenCalledWith(plan);
    expect(useVideo).not.toHaveBeenCalled();
  });
});
