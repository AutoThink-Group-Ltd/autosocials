import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ add: vi.fn(), scheduled: false }));
vi.mock("@/contexts/WorkspaceContext", () => ({useWorkspace: () => ({currentWorkspace:null})}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/linkedin-carousel.functions", () => ({ listLinkedInCarousels: vi.fn(async () => []), getLinkedInCarousel: vi.fn() }));
vi.mock("@/lib/creation-schedule.functions", () => ({ getTileChannelCaption: vi.fn(async () => ({caption:"Channel draft"})), getScheduleTileCaptions: vi.fn(async () => ({ new: { platform: "linkedin", caption: "Approved copy" } })) }));
vi.mock("@/lib/asset-versions.functions", () => ({ getAssetVersionPlayback: vi.fn(async () => ({url: "https://example.test/video"})) }));
vi.mock("@/lib/creative.functions", () => ({ reviewVariant: vi.fn() }));
vi.mock("./ScheduleDialogHost", () => ({ useScheduleDialog: () => ({ addToSchedule: state.add }) }));
vi.mock("@/components/publishing/ComposerDrawer", () => ({
  ComposerDrawer: ({ postId }: { postId: string }) => <div role="dialog" aria-label="Scheduled post editor">{postId}</div>,
}));
vi.mock("./useAssetPublishingStatus", async importOriginal => ({
  ...await importOriginal<typeof import("./useAssetPublishingStatus")>(),
  useAssetPublishingStatus: () => ({
    isPending: false,
    isSuccess: true,
    data: {
      ...(state.scheduled ? { new: [{ postId: "scheduled-post", postStatus: "scheduled", accountId: "account", platform: "facebook", account: "Example Shop", status: "pending", date: "2030-11-19T13:00:00Z" }] } : {}),
      old: [{ postId: "published-post", accountId: "account", platform: "facebook", account: "Example Shop", status: "published", date: "2026-11-19T13:00:00Z", platformPostId: "123_456", permalink: "https://facebook.com/123_456" }],
    },
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
 const data = table === "brand_files" ? [{id:"new", name:"New.png", storage_path:"ws/new.png"}, {id:"old", name:"Old.png", storage_path:"ws/old.png"}] : table === "posts" ? [{ id:"checklist", caption:"A VC’s checklist for marketing systems", status:"draft", post_media:[], created_via:null }] : [];
 const q: any = {select:()=>q, eq:()=>q, not:()=>q, is:()=>q, in:()=>q, or:()=>q, order:()=>q, range:async()=>({data,error:null})}; return q;
}, storage:{from:()=>({createSignedUrls:async()=>({data:[]})})} } }));
import { ScheduleAssetGallery } from "./ScheduleAssetGallery";
it("separates published assets and adds through the shared scheduling host", async () => {
 state.add.mockClear(); render(<QueryClientProvider client={new QueryClient()}><ScheduleAssetGallery workspaceId="ws" trashedKeys={new Set(["written:checklist"])} selected={[]} /></QueryClientProvider>);
 const gallery = screen.getByRole("region", {name:"Asset gallery"});
 expect(within(gallery).getByRole("tab", { name: "Scheduled" })).toHaveAttribute("aria-selected", "true");
 fireEvent.click(within(gallery).getByRole("tab", { name: "Not scheduled" }));
 expect(await within(gallery).findByText("New")).toBeInTheDocument();
 expect(within(gallery).queryByText(/VC’s checklist/)).toBeNull();
 expect(within(gallery).queryByText("Old")).not.toBeInTheDocument();
 fireEvent.click(within(gallery).getByRole("button", {name:"Add to schedule"}));
 expect(state.add).toHaveBeenCalledWith({tileIds:["new"]});
 fireEvent.click(within(gallery).getByRole("tab", {name:"Published"}));
 expect(await within(gallery).findByText("Old")).toBeInTheDocument();
 expect(within(gallery).getByText(/Facebook · Example Shop: Published/)).toBeInTheDocument();
 fireEvent.click(within(gallery).getByRole("button", {name:"Add to schedule"}));
 expect(state.add).toHaveBeenLastCalledWith({tileIds:["old"]});
});

it("opens a larger asset preview without changing the schedule", async () => {
 state.add.mockClear(); render(<QueryClientProvider client={new QueryClient()}><ScheduleAssetGallery workspaceId="ws" selected={[]} /></QueryClientProvider>);
 fireEvent.click(screen.getByRole("tab", {name:"Not scheduled"}));
 fireEvent.click(await screen.findByRole("button", {name:"Expand New"}));
 const dialog = await screen.findByRole("dialog", {name:"New"});
 expect(within(dialog).getByText("No publishing record for LinkedIn.")).toBeInTheDocument();
 expect(within(dialog).getByText("Approved copy")).toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button", { name: "Instagram" }));
 expect(await within(dialog).findByText("Channel draft")).toBeInTheDocument();
 fireEvent.click(within(dialog).getByRole("button", { name: "LinkedIn" }));
 expect(within(dialog).getByText("Approved copy")).toBeInTheDocument();
 expect(state.add).not.toHaveBeenCalled();
});

it("opens the published Facebook Page post directly from its preview", async () => {
  render(<QueryClientProvider client={new QueryClient()}><ScheduleAssetGallery workspaceId="ws" selected={[]} /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("tab", { name: "Published" }));
  fireEvent.click(await screen.findByRole("button", { name: "Expand Old" }));
  const dialog = within(await screen.findByRole("dialog", { name: "Old" }));
  expect(dialog.queryByRole("link", { name: /Open post/ })).toBeNull();
  fireEvent.click(dialog.getByRole("button", { name: "Facebook" }));
  expect(dialog.getByText("Facebook · Example Shop (Page): Published")).toBeInTheDocument();
  expect(dialog.getByText("Post ID 123_456")).toBeInTheDocument();
  const link = dialog.getByRole("link", { name: /Open post on Facebook/ });
  expect(link).toHaveAttribute("href", "https://www.facebook.com/permalink.php?story_fbid=456&id=123");
  expect(link).toHaveAttribute("target", "_blank");
});

it("opens the saved post from a scheduled tile without adding another post", async () => {
  state.scheduled = true;
  state.add.mockClear();
  try {
    render(<QueryClientProvider client={new QueryClient()}><ScheduleAssetGallery workspaceId="ws" selected={[]} /></QueryClientProvider>);
    await screen.findByRole("button", { name: "Expand New" });
    expect(screen.queryByRole("button", { name: "Add to schedule" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Open scheduled post" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", {name:"Not scheduled"}));
    expect(screen.queryByRole("button", {name:"Expand New"})).toBeNull();
    fireEvent.click(screen.getByRole("tab", {name:"Scheduled"}));
    fireEvent.click(screen.getByRole("button", {name:"Expand New"}));
    expect(await screen.findByRole("dialog", { name: "Scheduled post editor" })).toHaveTextContent("scheduled-post");
    expect(state.add).not.toHaveBeenCalled();
  } finally {
    state.scheduled = false;
  }
});
