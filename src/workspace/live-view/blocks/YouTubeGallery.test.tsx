import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { YouTubeGalleryBlock } from "@/lib/youtube";
import { YouTubeGallery } from "./YouTubeGallery";
const mocks = vi.hoisted(() => ({ videos: vi.fn(), browse: vi.fn(), comments: vi.fn(), selected: vi.fn(), open: vi.fn() }));
vi.mock("@/lib/youtube.functions", () => ({ getYouTubeVideos: mocks.videos, browseYouTube: mocks.browse, getYouTubeComments: mocks.comments }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/workspace/WorkspaceUi", () => ({ useWorkspaceUiOptional: () => ({ openYouTube: mocks.open }) }));
const id = "M7lc1UVf-VE";
const video = { id, title: "A real reference", channelTitle: "Public creator", channelId: "UC123", description: "Creator says this is AI", available: true, embeddable: true };
const block: YouTubeGalleryBlock = { type: "youtube_gallery", title: "Video inspiration", query: "AI video", video_ids: [id], selected_video_id: id };
function show() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><YouTubeGallery b={block} workspaceId="workspace-1" onChange={mocks.selected} /></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); mocks.videos.mockResolvedValue({ videos: [video], fetched_at: "2026-11-04T12:00:00Z" }); });
afterEach(cleanup);
describe("YouTube canvas references", () => {
  it("keeps canvas as a grid and opens full preview only on a user video or author click", async () => {
    show();
    const title = await screen.findByRole("heading", { name: video.title });
    expect(mocks.open).not.toHaveBeenCalled();
    expect(document.querySelector('script[src="https://www.youtube.com/iframe_api"]')).toBeNull();
    fireEvent.click(title);
    expect(mocks.open).toHaveBeenLastCalledWith({ videoIds: [id], selectedVideoId: id, query: "AI video" });
    expect(mocks.selected).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "View channel Public creator" }));
    expect(mocks.open).toHaveBeenLastCalledWith({ channelId: "UC123", query: undefined });
  });
  it("keeps direct YouTube links when metadata fails", async () => {
    mocks.videos.mockRejectedValue(new Error("YouTube quota unavailable"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("YouTube quota unavailable");
    expect(screen.getByRole("link", { name: /Open on YouTube/ })).toHaveAttribute("href", `https://www.youtube.com/watch?v=${id}`);
  });
});
