import { expect, it, vi } from "vitest";
import { saveUpcomingSchedule } from "./edit-upcoming-schedule.functions";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (validate: (value: unknown) => unknown) => ({
      handler: (handler: (input: { data: unknown }) => unknown) => async ({ data }: { data: unknown }) => handler({ data: validate(data) }),
    }),
  }),
}));
vi.mock("./supabase-admin.server", () => ({
  requireUser: async () => ({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
  getAdminClient: () => ({ rpc }),
}));

it("accepts Supabase timestamps and preserves eight scheduled slots when removing channels", async () => {
  const workspaceId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const facebook = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const x = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
  const linkedin = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const edits = Array.from({ length: 8 }, (_, i) => ({
    id: `11111111-1111-4111-8111-11111111111${i}`,
    expected_updated_at: "2026-11-13T23:41:47.761605+00:00",
    expected_account_ids: [facebook, x, linkedin],
    scheduled_at: i === 7 ? "2099-11-30T10:00:00.000Z" : `2099-11-${23 + i}T09:00:00.551003+00:00`,
    account_ids: [linkedin],
  }));
  rpc.mockResolvedValueOnce({ data: true, error: null }).mockResolvedValueOnce({ data: 8, error: null });
  expect(await saveUpcomingSchedule({ data: { workspaceId, edits } })).toEqual({ saved: 8 });
  expect(rpc).toHaveBeenNthCalledWith(2, "edit_upcoming_schedule", {
    _user_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", _workspace_id: workspaceId, _edits: edits,
  });
  await expect(saveUpcomingSchedule({ data: { workspaceId, edits: [{ ...edits[0]!, scheduled_at: "not-a-date" }] } }))
    .rejects.toThrow("One or more post times are invalid");
  expect(rpc).toHaveBeenCalledTimes(2);
});
