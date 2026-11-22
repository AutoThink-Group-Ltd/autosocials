import { Link, Outlet, useLocation, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { ChevronRight, Gauge, LayoutGrid, Palette, Film, Wallet, Cpu, Menu, ListTree } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { AppIcon } from "@/components/brand/AppIcon";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_GROUPS, ADMIN_SECTIONS, type AdminGroup } from "@/pages/app/SuperAdminPanel";
import { cn } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ImpersonationBar, UserSwitcherButton } from "./UserSwitcher";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const engineLinks = [
  { id: "hyperframes", label: "HyperFrames" }, { id: "golpo", label: "Golpo.io" },
  { id: "openai", label: "OpenAI" }, { id: "higgsfield", label: "Higgsfield" },
  { id: "kie", label: "Kie" }, { id: "ideogram", label: "Ideogram" }, { id: "recraft", label: "Recraft" }, { id: "heygen", label: "HeyGen" },
] as const;

const item = "flex min-h-11 items-center gap-3 rounded-[10px] px-3 text-[13px] transition-colors md:min-h-9";

/** Menu entries that are their own route rather than a tab on /app/admin. */
const ROUTE_ITEMS: Partial<Record<AdminGroup, { to: "/app/admin/brand" | "/app/admin/seo" | "/app/admin/seo-plan" | "/app/admin/generations" | "/app/admin/higgsfield" | "/app/admin/engine-economics" | "/app/admin/virlo-usage" | "/app/admin/agent-access"; label: string; icon: typeof Palette; match: (path: string) => boolean }[]>> = {
  "Economics": [{ to: "/app/admin/engine-economics", label: "Engine Economics", icon: Wallet, match: p => p.startsWith("/app/admin/engine-economics") || p.startsWith("/app/admin/engine-costs") || p.startsWith("/app/admin/higgsfield") }, { to: "/app/admin/virlo-usage", label: "Virlo usage", icon: Wallet, match: p => p.startsWith("/app/admin/virlo-usage") }],
  "Platform": [{ to: "/app/admin/generations", label: "Generation tracker", icon: Film, match: p => p.startsWith("/app/admin/generations") }],
  "Agents": [{ to: "/app/admin/agent-access", label: "API and AI agent activity", icon: Cpu, match: p => p.startsWith("/app/admin/agent-access") }],
  "SEO": [
    { to: "/app/admin/seo", label: "SEO health", icon: Gauge, match: (p) => p === "/app/admin/seo" },
    { to: "/app/admin/seo-plan", label: "SEO plan", icon: ListTree, match: (p) => p.startsWith("/app/admin/seo-plan") },
  ],
  "Brand & planning": [
    { to: "/app/admin/brand", label: "Brand Identity", icon: Palette, match: (p) => p.startsWith("/app/admin/brand") },
  ],
};

