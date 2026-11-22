import { KeyRound } from "lucide-react";
import { ElevenLabsCard } from "@/features/integrations/ElevenLabsCard";
import { VideoStorageCard } from "@/features/integrations/VideoStorageCard";
const PlatformIntegrationsTab = () => <div className="space-y-6"><VideoStorageCard /><ElevenLabsCard workspaceId={null} /></div>;
import OverviewTab from "@/components/admin/OverviewTab";
import { PeopleUsersTab, PeopleAgenciesTab, PeopleWorkspacesTab, PeopleSubscribersTab } from "@/components/admin/PeopleTabs";
import { Briefcase } from "lucide-react";
import SocialTilesHistory from "@/features/admin/SocialTilesHistory";
import { Building2 } from "lucide-react";
import { Home } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useSuperAdmin } from "@/hooks/useSuperAdmin";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Shield, Users, FileText, Globe, Eye, Clock, AlertTriangle,
  CheckCircle2, Loader2, RefreshCw, ExternalLink, BarChart3,
  Search, TrendingUp, DollarSign, UserCheck, Activity,
  LineChart, SearchCode, Brain, Workflow, ShieldAlert, Map as MapIcon
} from "lucide-react";
import DataSourcesTab from "@/components/admin/DataSourcesTab";
import WebAnalyticsTab from "@/components/admin/WebAnalyticsTab";
import GoogleAnalyticsTab from "@/components/admin/GoogleAnalyticsTab";
import PricingEconomicsTab from "@/components/admin/PricingEconomicsTab";
import SearchConsoleTab from "@/components/admin/SearchConsoleTab";
import MemoryTab from "@/components/admin/MemoryTab";
import StorageExportTab from "@/components/admin/StorageExportTab";
import SocialLensReportsTab from "@/components/admin/SocialLensReportsTab";
import { Archive } from "lucide-react";
import RoadmapPage from "@/pages/app/RoadmapPage";
import AgentTracesPage from "@/pages/app/AgentTracesPage";
import AgentApprovalsPage from "@/pages/app/AgentApprovalsPage";
import { cn } from "@/lib/utils";
import AdminContentLibrary from "@/features/admin/AdminContentLibrary";

// ═══════════ CREATOR PAGES TAB ═══════════
type CreatorPage = {
  id: string;
  platform: string;
  username: string;
  display_name: string | null;
  slug: string;
  status: string;
  review_status: string;
  is_indexable: boolean;
  low_data_warning: boolean;
  duplicate_risk: boolean;
  page_views: number;
  ai_summary: string | null;
  created_at: string | null;
  published_at: string | null;
};

const statusColors: Record<string, string> = {
  published: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  draft: "bg-amber-500/10 text-amber-700 border-amber-500/20",
};

const reviewColors: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  needs_review: "bg-orange-500/10 text-orange-700 border-orange-500/20",
};

const PAGE_SIZE = 50;

