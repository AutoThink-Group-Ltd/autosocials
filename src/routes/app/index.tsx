import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { landingPath } from "@/lib/landing";

export const Route = createFileRoute("/app/")({
  component: AppIndex,
});

function AppIndex() {
  const { isSuperAdmin, isLoading } = useSuperAdmin();
  const { profile } = useAuth();
  const { currentWorkspace, loading: workspaceLoading } = useWorkspace();
  if (isLoading || workspaceLoading) return null;
  return <Navigate to={landingPath({
    isSuperAdmin,
    accountType: profile?.account_type ?? null,
    primaryWorkspaceId: currentWorkspace?.id ?? null,
  })} replace />;
}
