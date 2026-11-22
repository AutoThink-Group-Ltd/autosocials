import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), operation: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("./brand-assets.functions", () => ({ runBrandOperation: mocks.operation }));
import { stockStatusForUser, searchStockForUser, licenseStockForUser } from "./asset-stock.server";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("licensed stock availability", () => {
  it("does not reveal configuration to callers outside the workspace", async () => {
    mocks.rpc.mockResolvedValue({ data: false });
    await expect(stockStatusForUser("user", "workspace")).rejects.toThrow("access");
  });
  it("reports missing setup without calling the provider or making a reservation", async () => {
    mocks.rpc.mockResolvedValue({ data: true }); vi.stubEnv("SHUTTERSTOCK_USER_TOKEN", ""); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(stockStatusForUser("user", "workspace")).resolves.toEqual({ configured: false, entitlement_verified: false });
    await expect(searchStockForUser("user", "workspace", "office")).rejects.toThrow("not connected");
    expect(fetcher).not.toHaveBeenCalled(); expect(mocks.operation).not.toHaveBeenCalled();
  });
  it("does not equate a saved credential with verified entitlement", async () => {
    mocks.rpc.mockResolvedValue({ data: true }); vi.stubEnv("SHUTTERSTOCK_USER_TOKEN", "test-key");
    await expect(stockStatusForUser("user", "workspace")).resolves.toEqual({ configured: true, entitlement_verified: false });
  });
  it("refuses licensing without an explicitly active subscription", async () => {
    mocks.rpc.mockResolvedValue({ data: true }); vi.stubEnv("SHUTTERSTOCK_USER_TOKEN", "test-key");
    mocks.operation.mockImplementation(async (_admin, _ws, _kind, _input, run) => ({ result: await run(), busy: false }));
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [{ id: "expired", is_active: false }] }), { status: 200 })); vi.stubGlobal("fetch", fetcher);
    await expect(licenseStockForUser("user", "workspace", "123")).rejects.toThrow("No active");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][0]).toContain("/user/subscriptions");
  });
  it("reports invalid access without exposing response secrets", async () => {
    mocks.rpc.mockResolvedValue({ data: true }); vi.stubEnv("SHUTTERSTOCK_USER_TOKEN", "test-secret");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private-token", { status: 401 })));
    await expect(searchStockForUser("user", "workspace", "office")).rejects.toThrow("needs reconnecting");
  });
});

const entitlement = () => ({ id: "image-plan", expiration_time: "2027-01-01T00:00:00Z", license: "standard", asset_type: "images", allotment: { start_time: "2026-11-01T00:00:00Z", end_time: "2026-12-01T00:00:00Z", downloads_left: 20 }, formats: [{ size: "huge", media_type: "image" }] });
import { selectImageSubscription } from "./asset-stock.server";
describe("observed image subscription response", () => {
  const now = Date.parse("2026-11-05T12:00:00Z");
  it("accepts the actual response without an is_active field", () => expect(selectImageSubscription([entitlement()], now)?.id).toBe("image-plan"));
  it("uses the eligible subscription expiring first", () => expect(selectImageSubscription([{ ...entitlement(), id: "later", expiration_time: "2028-01-01T00:00:00Z" }, entitlement()], now)?.id).toBe("image-plan"));
  it.each([
    { is_active: false }, { expiration_time: "2026-11-01T00:00:00Z" }, { expiration_time: "unknown" }, { asset_type: "videos" }, { license: undefined }, { formats: [{ size: "small", media_type: "image" }] },
    { allotment: { start_time: "2026-11-01T00:00:00Z", end_time: "2026-12-01T00:00:00Z", downloads_left: 0 } },
    { allotment: { start_time: "2026-12-01T00:00:00Z", end_time: "2027-01-01T00:00:00Z", downloads_left: 2 } },
    { allotment: { start_time: "2026-10-01T00:00:00Z", end_time: "2026-11-01T00:00:00Z", downloads_left: 2 } },
    { allotment: { downloads_left: 2 } },
  ])("rejects expired, exhausted or incompatible entitlement %j", patch => expect(selectImageSubscription([{ ...entitlement(), ...patch }], now)).toBeNull());
  it("rejects unknown subscription shapes", () => { expect(selectImageSubscription(null, now)).toBeNull(); expect(selectImageSubscription([{ is_active: true, id: "unknown" }], now)).toBeNull(); });
});
