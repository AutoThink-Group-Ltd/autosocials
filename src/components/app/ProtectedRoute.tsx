import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Navigate } from "@/lib/router-compat";

const SLOW_MS = 15000;

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { session, profile, loading } = useAuth();
  const { currentWorkspace, loading: workspaceLoading } = useWorkspace();
  const [slow, setSlow] = useState(false);
  const busy = loading || workspaceLoading;

  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [busy]);

  if (busy) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        {slow ? (
          <>
            <p className="font-display text-[20px] font-bold text-ink">Can't reach AutoSocials right now</p>
            <p className="max-w-sm text-[14px] text-text-secondary">
              Your work is safe. The service is taking longer than usual to respond. Try again in a moment.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 rounded-[10px] bg-ink px-4 text-[14px] font-semibold text-inverse hover:bg-ink-hover"
            >
              Retry
            </button>
          </>
        ) : (
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" aria-label="Loading" />
        )}
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/auth" replace />;
  }

  // Agency users can access /app ONLY when they have a client workspace selected
  if (profile && profile.account_type === "agency" && !currentWorkspace) {
    return <Navigate to="/agency" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
