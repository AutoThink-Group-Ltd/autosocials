import { Link } from "@tanstack/react-router";
import { BriefcaseBusiness } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";

/** Clear the client selection before entering the agency portfolio. */
export function AgencyDashboardLink({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: (() => void) | undefined }) {
  const { profile } = useAuth();
  const { setCurrentWorkspace } = useWorkspace();
  if (profile?.account_type !== "agency") return null;

  return (
    <Button asChild variant="ghost" size={compact ? "icon" : "sm"}
      className={compact ? "text-inverse hover:bg-sidebar-accent hover:text-inverse" : "w-full justify-start text-inverse hover:bg-sidebar-accent hover:text-inverse"}>
      <Link to="/agency" aria-label="Agency dashboard" title="Agency dashboard"
        onClick={() => { setCurrentWorkspace(null); onNavigate?.(); }}>
        <BriefcaseBusiness size={16} />
        {!compact && <span>Agency dashboard</span>}
      </Link>
    </Button>
  );
}