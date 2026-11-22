import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { YouTubeBrowser } from "./YouTubeBrowser";
const mocks = vi.hoisted(() => ({ videos: vi.fn(), browse: vi.fn(), comments: vi.fn() }));
vi.mock("@/lib/youtube.functions", () => ({ getYouTubeVideos: mocks.videos, browseYouTube: mocks.browse, getYouTubeComments: mocks.comments }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
const id = "M7lc1UVf-VE";
const video = { id, title: "A real reference", channelTitle: "Public creator", channelId: "UC123", description: "A creator description", available: true, embeddable: true };
const destroy = vi.fn();
const Player = vi.fn(function () { return { destroy, getIframe: () => document.createElement("iframe") }; });
function show(initial?: Parameters<typeof YouTubeBrowser>[0]["initial"]) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const close = vi.fn();
  const result = render(<QueryClientProvider client={client}><YouTubeBrowser workspaceId="workspace-1" initial={initial} onClose={close} /></QueryClientProvider>);
  return { ...result, close };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.videos.mockResolvedValue({ videos: [video], fetched_at: "2026-11-04T12:00:00Z" });
  mocks.browse.mockImplementation(({ data }: { data: { channel_id?: string; page_token?: string } }) => Promise.resolve({ videos: data.page_token ? [{ ...video, id: "dQw4w9WgXcQ", title: "Next page video" }] : [video], next_page_token: data.page_token ? undefined : "page2", fetched_at: "2026-11-04T12:00:00Z", channel: data.channel_id ? { id: "UC123", title: "Public creator" } : undefined }));
  mocks.comments.mockResolvedValue({ comments: [], notice: "Comments disabled" });
  (window as Window & { YT?: unknown }).YT = { Player };
});
afterEach(() => { cleanup(); delete (window as Window & { YT?: unknown }).YT; });
describe("YouTube preview browser", () => {
  it("opens a selected video immediately, with controls and no autoplay; Back restores gallery and scroll", async () => {
    show();
    const title = await screen.findByRole("heading", { name: video.title });
    const scroller = title.closest("article")!.parentElement!.parentElement!;
    scroller.scrollTop = 240;
    fireEvent.click(title);
    await waitFor(() => expect(Player).toHaveBeenCalledOnce());
    const options = (Player.mock.calls[0] as unknown as [HTMLElement, { playerVars: { autoplay: number; controls: number; origin: string }; events: { onError: (event: { data: number }) => void } }])[1];
    expect(options.playerVars).toMatchObject({ autoplay: 0, controls: 1, origin: window.location.origin });
    expect(screen.queryByRole("button", { name: /Load YouTube player/ })).not.toBeInTheDocument();
    expect(mocks.comments).not.toHaveBeenCalled();
    act(() => options.events.onError({ data: 153 }));
    expect(screen.getByRole("alert")).toHaveTextContent("could not identify");
    expect(screen.getByRole("link", { name: /Watch on YouTube/ })).toHaveAttribute("href", `https://www.youtube.com/watch?v=${id}`);
    fireEvent.click(screen.getByRole("button", { name: "Back to previous view" }));
    await screen.findByRole("heading", { name: "Popular on YouTube" });
    expect(destroy).toHaveBeenCalledOnce();
    expect(screen.getByRole("heading", { name: video.title }).closest("article")!.parentElement!.parentElement!.scrollTop).toBe(240);
    expect(mocks.browse).toHaveBeenCalledOnce();
  });
  it("searches from watch, browses author channels, and explicitly paginates", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "View channel Public creator" }));
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledWith({ data: { workspace_id: "workspace-1", query: undefined, channel_id: "UC123", page_token: undefined } }));
    fireEvent.click(await screen.findByRole("button", { name: "Load more videos" }));
    expect(await screen.findByRole("heading", { name: "Next page video" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("heading", { name: video.title }));
    await waitFor(() => expect(Player).toHaveBeenCalled());
    fireEvent.change(screen.getByRole("textbox", { name: "Search YouTube" }), { target: { value: "film references" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByRole("heading", { name: "Results for “film references”" })).toBeInTheDocument();
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledWith({ data: { workspace_id: "workspace-1", query: "film references", channel_id: undefined, page_token: undefined } }));
  });
  it("requests provider sorting and keeps the selected order when returning from watch", async () => {
    show({ query: "property" });
    await screen.findByRole("heading", { name: video.title });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort videos" }), { target: { value: "viewCount" } });
    await waitFor(() => expect(mocks.browse).toHaveBeenCalledWith({ data: { workspace_id: "workspace-1", query: "property", channel_id: undefined, page_token: undefined, order: "viewCount" } }));
    fireEvent.click(await screen.findByRole("heading", { name: video.title }));
    expect(await screen.findByText("Dislikes unavailable")).toBeVisible();
    expect(screen.getByText("Published date/time unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Back to previous view" }));
    expect(screen.getByRole("combobox", { name: "Sort videos" })).toHaveValue("viewCount");
  });
  it("honours a reopened Home request and returns to work", async () => {
    const result = show({ videoIds: [id], selectedVideoId: id, query: "references" });
    await screen.findByRole("heading", { name: video.title });
    expect(mocks.videos).toHaveBeenCalledOnce();
    const client = new QueryClient();
    result.rerender(<QueryClientProvider client={client}><YouTubeBrowser workspaceId="workspace-1" initial={{}} onClose={result.close} /></QueryClientProvider>);
    expect(await screen.findByRole("heading", { name: "Popular on YouTube" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close YouTube and return to work" }));
    expect(result.close).toHaveBeenCalledOnce();
  });
});
