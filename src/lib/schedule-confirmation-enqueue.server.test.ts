import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), dispatch: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("./schedule-confirmation-dispatch.server", () => ({ dispatchScheduleConfirmation: mocks.dispatch }));
import { enqueueScheduleConfirmation } from "./schedule-confirmation-enqueue.server";

describe("schedule confirmation snapshots", () => {
  it("uses receipt snapshots rather than subsequently edited posts", async () => {
    const seen: string[] = [];
    mocks.from.mockImplementation((table: string) => {
      seen.push(table);
      const data: Record<string, unknown> = {
        creation_schedule_requests: { workspace_id: "workspace", user_id: "user", expected_count: 1 },
        creation_schedule_receipts: [{ post_id: "post", immediate_at: null }],
        schedule_confirmation_items: [{ post_id: "post", snapshot: { title: "Original title", scheduledAt: "2026-11-20T09:00:00Z", channels: ["facebook"], mediaKind: "video" } }],
        workspaces: { name: "Brand", timezone: "UTC" },
      };
      const chain: any = { select: () => chain, eq: () => chain, single: async () => ({ data: data[table], error: null }), maybeSingle: async () => ({ data: data[table], error: null }), then: (resolve: any) => resolve({ data: data[table], error: null }) };
      return chain;
    });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.dispatch.mockResolvedValue(undefined);
    await enqueueScheduleConfirmation("request", "workspace", "user", "owner@example.test");
    expect(seen).not.toContain("posts");
    expect(mocks.rpc).toHaveBeenCalledWith("finalize_schedule_confirmation", expect.objectContaining({ _payload: expect.objectContaining({ items: [expect.objectContaining({ title: "Original title" })] }) }));
  });
});
