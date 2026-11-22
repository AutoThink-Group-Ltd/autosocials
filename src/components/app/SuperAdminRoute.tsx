import type { ReactNode } from "react";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Navigate } from "@/lib/router-compat";

/** Renders children only for users with the super_admin role (checked against user_roles). */
export default function SuperAdminRoute({ children }: { children: ReactNode }) {
  const { isSuperAdmin, isLoading } = useSuperAdmin();
  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-label="Loading" />
      </div>
    );
  }
  if (!isSuperAdmin) return <Navigate to="/app/create" replace />;
  return <>{children}</>;
}