/** Full-width Super Admin console: carbon sidebar + header, no Sam pane. */
export default function AdminShell() {
  const { pathname } = useLocation();
  const search = useSearch({ strict: false }) as { tab?: string };
  const { profile, signOut } = useAuth();
  const onPanel = pathname === "/app/admin" || pathname === "/app/admin/";
  const activeTab = onPanel ? (search.tab ?? "overview") : null;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const [navigationOpen, setNavigationOpen] = useState(false);
  const enginesOpen = openGroups["Engines"] ?? pathname.startsWith("/app/admin/engines");

  const navigation = (
        <nav aria-label="Admin" className="flex h-full min-h-0 w-full flex-col bg-ink text-silver"
          onClick={(event) => { if ((event.target as HTMLElement).closest("a")) setNavigationOpen(false); }}>
          <div className="flex h-12 items-center gap-2 px-4">
            <Logo reversed size={20} />
          </div>
          <p className="px-4 pb-2 text-[11px] font-medium uppercase tracking-wider text-silver">Super Admin</p>
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2">
            <div className="pb-1">
              <button type="button" onClick={() => setOpenGroups((o) => ({ ...o, Engines: !enginesOpen }))} aria-expanded={enginesOpen}
                className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 text-[11px] font-medium uppercase tracking-wider text-silver hover:text-inverse md:min-h-8">
                <span className="truncate">Engines</span><span className="ml-auto tabular-nums">{engineLinks.length + 1}</span>
                <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", enginesOpen && "rotate-90")} />
              </button>
              {enginesOpen && <div className="space-y-0.5">
                <Link to="/app/admin/engines" aria-current={pathname.replace(/\/$/, "") === "/app/admin/engines" ? "page" : undefined}
                  className={cn(item, pathname.replace(/\/$/, "") === "/app/admin/engines" ? "bg-canvas font-medium text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}><Cpu className="h-4 w-4 shrink-0" />Overview</Link>
                {engineLinks.map((engine) => <Link key={engine.id} to="/app/admin/engines/$engine" params={{ engine: engine.id }} aria-current={pathname.replace(/\/$/, "") === `/app/admin/engines/${engine.id}` ? "page" : undefined}
                  className={cn(item, pathname.replace(/\/$/, "") === `/app/admin/engines/${engine.id}` ? "bg-canvas font-medium text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}><Film className="h-4 w-4 shrink-0" /><span className="truncate">{engine.label}</span></Link>)}
              </div>}
            </div>
            {ADMIN_GROUPS.map((g) => {
              const extras = ROUTE_ITEMS[g] ?? [];
              const items = ADMIN_SECTIONS.filter((x) => x.group === g);
              const hasActive = items.some((x) => x.id === activeTab) || extras.some((x) => x.match(pathname));
              const open = openGroups[g] ?? hasActive;
              if (g === "Overview") return items.map((s) => {
                const Icon = s.icon;
                const active = activeTab === s.id;
                return (
                  <Link key={s.id} to="/app/admin" search={{ tab: s.id }} aria-current={active ? "page" : undefined}
                    className={cn(item, "mb-2", active ? "bg-canvas font-medium text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
                    <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{s.label}</span>
                  </Link>
                );
              });
              return (
                <div key={g} className="pb-1">
                  <button type="button" onClick={() => setOpenGroups((o) => ({ ...o, [g]: !open }))} aria-expanded={open}
                    className="flex min-h-11 w-full items-center gap-2 rounded-[8px] px-3 text-[11px] font-medium uppercase tracking-wider text-silver hover:text-inverse md:min-h-8">
                    <span className="truncate">{g}</span>
                    <span className="ml-auto tabular-nums">{items.length + extras.length}</span>
                    <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-90")} />
                  </button>
                  {open && (
                    <div className="space-y-0.5">
                      {extras.map((x) => {
                        const Icon = x.icon;
                        const active = x.match(pathname);
                        return (
                          <Link key={x.to} to={x.to}
                            aria-current={active ? "page" : undefined}
                            className={cn(item, active ? "bg-canvas font-medium text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
                            <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{x.label}</span>
                          </Link>
                        );
                      })}
                      {items.map((s) => {
                        const Icon = s.icon;
                        const active = activeTab === s.id;
                        return (
                          <Link key={s.id} to="/app/admin" search={{ tab: s.id }}
                            aria-current={active ? "page" : undefined}
                            className={cn(item, active ? "bg-canvas font-medium text-ink" : "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
                            <Icon className="h-4 w-4 shrink-0" /> <span className="truncate">{s.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="space-y-0.5 border-t border-[hsl(var(--sidebar-border))] p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            <Link to="/app/create" className={cn(item, "text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
              <LayoutGrid className="h-4 w-4" /> Open workspace
            </Link>
            <button type="button" onClick={() => void signOut()} className={cn(item, "w-full text-inverse/85 hover:bg-[hsl(var(--sidebar-accent))]")}>
              <AppIcon name="signOut" size={16} /> Sign out
            </button>
          </div>
        </nav>
  );

  return (
    <div className="panes-no-scrollbar flex h-dvh flex-col overflow-hidden bg-canvas text-foreground">
      <ImpersonationBar />
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[232px] shrink-0 md:block">{navigation}</div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border bg-canvas px-2 sm:gap-3 sm:px-4">
            <Sheet open={navigationOpen} onOpenChange={setNavigationOpen}>
              <SheetTrigger asChild>
                <button type="button" aria-label="Open admin navigation" className="grid size-11 shrink-0 place-items-center rounded-lg hover:bg-surface-subtle md:hidden"><Menu className="size-5" /></button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-[min(85vw,320px)] flex-col gap-0 border-0 bg-ink p-0 text-silver md:hidden">
                <SheetTitle className="sr-only">Super Admin navigation</SheetTitle>
                <SheetDescription className="sr-only">Navigate the admin console.</SheetDescription>
                {navigation}
              </SheetContent>
            </Sheet>
            <p className="min-w-0 truncate text-[13px] font-semibold text-ink">Admin console</p>
            <div className="ml-auto flex items-center gap-2">
              <Link to="/app/create" className="hidden h-8 items-center gap-2 rounded-[10px] border border-border-control bg-surface px-3 text-[12px] font-medium hover:bg-surface-subtle sm:inline-flex">
                <LayoutGrid className="h-3.5 w-3.5" /> Open workspace
              </Link>
              <UserSwitcherButton />
              <DropdownMenu>
                <DropdownMenuTrigger aria-label="Account" className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-inverse">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={profile?.avatar_url || undefined} alt={profile?.full_name || "Account"} className="object-cover" />
                    <AvatarFallback className="bg-ink text-inverse">
                      {(profile?.full_name || "?").slice(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>{profile?.full_name || "Account"}</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link to="/app/create">Open workspace</Link></DropdownMenuItem>
                  <DropdownMenuItem onClick={() => void signOut()}>Sign out</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain bg-surface"><Outlet /></main>
        </div>
      </div>
    </div>
  );
}
