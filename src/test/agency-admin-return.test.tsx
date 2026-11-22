import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ superAdmin: false, setCurrentWorkspace: vi.fn() }));
vi.mock("@/lib/router-compat", () => ({ NavLink: ({ to, children, onClick, ...props }: any) => <a href={to} {...props} onClick={(event) => { event.preventDefault(); onClick?.(event); }}>{children}</a>, Outlet: () => <div>Agency content</div>, useNavigate: () => vi.fn(), useLocation: () => ({ pathname: "/agency" }) }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));
vi.mock("@/contexts/WorkspaceContext", () => ({ useWorkspace: () => ({ currentWorkspace: null, workspaces: [], setCurrentWorkspace: state.setCurrentWorkspace, isAgencyDashboard: true, loading: false }) }));
vi.mock("@/hooks/useSuperAdmin", () => ({ useSuperAdmin: () => ({ isSuperAdmin: state.superAdmin }) }));
vi.mock("@/features/agency/useAgencyLogo", () => ({ useAgencyLogo: () => null }));
vi.mock("@/features/agency/useAgencyRole", () => ({ useAgencyRole: () => ({ role: "owner", loading: false }) }));
vi.mock("@/features/agency/AgencyProfileMenu", () => ({ AgencyProfileMenu: () => null }));
vi.mock("@/components/ThemeToggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/features/admin/UserSwitcher", () => ({ ImpersonationBar: () => <div>Session return bar</div> }));
import AgencyShell from "@/features/agency/AgencyShell";
afterEach(() => { cleanup(); vi.clearAllMocks(); state.superAdmin = false; });
describe("agency admin navigation", () => {
  it("does not offer admin navigation to ordinary agency users", () => {
    render(<AgencyShell />);
    expect(screen.queryByRole("link", { name: "Back to Admin" })).toBeNull();
    expect(screen.getByText("Session return bar")).toBeInTheDocument();
  });
  it("shows a visible admin return for the real superadmin session", () => {
    state.superAdmin = true;
    render(<AgencyShell />);
    const link = screen.getByRole("link", { name: "Back to Admin" });
    expect(link).toHaveAttribute("href", "/app/admin");
    fireEvent.click(link);
    expect(state.setCurrentWorkspace).toHaveBeenCalledWith(null);
  });
});
