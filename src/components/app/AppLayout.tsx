import { NavLink, Outlet, useNavigate, useLocation } from "@/lib/router-compat";
import logoWhite from "@/assets/logo-white.png";
import logoDark from "@/assets/logo-dark.png";
import { Search, Users, MessageSquare, Handshake, BarChart3, Settings, Compass, Bell, Menu, X, LogOut, ChevronDown, ChevronRight, Shield, Megaphone, Mail, Percent, Activity, Sparkles, Command as CommandIcon, PanelLeftClose, PanelLeftOpen, Calendar, TrendingUp, Inbox, Radar, Lightbulb, FolderOpen, ShoppingBag, LineChart, Star, Home as HomeIcon, Hash, Upload, BookOpen } from "lucide-react";
import { PaymentFailedBanner } from "@/components/app/PaymentFailedBanner";
import { CommandBar } from "@/components/agent/CommandBar";
import { GlobalAgentStatusStrip } from "@/components/agent/GlobalAgentStatusStrip";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { supabase } from "@/integrations/supabase/client";

// ──────────────── NAVIGATION SCHEMA — mirrors /app/admin/roadmap ────────────────
// Each top-level entry is either a single link or a pillar with children.
// `comingSoon` renders a disabled item with a "Soon" badge.

type NavLeaf = {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  end?: boolean;
  comingSoon?: boolean;
};

type NavGroup = {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  comingSoon?: boolean;
  children?: NavLeaf[];
};

type NavEntry = NavLeaf | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => "children" in e || (e as NavGroup).id !== undefined;

const topNav: NavLeaf[] = [
  { to: "/app/dossier", icon: BookOpen, label: "Dossier" },
];

const pillarNav: NavEntry[] = [
  {
    id: "publishing",
    icon: Calendar,
    label: "Publishing",
    children: [
      { to: "/app/publishing", icon: Calendar, label: "Posts" },
      { to: "/app/publishing/calendar", icon: Calendar, label: "Calendar" },
      { to: "/app/publishing/plan", icon: Sparkles, label: "Plan with Vibe" },
      { to: "/app/publishing/hashtags", icon: Hash, label: "Hashtag groups" },
      { to: "/app/publishing/bulk-import", icon: Upload, label: "Bulk import" },
      { to: "/app/publishing/approvals", icon: Handshake, label: "Approvals" },
      { to: "/app/settings/connections", icon: Handshake, label: "Connections" },
    ],
  },
  {
    id: "outreach",
    icon: Handshake,
    label: "Outreach",
    children: [
      { to: "/app/discover", icon: Compass, label: "Discover" },
      { to: "/app/lists", icon: Users, label: "Creator Lists" },
      { to: "/app/messages", icon: MessageSquare, label: "Messages" },
      { to: "/app/collaborations", icon: Handshake, label: "Collaborations" },
      { to: "/app/templates", icon: Mail, label: "Templates" },
      { to: "/app/commissions", icon: Percent, label: "Commissions" },
    ],
  },
  { id: "paid", icon: TrendingUp, label: "Paid Ads", comingSoon: true },
  { id: "inbox", icon: Inbox, label: "Inbox", comingSoon: true },
  {
    id: "listening",
    icon: Radar,
    label: "Listening",
    children: [
      { to: "/app/brand-intelligence", icon: Megaphone, label: "Brand Intel" },
    ],
  },
  {
    id: "analytics",
    icon: BarChart3,
    label: "Analytics",
    children: [
      { to: "/app/insights", icon: BarChart3, label: "Insights" },
      { to: "/app/activity", icon: Activity, label: "Activity" },
    ],
  },
  { id: "ideation", icon: Lightbulb, label: "Ideation", comingSoon: true },
  { id: "dam", icon: FolderOpen, label: "Assets", comingSoon: true },
  { id: "commerce", icon: ShoppingBag, label: "Commerce", comingSoon: true },
  { id: "creator-perf", icon: LineChart, label: "Creator Perf.", comingSoon: true },
  { id: "reviews", icon: Star, label: "Reviews", comingSoon: true },
];

