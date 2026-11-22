import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ user: null as {id:string} | null, profile: null as {account_type:string;primary_workspace_id:string} | null, authLoading: true, roleLoading: true, from: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: state.user, profile: state.profile, loading: state.authLoading }) }));
vi.mock("@/hooks/useSuperAdmin", () => ({ useSuperAdmin: () => ({ isSuperAdmin: false, isLoading: state.roleLoading }) }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: () => async ({ data }: {data:{workspaceIds:string[]}}) => data.workspaceIds.map(id => ({workspace_id:id, workspace_kind:"client"})) }));
vi.mock("@/lib/workspace-kinds.functions", () => ({ getWorkspaceKinds: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from } }));
import { WorkspaceProvider, useWorkspace } from "@/contexts/WorkspaceContext";
function Probe() { const ws = useWorkspace(); return <p>{ws.loading ? "Loading workspace" : ws.currentWorkspace?.name ?? "Agency dashboard"}</p>; }
function storage() { const values = new Map<string,string>(); return { getItem: (key:string) => values.get(key) ?? null, setItem: (key:string, value:string) => values.set(key, value), removeItem: (key:string) => values.delete(key), clear: () => values.clear() }; }
afterEach(() => { cleanup(); state.user = null; state.profile = null; state.authLoading = true; state.roleLoading = true; vi.clearAllMocks(); });
it("waits for the agency profile and selected client before rendering the workspace", async () => {
  Object.defineProperty(window, "localStorage", { configurable:true, value:storage() });
  Object.defineProperty(window, "sessionStorage", { configurable:true, value:storage() });
  window.localStorage.setItem("autosocials_workspace_id", "client");
  state.from.mockImplementation((table: string) => { const query: any = { select: () => query, eq: () => Promise.resolve({data:[{workspace_id:"client"}],error:null}), in: () => Promise.resolve({data:[{id:"client",name:"Client workspace"}],error:null}) }; if (!["agency_client_links", "workspaces"].includes(table)) throw new Error(`Unexpected query ${table}`); return query; });
  const view = render(<WorkspaceProvider><Probe /></WorkspaceProvider>);
  expect(screen.getByText("Loading workspace")).toBeInTheDocument();
  state.user = {id:"agency"}; state.authLoading = false; state.roleLoading = false;
  view.rerender(<WorkspaceProvider><Probe /></WorkspaceProvider>);
  expect(screen.getByText("Loading workspace")).toBeInTheDocument();
  expect(state.from).not.toHaveBeenCalled();
  state.profile = {account_type:"agency", primary_workspace_id:"client"};
  view.rerender(<WorkspaceProvider><Probe /></WorkspaceProvider>);
  expect(screen.getByText("Loading workspace")).toBeInTheDocument();
  expect(await screen.findByText("Client workspace")).toBeInTheDocument();
  expect(screen.queryByText("Agency dashboard")).not.toBeInTheDocument();
});
