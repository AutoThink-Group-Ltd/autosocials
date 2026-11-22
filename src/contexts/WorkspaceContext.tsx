import { createContext, useContext, useEffect, useState, useRef, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./AuthContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useServerFn } from "@tanstack/react-start";
import { getWorkspaceKinds } from "@/lib/workspace-kinds.functions";
import { fetchAll } from "@/lib/fetch-all";

interface Workspace {
  timezone?: string | null;
  workspace_kind?: "client" | "agency" | "personal" | "lead";
  id: string;
  name: string;
  logo_url: string | null;
  website: string | null;
  social_profiles?: unknown;
  phone: string | null;
  address: string | null;
  booking_link: string | null;
  business_model: string | null;
  software_name: string | null;
  software_url: string | null;
  contact_name: string | null;
  created_at: string;
  updated_at: string;
}

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  setCurrentWorkspace: (workspace: Workspace | null) => void;
  refetchWorkspaces: () => Promise<void>;
  loading: boolean;
  isAgencyDashboard: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextType>({
  currentWorkspace: null,
  workspaces: [],
  setCurrentWorkspace: () => {},
  refetchWorkspaces: async () => {},
  loading: true,
  isAgencyDashboard: false,
});

export const useWorkspace = () => useContext(WorkspaceContext);

const STORAGE_KEY = "autosocials_workspace_id";

