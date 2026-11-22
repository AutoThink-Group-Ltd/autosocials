import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type JSX } from "react";
import { ArrowLeftRight, CalendarDays, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Youtube, Sparkles, House, Mail } from "lucide-react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { BrandMark } from "@/components/brand/Logo";
import { MODULES, currentModule } from "@/brand/tokens";
import { Logo } from "@/components/brand/Logo";
import { AppIcon, type IconName } from "@/components/brand/AppIcon";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { personalLinkedIn } from "@/lib/profile-dna";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SamPane } from "@/features/sam/SamPane";
import { WorkspaceUiProvider, useWorkspaceUi } from "./WorkspaceUi";
import { UploadTray } from "./uploads/UploadTray";
import { ImpersonationBar, UserSwitcherButton } from "@/features/admin/UserSwitcher";
import { ChevronRight, Archive } from "lucide-react";
import { LEGACY_PAGES, legacyPageFor } from "./legacy";
import { AgencyDashboardLink } from "./AgencyDashboardLink";
import { BrandDnaProgressBanner } from "./BrandDnaProgressBanner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { YouTubeBrowser } from "./live-view/YouTubeBrowser";
import { ScheduleDialogHost, useScheduleDialog } from "@/features/schedule/ScheduleDialogHost";
import { PersonalReviewConnectionWatcher, PersonalReviewRefreshButton } from "./PersonalReviewRefresh";

