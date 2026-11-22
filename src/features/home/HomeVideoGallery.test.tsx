import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ openSchedule: vi.fn(), from: vi.fn(), playback: vi.fn(async () => ({ url: "https://example.test/video", download_url: "https://example.test/download" })), versions: vi.fn(async ({ data }: any) => ({ asset: { primary_render_id: data.id === "variant-ready" ? "ready" : "draft", review_state: data.id === "variant-ready" ? "approved" : "draft" } })), review: vi.fn(async () => ({ ok: true })) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a href="/app/sam-creations">{children}</a> }));
vi.mock("@/features/schedule/ScheduleDialogHost", () => ({ useScheduleDialog: () => ({ addToSchedule: mocks.openSchedule }) }));
vi.mock("@/features/schedule/useAssetPublishingStatus", () => ({ useAssetPublishingStatus: () => ({ isSuccess: true, data: {} }), channelStatusLabel: () => "Published" }));
vi.mock("@/lib/asset-versions.functions", () => ({ getAssetVersionPlayback: mocks.playback, getAssetVersions: mocks.versions }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
vi.mock("@/lib/creative.functions", () => ({ reviewVariant: mocks.review }));
import { HomeVideoGallery } from "./HomeVideoGallery";

it("schedules only approved primary versions using variant IDs", async () => {
  const video = (id: string, variant: string, review: string, primary: string) => ({ id, variant_id: variant, created_at: "2026-11-15T00:00:00Z", brief_snapshot: { hook: id }, creative_variants: { hook: id, size: "1080x1920", duration_s: 30, review_state: review, primary_render_id: primary } });
  const data = [video("ready", "variant-ready", "approved", "ready"), video("old", "variant-ready", "approved", "ready"), video("draft", "variant-draft", "draft", "draft")];
  const chain: any = { select: () => chain, eq: () => chain, not: () => chain, order: () => chain, range: async () => ({ data, error: null }) };
  mocks.from.mockReturnValue(chain);
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeVideoGallery workspaceId="workspace" /></QueryClientProvider>);
  const ready = await screen.findByRole("checkbox", { name: "Select ready" });
  expect(ready).toBeEnabled();
  expect(screen.getByRole("checkbox", { name: "Select old" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Add draft to Schedule" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Add ready to Schedule" }));
  await vi.waitFor(() => expect(mocks.openSchedule).toHaveBeenCalledWith({ videoIds: ["variant-ready"] }));
  fireEvent.click(ready);
  expect(screen.getByRole("checkbox", { name: "Select old" })).not.toBeChecked();
  mocks.openSchedule.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "Add to Schedule (1)" }));
  await vi.waitFor(() => expect(mocks.openSchedule).toHaveBeenLastCalledWith({ videoIds: ["variant-ready"] }));
  const card = ready.closest("article")!;
  expect(within(card).getByRole("button", { name: "Share ready" })).toBeEnabled();
  expect(within(card).getByRole("link", { name: "Download ready" })).toHaveAttribute("href", "https://example.test/download");
});

it("adds a finished draft video directly without an approval step", async () => {
  const video = { id: "draft", variant_id: "variant-draft", created_at: "2026-11-15", brief_snapshot: { hook: "Draft" }, creative_variants: { hook: "Draft", size: "1080x1920", duration_s: 30, review_state: "draft", primary_render_id: null } };
  const chain: any = { select: () => chain, eq: () => chain, not: () => chain, order: () => chain, range: async () => ({ data: [video], error: null }) };
  mocks.from.mockReturnValue(chain); mocks.openSchedule.mockClear(); mocks.review.mockClear();
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><HomeVideoGallery workspaceId="workspace" /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole("checkbox", { name: "Select Draft" }));
  fireEvent.click(screen.getByRole("button", { name: "Add to Schedule (1)" }));
  await vi.waitFor(() => expect(mocks.openSchedule).toHaveBeenCalledWith({ videoIds: ["variant-draft"] }));
  expect(mocks.review).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog", { name: "Review video before scheduling" })).not.toBeInTheDocument();
});