export const WorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const { user, profile, loading: authLoading } = useAuth();
  const getKinds = useServerFn(getWorkspaceKinds);
  const loadKinds = async (ids: string[]) => {
    const rows: Awaited<ReturnType<typeof getKinds>> = [];
    for (let i = 0; i < ids.length; i += 500) rows.push(...await getKinds({ data: { workspaceIds: ids.slice(i, i + 500) } }));
    return new Map(rows.map((row) => [row.workspace_id, row.workspace_kind]));
  };
  const { isSuperAdmin, isLoading: roleLoading } = useSuperAdmin();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const currentWorkspaceRef = useRef<Workspace | null>(null);
  const agencyDashboardSelectedRef = useRef(false);
  const loadedUserRef = useRef<string | null>(null);
  const fetchRunRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);

  const isAgency = profile?.account_type === "agency";

  const fetchWorkspaces = async (showLoading = true) => {
    const run = ++fetchRunRef.current;
    const isCurrent = () => run === fetchRunRef.current && loadedUserRef.current === (user?.id ?? null);
    if (showLoading) setLoading(true);
    if (!user) {
      setWorkspaces([]);
      setCurrentWorkspaceState(null);
      currentWorkspaceRef.current = null;
      agencyDashboardSelectedRef.current = false;
      setResolvedUserId(null);
      setLoading(false);
      return;
    }

    let completed = false;
    try {
      // An impersonated agency starts on its portfolio, even if its profile saved a client.
      if (isAgency && sessionStorage.getItem("autosocials_impersonation_agency_dashboard") === "1") {
        agencyDashboardSelectedRef.current = true;
        currentWorkspaceRef.current = null;
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem("autosocials_impersonation_agency_dashboard");
      }
      let workspaceIds: string[] = [];

      if (isSuperAdmin) {
        // Super admin: fetch ALL workspaces across all users
        const allWorkspaces = await fetchAll((from, to) => supabase
          .from("workspaces")
          .select("*")
          .order("name")
          .order("id")
          .range(from, to));

        const kinds = await loadKinds(allWorkspaces.map((row) => row.id));
        if (!isCurrent()) return;
        const ws = allWorkspaces.map((row) => ({ ...row, workspace_kind: kinds.get(row.id) as Workspace["workspace_kind"] })) as Workspace[];
        setWorkspaces(ws);

        // Restore or pick first
        const currentId = currentWorkspaceRef.current?.id;
        const updatedCurrent = currentId ? ws.find((w) => w.id === currentId) : null;
        if (updatedCurrent) {
          setCurrentWorkspaceState(updatedCurrent);
          currentWorkspaceRef.current = updatedCurrent;
        } else {
          const storedId = localStorage.getItem(STORAGE_KEY) || profile?.primary_workspace_id;
          const restored = ws.find((w) => w.id === storedId);
          setCurrentWorkspaceState(restored || ws[0] || null);
          currentWorkspaceRef.current = restored || ws[0] || null;
        }
        completed = true;
        return;
      }

      if (isAgency) {
        // Agency users: fetch ONLY client workspaces via agency_client_links
        const { data: agencyLinks, error: linksError } = await supabase
          .from("agency_client_links")
          .select("workspace_id")
          .eq("status", "active"); // RLS: own links, or links a teammate is assigned to
        if (linksError) throw linksError;

        if (agencyLinks) {
          workspaceIds = agencyLinks.map((link) => link.workspace_id);
        }
      } else {
        // Direct users: fetch via workspace_members
        const { data: memberships, error: membershipError } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", user.id);
        if (membershipError) throw membershipError;

        if (memberships) {
          workspaceIds = memberships.map((m) => m.workspace_id);
        }
      }

      if (!isCurrent()) return;
      if (workspaceIds.length === 0) {
        setWorkspaces([]);
        // Agency users start with null (agency dashboard view)
        setCurrentWorkspaceState(null);
        currentWorkspaceRef.current = null;
        if (isAgency) agencyDashboardSelectedRef.current = true;
        localStorage.removeItem(STORAGE_KEY);
        completed = true;
        return;
      }

      // Fetch full workspace data
      const { data: workspaceData, error: workspaceError } = await supabase
        .from("workspaces")
        .select("*")
        .in("id", workspaceIds);
      if (workspaceError) throw workspaceError;

      const kinds = await loadKinds((workspaceData ?? []).map((row) => row.id));
      if (!isCurrent()) return;
      const ws = (workspaceData || []).map((row) => ({ ...row, workspace_kind: kinds.get(row.id) as Workspace["workspace_kind"] })) as Workspace[];
      setWorkspaces(ws);

      // If we already have a valid workspace selected that exists in the list, refresh it with latest data
      const currentId = currentWorkspaceRef.current?.id;
      const updatedCurrent = currentId ? ws.find((w) => w.id === currentId) : null;
      if (updatedCurrent) {
        setCurrentWorkspaceState(updatedCurrent);
        currentWorkspaceRef.current = updatedCurrent;
      } else if (isAgency) {
        // Agency: restore last selected client workspace, or stay on dashboard (null)
        const storedId = agencyDashboardSelectedRef.current
          ? null
          : localStorage.getItem(STORAGE_KEY) || profile?.primary_workspace_id;
        const restored = ws.find((w) => w.id === storedId);
        setCurrentWorkspaceState(restored || null);
        currentWorkspaceRef.current = restored || null;
        if (!restored) {
          agencyDashboardSelectedRef.current = true;
          localStorage.removeItem(STORAGE_KEY);
        }
      } else {
        // Direct users: restore or pick first
        const storedId = localStorage.getItem(STORAGE_KEY) || profile?.primary_workspace_id;
        const restored = ws.find((w) => w.id === storedId);
        setCurrentWorkspaceState(restored || ws[0] || null);
        currentWorkspaceRef.current = restored || ws[0] || null;
      }
      completed = true;
    } catch (err) {
      console.error("Failed to fetch workspaces:", err);
    } finally {
      if (isCurrent()) { if (completed) setResolvedUserId(user.id); setLoading(false); }
    }
  };

  const setCurrentWorkspace = (workspace: Workspace | null) => {
    setCurrentWorkspaceState(workspace);
    currentWorkspaceRef.current = workspace;
    agencyDashboardSelectedRef.current = isAgency && workspace === null;
    if (workspace) {
      localStorage.setItem(STORAGE_KEY, workspace.id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    // Persist to profile for cross-browser sync
    if (user) {
      supabase
        .from("profiles")
        .update({ primary_workspace_id: workspace?.id || null })
        .eq("id", user.id)
        .then();
    }
  };

  useEffect(() => {
    if (loadedUserRef.current !== (user?.id ?? null)) {
      fetchRunRef.current++;
      if (loadedUserRef.current) localStorage.removeItem(STORAGE_KEY);
      loadedUserRef.current = user?.id ?? null;
      currentWorkspaceRef.current = null;
      agencyDashboardSelectedRef.current = false;
    }
    // Do not restore a super admin as a direct user while their role is still
    // loading: that can replace their selected workspace before the admin list arrives.
    if (authLoading || (user && (roleLoading || !profile))) return;
    void fetchWorkspaces();
    // Transfers can change an agency's client access while this tab stays open.
    const refreshOnFocus = () => { if (isAgency) void fetchWorkspaces(false); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [user?.id, profile?.account_type, isSuperAdmin, roleLoading, authLoading]);

  const isAgencyDashboard = isAgency && currentWorkspace === null;

  return (
    <WorkspaceContext.Provider
      value={{
        currentWorkspace,
        workspaces,
        setCurrentWorkspace,
        refetchWorkspaces: fetchWorkspaces,
        loading: authLoading || loading || !!(user && (roleLoading || !profile || resolvedUserId !== user.id)),
        isAgencyDashboard,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  );
};
