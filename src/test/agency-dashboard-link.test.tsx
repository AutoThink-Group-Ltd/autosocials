import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgencyDashboardLink } from "@/workspace/AgencyDashboardLink";

const state = vi.hoisted(() => ({ accountType: "agency", setCurrentWorkspace: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ profile: { account_type: state.accountType } }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ setCurrentWorkspace: state.setCurrentWorkspace }) }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ to, ...props }: { to: string }) => <a href={to} {...props} /> }));
afterEach(() => { cleanup(); vi.clearAllMocks(); state.accountType = "agency"; });

describe("agency dashboard return", () => {
  it("returns to /agency and clears the client selection that would redirect back to /app", () => {
    const onNavigate = vi.fn();
    render(<AgencyDashboardLink onNavigate={onNavigate} />);
    const link = screen.getByRole("link", { name: "Agency dashboard" });
    expect(link).toHaveAttribute("href", "/agency");
    fireEvent.click(link);
    expect(state.setCurrentWorkspace).toHaveBeenCalledWith(null);
    expect(onNavigate).toHaveBeenCalledOnce();
  });
  it("also clears the client selection from the collapsed menu", () => {
    render(<AgencyDashboardLink compact />);
    fireEvent.click(screen.getByRole("link", { name: "Agency dashboard" }));
    expect(state.setCurrentWorkspace).toHaveBeenCalledWith(null);
  });
  it("does not offer agency navigation to direct accounts", () => {
    state.accountType = "direct";
    render(<AgencyDashboardLink />);
    expect(screen.queryByRole("link")).toBeNull();
  });
});