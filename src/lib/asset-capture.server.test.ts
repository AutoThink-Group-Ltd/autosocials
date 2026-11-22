import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), reserve: vi.fn(), download: vi.fn() }));
vi.mock("./supabase-admin.server", () => ({ getAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("./brand-assets.functions", () => ({ runBrandOperation: mocks.reserve }));
vi.mock("./brand-discovery.server", () => ({ publicBrandWebsite: (url: string) => url.startsWith("https://public.example/") ? url : null }));
vi.mock("./creative-media.server", () => ({ downloadCreativeMedia: mocks.download }));
import { capturePublicAppForUser } from "./asset-capture.server";
import { licenseStockForUser, searchStockForUser } from "./asset-stock.server";
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
describe("asset acquisition authorization", () => {
  it.each(["capture", "stock-search", "stock-license"])("rejects %s before provider calls or reservations", async action => {
    mocks.rpc.mockResolvedValue({ data: false }); const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const call = action === "capture" ? capturePublicAppForUser("user", "workspace", "https://public.example/app") : action === "stock-search" ? searchStockForUser("user", "workspace", "office") : licenseStockForUser("user", "workspace", "123");
    await expect(call).rejects.toThrow("access"); expect(fetcher).not.toHaveBeenCalled(); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("does not submit capture for nonpublic URLs", async () => {
    mocks.rpc.mockResolvedValue({ data: true }); await expect(capturePublicAppForUser("user", "workspace", "http://127.0.0.1/private")).rejects.toThrow("public HTTPS"); expect(mocks.reserve).not.toHaveBeenCalled();
  });
  it("fails clearly when hosted capture is not configured", async () => {
    mocks.rpc.mockResolvedValue({ data: true }); vi.stubEnv("FIRECRAWL_API_KEY", ""); await expect(capturePublicAppForUser("user", "workspace", "https://public.example/app")).rejects.toThrow("not connected"); expect(mocks.reserve).not.toHaveBeenCalled();
  });
});
