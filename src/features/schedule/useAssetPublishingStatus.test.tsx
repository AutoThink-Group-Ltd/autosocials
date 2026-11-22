import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { useAssetPublishingStatus, channelStatusLabel, publishedPostLink } from "./useAssetPublishingStatus";

it("shows the real account and target outcome, ignoring unscheduled drafts", async () => {
  const posts = [
    { id: "published", created_via: "social_tile:tile", variant_id: null, status: "partially_published", scheduled_at: "2026-11-12T10:00:00Z", post_targets: [
      { social_account_id: "fb", platform: "facebook", status: "published", published_at: "2026-11-12T10:01:00Z", platform_post_id: "123_456", permalink: "https://facebook.com/123_456", social_accounts: { display_name: "Example Shop", handle: null } },
      { social_account_id: "ig", platform: "instagram", status: "failed", published_at: null, permalink: "https://www.instagram.com/p/example/", social_accounts: { display_name: null, handle: "@gold" } },
    ] },
    { id: "draft", created_via: "social_tile:tile", variant_id: null, status: "draft", scheduled_at: null, post_targets: [{ social_account_id: "draft", platform: "facebook", status: "pending" }] },
  ];
  const chain = { select: () => chain, eq: () => chain, in: () => chain, order: () => chain, range: async () => ({ data: posts, error: null }) };
  mocks.from.mockReturnValue(chain);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useAssetPublishingStatus("workspace", ["tile"]), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.tile).toHaveLength(2);
  expect(channelStatusLabel(result.current.data!.tile![0]!)).toContain("Facebook · Example Shop: Published");
  expect(channelStatusLabel(result.current.data!.tile![1]!)).toContain("Instagram · @gold: Failed");
  expect(publishedPostLink(result.current.data!.tile![0]!)).toBe("https://www.facebook.com/permalink.php?story_fbid=456&id=123");
  expect(publishedPostLink(result.current.data!.tile![1]!)).toBeNull();
});
