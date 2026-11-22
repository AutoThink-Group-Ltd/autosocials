import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock("@/features/schedule/ScheduleDialogHost", () => ({ useScheduleDialog: () => ({ addToSchedule: mocks.open }) }));
vi.mock("@/features/schedule/useAssetPublishingStatus", () => ({ channelStatusLabel: (item: {status: string}) => item.status === "published" ? "Published" : "Scheduled", useAssetPublishingStatus: () => ({ isSuccess: true, data: { scheduled: [{ status: "pending", date: "2026-11-18T10:00:00Z" }], published: [{ status: "published", date: "2026-11-13T10:00:00Z" }] } }) }));
vi.mock("@/integrations/supabase/client", () => {
  const items = ["scheduled", "published"].map(id => ({ id, name: `${id}.png`, storage_path: `gold/${id}.png`, created_at: "2026-11-13" }));
  const chain: any = { select: () => chain, eq: () => chain, order: () => chain, range: async () => ({ data: items, error: null }) };
  return { supabase: { from: () => chain, storage: { from: () => ({ list: async () => ({ data: [], error: null }), createSignedUrl: async () => ({ data: { signedUrl: "https://example.test/image" }, error: null }) }) } } };
});
import { HomeSocialTiles } from "./HomeSocialTiles";

it("labels scheduled and published tiles while allowing explicit add", async () => {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeSocialTiles workspaceId="gold" /></QueryClientProvider>);
  expect(await screen.findByText("Ready to create something new?")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Create a narrative" })).toHaveAttribute("href", "/app/create");
  fireEvent.click(screen.getByRole("tab", { name: "Scheduled" }));
  const image = await screen.findByRole("img", { name: "scheduled.png" });
  expect(image.className).not.toContain("opacity");
  expect(within(image.closest("article")!).getByText("Scheduled")).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Select for scheduling" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Published" }));
  expect(await screen.findByRole("img", { name: "published.png" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: "Select for scheduling" })).toBeInTheDocument();
});