function Pager({ page, total, onPage }: { page: number; total: number; onPage: (p: number) => void }) {
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <span>Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="outline" size="sm" disabled={to >= total} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

function CreatorPagesTab() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [search]);

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["admin-creator-pages-stats"],
    queryFn: async () => {
      const { data } = await supabase.rpc("admin_creator_page_stats" as any);
      const row = (Array.isArray(data) ? data[0] : data) as any;
      return { total: Number(row?.total ?? 0), published: Number(row?.published ?? 0), needsReview: Number(row?.needs_review ?? 0), views: Number(row?.total_views ?? 0) };
    },
  });

  const { data: result, isLoading, refetch: refetchRows } = useQuery({
    queryKey: ["admin-creator-pages", page, search],
    queryFn: async () => {
      let q = supabase.from("public_creator_pages" as any).select("*", { count: "exact" });
      const s = search.trim().replace(/[%,()]/g, "");
      if (s) q = q.or(`username.ilike.%${s}%,display_name.ilike.%${s}%`);
      const { data, count } = await q.order("created_at", { ascending: false }).range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      return { rows: (data || []) as unknown as CreatorPage[], count: count ?? 0 };
    },
  });
  const refetch = () => { refetchRows(); refetchStats(); };

  async function toggleStatus(page: CreatorPage) {
    const newStatus = page.status === "published" ? "draft" : "published";
    await supabase
      .from("public_creator_pages" as any)
      .update({ status: newStatus, published_at: newStatus === "published" ? new Date().toISOString() : null, updated_at: new Date().toISOString() } as any)
      .eq("id", page.id);
    refetch();
  }

  async function toggleReview(page: CreatorPage) {
    const newReview = page.review_status === "approved" ? "needs_review" : "approved";
    await supabase
      .from("public_creator_pages" as any)
      .update({ review_status: newReview, updated_at: new Date().toISOString() } as any)
      .eq("id", page.id);
    refetch();
  }

  const filtered = result?.rows ?? [];

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: FileText, label: "Total Pages", value: (stats?.total ?? 0).toLocaleString(), color: "text-blue-500" },
          { icon: Globe, label: "Published", value: (stats?.published ?? 0).toLocaleString(), color: "text-emerald-500" },
          { icon: AlertTriangle, label: "Needs Review", value: (stats?.needsReview ?? 0).toLocaleString(), color: "text-orange-500" },
          { icon: Eye, label: "Total Views", value: (stats?.views ?? 0).toLocaleString(), color: "text-purple-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
            </div>
            <span className="text-xl font-bold text-foreground">{stat.value}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search creators..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Creator</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Platform</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Review</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Views</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Flags</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Created</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((page) => (
                  <tr key={page.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="p-3">
                      <p className="font-medium text-foreground">{page.display_name || page.username}</p>
                      <p className="text-xs text-muted-foreground">@{page.username}</p>
                    </td>
                    <td className="p-3">
                      <span className="text-xs capitalize px-2 py-0.5 bg-secondary rounded-md">{page.platform}</span>
                    </td>
                    <td className="p-3">
                      <button onClick={() => toggleStatus(page)}>
                        <Badge variant="outline" className={`text-[10px] cursor-pointer ${statusColors[page.status] || ""}`}>
                          {page.status}
                        </Badge>
                      </button>
                    </td>
                    <td className="p-3">
                      <button onClick={() => toggleReview(page)}>
                        <Badge variant="outline" className={`text-[10px] cursor-pointer ${reviewColors[page.review_status] || ""}`}>
                          {page.review_status}
                        </Badge>
                      </button>
                    </td>
                    <td className="p-3 text-xs font-medium text-foreground">{page.page_views || 0}</td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {page.low_data_warning && <span title="Low data"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></span>}
                        {page.duplicate_risk && <span title="Duplicate risk"><AlertTriangle className="w-3.5 h-3.5 text-destructive" /></span>}
                        {page.ai_summary && <span title="Has AI summary"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /></span>}
                      </div>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {page.created_at ? new Date(page.created_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3">
                      <a href={`https://autosocialsapp.lovable.app/${page.platform}/${page.username}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:text-primary/80">
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-muted-foreground text-sm">No creator pages found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pager page={page} total={result?.count ?? 0} onPage={setPage} />
    </div>
  );
}

async function headCount(table: string, apply?: (q: any) => any) {
  let q: any = supabase.from(table as any).select("id", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count } = await q;
  return count ?? 0;
}

// ═══════════ USERS TAB ═══════════
export function LegacyUsersTab() {
  const [page, setPage] = useState(0);
  const { data: result, isLoading } = useQuery({
    queryKey: ["admin-all-profiles", page],
    queryFn: async () => {
      const { data, count } = await supabase.from("profiles")
        .select("id, full_name, account_type, onboarding_completed, created_at, workspace_id", { count: "exact" })
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      return { rows: data || [], count: count ?? 0 };
    },
  });
  const profiles = result?.rows ?? [];
  const { data: ustats } = useQuery({
    queryKey: ["admin-profile-stats"],
    queryFn: async () => ({
      total: await headCount("profiles"),
      onboarded: await headCount("profiles", (q) => q.eq("onboarding_completed", true)),
      direct: await headCount("profiles", (q) => q.or("account_type.eq.direct,account_type.is.null")),
      agency: await headCount("profiles", (q) => q.eq("account_type", "agency")),
    }),
  });

  const ids = profiles.map((p: any) => p.id);
  const { data: sessions = [] } = useQuery({
    queryKey: ["admin-recent-sessions", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_sessions")
        .select("user_id, logged_in_at")
        .in("user_id", ids)
        .order("logged_in_at", { ascending: false })
        .limit(1000);
      return data || [];
    },
  });

  const lastLoginMap = new Map<string, string>();
  sessions.forEach((s: any) => {
    if (!lastLoginMap.has(s.user_id)) lastLoginMap.set(s.user_id, s.logged_in_at);
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: Users, label: "Total Users", value: (ustats?.total ?? 0).toLocaleString(), color: "text-blue-500" },
          { icon: UserCheck, label: "Onboarded", value: (ustats?.onboarded ?? 0).toLocaleString(), color: "text-emerald-500" },
          { icon: Activity, label: "Direct", value: (ustats?.direct ?? 0).toLocaleString(), color: "text-purple-500" },
          { icon: Shield, label: "Agency", value: (ustats?.agency ?? 0).toLocaleString(), color: "text-orange-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
            </div>
            <span className="text-xl font-bold text-foreground">{stat.value}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Onboarded</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Last Login</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Joined</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p: any) => (
                  <tr key={p.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="p-3">
                      <p className="font-medium text-foreground">{p.full_name || "Unnamed"}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{p.id.slice(0, 8)}...</p>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px] capitalize">{p.account_type || "direct"}</Badge>
                    </td>
                    <td className="p-3">
                      {p.onboarding_completed
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        : <Clock className="w-4 h-4 text-muted-foreground" />
                      }
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {lastLoginMap.get(p.id)
                        ? new Date(lastLoginMap.get(p.id)!).toLocaleDateString()
                        : "Never"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pager page={page} total={result?.count ?? 0} onPage={setPage} />
    </div>
  );
}

// ═══════════ SUBSCRIPTIONS TAB ═══════════
function SubscriptionsTab() {
  const [page, setPage] = useState(0);
  const { data: result, isLoading } = useQuery({
    queryKey: ["admin-subscriptions-panel", page],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("workspace_subscriptions")
        .select("*, workspaces(name)", { count: "exact" })
        .order("updated_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      return { rows: data || [], count: count ?? 0 };
    },
  });
  const subs = result?.rows ?? [];
  const { data: sstats } = useQuery({
    queryKey: ["admin-subscription-stats"],
    queryFn: async () => ({
      total: await headCount("workspace_subscriptions"),
      active: await headCount("workspace_subscriptions", (q) => q.in("subscription_status", ["active", "trialing"])),
      trialing: await headCount("workspace_subscriptions", (q) => q.eq("subscription_status", "trialing")),
      canceled: await headCount("workspace_subscriptions", (q) => q.eq("subscription_status", "canceled")),
    }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { icon: DollarSign, label: "Total Subs", value: (sstats?.total ?? 0).toLocaleString(), color: "text-blue-500" },
          { icon: TrendingUp, label: "Active", value: (sstats?.active ?? 0).toLocaleString(), color: "text-emerald-500" },
          { icon: Clock, label: "Trialing", value: (sstats?.trialing ?? 0).toLocaleString(), color: "text-amber-500" },
          { icon: AlertTriangle, label: "Cancelled", value: (sstats?.canceled ?? 0).toLocaleString(), color: "text-destructive" },
        ].map((stat) => (
          <div key={stat.label} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-1.5 mb-2">
              <stat.icon className={`w-3.5 h-3.5 ${stat.color}`} />
              <span className="text-[11px] text-muted-foreground">{stat.label}</span>
            </div>
            <span className="text-xl font-bold text-foreground">{stat.value}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left p-3 font-medium text-muted-foreground">Workspace</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Plan</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Period End</th>
                  <th className="text-left p-3 font-medium text-muted-foreground">Updated</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors">
                    <td className="p-3 font-medium text-foreground">{(s as any).workspaces?.name || "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-[10px] capitalize">{s.plan_key || "free"}</Badge>
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className={`text-[10px] ${
                        s.subscription_status === "active" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" :
                        s.subscription_status === "trialing" ? "bg-amber-500/10 text-amber-700 border-amber-500/20" :
                        "bg-destructive/10 text-destructive border-destructive/20"
                      }`}>
                        {s.subscription_status}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}
                    </td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {s.updated_at ? new Date(s.updated_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <Pager page={page} total={result?.count ?? 0} onPage={setPage} />
    </div>
  );
}

// ═══════════ MAIN ADMIN PANEL ═══════════
const SuperAdminPanel = ({ section = "creator-pages" }: { section?: string }) => {
  const { isSuperAdmin, isLoading } = useSuperAdmin();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isSuperAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <Shield className="w-12 h-12 text-destructive" />
        <h2 className="text-xl font-bold text-foreground">Access Denied</h2>
        <p className="text-sm text-muted-foreground">You do not have super admin privileges.</p>
        <Button variant="outline" onClick={() => navigate("/app")}>Go back</Button>
      </div>
    );
  }

  const current = ADMIN_SECTIONS.find((s) => s.id === section) ?? ADMIN_SECTIONS[0]!;
  const Component = current.component;
  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl space-y-4 p-4 sm:p-6">
      {!current.ownHeader && (
        <div>
          <h2 className="text-2xl font-bold text-foreground">{current.label}</h2>
          {current.description && <p className="text-sm text-muted-foreground">{current.description}</p>}
        </div>
      )}
      <Component />
    </div>
  );
};

export const ADMIN_GROUPS = ["Overview", "People", "Content", "Economics", "SEO", "Analytics", "Data", "Agents", "Brand & planning", "Platform"] as const;
export type AdminGroup = (typeof ADMIN_GROUPS)[number];

export const ADMIN_SECTIONS: {
  id: string;
  label: string;
  icon: typeof Shield;
  component: React.ComponentType;
  description?: string;
  group: AdminGroup;
  ownHeader?: boolean;
}[] = [
  { id: "overview", label: "Overview", icon: Home, component: OverviewTab, group: "Overview", ownHeader: true },
  { id: "creator-pages", label: "Creator Pages", icon: Globe, component: CreatorPagesTab, description: "Public SEO profiles.", group: "SEO" },
  { id: "social-lens", label: "Social Lens", icon: Eye, component: SocialLensReportsTab, description: "Saved reports across workspaces.", group: "SEO" },
  { id: "content-videos", label: "Video library", icon: Archive, component: AdminContentLibrary, group: "Content", ownHeader: true },
  { id: "social-tiles", label: "Social Tiles", icon: Archive, component: SocialTilesHistory, description: "Design requests, models and provider usage.", group: "Content" },
  { id: "users", label: "Users", icon: Users, component: PeopleUsersTab, description: "Every account, last activity, and delete.", group: "People" },
  { id: "agencies", label: "Agencies", icon: Building2, component: PeopleAgenciesTab, description: "Every agency and how many clients it manages.", group: "People" },
  { id: "workspaces", label: "Workspaces", icon: Briefcase, component: PeopleWorkspacesTab, description: "Every workspace and which agency manages it.", group: "People" },
  { id: "subscribers", label: "Subscribers", icon: DollarSign, component: PeopleSubscribersTab, description: "Workspace plans, billing and credit periods.", group: "People" },
  { id: "subscriptions", label: "Subscriptions", icon: DollarSign, component: SubscriptionsTab, description: "Plan and billing status by workspace.", group: "Economics" },
  { id: "pricing-economics", label: "Pricing Economics", icon: TrendingUp, component: PricingEconomicsTab, group: "Economics" },
  { id: "data-sources", label: "Data Sources", icon: Activity, component: DataSourcesTab, group: "Data" },
  { id: "storage-export", label: "Storage Export", icon: Archive, component: StorageExportTab, description: "Download every Storage bucket as a progress-tracked ZIP archive.", group: "Data" },
  { id: "web-analytics", label: "Web Analytics", icon: BarChart3, component: WebAnalyticsTab, group: "Analytics" },
  { id: "google-analytics", label: "Google Analytics", icon: LineChart, component: GoogleAnalyticsTab, group: "Analytics", ownHeader: true },
  { id: "search-console", label: "Search Console", icon: SearchCode, component: SearchConsoleTab, group: "Analytics", ownHeader: true },
  { id: "memory", label: "Memory", icon: Brain, component: MemoryTab, description: "Live mirror of mem:// — persona, rules, and context.", group: "Agents" },
  { id: "integrations", label: "Integrations", icon: KeyRound, component: PlatformIntegrationsTab, description: "Platform keys and render engines used by every workspace.", group: "Platform" },
  { id: "roadmap", label: "Roadmap", icon: MapIcon, component: RoadmapPage, description: "Master build plan across all six core engines.", group: "Brand & planning" },
  { id: "agent-traces", label: "Agent Traces", icon: Workflow, component: AgentTracesPage, description: "Every agent run, skill, tool call, and outcome.", group: "Agents" },
  { id: "agent-approvals", label: "Agent Approvals", icon: ShieldAlert, component: AgentApprovalsPage, description: "Pending high-risk actions awaiting human approval.", group: "Agents" },
];

export default SuperAdminPanel;
