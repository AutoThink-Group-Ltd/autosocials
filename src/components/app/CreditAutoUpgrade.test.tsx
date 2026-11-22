import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  status: { enabled: false, ready: false, owner: true, payment_ready: false },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: mocks.status, isError: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: vi.fn() } },
}));
import { CreditAutoUpgrade } from "./CreditAutoUpgrade";

describe("automatic upgrades", () => {
  it("fails closed while the payment worker is not ready", () => {
    render(<CreditAutoUpgrade workspaceId="workspace" isFree />);
    expect(
      screen.getByRole("switch", { name: "Automatic upgrades" }),
    ).toBeDisabled();
    expect(
      screen.getByText(/prorated Starter price/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /set up payment/i }),
    ).not.toBeInTheDocument();
  });
  it("still permits an owner to turn off an enabled setting if readiness is withdrawn", () => {
    mocks.status.enabled = true;
    render(<CreditAutoUpgrade workspaceId="workspace" isFree />);
    expect(screen.getByRole("switch", { name: "Automatic upgrades" })).toBeEnabled();
    mocks.status.enabled = false;
  });
});
