import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ accountType: "agency", from: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "agency-user" }, profile: { account_type: state.accountType, primary_workspace_id: "client" } }) }));
vi.mock("@/hooks/useSuperAdmin", () => ({ useSuperAdmin: () => ({ isSuperAdmin: false }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceContext";
function Probe() { const { currentWorkspace, loading } = useWorkspace(); return <p>{loading ? "loading" : currentWorkspace?.id ?? "portfolio"}</p>; }
afterEach(() => { cleanup(); sessionStorage.clear(); localStorage.clear(); state.accountType = "agency"; });
function setup() {
  state.from.mockImplementation((name: string) => { const result = { data: name === "agency_client_links" || name === "workspace_members" ? [{ workspace_id: "client" }] : [{ id: "client", name: "Client" }] }; const chain: any = { select: () => chain, eq: () => Promise.resolve(result), in: () => Promise.resolve(result) }; return chain; });
  render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
}
describe("agency impersonation context", () => {
  it("starts at the agency portfolio instead of its saved client", async () => {
    sessionStorage.setItem("autosocials_impersonation_agency_dashboard", "1");
    localStorage.setItem("autosocials_workspace_id", "client");
    setup();
    await screen.findByText("portfolio");
    expect(sessionStorage.getItem("autosocials_impersonation_agency_dashboard")).toBeNull();
    expect(localStorage.getItem("autosocials_workspace_id")).toBeNull();
  });
  it("preserves normal saved-client restoration without the switch flag", async () => {
    setup();
    await screen.findByText("client");
  });
  it("preserves direct-user workspace selection", async () => {
    state.accountType = "direct";
    setup();
    await screen.findByText("client");
  });
});
