import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), signed: vi.fn(), openSchedule: vi.fn() }));
vi.mock("@/features/schedule/ScheduleDialogHost", () => ({ useScheduleDialog: () => ({ addToSchedule: mocks.openSchedule }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from, storage: { from: () => ({ list: async () => ({ data: [], error: null }), createSignedUrl: mocks.signed }) } } }));
vi.mock("@/features/schedule/CreationScheduleDialog", () => ({ CreationScheduleDialog: ({ initialTileIds, workspaceId, timezone, accounts, onOpenChange }: any) => <div role="dialog" aria-label="Publish content"><span>{workspaceId}:{timezone}:{initialTileIds.join(",")}:{accounts.length}</span><button onClick={() => onOpenChange(false)}>Close scheduler</button></div> }));
vi.mock("@/features/schedule/useAssetPublishingStatus", () => ({ useAssetPublishingStatus: () => ({ isSuccess: true, data: {} }), channelStatusLabel: () => "Published" }));
vi.mock("@/features/schedule/TileFeedPreview", () => ({ TileFeedPreview: ({ title, imageUrl }: { title: string; imageUrl: string }) => <div><p>Channel preview</p><img src={imageUrl} alt={title + ".png"} /></div> }));
import { HomeSocialTiles } from "./HomeSocialTiles";

it("shows workspace social tiles with uncropped previews and original download links", async () => {
  const chain: any = { select: () => chain, eq: () => chain, order: () => chain, range: async () => ({ data: [{ id: "tile", name: "Gold.png", storage_path: "gold/social-tiles/tile.png", created_at: "2026-11-13" }], error: null }) };
  mocks.from.mockReturnValue(chain);
  mocks.signed.mockImplementation(async (_path, _seconds, options) => ({ data: { signedUrl: options ? "https://example.test/download" : "https://example.test/image" }, error: null }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeSocialTiles workspaceId="gold" /></QueryClientProvider>);
  expect(await screen.findByRole("img", { name: "Gold.png" })).toHaveAttribute("src", "https://example.test/image");
  expect(screen.getByRole("link", { name: "Download Gold.png" })).toHaveAttribute("href", "https://example.test/download");
  expect(screen.getByRole("button", { name: "Share Gold.png" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Open Gold.png preview" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("Channel preview")).toBeInTheDocument();
  expect(within(dialog).getByRole("img", { name: "Gold.png" })).toHaveAttribute("src", "https://example.test/image");
  expect(within(dialog).getByRole("link", { name: "Download Gold.png" })).toHaveAttribute("href", "https://example.test/download");
  expect(within(dialog).getByRole("button", { name: "Share Gold.png" })).toBeEnabled();
});

it("navigates between designs and updates their actions", async () => {
  const items = [{ id: "one", name: "One.png", storage_path: "gold/one.png", created_at: "2026-11-13" }, { id: "two", name: "Two.png", storage_path: "gold/two.png", created_at: "2026-11-12" }];
  const chain: any = { select: () => chain, eq: () => chain, order: () => chain, range: async () => ({ data: items, error: null }) };
  mocks.from.mockReturnValue(chain);
  mocks.signed.mockImplementation(async (path, _seconds, options) => ({ data: { signedUrl: "https://example.test/" + (options ? "download/" : "") + path }, error: null }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeSocialTiles workspaceId="gold" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Open One.png preview" }));
  expect(within(await screen.findByRole("dialog")).getByRole("button", { name: "Previous design" })).toBeDisabled();
  fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Next design" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByRole("img", { name: "Two.png" })).toBeInTheDocument();
  expect(within(dialog).getByRole("link", { name: "Download Two.png" })).toHaveAttribute("href", "https://example.test/download/gold/two.png");
  fireEvent.keyDown(dialog, { key: "ArrowLeft" });
  expect(within(await screen.findByRole("dialog")).getByRole("img", { name: "One.png" })).toBeInTheDocument();
});

it("opens the shared scheduler on Home with the selected tiles and workspace context", async () => {
  const items = [{ id: "one", name: "One.png", storage_path: "gold/one.png", created_at: "2026-11-13" }, { id: "two", name: "Two.png", storage_path: "gold/two.png", created_at: "2026-11-12" }];
  mocks.from.mockImplementation((table: string) => {
    if (table === "workspaces") { const chain: any = { select: () => chain, eq: () => chain, single: async () => ({ data: { timezone: "Europe/London" }, error: null }) }; return chain; }
    if (table === "social_accounts") { const chain: any = { select: () => chain, eq: () => chain, in: () => chain, order: async () => ({ data: [{ id: "account", platform: "facebook", display_name: "Page", handle: null, status: "connected", is_enabled: true, expires_at: null }], error: null }) }; return chain; }
    const chain: any = { select: () => chain, eq: () => chain, order: () => chain, range: async () => ({ data: items, error: null }) }; return chain;
  });
  mocks.signed.mockResolvedValue({ data: { signedUrl: "https://example.test/image" }, error: null });
  const path = window.location.pathname;
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeSocialTiles workspaceId="gold" /></QueryClientProvider>);
  fireEvent.click((await screen.findAllByRole("checkbox", { name: "Select for scheduling" }))[0]!);
  fireEvent.click(screen.getByRole("button", { name: "Add to Schedule (1)" }));
  expect(mocks.openSchedule).toHaveBeenCalledWith({ tileIds: ["one"] });
  expect(window.location.pathname).toBe(path);
  expect(screen.getByRole("button", { name: "Add to Schedule (1)" })).toBeEnabled();
});