const bottomNav: NavLeaf[] = [];

const platformOptions = [
  { label: "TikTok", active: true },
  { label: "Instagram", active: false },
  { label: "YouTube", active: false },
  { label: "Facebook", active: false },
];

const AppLayout = () => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Desktop collapse state — defaults to collapsed, persisted in localStorage.
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem("autosocials.sidebarCollapsed");
    return stored === null ? true : stored === "1";
  });
  useEffect(() => {
    localStorage.setItem("autosocials.sidebarCollapsed", sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);
  const [platformFilter, setPlatformFilter] = useState("TikTok");
  const [globalSearch, setGlobalSearch] = useState("");
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [unreadReplies, setUnreadReplies] = useState(0);
  const navigate = useNavigate();
  const { user, profile, signOut } = useAuth();
  const { currentWorkspace, workspaces, setCurrentWorkspace } = useWorkspace();
  const { isSuperAdmin } = useSuperAdmin();
  const { pathname } = useLocation();

  // Auto-open groups whose child route is active. Track per-group manual override.
  const activeGroupId = useMemo(() => {
    for (const entry of pillarNav) {
      if (!isGroup(entry) || !entry.children) continue;
      if (entry.children.some((c) => pathname === c.to || pathname.startsWith(c.to + "/"))) {
        return entry.id;
      }
    }
    return null;
  }, [pathname]);

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  useEffect(() => {
    if (activeGroupId) setOpenGroups((g) => ({ ...g, [activeGroupId]: true }));
  }, [activeGroupId]);

  const toggleGroup = (id: string) => {
    if (sidebarCollapsed) {
      setSidebarCollapsed(false);
      setOpenGroups((g) => ({ ...g, [id]: true }));
      return;
    }
    setOpenGroups((g) => ({ ...g, [id]: !g[id] }));
  };

  const displayName = profile?.full_name || user?.email?.split("@")[0] || "User";
  const displayEmail = user?.email || "";
  const initials = displayName.slice(0, 2).toUpperCase();

  // Fetch unread reply count
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from("email_replies")
        .select("*", { count: "exact", head: true })
        .eq("workspace_id", currentWorkspace.id)
        .eq("is_read", false);
      setUnreadReplies(count || 0);
    };
    fetchUnread();

    const channel = supabase
      .channel(`unread-${currentWorkspace.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'email_replies', filter: `workspace_id=eq.${currentWorkspace.id}` }, () => {
        fetchUnread();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [currentWorkspace?.id]);

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-foreground/20 z-40 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 bg-card border-r border-border flex flex-col transition-all duration-200 lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full w-64"
        } ${sidebarCollapsed ? "lg:w-16" : "lg:w-72"}`}
      >
        <div className="h-20 flex items-center justify-center px-3 border-b border-border flex-shrink-0 relative">
          {sidebarCollapsed ? (
            <Sparkles className="w-7 h-7 text-primary" />
          ) : (
            <>
              <img src={logoWhite} alt="AutoSocials" className="h-14 w-auto object-contain hidden dark:block" />
              <img src={logoDark} alt="AutoSocials" className="h-14 w-auto object-contain dark:hidden block" />
            </>
          )}
          <button className="lg:hidden absolute right-4" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Workspace switcher */}
        {workspaces.length > 0 && !sidebarCollapsed && (
          <div className="px-3 pt-3">
            <div className="relative">
              <button
                onClick={() => setSwitcherOpen(!switcherOpen)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary text-sm hover:bg-secondary/80 transition-colors"
              >
                {currentWorkspace?.logo_url ? (
                  <img src={currentWorkspace.logo_url} alt="" className="w-6 h-6 rounded object-cover" />
                ) : (
                  <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary">
                    {currentWorkspace?.name?.charAt(0) || "W"}
                  </div>
                )}
                <span className="flex-1 text-left truncate text-foreground font-medium">
                  {currentWorkspace?.name || "Select workspace"}
                </span>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </button>
               {switcherOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-elevated z-50 py-1">
                  {profile?.account_type === "agency" && (
                    <>
                      <button
                        onClick={() => { setCurrentWorkspace(null); setSwitcherOpen(false); navigate("/agency"); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors text-foreground"
                      >
                        <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary">
                          A
                        </div>
                        <span className="truncate font-medium">Agency Dashboard</span>
                      </button>
                      <div className="mx-2 my-1 border-t border-border" />
                    </>
                  )}
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      onClick={() => { setCurrentWorkspace(ws); setSwitcherOpen(false); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-secondary transition-colors ${
                        currentWorkspace?.id === ws.id ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {ws.logo_url ? (
                        <img src={ws.logo_url} alt="" className="w-5 h-5 rounded object-cover" />
                      ) : (
                        <div className="w-5 h-5 rounded bg-primary/10 flex items-center justify-center text-[10px] font-semibold text-primary">
                          {ws.name.charAt(0)}
                        </div>
                      )}
                      <span className="truncate">{ws.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <nav className="flex-1 px-2 py-4 space-y-1 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {/* Top — always visible */}
          {topNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              {...(item.end !== undefined ? { end: item.end } : {})}
              onClick={() => setSidebarOpen(false)}
              {...(sidebarCollapsed ? { title: item.label } : {})}
              className={({ isActive }) =>
                `flex items-center gap-3 ${sidebarCollapsed ? "lg:justify-center lg:px-2" : "px-3"} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/8 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <item.icon className="w-[18px] h-[18px] flex-shrink-0" />
              <span className={sidebarCollapsed ? "lg:hidden" : ""}>{item.label}</span>
            </NavLink>
          ))}

          {/* Pillars header */}
          {!sidebarCollapsed && (
            <div className="pt-4 pb-1 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              Engines
            </div>
          )}
          {sidebarCollapsed && <div className="my-2 border-t border-border/60" />}

          {pillarNav.map((entry) => {
            // Coming-soon top-level pillar
            if (!isGroup(entry) || (!entry.children && entry.comingSoon)) {
              const e = entry as NavGroup;
              return (
                <div
                  key={e.id}
                  title={sidebarCollapsed ? `${e.label} — coming soon` : undefined}
                  className={`flex items-center gap-3 ${sidebarCollapsed ? "lg:justify-center lg:px-2" : "px-3"} py-2.5 rounded-lg text-sm font-medium text-muted-foreground/60 cursor-not-allowed select-none`}
                >
                  <e.icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="truncate">{e.label}</span>
                      <Badge variant="outline" className="ml-auto text-[9px] px-1.5 py-0 font-normal">Soon</Badge>
                    </>
                  )}
                </div>
              );
            }

            // Group with children
            const group = entry as NavGroup;
            const open = !sidebarCollapsed && (openGroups[group.id] ?? activeGroupId === group.id);
            const childActive = group.children?.some((c) => pathname === c.to || pathname.startsWith(c.to + "/"));

            return (
              <div key={group.id}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  title={sidebarCollapsed ? group.label : undefined}
                  className={`w-full flex items-center gap-3 ${sidebarCollapsed ? "lg:justify-center lg:px-2" : "px-3"} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                    childActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <group.icon className="w-[18px] h-[18px] flex-shrink-0" />
                  {!sidebarCollapsed && (
                    <>
                      <span className="truncate flex-1 text-left">{group.label}</span>
                      <ChevronRight className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
                    </>
                  )}
                </button>
                {open && group.children && (
                  <div className="mt-0.5 ml-3 pl-3 border-l border-border/60 space-y-0.5">
                    {group.children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        {...(child.end !== undefined ? { end: child.end } : {})}
                        onClick={() => setSidebarOpen(false)}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-200 ${
                            isActive
                              ? "bg-primary/8 text-primary font-medium"
                              : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                          }`
                        }
                      >
                        <child.icon className="w-[15px] h-[15px] flex-shrink-0" />
                        <span className="truncate">{child.label}</span>
                        {child.label === "Messages" && unreadReplies > 0 && (
                          <Badge variant="destructive" className="ml-auto text-[10px] px-1.5 py-0 min-w-[20px]">
                            {unreadReplies}
                          </Badge>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

        </nav>

        {/* Admin + Sign out area */}
        <div className={`${sidebarCollapsed ? "p-2" : "p-4"} border-t border-border space-y-1`}>
          {isSuperAdmin && (
            <NavLink
              to="/app/admin"
              onClick={() => setSidebarOpen(false)}
              title={sidebarCollapsed ? "Admin Panel" : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 ${sidebarCollapsed ? "lg:justify-center lg:px-2" : "px-3"} py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                  isActive
                    ? "bg-primary/8 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`
              }
            >
              <Shield className="w-[18px] h-[18px] flex-shrink-0" />
              <span className={sidebarCollapsed ? "lg:hidden" : ""}>Admin Panel</span>
            </NavLink>
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center gap-4 px-4 md:px-6 flex-shrink-0 bg-card">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)} aria-label="Open menu">
            <Menu className="w-5 h-5 text-foreground" />
          </button>
          <button
            className="hidden lg:inline-flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            onClick={() => setSidebarCollapsed((v) => !v)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-5 h-5" /> : <PanelLeftClose className="w-5 h-5" />}
          </button>

          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search creators by username or niche..."
                value={globalSearch}
                onChange={(e) => setGlobalSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && globalSearch.trim()) {
                    navigate(`/app?q=${encodeURIComponent(globalSearch.trim())}`);
                    setGlobalSearch("");
                  }
                }}
                className="w-full h-9 pl-9 pr-4 bg-secondary rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>

          <div className="hidden md:flex items-center gap-1 bg-secondary rounded-lg p-1">
            {platformOptions.map((p) => (
              <button
                key={p.label}
                onClick={() => p.active && setPlatformFilter(p.label)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  platformFilter === p.label
                    ? "bg-card text-foreground shadow-soft"
                    : p.active
                    ? "text-muted-foreground hover:text-foreground"
                    : "text-muted-foreground/40 cursor-not-allowed"
                }`}
                disabled={!p.active}
              >
                {p.label}
                {!p.active && <span className="ml-1 text-[10px]">soon</span>}
              </button>
            ))}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => {
                const ev = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
                document.dispatchEvent(ev);
              }}
              title="Command bar (⌘K)"
              className="hidden md:inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-secondary/60 text-xs text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <CommandIcon className="w-3.5 h-3.5" />
              <span>K</span>
            </button>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="w-[18px] h-[18px]" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full gradient-brand" />
            </Button>

            <ThemeToggle />

            <button
              onClick={() => navigate("/app")}
              title="Home"
              aria-label="Home"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <HomeIcon className="w-[18px] h-[18px]" />
            </button>

            <button
              onClick={() => navigate("/app/settings")}
              title="Settings"
              aria-label="Settings"
              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <Settings className="w-[18px] h-[18px]" />
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary transition-colors focus:outline-hidden"
                  title={displayName}
                >
                  <span className="hidden sm:block text-sm font-medium text-foreground truncate max-w-[140px]">{displayName}</span>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt={displayName} className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full gradient-brand flex items-center justify-center">
                      <span className="text-primary-foreground text-xs font-semibold">{initials}</span>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{displayName}</span>
                  {displayEmail && <span className="text-xs text-muted-foreground font-normal truncate">{displayEmail}</span>}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {profile?.account_type === "agency" && (
                  <DropdownMenuItem onClick={() => { setCurrentWorkspace(null); navigate("/agency"); }}>
                    <Shield className="w-4 h-4 mr-2" /> Agency Dashboard
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={async () => { await signOut(); navigate("/auth"); }}>
                  <LogOut className="w-4 h-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <PaymentFailedBanner />
        <GlobalAgentStatusStrip />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
      <CommandBar />
    </div>
  );
};

export default AppLayout;