function LegacyGroup({ onNavigate }: { onNavigate?: (() => void) | undefined }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <div>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-[13px] text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]">
        <Archive className="h-4 w-4" /> Legacy
        <span className="ml-auto text-[11px] text-silver">{LEGACY_PAGES.length}</span>
        <ChevronRight className={cn("h-3.5 w-3.5 text-silver transition-transform", open && "rotate-90")} />
      </button>
      {open && (
        <div className="max-h-56 space-y-0.5 overflow-y-auto py-1">
          {LEGACY_PAGES.map((p) => (
            <Link key={p.path} to={p.path} onClick={onNavigate} title={p.note}
              className={cn("flex h-8 items-center rounded-[8px] pl-10 pr-3 text-[12px] hover:bg-[hsl(var(--sidebar-accent))]",
                pathname === p.path ? "bg-[hsl(var(--sidebar-accent))] text-inverse" : "text-inverse/75")}>
              <span className="truncate">{p.label}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function LegacyBanner() {
  const { pathname } = useLocation();
  const page = legacyPageFor(pathname);
  if (!page) return null;
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface-subtle px-4 py-2 text-[12px] text-text-secondary">
      <span className="rounded-full bg-ink px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-inverse">Legacy</span>
      <span className="truncate">{page.label} · {page.note}. Kept for review.</span>
    </div>
  );
}

const UTILITIES: { to: string; icon: IconName; label: string }[] = [
  { to: "/app/settings/connections", icon: "connections", label: "Connections" },
  { to: "/app/settings", icon: "settings", label: "Settings" },
  { to: "/app/billing", icon: "billing", label: "Billing" },
];

function NavPane({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const active = currentModule(pathname);
  const { currentWorkspace, workspaces, setCurrentWorkspace } = useWorkspace();
  const hasProfileDna = !!personalLinkedIn(currentWorkspace?.social_profiles);
  const { signOut } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const { layout, updateLayout } = useWorkspaceUi();
  const onStage = MODULES.some((m) => pathname.startsWith(m.path));
  return (
    <nav aria-label="Workspace" className="flex h-full min-h-0 flex-col overflow-y-auto overscroll-contain bg-ink text-silver [&>*]:shrink-0">
      <div className="flex h-12 items-center justify-between px-4"><Link to="/app/home" onClick={onNavigate} aria-label="AutoSocials Home"><Logo reversed size={20} /></Link><span className="md:hidden"><PersonalReviewRefreshButton /></span><button type="button" className="hidden rounded p-1 text-silver hover:text-inverse xl:block" onClick={() => updateLayout({ navCollapsed: !layout.navCollapsed })} aria-label="Collapse menu" title="Collapse menu"><PanelLeftClose size={16} /></button></div>

      <div className="px-3 pb-3">
        <AgencyDashboardLink onNavigate={onNavigate} />
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center justify-between rounded-[10px] border border-[hsl(var(--sidebar-border))] px-3 py-2 text-left text-[13px] text-inverse hover:bg-[hsl(var(--sidebar-accent))]">
            <span className="truncate">{currentWorkspace?.name ?? "Select business"}</span>
            <span className="text-[11px] text-silver">Switch</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Businesses</DropdownMenuLabel>
            {workspaces.map((w) => (
              <DropdownMenuItem key={w.id} onClick={() => {
                if (w.id === currentWorkspace?.id) return;
                setCurrentWorkspace(w);
                void navigate({ to: "/app/create", search: { stage: "plans" } });
                onNavigate?.();
              }}>{w.name}</DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <a
          href="/app/create?stage=plans"
          onClick={onNavigate}
          className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-[10px] bg-canvas text-[13px] font-semibold text-ink hover:bg-surface-subtle"
        >
          <AppIcon name="new" size={16} /> Create
        </a>
      </div>

      <div className="px-3 pb-3">
        <input type="search" placeholder="Search work" aria-label="Search work"
          className="h-8 w-full rounded-[8px] border border-[hsl(var(--sidebar-border))] bg-transparent px-2.5 text-[12px] text-inverse placeholder:text-silver outline-none" />
      </div>
      <div className="mb-2 px-2"><Link to="/app/home" onClick={onNavigate} aria-current={pathname === "/app/home" ? "page" : undefined}
        className={cn("flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium", pathname === "/app/home" ? "bg-canvas text-ink" : "text-inverse/90 hover:bg-[hsl(var(--sidebar-accent))]")}><House size={16} /> Home</Link></div>
      <ol className="space-y-0.5 px-2">
        <li><Link to="/app/virlo" onClick={onNavigate} aria-current={pathname === "/app/virlo" ? "page" : undefined}
          className={cn("flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium", pathname === "/app/virlo" ? "bg-canvas text-ink" : "text-inverse/90 hover:bg-[hsl(var(--sidebar-accent))]")}>
          <AppIcon name="research" size={16} /><span>Research</span>
        </Link></li>
        {MODULES.map((m) => {
          const isActive = onStage && m.id === active;
          return (
            <li key={m.id}>
              <Link
                to={m.path}
                onClick={onNavigate}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-[10px] px-3 text-[13px] font-medium transition-colors",
                  isActive ? "bg-canvas text-ink" : "text-inverse/90 hover:bg-[hsl(var(--sidebar-accent))]",
                )}
              >
                {m.id === "outreach" ? <Mail size={16} /> : <AppIcon name={m.id} size={16} />}
                <span className="truncate">{m.label}</span>
              </Link>
            </li>
          );
        })}
      </ol>

      <div className="mt-5 px-4 text-[11px] font-medium uppercase tracking-wider text-silver">Tools</div>
      <div className="mt-1 space-y-0.5 px-2">
        <Link to="/app/models" onClick={onNavigate} aria-current={pathname === "/app/models" ? "page" : undefined}
          className={cn("flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px]", pathname === "/app/models" ? "bg-canvas text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
          <Sparkles size={16} /> Models
        </Link>
        <Link to="/app/research/social-lens" onClick={onNavigate} aria-current={pathname.startsWith("/app/research") ? "page" : undefined}
          className={cn("flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px]",
            pathname.startsWith("/app/research") ? "bg-canvas text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
          <AppIcon name="research" size={16} /> Social Lens
        </Link>
      </div>

      <div className="mt-5 px-4 text-[11px] font-medium uppercase tracking-wider text-silver">Assets</div>
      <div className="mt-1 space-y-0.5 px-2">
        {(!hasProfileDna || currentWorkspace?.website) && <Link to="/app/brand-dna" onClick={onNavigate} aria-current={pathname === "/app/brand-dna" ? "page" : undefined}
          className={cn("flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px]", pathname === "/app/brand-dna" ? "bg-[hsl(var(--sidebar-accent))] text-inverse" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
          <Sparkles size={16} /> Brand DNA
        </Link>}
        {hasProfileDna && <Link to="/app/profile-dna" onClick={onNavigate} aria-current={pathname === "/app/profile-dna" ? "page" : undefined}
          className={cn("flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px]", pathname === "/app/profile-dna" ? "bg-[hsl(var(--sidebar-accent))] text-inverse" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
          <Sparkles size={16} /> Profile DNA
        </Link>}
        <Link to="/app/brand-assets" onClick={onNavigate} aria-current={pathname === "/app/brand-assets" ? "page" : undefined}
          className={cn("flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px]",
            pathname === "/app/brand-assets" ? "bg-[hsl(var(--sidebar-accent))] text-inverse" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
          <AppIcon name="knowledge" size={16} /> Brand assets
        </Link>
      </div>

      <div className="mt-auto space-y-0.5 border-t border-[hsl(var(--sidebar-border))] p-2">
        {UTILITIES.map((u) => (
          <Link key={u.to} to={u.to} onClick={onNavigate}
            className="flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px] text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]">
            <AppIcon name={u.icon} size={16} /> {u.label}
          </Link>
        ))}
        {isSuperAdmin && (
          <>
            <LegacyGroup onNavigate={onNavigate} />
            <Link to="/app/admin" onClick={onNavigate}
              className="flex h-9 items-center gap-3 rounded-[10px] px-3 text-[13px] text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]">
              <AppIcon name="admin" size={16} /> Super Admin
            </Link>
            <Link to="/app/admin/brand" onClick={onNavigate}
              className="flex h-9 items-center gap-3 rounded-[10px] pl-10 pr-3 text-[13px] text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]">
              Brand Identity
            </Link>
          </>
        )}
        <button type="button" onClick={() => void signOut()}
          className="flex h-9 w-full items-center gap-3 rounded-[10px] px-3 text-[13px] text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]">
          <AppIcon name="signOut" size={16} /> Sign out
        </button>
      </div>
    </nav>
  );
}

function StageRail() {
  const { layout, updateLayout } = useWorkspaceUi();
  const { pathname } = useLocation();
  const active = currentModule(pathname);
  return (
    <nav aria-label="Stages" className="flex h-full flex-col items-center gap-1 bg-ink py-3 text-silver">
      <Link to="/app/home" aria-label="AutoSocials Home" className="mb-3"><BrandMark reversed size={24} /></Link>
      {layout.navCollapsed && <button type="button" onClick={() => updateLayout({ navCollapsed: false })} aria-label="Expand menu" title="Expand menu" className="hidden h-9 w-9 items-center justify-center rounded text-inverse hover:bg-[hsl(var(--sidebar-accent))] xl:flex"><PanelLeftOpen size={16} /></button>}
      <Link to="/app/home" title="Home" aria-label="Home" aria-current={pathname === "/app/home" ? "page" : undefined}
        className={cn("flex h-11 w-11 items-center justify-center rounded-[10px]", pathname === "/app/home" ? "bg-canvas text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}><House size={18} /></Link>
      <Link to="/app/virlo" title="Research" aria-label="Research" aria-current={pathname === "/app/virlo" ? "page" : undefined}
        className={cn("flex h-11 w-11 items-center justify-center rounded-[10px]", pathname === "/app/virlo" ? "bg-canvas text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}><AppIcon name="research" size={18} /></Link>
      {MODULES.map((m) => (
        <Link key={m.id} to={m.path} title={m.label} aria-label={m.label}
          className={cn("flex h-11 w-11 items-center justify-center rounded-[10px]",
            m.id === active && !pathname.startsWith("/app/research") && pathname !== "/app/virlo" && pathname !== "/app/models" && pathname !== "/app/home" ? "bg-canvas text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
          {m.id === "outreach" ? <Mail size={18} /> : <AppIcon name={m.id} size={18} />}
        </Link>
      ))}
      <Link to="/app/models" title="Models" aria-label="Models" aria-current={pathname === "/app/models" ? "page" : undefined}
        className={cn("flex h-11 w-11 items-center justify-center rounded-[10px]", pathname === "/app/models" ? "bg-canvas text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}><Sparkles size={18} /></Link>
      <Link to="/app/research/social-lens" title="Tools · Social Lens" aria-label="Social Lens"
        aria-current={pathname.startsWith("/app/research") ? "page" : undefined}
        className={cn("mt-2 flex h-11 w-11 items-center justify-center rounded-[10px]",
          pathname.startsWith("/app/research") ? "bg-canvas text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
        <AppIcon name="research" size={18} />
      </Link>
      <div className="mt-auto"><AgencyDashboardLink compact /></div>
    </nav>
  );
}

function HeaderShortcuts() {
  const { pathname } = useLocation();
  const { openYouTube, closeYouTube, youtube } = useWorkspaceUi();
  const shortcut = "flex h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-subtle hover:text-ink";
  return (
    <nav aria-label="Workspace shortcuts" className="flex shrink-0 items-center gap-0.5 border-r border-border pr-3">
      <Link to="/app/home" onClick={closeYouTube} aria-label="Home" title="Home" aria-current={pathname === "/app/home" && youtube === null ? "page" : undefined}
        className={cn(shortcut, pathname === "/app/home" && youtube === null && "bg-surface-subtle text-ink")}><House size={18} /></Link>
      <button type="button" onClick={() => openYouTube()} aria-label="Browse YouTube" title="Browse YouTube" aria-pressed={youtube !== null}
        className={cn(shortcut, youtube !== null && "bg-ink text-inverse hover:bg-ink hover:text-inverse")}><Youtube size={18} /></button>
    </nav>
  );
}

function PaneControls() {
  const { pathname } = useLocation();
  const isResearch = pathname.startsWith("/app/research");
  const { layout, updateLayout } = useWorkspaceUi();
  const btn = "hidden h-8 w-8 items-center justify-center rounded-[8px] text-text-secondary hover:bg-surface-subtle hover:text-ink xl:flex";
  return (
    <div className="flex items-center gap-0.5 border-r border-border pr-2">
      {!isResearch && <><button type="button" className={btn} disabled={layout.samCollapsed}
        onClick={() => updateLayout({ order: layout.order === "sam-live" ? "live-sam" : "sam-live" })}
        aria-label="Swap Sam and Live View" title="Swap Sam and Live View (Ctrl/⌘ ⇧ \)">
        <ArrowLeftRight size={16} />
      </button>
      {layout.samCollapsed && <button type="button" className={btn} onClick={() => updateLayout({ samCollapsed: false })} aria-label="Show Sam" title="Show Sam"><PanelRightOpen size={16} /></button>}</>}
    </div>
  );
}

function ScheduleBasketButton({ mobile = false }: { mobile?: boolean }) {
  const { openSchedulePane, basketCount } = useScheduleDialog();
  const navigate = useNavigate();
  return <button type="button" onClick={() => { void navigate({ to: "/app/schedule" }); openSchedulePane(); }} aria-label={basketCount ? `Open schedule, ${basketCount} selected` : "Open schedule"} title="Open schedule" className={cn("inline-flex items-center justify-center gap-1.5 text-sm font-semibold text-text-secondary hover:text-ink", mobile ? "h-12 text-xs" : "h-9 rounded-lg px-2 hover:bg-surface-subtle")}><CalendarDays size={16} />Schedule{basketCount > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-ink px-1 text-xs text-inverse">{basketCount}</span>}</button>;
}

function WorkspaceHeader() {
  const { currentWorkspace } = useWorkspace();
  const { profile, user, signOut } = useAuth();
  const { isSuperAdmin } = useSuperAdmin();
  const { pathname } = useLocation();
  const mod = MODULES.find((m) => m.id === currentModule(pathname))!;
  return (
    <header className="hidden h-12 shrink-0 items-center gap-3 border-b border-border bg-canvas px-4 md:flex">
      <HeaderShortcuts />
      <p className="min-w-0 truncate text-[13px]">
        <span className="font-semibold text-ink">{currentWorkspace?.name ?? "No business"}</span>
        <span className="text-text-secondary"> · {pathname === "/app/settings/deleted-items" ? "Settings · Deleted Items" : pathname === "/app/home" ? "Home" : pathname === "/app/virlo" ? "Research" : pathname.startsWith("/app/outreach") ? "Outreach" : pathname.startsWith("/app/research") ? "Tools · Social Lens" : pathname === "/app/models" ? "Models" : pathname === "/app/sam-creations" ? "Sam’s creations" : mod.label}</span>
      </p>
      <div className="ml-auto flex items-center gap-2">
        <ScheduleBasketButton />
        <PersonalReviewRefreshButton />
        <PaneControls />
        {isSuperAdmin && <UserSwitcherButton />}
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="Account" className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-inverse">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || "Account"} className="object-cover" />
              <AvatarFallback className="bg-ink text-inverse">
                {(profile?.full_name || "?").slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex min-w-0 flex-col gap-0.5">
              <span>{profile?.full_name || "Account"}</span>
              {user?.email && <span className="truncate text-[11px] font-normal text-text-secondary" title={user.email}>{user.email}</span>}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link to="/app/settings">Settings</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/app/team">People</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link to="/app/billing">Billing</Link></DropdownMenuItem>
            <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

const PANEL_KEY = "as_workspace_panels";
type PanelLayout = Record<string, number>;

function useIsWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1280px)");
    const on = () => setWide(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}

function Handle({ onReset }: { onReset: () => void }) {
  return (
    <ResizableHandle
      onDoubleClick={onReset}
      title="Drag to resize · double-click to reset"
      className="group pane-dot-cursor relative w-px bg-border transition-colors hover:bg-ink/40 focus-visible:bg-ink data-[separator=active]:bg-ink after:w-3"
    >
      <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink opacity-0 shadow-sm transition-all duration-150 group-hover:scale-125 group-hover:opacity-100 group-data-[separator=active]:scale-150 group-data-[separator=active]:opacity-100" />
    </ResizableHandle>
  );
}

function LiveContent() {
  const { youtube, closeYouTube } = useWorkspaceUi();
  const { currentWorkspace } = useWorkspace();
  return youtube ? <YouTubeBrowser key={currentWorkspace?.id ?? "none"} workspaceId={currentWorkspace?.id ?? null} initial={youtube} onClose={closeYouTube} /> : <><LegacyBanner />{currentWorkspace && <BrandDnaProgressBanner key={currentWorkspace.id} workspaceId={currentWorkspace.id} />}<Outlet /></>;
}

function DesktopPanes({ onOpenNav }: { onOpenNav: () => void }) {
  const { pathname } = useLocation();
  const isPublish = pathname.startsWith("/app/schedule") || pathname.startsWith("/app/research");
  const { layout, updateLayout } = useWorkspaceUi();
  const [saved, setSaved] = useState<PanelLayout | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const variant = `${layout.order}-${layout.samCollapsed ? "f" : "s"}-${layout.navCollapsed ? "r" : "n"}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`${PANEL_KEY}:${variant}`);
      setSaved(raw ? (JSON.parse(raw) as PanelLayout) : undefined);
    } catch { setSaved(undefined); }
    setReady(true);
  }, [variant, resetKey]);

  const reset = () => {
    try { localStorage.removeItem(`${PANEL_KEY}:${variant}`); } catch { /* ignore */ }
    setResetKey((k) => k + 1);
  };

  if (!ready) return null;

  const sam = layout.samCollapsed || isPublish ? null : (
    <ResizablePanel id="sam" key="sam" defaultSize={388} minSize={320} maxSize={560} className="flex min-h-0">
      <section aria-label="Sam" className="flex h-full w-full min-h-0 flex-col"><div className="flex justify-end border-b border-border bg-canvas px-3 py-1"><button type="button" onClick={() => updateLayout({ samCollapsed: true })} aria-label="Hide Sam" title="Hide Sam" className="rounded p-1 text-text-secondary hover:bg-surface-subtle"><PanelRightClose size={16} /></button></div><div className="flex min-h-0 flex-1"><SamPane onOpenNav={onOpenNav} /></div></section>
    </ResizablePanel>
  );
  const live = (
    <ResizablePanel id="live" key="live" minSize={480} className="flex min-h-0">
      <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"><LiveContent /></main>
    </ResizablePanel>
  );
  const work = layout.order === "sam-live" ? [sam, live] : [live, sam];
  const items = work.filter(Boolean) as JSX.Element[];

  return (
    <ResizablePanelGroup disableCursor
      key={`${variant}-${resetKey}`}
      orientation="horizontal"
      {...(saved ? { defaultLayout: saved } : {})}
      onLayoutChanged={(l) => { try { localStorage.setItem(`${PANEL_KEY}:${variant}`, JSON.stringify(l)); } catch { /* ignore */ } }}
      className="min-h-0 flex-1"
    >
      {layout.navCollapsed ? (
        <div className="w-16 shrink-0"><StageRail /></div>
      ) : (
        <>
          <ResizablePanel id="nav" defaultSize={224} minSize={200} maxSize={300} className="min-h-0"><NavPane /></ResizablePanel>
          <Handle onReset={reset} />
        </>
      )}
      <ResizablePanel id="work" minSize={800} className="flex min-h-0 min-w-0 flex-col">
        <WorkspaceHeader />
        <div className="flex min-h-0 flex-1">
          {items.length === 2 ? (
            <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
              {items[0]}
              <Handle onReset={reset} />
              {items[1]}
            </ResizablePanelGroup>
          ) : items[0]}
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function ShellInner() {
  const { pathname } = useLocation();
  const isResearch = pathname.startsWith("/app/research");
  const isPublish = pathname.startsWith("/app/schedule") || isResearch;
  const { mobileView, setMobileView, layout, updateLayout, openYouTube, closeYouTube } = useWorkspaceUi();
  const [drawer, setDrawer] = useState(false);
  const wide = useIsWide();

  useEffect(() => { closeYouTube(); }, [pathname, closeYouTube]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key !== "\\") return;
      e.preventDefault();
      if (e.shiftKey) updateLayout({ order: layout.order === "sam-live" ? "live-sam" : "sam-live" });
      else updateLayout({ samCollapsed: !layout.samCollapsed });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layout, updateLayout]);

  const drawerEl = drawer && (
    <div className="fixed inset-0 z-50 flex xl:hidden">
      <div className="h-full w-[min(260px,85vw)]"><NavPane onNavigate={() => setDrawer(false)} /></div>
      <button type="button" aria-label="Close navigation" className="flex-1 bg-ink/40" onClick={() => setDrawer(false)} />
    </div>
  );

  return (
    <div className="panes-no-scrollbar flex h-dvh flex-col overflow-hidden bg-canvas text-foreground">
      <ImpersonationBar />
      {wide ? (
        <div className="flex min-h-0 flex-1"><DesktopPanes onOpenNav={() => setDrawer(true)} /></div>
      ) : (
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-16 shrink-0 lg:block">
          <StageRail />
        </aside>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <WorkspaceHeader />
        <div className="flex min-h-0 flex-1">
        {drawerEl}
        {!isPublish && <section
          aria-label="Sam"
          className={cn(
            "min-h-0 w-full shrink-0 border-r border-border md:w-[340px]",
            mobileView === "sam" ? "flex" : "hidden md:flex",
          )}
        >
          <SamPane onOpenNav={() => setDrawer(true)} />
        </section>}
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col bg-surface",
            !isResearch && mobileView === "sam" ? "hidden md:flex" : "flex",
          )}
        >
          <LiveContent />
        </main>
        </div>
        </div>
      </div>
      )}

      {/* Mobile switcher */}
      <div className={cn("grid border-t border-border bg-canvas md:hidden", isResearch ? "grid-cols-4" : "grid-cols-5")} style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {(isResearch ? ["work", "live"] as const : ["work", "sam", "live"] as const).map((v) => (
          <button key={v} type="button"
            onClick={() => (v === "work" ? setDrawer(true) : setMobileView(v))}
            className={cn("h-12 text-[13px] font-medium", mobileView === v && v !== "work" ? "text-ink underline underline-offset-4" : "text-muted-foreground")}>
            {v === "work" ? "Work" : v === "sam" ? "Sam" : "Live View"}
          </button>
        ))}
        <ScheduleBasketButton mobile />
        <button type="button" onClick={() => openYouTube()} aria-label="Browse YouTube" className="flex h-12 items-center justify-center gap-1 text-[13px] font-medium text-muted-foreground"><Youtube size={16} />YouTube</button>
      </div>
    </div>
  );
}

export default function WorkspaceShell() {
  return (
    <WorkspaceUiProvider>
      <ScheduleDialogHost><PersonalReviewConnectionWatcher /><ShellInner /><UploadTray /></ScheduleDialogHost>
    </WorkspaceUiProvider>
  );
}
