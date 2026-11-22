import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, TrendingUp, Mail, MessageSquare, BarChart3, Plus, AlertTriangle, Clock, CalendarCheck, FileText, Sparkles, Unplug, BellRing } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "@/lib/router-compat";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { ClientAvatar } from "@/features/agency/ClientAvatar";
import { useAgencyRole } from "@/features/agency/useAgencyRole";
import { ClientPanelSheet, type ClientPanel } from "@/features/agency/ClientPanels";
import InviteClientDialog from "@/components/agency/InviteClientDialog";
import { summarizeClient, type ClientSummary, type ClientStatusKey, type PostLite } from "@/lib/client-status";

const STATUS: Record<ClientStatusKey, { label: string; icon: typeof Clock; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  attention: { label: "Needs attention", icon: AlertTriangle, variant: "destructive" },
  approval: { label: "Awaiting approval", icon: Clock, variant: "default" },
  scheduled: { label: "Scheduled", icon: CalendarCheck, variant: "default" },
  drafts: { label: "Drafts only", icon: FileText, variant: "secondary" },
  empty: { label: "No content", icon: Sparkles, variant: "outline" },
  disconnected: { label: "Disconnected", icon: Unplug, variant: "outline" },
};

const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const AgencyDashboardPage = () => {
  const { user, profile } = useAuth();
  const { workspaces, setCurrentWorkspace } = useWorkspace();
  const { isAdmin, ownerId, loading: roleLoading } = useAgencyRole();
  const navigate = useNavigate();
  const [clients, setClients] = useState<any[]>([]);
  const [summaries, setSummaries] = useState<Record<string, ClientSummary>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<"client" | "agency" | "personal">("client");
  const openCreate = (mode: "client" | "agency" | "personal") => { setWorkspaceMode(mode); setInviteOpen(true); };
  const [panel, setPanel] = useState<ClientPanel>(null);

  const [totalEmailsSent, setTotalEmailsSent] = useState(0);
  const [totalReplies, setTotalReplies] = useState(0);
  const [activeCampaigns, setActiveCampaigns] = useState(0);

  useEffect(() => {
    if (roleLoading) return;
    if (user && ownerId) {
      void fetchData(ownerId);
      const refreshOnFocus = () => void fetchData(ownerId);
      window.addEventListener("focus", refreshOnFocus);
      return () => window.removeEventListener("focus", refreshOnFocus);
    }
    setClients([]);
    setLoadError(!!user);
    setLoading(false);
    return undefined;
  }, [user?.id, ownerId, roleLoading]);

  const fetchData = async (agencyOwnerId: string) => {
    setLoading(true);
    setLoadError(false);
    const clientRes = await supabase.from("agency_clients").select("*")
      .eq("agency_user_id", agencyOwnerId).eq("status", "active").neq("workspace_kind", "lead");
    if (clientRes.error) {
      setLoadError(true);
      setLoading(false);
      return;
    }
    const clientsData = clientRes.data || [];
    setClients(clientsData);
    setTotalEmailsSent(0);
    setTotalReplies(0);
    setActiveCampaigns(0);
    setSummaries({});

    if (clientsData.length > 0) {
      const workspaceIds = clientsData.map((c: any) => c.workspace_id);
      const [emailRes, replyRes, folderRes, postRes] = await Promise.all([
        supabase.from("email_send_log").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds),
        supabase.from("email_replies").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds),
        supabase.from("email_folders").select("id", { count: "exact", head: true }).in("workspace_id", workspaceIds),
        supabase.from("posts").select("workspace_id,status,scheduled_at,published_at").in("workspace_id", workspaceIds).limit(5000),
      ]);
      setTotalEmailsSent(emailRes.count || 0);
      setTotalReplies(replyRes.count || 0);
      setActiveCampaigns(folderRes.count || 0);

      const byWs: Record<string, PostLite[]> = {};
      for (const row of (postRes.data || []) as any[]) (byWs[row.workspace_id] ||= []).push(row);
      const next: Record<string, ClientSummary> = {};
      for (const c of clientsData as any[]) next[c.workspace_id] = summarizeClient(byWs[c.workspace_id] || []);
      setSummaries(next);
    }
    setLoading(false);
  };

  const ownWorkspaces = clients.filter((c) => c.workspace_kind !== "client");
  const clientWorkspaces = clients.filter((c) => c.workspace_kind === "client");
  const conversionRate = totalEmailsSent > 0 ? ((totalReplies / totalEmailsSent) * 100).toFixed(3) : "0.000";

  const stats = [
    { label: "Total Clients", value: clientWorkspaces.length.toString(), icon: Users },
    { label: "Emails Sent", value: totalEmailsSent.toLocaleString(), icon: Mail },
    { label: "Replies", value: totalReplies.toLocaleString(), icon: MessageSquare },
    { label: "Reply Rate", value: `${conversionRate}%`, icon: TrendingUp },
    { label: "Active Campaigns", value: activeCampaigns.toString(), icon: BarChart3 },
  ];

  const openClient = (workspaceId: string, path = "/app") => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) { toast.error("Couldn't open this client workspace. Refresh and try again."); return; }
    setCurrentWorkspace(ws);
    navigate(path);
  };

  const renderCards = (items: any[]) => (
    <>
            {items.map((client) => {
              const s = summaries[client.workspace_id] || summarizeClient([]);
              const meta = STATUS[s.status];
              const Icon = meta.icon;
              return (
                <Card
                  key={client.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openClient(client.workspace_id)}
                  onKeyDown={(e) => e.key === "Enter" && openClient(client.workspace_id)}
                  className="border-2 border-border hover:border-foreground transition-colors cursor-pointer"
                >
                  <CardContent className="p-5 space-y-4">
                    <div className="flex items-center gap-3">
                      <ClientAvatar workspaceId={client.workspace_id} name={client.client_name} className="w-10 h-10 text-sm" />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-foreground truncate">{client.client_name}</p>
                        {client.workspace_kind !== "client" && <p className="text-xs text-muted-foreground">{client.workspace_kind === "agency" ? "Your agency" : "Personal brand"}</p>}
                        {client.client_contact_email && <p className="text-xs text-muted-foreground truncate">{client.client_contact_email}</p>}
                      </div>
                      {isAdmin && (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                          <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`People in ${client.client_name}`} title="People" onClick={() => setPanel({ type: "people", client })}><Users className="h-3.5 w-3.5" /></Button>
                          <Button size="icon" variant="outline" className="h-8 w-8" aria-label={`Notifications for ${client.client_name}`} title="Notifications" onClick={() => setPanel({ type: "notifications", client })}><BellRing className="h-3.5 w-3.5" /></Button>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Badge variant={meta.variant} className="gap-1"><Icon className="w-3 h-3" /> {meta.label}</Badge>
                      <p className="text-sm text-muted-foreground">
                        {s.status === "attention" && `${s.failed} post${s.failed === 1 ? "" : "s"} failed to publish`}
                        {s.status === "approval" && `${s.awaiting} waiting for sign-off`}
                        {s.status === "scheduled" && `${s.scheduled} post${s.scheduled === 1 ? "" : "s"} scheduled${s.nextScheduledAt ? ` · next ${fmt(s.nextScheduledAt)}` : ""}`}
                        {s.status === "drafts" && `${s.drafts} draft${s.drafts === 1 ? "" : "s"}, nothing scheduled`}
                        {s.status === "empty" && "Nothing created yet"}
                        {s.status === "disconnected" && "Agency link not active"}
                      </p>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[["Scheduled", s.scheduled], ["Published", s.publishedThisWeek], ["Drafts", s.drafts], ["Failed", s.failed]].map(([l, v]) => (
                        <div key={l as string} className="rounded-md bg-secondary/60 py-2">
                          <p className="text-sm font-bold text-foreground">{v}</p>
                          <p className="text-[10px] text-muted-foreground leading-tight">{l}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {s.lastPublishedAt ? `Last published ${new Date(s.lastPublishedAt).toLocaleDateString()}` : "Never published"}
                      </p>
                      {s.status === "empty" && (
                        <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openClient(client.workspace_id, "/app/create"); }}>
                          Create content
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
    </>
  );

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-8">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">
          Welcome back{profile?.full_name ? `, ${profile.full_name}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1">Here's your agency portfolio overview.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label} className="border-border">
            <CardContent className="flex flex-col items-center gap-2 p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                <stat.icon className="w-4 h-4 text-foreground" />
              </div>
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground leading-tight">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">Your workspaces</h2>
          {isAdmin && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => openCreate("agency")}><Plus className="mr-1 h-4 w-4" /> Your agency</Button><Button variant="outline" onClick={() => openCreate("personal")}><Plus className="mr-1 h-4 w-4" /> Personal brand</Button></div>}
        </div>
        {!loading && !loadError && ownWorkspaces.length > 0 && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{renderCards(ownWorkspaces)}</div>}
        {!loading && !loadError && ownWorkspaces.length === 0 && <p className="text-sm text-muted-foreground">Create a workspace for your agency or personal brand.</p>}
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
            <Users className="w-5 h-5" /> Clients
          </h2>
          {isAdmin && (
            <Button onClick={() => openCreate("client")}><Plus className="w-4 h-4 mr-1" /> Add client</Button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <Card className="border-border"><CardContent className="py-12 text-center">
            <p className="text-sm text-foreground">Couldn’t load agency clients.</p>
            <Button className="mt-4" variant="outline" onClick={() => { if (ownerId) void fetchData(ownerId); }}>Try again</Button>
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
            {renderCards(clientWorkspaces)}

            {isAdmin && (
              <button
                onClick={() => openCreate("client")}
                className="min-h-[220px] rounded-xl border-2 border-dashed border-border hover:border-foreground transition-colors flex flex-col items-center justify-center gap-2 text-muted-foreground hover:text-foreground"
              >
                <Plus className="w-6 h-6" />
                <span className="font-medium">Add client</span>
              </button>
            )}
            {!isAdmin && clientWorkspaces.length === 0 && (
              <p className="text-sm text-muted-foreground">No clients assigned to you yet.</p>
            )}
          </div>
        )}
      </section>

      <ClientPanelSheet panel={panel} onClose={() => setPanel(null)} />
      <InviteClientDialog key={workspaceMode} mode={workspaceMode} open={inviteOpen} onOpenChange={setInviteOpen} onInviteSent={() => { if (ownerId) void fetchData(ownerId); }} />
    </div>
  );
};

export default AgencyDashboardPage;
