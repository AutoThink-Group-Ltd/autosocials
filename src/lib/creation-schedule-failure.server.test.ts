import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), send: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: mocks.admin }));
vi.mock("./email-layout.server", () => ({ FROM: { email: "admin@example.test" }, renderEmail: () => ({ html: "alert", text: "alert" }), sendViaSendGrid: mocks.send }));
import { recordCreationScheduleFailure, scheduleFailureCategory } from "./creation-schedule-failure.server";

describe("schedule failure categorisation", () => {
  it("categorises failures without returning raw provider content", () => {
    expect(scheduleFailureCategory(new Error("Instagram provider failed with token=secret"))).toBe("provider");
    expect(scheduleFailureCategory(new Error("Workspace access denied"))).toBe("access");
    expect(scheduleFailureCategory(new Error("The tile image is unavailable"))).toBe("media");
    expect(scheduleFailureCategory(new Error("unexpected private caption"))).toBe("other");
  });
  it("records categorised failures and alerts administrators without including provider messages", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const admin = { from: (table: string) => table === "creation_schedule_failure_events" ? { insert } : table === "platform_alert_log" ? { upsert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { alert_type: "claimed" }, error: null }) }) }) } : { select: () => ({ eq: async () => ({ data: [{ user_id: "admin" }] }) }) }, auth: { admin: { listUsers: async () => ({ data: { users: [{ id: "admin", email: "admin@example.test" }] }, error: null }) } } };
    mocks.admin.mockReturnValue(admin);
    await recordCreationScheduleFailure({ workspaceId: "workspace", requestId: "request", actorId: "actor", stage: "confirm", error: new Error("Instagram token=secret") });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ category: "provider", stage: "confirm" }));
    expect(JSON.stringify(insert.mock.calls)).not.toContain("secret");
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: "admin@example.test", subject: "AutoSocials: scheduling needs attention" }));
  });
});
