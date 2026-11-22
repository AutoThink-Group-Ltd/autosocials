import { createFileRoute, useLocation } from "@tanstack/react-router";
import ProtectedRoute from "@/components/app/ProtectedRoute";
import WorkspaceShell from "@/workspace/WorkspaceShell";
import AdminShell from "@/features/admin/AdminShell";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Navigate } from "@/lib/router-compat";
import { isRetiredPath } from "@/workspace/legacy";

export const Route = createFileRoute("/app")({
  head: () => ({ meta: [{ title: "Workspace — AutoSocials" }, { name: "robots", content: "noindex" }] }),
  component: AppLayout,
});

/** Retired screens (docs/inventory.md) redirect to the workspace unless the viewer is a super admin reviewing legacy pages. */
function RetiredGate({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { isSuperAdmin, isLoading } = useSuperAdmin();
  if (!isRetiredPath(pathname)) return <>{children}</>;
  if (isLoading) return null;
  if (!isSuperAdmin) return <Navigate to="/app/create" replace />;
  return <>{children}</>;
}

function AppLayout() {
  const { pathname } = useLocation();
  const admin = pathname === "/app/admin" || pathname.startsWith("/app/admin/");
  return (
    <ProtectedRoute>
      <RetiredGate>{admin ? <AdminShell /> : <WorkspaceShell />}</RetiredGate>
    </ProtectedRoute>
  );
}
