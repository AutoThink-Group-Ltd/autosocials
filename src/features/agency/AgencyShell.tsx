import { NavLink, Outlet, useNavigate, useLocation } from "@/lib/router-compat";
import { Logo } from "@/components/brand/Logo";
import { AgencyProfileMenu } from "./AgencyProfileMenu";
import { useAgencyLogo } from "./useAgencyLogo";
import {
  LayoutDashboard, Users, UserPlus, FileText, DollarSign, Activity,
  Settings, Link2, Menu, X, LogOut, ChevronDown, Mail, BellRing,
  Building2, Check, Briefcase, UserCircle,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAgencyRole } from "./useAgencyRole";
import { agencyPathAllowed } from "@/lib/invites";
import { ImpersonationBar } from "@/features/admin/UserSwitcher";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";

const agencyNavGroups = [
  { label: "Portfolio", items: [
    { to: "/agency", icon: LayoutDashboard, label: "Dashboard", end: true },
    { to: "/agency/clients", icon: Users, label: "Clients" },
    { to: "/agency/leads", icon: UserPlus, label: "Leads" },
    { to: "/agency/invites", icon: Mail, label: "Invitations" },
  ]},
  { label: "Team", items: [
    { to: "/agency/team", icon: UserPlus, label: "Team" },
    { to: "/agency/activity", icon: Activity, label: "Activity" },
  ]},
  { label: "Money", items: [
    { to: "/agency/revenue", icon: DollarSign, label: "Revenue" },
    { to: "/agency/referrals", icon: Link2, label: "Referrals" },
    { to: "/agency/reports", icon: FileText, label: "Reports" },
  ]},
  { label: "Account", items: [
    { to: "/agency/profile", icon: UserCircle, label: "My profile" },
    { to: "/agency/notifications", icon: BellRing, label: "Notifications" },
    { to: "/agency/settings", icon: Settings, label: "Settings" },
  ]},
] as { label: string; items: { to: string; icon: typeof Users; label: string; end?: boolean }[] }[];

