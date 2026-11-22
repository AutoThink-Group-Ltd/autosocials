import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Navigate } from "@/lib/router-compat";

const AgencyProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useAuth();
  const { loading: workspaceLoading } = useWorkspace();

  if (loading || workspaceLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // If user is not an agency account, redirect to regular app
  if (profile && profile.account_type !== "agency") {
    return <Navigate to="/app" replace />;
  }

  return <>{children}</>;
};

export default AgencyProtectedRoute;
