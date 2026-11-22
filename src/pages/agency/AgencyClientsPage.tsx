import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useNavigate } from "@/lib/router-compat";
import { useAgencyRole } from "@/features/agency/useAgencyRole";
import { WorkspacePeople } from "@/features/people/WorkspacePeople";
import { toast } from "sonner";
import { Users, Mail, ArrowRight, LayoutGrid, Rows3, BellRing, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ClientPanelSheet } from "@/features/agency/ClientPanels";
import InviteClientDialog from "@/components/agency/InviteClientDialog";
import { ClientAvatar } from "@/features/agency/ClientAvatar";
import { ClientSocialProfiles } from "@/components/agency/ClientSocialProfiles";
import type { ClientSocialProfile } from "@/lib/client-social-profiles";

type Client = { id: string; client_name: string; client_contact_name: string | null; client_contact_email: string | null; status: string | null; workspace_id: string | null; created_at: string | null; subscription_plan_key: string | null; social_profiles: ClientSocialProfile[] | null; workspaces?: { social_profiles: ClientSocialProfile[] | null } | null };
const VIEW_KEY = "autosocials_agency_clients_view";
const AgencyClientsPage = () => {
  const { workspaces, setCurrentWorkspace } = useWorkspace();
  const { ownerId, isAdmin, loading: roleLoading } = useAgencyRole();
  const navigate = useNavigate();
  const [view, setView] = useState<"cards" | "table">("cards");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [panel, setPanel] = useState<{ type: "people" | "notifications"; client: Client } | null>(null);

  useEffect(() => { const v = localStorage.getItem(VIEW_KEY); if (v === "table" || v === "cards") setView(v); }, []);
  const changeView = (v: "cards" | "table") => { setView(v); localStorage.setItem(VIEW_KEY, v); };

  const { data: clients = [], isLoading, error, refetch } = useQuery({
    queryKey: ["agency-clients", ownerId],
    enabled: !!ownerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("agency_clients").select("*,workspaces(social_profiles)")
        .eq("agency_user_id", ownerId!).eq("status", "active").eq("workspace_kind", "client")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Client[];
    },
  });
  const { data: counts = {} } = useQuery({
    queryKey: ["agency-client-people", clients.map((c) => c.workspace_id).join()],
    enabled: clients.length > 0,
    queryFn: async () => {
      const ids = clients.map((c) => c.workspace_id).filter(Boolean) as string[];
      const { data } = await supabase.from("workspace_members").select("workspace_id").in("workspace_id", ids);
      return (data ?? []).reduce<Record<string, number>>((a, r) => { a[r.workspace_id] = (a[r.workspace_id] ?? 0) + 1; return a; }, {});
    },
  });

  const openClient = (workspaceId: string) => {
    const ws = workspaces.find((w) => w.id === workspaceId);
    if (!ws) { toast.error("Couldn't open this client workspace. Refresh and try again."); return; }
    setCurrentWorkspace(ws);
    navigate("/app");
  };

  const statusVariant = (s: string | null) => s === "active" ? "default" : s === "disconnected" ? "destructive" : "secondary";
  const actions = (c: Client, size: "sm" | "icon" = "sm") => c.status === "active" && c.workspace_id ? (
    <div className="flex gap-1.5">
      <Button size={size} variant="outline" onClick={() => setPanel({ type: "people", client: c })} aria-label={`People in ${c.client_name}`}>
        <Users className="h-3.5 w-3.5" />{size === "sm" && <span className="ml-1">People</span>}</Button>
      <Button size={size} variant="outline" onClick={() => setPanel({ type: "notifications", client: c })} aria-label={`Notifications for ${c.client_name}`}>
        <BellRing className="h-3.5 w-3.5" />{size === "sm" && <span className="ml-1">Notifications</span>}</Button>
    </div>
  ) : null;

  return (
    <div className="space-y-6 p-4 sm:p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Clients</h1>
          <p className="mt-1 text-muted-foreground">Manage your client portfolio</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="View">
            <Button size="sm" variant={view === "cards" ? "secondary" : "ghost"} onClick={() => changeView("cards")} aria-pressed={view === "cards"}><LayoutGrid className="h-4 w-4" /><span className="ml-1">Cards</span></Button>
            <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} onClick={() => changeView("table")} aria-pressed={view === "table"}><Rows3 className="h-4 w-4" /><span className="ml-1">Table</span></Button>
          </div>
          {isAdmin && <Button onClick={() => setInviteOpen(true)}>Add client</Button>}
        </div>
      </div>

      {isLoading || roleLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !ownerId ? (
        <Card className="border-border"><CardContent className="py-12 text-center text-sm text-muted-foreground">
          Your agency account could not be loaded. Refresh this page to try again.
        </CardContent></Card>
      ) : error ? (
        <Card className="border-border"><CardContent className="py-12 text-center">
          <p className="text-sm text-foreground">Couldn’t load clients.</p>
          <Button className="mt-4" variant="outline" onClick={() => void refetch()}>Try again</Button>
        </CardContent></Card>
      ) : clients.length === 0 ? (
        <Card className="border-border"><CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="mb-4 h-12 w-12 text-muted-foreground/30" />
          <h3 className="text-lg font-medium text-foreground">No clients yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">Invite your first client to get started.</p>
        </CardContent></Card>
      ) : view === "cards" ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => (
            <Card key={c.id} className="border-border">
              <CardContent className="flex h-full flex-col p-5">
                <div className="mb-3 flex items-start justify-between">
                  <ClientAvatar workspaceId={c.workspace_id} name={c.client_name} />
                  <Badge variant={statusVariant(c.status)} className="capitalize">{c.status}</Badge>
                </div>
                <h3 className="font-semibold text-foreground">{c.client_name}</h3>
                {c.client_contact_name && <p className="mt-0.5 text-sm text-muted-foreground">{c.client_contact_name}</p>}
                {c.client_contact_email && <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Mail className="h-3 w-3" />{c.client_contact_email}</div>}
                <ClientSocialProfiles profiles={c.workspaces?.social_profiles ?? c.social_profiles} />
                {c.workspace_id && <p className="mt-1 text-xs text-muted-foreground">{counts[c.workspace_id] ?? 0} people</p>}
                <div className="mt-auto space-y-2 pt-4">
                  {actions(c)}
                  {c.status === "active" && c.workspace_id && (
                    <Button size="sm" className="w-full" onClick={() => openClient(c.workspace_id!)}>Open workspace <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Client</TableHead><TableHead>Contact</TableHead><TableHead>Status</TableHead>
              <TableHead>People</TableHead><TableHead>Added</TableHead><TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {clients.map((c) => (
                <TableRow key={c.id}>
                  <TableCell><div className="flex items-center gap-3"><ClientAvatar workspaceId={c.workspace_id} name={c.client_name} /><div><span className="font-medium text-foreground">{c.client_name}</span><ClientSocialProfiles profiles={c.workspaces?.social_profiles ?? c.social_profiles} /></div></div></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.client_contact_email || "—"}</TableCell>
                  <TableCell><Badge variant={statusVariant(c.status)} className="capitalize">{c.status}</Badge></TableCell>
                  <TableCell>{c.workspace_id ? counts[c.workspace_id] ?? 0 : "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{c.created_at ? new Date(c.created_at).toLocaleDateString() : "—"}</TableCell>
                  <TableCell><div className="flex justify-end gap-1.5">{actions(c, "icon")}
                    {c.status === "active" && c.workspace_id && <Button size="sm" onClick={() => openClient(c.workspace_id!)}>Open</Button>}
                  </div></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <ClientPanelSheet panel={panel} onClose={() => setPanel(null)} />

      <InviteClientDialog open={inviteOpen} onOpenChange={setInviteOpen} onInviteSent={() => void refetch()} />
    </div>
  );
};

export default AgencyClientsPage;
