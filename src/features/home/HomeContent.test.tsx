const schedule = vi.hoisted(() => vi.fn());
const trashState = vi.hoisted(() => ({ ids: [] as string[], update: vi.fn() }));
vi.mock("@/lib/content-trash", () => ({
  contentTrashKey: (workspace: string, kind: string) => ["content-trash", workspace, kind],
  listContentTrash: async () => [...trashState.ids],
  setContentTrashed: async (_workspace: string, _kind: string, id: string, trashed: boolean) => {
    trashState.update(id, trashed);
    trashState.ids = trashed ? [...trashState.ids, id] : trashState.ids.filter(item => item !== id);
  },
}));
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
vi.mock("@/features/schedule/ScheduleDialogHost", () => ({ useScheduleDialog: () => ({ addToSchedule: schedule }) }));
vi.mock("@/features/schedule/useAssetPublishingStatus", () => ({ useAssetPublishingStatus: () => ({ isSuccess: true, data: {} }), channelStatusLabel: () => "Published" }));
vi.mock("./HomeVideoGallery", () => ({ HomeVideoGallery: () => <div>Video gallery</div> }));
vi.mock("./HomeSocialTiles", () => ({ HomeSocialTiles: () => <div>Tile gallery</div> }));
vi.mock("@/features/create/CarouselLibrary", () => ({ CarouselLibrary: ({ workspaceId }: { workspaceId: string }) => <div>Carousel library for {workspaceId}</div> }));
vi.mock("@/components/publishing/ComposerDrawer", () => ({ ComposerDrawer: ({ open, postId, onOpenChange }: { open: boolean; postId: string; onOpenChange: (value: boolean) => void }) => open ? <div role="dialog">Review {postId}<button onClick={() => onOpenChange(false)}>Close</button></div> : null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const rows = table === "posts" ? [
    { id: "generated", caption: "Generated text", created_via: "written_posts", status: "draft", post_media: [] },
    { id: "legacy", caption: "Older text", created_via: null, status: "draft", post_media: [] },
    { id: "published", caption: "Previously published post", created_via: "written_posts", status: "published", post_media: [] },
    { id: "image", caption: "Image caption", created_via: null, post_media: [{ id: "media" }] },
  ] : [];
  const result = { data: rows, error: null };
  const chain: any = { select: () => chain, eq: () => chain, is: () => chain, not: () => chain, like: () => chain, or: () => chain, order: () => Promise.resolve(result), limit: () => Promise.resolve(result) };
  return chain;
} } }));
import { HomeContent } from "./HomeContent";

it("defaults to written content, excludes legacy media captions, and reviews selected drafts separately", async () => {
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeContent workspaceId="gold" /></QueryClientProvider>);
  expect(await screen.findByText("Generated text")).toBeInTheDocument();
  expect(screen.queryByText("Image caption")).not.toBeInTheDocument();
  expect(screen.getByText("Published")).toBeInTheDocument();
  expect(screen.getByRole("tab", { name: "Written" })).toHaveAttribute("aria-selected", "true");
  fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
  fireEvent.click(screen.getByRole("button", { name: "Copy selected (3)" }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith("Generated text\n\n---\n\nOlder text\n\n---\n\nPreviously published post"));
  fireEvent.click(screen.getByRole("button", { name: "Add to Schedule (3)" }));
  expect(schedule).toHaveBeenCalledWith({ writtenIds: ["generated", "legacy", "published"], knownPreviouslyPublished: true });
  const carouselTab = screen.getByRole("tab", { name: "LinkedIn Carousels" });
  fireEvent.mouseDown(carouselTab, { button: 0, ctrlKey: false });
  expect(carouselTab).toHaveAttribute("aria-selected", "true");
  expect(screen.getByText("Carousel library for gold")).toBeInTheDocument();
});

it("moves a legacy post to recoverable Trash", async () => {
  trashState.ids = [];
  trashState.update.mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeContent workspaceId="gold" writtenOnly /></QueryClientProvider>);
  const item = (await screen.findByText("Older text")).closest("article")!;
  fireEvent.click(within(item).getByRole("button", { name: "Move post to Trash" }));
  fireEvent.click(screen.getByRole("button", { name: "Move to Trash" }));
  await waitFor(() => expect(screen.queryByText("Older text")).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: /Trash \(/ })).not.toBeInTheDocument();
  expect(trashState.update).toHaveBeenCalledWith("legacy", true);
  vi.restoreAllMocks();
});
