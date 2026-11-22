import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CampaignsSurface } from "@/features/campaigns/CampaignsSurface";
import { WinnersSurface } from "./WinnersSurface";

const calls = vi.hoisted(() => ({ get: vi.fn(), comments: vi.fn(), select: vi.fn(), sync: vi.fn(), dismiss: vi.fn(), analyse: vi.fn() }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ currentWorkspace: { id: "workspace-a" } }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: calls.sync } } }));
vi.mock("@/lib/winners.functions", () => ({ getWinners: calls.get, getWinnerComments: calls.comments, updateWinnerShortlist: calls.select, dismissWinnerFinding: calls.dismiss, refreshWinnerFindings: calls.analyse }));
vi.mock("@/lib/router-compat", () => ({ Link: ({ children, to }: { children: React.ReactNode; to: string }) => <a href={to}>{children}</a> }));

describe("Find winners", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    calls.get.mockResolvedValue({ accounts: [{ id: "acct", platform: "instagram", handle: "example", status: "disconnected", is_enabled: false }], syncs: [], findings: [], shortlist: [], truncated: false, posts: [
      { id: "p1", account_id: "acct", platform: "instagram", caption: "A useful post", format: "video", thumbnail_url: null, permalink: "https://instagram.com/p/1", published_at: new Date(Date.now() - 3 * 86400000).toISOString(), measured_at: new Date().toISOString(), views: null, reach: null, likes: 12, comments_count: 1, shares: null, comments: [{ text: "Great question" }], comments_status: "available" },
    ] });
    calls.select.mockResolvedValue({ updated: 1 });
    calls.comments.mockResolvedValue({ status: "available", comments: [{ text: "Great question" }] });
  });
  function show() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WinnersSurface /></QueryClientProvider>); }
  it("shows real counts, missing metrics and comments", async () => {
    show();
    expect(await screen.findByText("A useful post")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View details and comments" }));
    expect(await screen.findByText("Great question")).toBeInTheDocument();
    expect(calls.sync).not.toHaveBeenCalled();
  });
  it("finds a post by provider title even when its caption differs", async () => {
    const data = await calls.get();
    calls.get.mockResolvedValueOnce({ ...data, posts: [{ ...data.posts[0], title: "Topical authority" }] });
    show();
    const field = await screen.findByRole("searchbox");
    fireEvent.change(field, { target: { value: "  AUTHor  " } });
    expect(screen.getByText("A useful post")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "absent" } });
    expect(screen.queryByText("A useful post")).not.toBeInTheDocument();
  });
  it("uses the actual TikTok player when its cover fails", async () => {
    const data = await calls.get();
    calls.get.mockResolvedValueOnce({ ...data, posts: [{ ...data.posts[0], platform: "tiktok", external_id: "12345", permalink: "https://www.tiktok.com/@example/video/12345", thumbnail_url: "https://example.com/expired.jpg" }] });
    show();
    fireEvent.error(await screen.findByRole("presentation"));
    expect(screen.getByRole("link", { name: /Watch on TikTok/ })).toHaveAttribute("href", "https://www.tiktok.com/@example/video/12345");
    expect(screen.getByTitle("A useful post")).toHaveAttribute("src", "https://www.tiktok.com/player/v1/12345?autoplay=0");
  });
  it("sends selected posts to the workspace shortlist only", async () => {
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Shortlist for ads" }));
    await waitFor(() => expect(calls.select).toHaveBeenCalledWith({ data: { workspace_id: "workspace-a", post_ids: ["p1"], selected: true } }));
  });
  it("shows an older post in the gallery and carries its saved selection into Launch ads", async () => {
    const dashboard = await calls.get();
    const post = { ...dashboard.posts[0], published_at: "2020-01-01T12:00:00Z" };
    calls.get.mockResolvedValue({ ...dashboard, posts: [post] });
    calls.select.mockImplementationOnce(async () => {
      calls.get.mockResolvedValue({ ...dashboard, posts: [post], shortlist: [{ winner_post_id: post.id, winner_posts: post }] });
      return { updated: 1 };
    });
    const client = new QueryClient();
    const view = render(<QueryClientProvider client={client}><WinnersSurface /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "Shortlist for ads" }));
    expect(await screen.findByRole("button", { name: "Shortlisted" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Ad shortlist (1)" })).toHaveAttribute("href", "/app/campaigns");
    view.rerender(<QueryClientProvider client={client}><CampaignsSurface /></QueryClientProvider>);
    expect(await screen.findByText(post.caption)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remove" })).toBeInTheDocument();
  });
});
