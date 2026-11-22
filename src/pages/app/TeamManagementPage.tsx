import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { WorkspacePeople } from "@/features/people/WorkspacePeople";

const TeamManagementPage = () => {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const wsId = currentWorkspace?.id;

  const { data: canManage = false } = useQuery({
    queryKey: ["can-manage-people", wsId, user?.id],
    enabled: !!wsId && !!user,
    queryFn: async () => {
      const [o, a, m] = await Promise.all([
        supabase.rpc("is_workspace_owner", { _user_id: user!.id, _workspace_id: wsId! }),
        supabase.rpc("is_workspace_agency", { _user_id: user!.id, _workspace_id: wsId! }),
        supabase.from("workspace_members").select("role").eq("workspace_id", wsId!).eq("user_id", user!.id).maybeSingle(),
      ]);
      return !!o.data || !!a.data || m.data?.role === "admin";
    },
  });

  if (!currentWorkspace) {
    return <div className="p-4 sm:p-6 md:p-8"><p className="text-muted-foreground">Select a workspace to manage its people.</p></div>;
  }

  return (
    <div className="max-w-3xl space-y-6 p-4 sm:p-6 md:p-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">People</h1>
        <p className="mt-1 text-muted-foreground">Who can work in {currentWorkspace.name}</p>
      </div>
      <WorkspacePeople workspaceId={currentWorkspace.id} workspaceName={currentWorkspace.name} canManage={canManage} />
    </div>
  );
};

export default TeamManagementPage;
