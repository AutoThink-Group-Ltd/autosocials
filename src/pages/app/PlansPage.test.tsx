import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), checkout: vi.fn(), refetch: vi.fn() }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ currentWorkspace: { id: "workspace", name: "Brand" } }) }));
vi.mock("@/lib/router-compat", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock("@/hooks/useSubscription", () => ({ createCheckoutSession: mocks.checkout, useSubscription: () => ({ subscribed: true, isLoading: false, auth_unavailable: false, planKey: "starter", refetch: mocks.refetch }) }));
vi.mock("@/components/pricing/ContentCreditPlans", () => ({ ContentCreditPlans: ({ onSelect }: { onSelect: (plan: unknown) => void }) => <button onClick={() => onSelect({ key: "growth", name: "Growth" })}>Select Growth</button> }));
import PlansPage from "./PlansPage";

describe("monthly plan changes", () => {
  it("does not offer confirmation when the preview fails", async () => {
    mocks.invoke.mockReset().mockResolvedValue({ error: new Error("Preview unavailable") });
    render(<PlansPage />);
    fireEvent.click(screen.getByRole("button", { name: "Select Growth" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", { name: "Confirm plan change" })).not.toBeInTheDocument();
  });
  it("shows the server preview before asking for confirmation", async () => {
    mocks.invoke.mockReset();
    mocks.invoke.mockResolvedValueOnce({ data: { quote_id: "quote", amount_due: 1234, currency: "gbp", expires_at: "2099-01-01T00:00:00Z", effective_at: "2098-12-01T00:00:00Z", credit_delta: 200, change: "upgrade" } }).mockResolvedValueOnce({ data: { status: "pending" } });
    render(<PlansPage />);
    fireEvent.click(screen.getByRole("button", { name: "Select Growth" }));
    expect(await screen.findByText("Amount due: £12.34")).toBeInTheDocument();
    expect(screen.getByText("Credit adjustment: 200 credits")).toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Confirm plan change" }));
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledWith("update-subscription", { body: { workspace_id: "workspace", action: "confirm", quote_id: "quote", confirmed: true } }));
  });
});