const AgencyShell = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useAuth();
  const agencyLogo = useAgencyLogo();
  const { role, loading: roleLoading } = useAgencyRole();
  const { isSuperAdmin } = useSuperAdmin();
  const { currentWorkspace, workspaces, setCurrentWorkspace, isAgencyDashboard, loading: workspaceLoading } = useWorkspace();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // Close switcher on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    if (switcherOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [switcherOpen]);

  useEffect(() => {
    if (!workspaceLoading && currentWorkspace && workspaces.some((ws) => ws.id === currentWorkspace.id) && location.pathname.startsWith("/agency")) {
      navigate("/app", { replace: true });
    }
  }, [currentWorkspace, workspaces, workspaceLoading, location.pathname, navigate]);

  const handleSelectAgencyDashboard = () => {
    setCurrentWorkspace(null);
    setSwitcherOpen(false);
    if (!location.pathname.startsWith("/agency")) {
      navigate("/agency");
    }
  };

  const handleSelectClientWorkspace = (ws: typeof workspaces[0]) => {
    setCurrentWorkspace(ws);
    setSwitcherOpen(false);
    navigate("/app/create?stage=plans");
  };

  return (
    <div className="panes-no-scrollbar flex h-dvh overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-64 bg-ink text-silver flex flex-col transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-16 flex items-center px-5 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Logo reversed size={20} />
            <span className="rounded-full border border-sidebar-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-silver">Agency</span>
          </div>
          <button className="lg:hidden ml-auto" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-silver" />
          </button>
        </div>

        <nav aria-label="Agency" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-2">
          {agencyNavGroups.map((group) => (
            <div key={group.label}>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-silver/60">{group.label}</p>
              <div className="space-y-0.5">
                {group.items.filter((item) => roleLoading || agencyPathAllowed(item.to, role)).map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    {...(item.end !== undefined ? { end: item.end } : {})}
                    onClick={() => setSidebarOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                        isActive ? "bg-ink-hover text-inverse" : "text-silver hover:bg-ink-hover hover:text-inverse"
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              onClick={async () => { await signOut(); navigate("/auth"); }}
              className="flex items-center gap-2 px-3 py-2 flex-1 text-sm text-silver hover:text-inverse hover:bg-ink-hover rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <ImpersonationBar />
        <header className="h-16 border-b border-border flex items-center gap-4 px-4 md:px-6 flex-shrink-0 bg-background">
          <button type="button" aria-label="Open agency navigation" aria-expanded={sidebarOpen} className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5 text-foreground" />
          </button>

          {/* Workspace Switcher */}
          <div className="relative" ref={switcherRef}>
            <button
              onClick={() => setSwitcherOpen(!switcherOpen)}
              className="flex items-center gap-3 px-3 py-2 rounded-full border border-border bg-card hover:bg-secondary transition-all duration-200"
            >
              <div className="w-8 h-8 rounded-full overflow-hidden flex items-center justify-center bg-ink">
                {isAgencyDashboard && agencyLogo ? (
                  <img src={agencyLogo} alt="" className="w-8 h-8 object-cover" />
                ) : isAgencyDashboard ? (
                  <Briefcase className="w-4 h-4 text-inverse" />
                ) : currentWorkspace?.logo_url ? (
                  <img src={currentWorkspace.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                ) : (
                  <Building2 className="w-4 h-4 text-inverse" />
                )}
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-[11px] text-muted-foreground leading-none mb-0.5">
                  {isAgencyDashboard ? "Agency" : "Managing"}
                </p>
                <p className="text-sm font-semibold text-foreground truncate max-w-[180px]">
                  {isAgencyDashboard ? "Agency Dashboard" : currentWorkspace?.name || "Select client"}
                </p>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${switcherOpen ? "rotate-180" : ""}`} />
            </button>

            {switcherOpen && (
              <div className="absolute top-full left-0 mt-2 w-72 sm:w-80 bg-card border border-border rounded-xl shadow-elevated z-50 py-2 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Agency Dashboard option */}
                <div className="px-1 pb-1">
                  <button
                    onClick={handleSelectAgencyDashboard}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm transition-all duration-150 ${
                      isAgencyDashboard
                        ? "bg-secondary text-foreground"
                        : "text-foreground hover:bg-secondary"
                    }`}
                  >
                    <div className={`w-9 h-9 rounded-lg overflow-hidden flex items-center justify-center flex-shrink-0 ${
                      isAgencyDashboard ? "bg-ink" : "bg-secondary"
                    }`}>
                      {agencyLogo ? <img src={agencyLogo} alt="" className="w-9 h-9 object-cover" /> : <Briefcase className={`w-4.5 h-4.5 ${isAgencyDashboard ? "text-inverse" : "text-muted-foreground"}`} />}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="font-semibold">Agency Dashboard</p>
                      <p className="text-[11px] text-muted-foreground">Portfolio overview & management</p>
                    </div>
                    {isAgencyDashboard && <Check className="w-4 h-4 text-foreground flex-shrink-0" />}
                  </button>
                </div>

                {/* Separator */}
                {workspaces.length > 0 && (
                  <div className="mx-3 my-1 border-t border-border" />
                )}

                {/* Client Workspaces */}
                {workspaces.length > 0 && (
                  <>
                    <div className="px-4 py-1.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Workspaces
                      </p>
                    </div>
                    <div className="max-h-56 overflow-y-auto px-1">
                      {workspaces.map((ws) => {
                        const isActive = currentWorkspace?.id === ws.id;
                        return (
                          <button
                            key={ws.id}
                            onClick={() => handleSelectClientWorkspace(ws)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                              isActive
                                ? "bg-secondary text-foreground"
                                : "text-foreground hover:bg-secondary"
                            }`}
                          >
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                              isActive ? "bg-ink" : "bg-secondary"
                            }`}>
                              {ws.logo_url ? (
                                <img src={ws.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                              ) : (
                                <Building2 className={`w-4 h-4 ${isActive ? "text-inverse" : "text-muted-foreground"}`} />
                              )}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <p className="font-medium truncate">{ws.name}</p>
                              {ws.workspace_kind === "lead" && <p className="text-xs text-muted-foreground">Lead</p>}
                            </div>
                            {isActive && <Check className="w-4 h-4 text-foreground flex-shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {workspaces.length === 0 && (
                  <div className="px-4 py-3 text-center">
                    <p className="text-xs text-muted-foreground">No client workspaces yet</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Invite clients to see their workspaces here</p>
                  </div>
                )}
                {isSuperAdmin && (
                  <>
                    <div className="mx-3 my-1 border-t border-border" />
                    <div className="px-1">
                      <NavLink
                        to="/app/admin"
                        onClick={() => setSwitcherOpen(false)}
                        className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm text-foreground hover:bg-secondary transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-secondary">
                          <LayoutDashboard className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex-1 text-left">
                          <p className="font-semibold">Admin console</p>
                          <p className="text-[11px] text-muted-foreground">Return to super admin</p>
                        </div>
                      </NavLink>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 flex-shrink-0">
            {isSuperAdmin && (
              <NavLink to="/app/admin" onClick={() => setCurrentWorkspace(null)}
                className="rounded-full border border-border px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary">
                Back to Admin
              </NavLink>
            )}
            <AgencyProfileMenu />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {!roleLoading && !agencyPathAllowed(location.pathname, role) ? (
            <div className="p-8"><p className="font-display text-xl font-bold text-foreground">This page is for agency admins</p>
              <p className="mt-1 text-sm text-muted-foreground">Ask your agency owner if you need access to billing, team or settings.</p></div>
          ) : <Outlet />}
        </main>
      </div>
    </div>
  );
};

export default AgencyShell;
