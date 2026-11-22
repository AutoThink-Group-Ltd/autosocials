import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ roleLoading: true, isSuperAdmin: false, from: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "admin" }, profile: { account_type: "direct", primary_workspace_id: "own" } }) }));
vi.mock("@/hooks/useSuperAdmin", () => ({ useSuperAdmin: () => ({ isSuperAdmin: state.isSuperAdmin, isLoading: state.roleLoading }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceContext";

function Probe() { const { currentWorkspace, loading } = useWorkspace(); return <p>{loading ? "loading" : currentWorkspace?.name ?? "none"}</p>; }
afterEach(() => { cleanup(); localStorage.clear(); state.roleLoading = true; state.isSuperAdmin = false; vi.clearAllMocks(); });

it("restores the admin's selected workspace after their role resolves", async () => {
  localStorage.setItem("autosocials_workspace_id", "gold");
  state.from.mockImplementation((table: string) => {
    if (table !== "workspaces") throw new Error("Should not query direct-user memberships while role is loading");
    const query: any = { select: () => query, order: async () => ({ data: [{ id: "own", name: "AutoSocials" }, { id: "gold", name: "Example Shop" }] }) };
    return query;
  });
  const view = render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
  expect(state.from).not.toHaveBeenCalled();
  state.roleLoading = false; state.isSuperAdmin = true;
  view.rerender(<WorkspaceProvider><Probe /></WorkspaceProvider>);
  expect(await screen.findByText("Example Shop")).toBeInTheDocument();
  expect(localStorage.getItem("autosocials_workspace_id")).toBe("gold");
});
