import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";
const mocks = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: mocks.from } }));
import { useAssetPublishingStatus } from "./useAssetPublishingStatus";
it("loads publishing history for text-only written sources", async () => {
  const requests: unknown[] = [];
  const posts = [{ created_via: "written_post:post", variant_id: null, status: "scheduled", scheduled_at: "2030-01-01T10:00:00Z", post_targets: [{ social_account_id: "fb", platform: "facebook", status: "pending", published_at: null, social_accounts: { display_name: "Page", handle: null } }] }];
  const chain = { select: () => chain, eq: () => chain, in: async (column: string, values: unknown) => { requests.push(values); return { data: column === "created_via" ? posts : [{ id: "post", created_via: "written_posts", variant_id: null, status: "published", scheduled_at: null, post_targets: [{ social_account_id: "li", platform: "linkedin", status: "published", published_at: "2030-01-02T10:00:00Z", social_accounts: { display_name: "Profile", handle: null } }] }], error: null }; } };
  mocks.from.mockReturnValue(chain);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useAssetPublishingStatus("workspace", [], [], ["post"]), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(requests).toEqual([["written_post:post"], ["post"]]);
  expect(result.current.data?.post).toMatchObject([{ accountId: "fb", status: "pending" }, { accountId: "li", status: "published" }]);
});

it("warns when a published original has no available channel history", async () => {
  const chain = { select: () => chain, eq: () => chain, in: async (column: string) => ({ data: column === "id" ? [{ id: "post", created_via: "written_posts", variant_id: null, status: "published", scheduled_at: null, published_at: "2030-01-02T10:00:00Z", post_targets: [] }] : [], error: null }) };
  mocks.from.mockReturnValue(chain);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result } = renderHook(() => useAssetPublishingStatus("workspace", [], [], ["post"]), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.post).toMatchObject([{ account: "Channel history unavailable", status: "published" }]);
});
