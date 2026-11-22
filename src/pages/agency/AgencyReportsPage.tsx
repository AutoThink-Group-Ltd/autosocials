import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Plus, Loader2, Eye, Send, Copy, ExternalLink, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Report {
  id: string;
  title: string | null;
  token: string | null;
  workspace_id: string;
  agency_client_id: string | null;
  date_from: string | null;
  date_to: string | null;
  view_count: number | null;
  last_viewed_at: string | null;
  sent_at: string | null;
  sent_to: string[] | null;
  custom_message: string | null;
  is_active: boolean | null;
  created_at: string | null;
}

interface Client {
  id: string;
  client_name: string;
  workspace_id: string;
  client_contact_email: string | null;
}

const AgencyReportsPage = () => {
  const { user } = useAuth();
  const [reports, setReports] = useState<Report[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  // Create form
  const [selectedClientId, setSelectedClientId] = useState("");
  const [title, setTitle] = useState("Performance Report");
  const [customMessage, setCustomMessage] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (user) fetchAll();
  }, [user?.id]);

  const fetchAll = async () => {
    const [reportsRes, clientsRes] = await Promise.all([
      supabase.from("agency_reports").select("*").eq("agency_user_id", user!.id).order("created_at", { ascending: false }),
      supabase.from("agency_clients").select("id, client_name, workspace_id, client_contact_email").eq("agency_user_id", user!.id).eq("status", "active").neq("workspace_kind", "lead"),
    ]);
    setReports((reportsRes.data || []) as Report[]);
    setClients((clientsRes.data || []) as Client[]);
    setLoading(false);
  };

  const handleCreate = async () => {
    if (!selectedClientId) { toast.error("Select a client"); return; }
    const client = clients.find((c) => c.id === selectedClientId);
    if (!client) return;

    setCreating(true);
    const { error } = await supabase.from("agency_reports").insert({
      agency_user_id: user!.id,
      workspace_id: client.workspace_id,
      agency_client_id: client.id,
      title: title.trim() || "Performance Report",
      custom_message: customMessage.trim() || null,
      date_from: (new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0]) ?? "",
      date_to: (new Date().toISOString().split("T")[0]) ?? "",
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success("Report created");
      setCreateOpen(false);
      setSelectedClientId("");
      setTitle("Performance Report");
      setCustomMessage("");
      fetchAll();
    }
    setCreating(false);
  };

  const copyReportLink = (token: string | null) => {
    if (!token) return;
    const url = `${window.location.origin}/agency-report/${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Report link copied");
  };

  const getClientName = (clientId: string | null) => {
    if (!clientId) return "Unknown";
    return clients.find((c) => c.id === clientId)?.client_name || "Unknown";
  };

  if (loading) {
    return (
      <div className="p-4 sm:p-6 md:p-8 flex justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Reports</h1>
          <p className="text-muted-foreground mt-1">Generate and send branded performance reports to clients</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button variant="default" disabled={clients.length === 0}>
              <Plus className="w-4 h-4 mr-2" /> Create Report
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Report</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Client *</Label>
                <Select value={selectedClientId} onValueChange={setSelectedClientId}>
                  <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Report Title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Performance Report" />
              </div>
              <div className="space-y-1.5">
                <Label>Custom Message (optional)</Label>
                <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} placeholder="Add a personal note to the report..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button variant="default" onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <FileText className="w-4 h-4 mr-1" />}
                Create Report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {reports.length === 0 ? (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No reports yet</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {clients.length === 0
                ? "Reports will appear here once you have active clients."
                : "Create your first performance report for a client."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map((report) => (
            <Card key={report.id} className="border-border hover:border-primary/30 transition-colors">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{report.title || "Performance Report"}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{getClientName(report.agency_client_id)}</p>
                  </div>
                  <Badge variant={report.is_active ? "default" : "secondary"} className="text-[10px] ml-2">
                    {report.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>

                {report.date_from && report.date_to && (
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(new Date(report.date_from), "dd MMM")} – {format(new Date(report.date_to), "dd MMM yyyy")}
                  </div>
                )}

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" /> {report.view_count || 0} views
                  </span>
                  {report.sent_at && (
                    <span className="flex items-center gap-1">
                      <Send className="w-3.5 h-3.5" /> Sent {format(new Date(report.sent_at), "dd MMM")}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <Button variant="outline" size="sm" className="flex-1 text-xs" onClick={() => copyReportLink(report.token)}>
                    <Copy className="w-3.5 h-3.5 mr-1" /> Copy Link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => window.open(`/agency-report/${report.token}`, "_blank")}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1" /> Preview
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AgencyReportsPage;
