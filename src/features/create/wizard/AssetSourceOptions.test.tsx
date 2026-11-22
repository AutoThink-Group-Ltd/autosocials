import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ status: vi.fn().mockResolvedValue({ configured: false, entitlement_verified: false }), search: vi.fn(), license: vi.fn(), capture: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/asset-stock.functions", () => ({ getAssetStockStatus: mocks.status, searchAssetStock: mocks.search, licenseAssetStock: mocks.license }));
vi.mock("@/lib/asset-capture.functions", () => ({ capturePublicApp: mocks.capture }));
import { AssetSourceOptions } from "./AssetSourceOptions";
describe("stock source setup", () => {
  it("shows a clear unavailable state instead of a broken search when no credential exists", async () => {
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><AssetSourceOptions ws="workspace" allowCapture={false} onImported={vi.fn()} /></QueryClientProvider>);
    await waitFor(() => expect(mocks.status).toHaveBeenCalled());
    expect(await screen.findByText(/Licensed stock is not connected yet/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Search", exact: true })).not.toBeInTheDocument();
    expect(mocks.search).not.toHaveBeenCalled(); expect(mocks.license).not.toHaveBeenCalled();
  });
});
