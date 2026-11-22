import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ open: vi.fn(), feed: vi.fn() }));
vi.mock("@/components/publishing/NativeAccountFeed", () => ({ NativeAccountFeed: (props: unknown) => { mocks.feed(props); return <div>Feed content</div>; } }));
vi.mock("@/integrations/supabase/client", () => {
  const accounts = ["facebook", "instagram", "x", "youtube", "tiktok"].map(platform => ({ id: platform, platform, display_name: "Example Shop", handle: platform, avatar_url: null, expires_at: platform === "x" ? "2020-01-01" : null }));
  const chain: any = { select: () => chain, eq: () => chain, in: () => chain, order: async () => ({ data: accounts, error: null }) };
  return { supabase: { from: () => chain } };
});
import { HomeChannelFeeds, HomeChannelFeedPane, SavedChannelFeedPane } from "./HomeChannelFeeds";

it("offers each connected platform and opens the X feed with its own identity", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeChannelFeeds workspaceId="workspace" onOpen={mocks.open} /></QueryClientProvider>);
  for (const platform of ["Facebook", "Instagram", "X", "YouTube", "TikTok"]) expect(await screen.findByRole("button", { name: `Open ${platform} feed for Example Shop` })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Open X feed for Example Shop" }));
  expect(mocks.open).toHaveBeenCalledWith(expect.objectContaining({ id: "x", platform: "x" }));
  render(<HomeChannelFeedPane account={mocks.open.mock.calls[0]![0]} onClose={() => {}} />);
  expect(screen.getByRole("heading", { name: "X feed" })).toBeInTheDocument();
  expect(mocks.feed).toHaveBeenCalledWith(expect.objectContaining({ socialAccountId: "x", platform: "x" }));
});

it("uses connected channels before saved profile fallbacks", async () => {
  const profiles = ["x", "substack"].map(platform => ({ platform: platform as "x" | "substack", handle: "gold", url: null, status: "empty", posts: [] }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeChannelFeeds workspaceId="workspace" onOpen={mocks.open} onOpenSaved={vi.fn()} profiles={profiles} /></QueryClientProvider>);
  expect(await screen.findByRole("button", { name: "Open X feed for Example Shop" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /open x saved profile/i })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /open substack saved profile/i })).toBeInTheDocument();
});

it("links directly to the LinkedIn post from its feed card", () => {
  const url = "https://www.linkedin.com/feed/update/urn:li:activity:123/";
  render(<QueryClientProvider client={new QueryClient()}><SavedChannelFeedPane workspaceId="ws"
    profile={{ platform:"linkedin", handle:"creator", url:null, status:"available", posts:[{ url, date:null, caption:"Test post", cover:null }] }}
    toolbar={null} refreshing={false} onRefresh={() => {}} onClose={() => {}} /></QueryClientProvider>);
  const link = screen.getByRole("link", { name:/Open original post/ });
  expect(link).toHaveAttribute("href", url);
  expect(link).toHaveAttribute("target", "_blank");
});
