import { afterEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("./supabase-admin.server", () => auth);
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => ({ inputValidator: () => ({ handler: (handler: unknown) => handler }) }) }));
import { HomeOverviewInput, getHomeOverview } from "./home-overview.functions";
afterEach(() => vi.resetAllMocks());
describe("Home overview endpoint", () => {
  it("accepts only an explicit valid workspace identity", () => {
    expect(HomeOverviewInput.parse({ workspace_id: "11111111-1111-4111-8111-111111111111" })).toEqual({ workspace_id: "11111111-1111-4111-8111-111111111111", view: "home" });
    expect(HomeOverviewInput.parse({ workspace_id: "11111111-1111-4111-8111-111111111111", view: "trash" }).view).toBe("trash");
    expect(() => HomeOverviewInput.parse({ workspace_id: "11111111-1111-4111-8111-111111111111", view: "everything" })).toThrow();
    expect(() => HomeOverviewInput.parse({ workspace_id: "another-business" })).toThrow();
  });
  it("rejects unsigned callers before loading privileged data helpers", async () => {
    auth.requireUser.mockRejectedValue(new Error("Unauthorized"));
    const handler = getHomeOverview as unknown as (context: { data: unknown }) => Promise<unknown>;
    await expect(handler({ data: { workspace_id: "11111111-1111-4111-8111-111111111111" } })).rejects.toThrow("Unauthorized");
  });
});
