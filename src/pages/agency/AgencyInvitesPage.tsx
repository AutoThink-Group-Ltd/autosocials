import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Mail, Clock, CheckCircle2, XCircle, ExternalLink, Copy, RotateCcw,
  Trash2, Send, Loader2,
} from "lucide-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import InviteClientDialog from "@/components/agency/InviteClientDialog";

type StatusFilter = "all" | "pending" | "sent" | "accepted";

const AgencyInvitesPage = () => {
  const { user } = useAuth();
  const [invitations, setInvitations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (user) fetchInvitations();
  }, [user?.id]);

  const fetchInvitations = async () => {
    const { data } = await supabase
      .from("agency_client_invitations")
      .select("*")
      .eq("agency_user_id", user!.id)
      .order("created_at", { ascending: false });
    setInvitations(data || []);
    setLoading(false);
  };

  const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
    pending: { color: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20", icon: Clock },
    sent: { color: "bg-blue-500/10 text-blue-500 border-blue-500/20", icon: Send },
    accepted: { color: "bg-green-500/10 text-green-500 border-green-500/20", icon: CheckCircle2 },
    expired: { color: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
  };

  const filtered = filter === "all"
    ? invitations
    : invitations.filter((inv) => inv.status === filter);

  const counts = {
    all: invitations.length,
    pending: invitations.filter((i) => i.status === "pending").length,
    sent: invitations.filter((i) => i.status === "sent" || (i.status === "pending" && i.sent_at)).length,
    accepted: invitations.filter((i) => i.status === "accepted").length,
  };

  const copyLink = (token: string) => {
    const url = `${window.location.origin}/accept-invite?token=${token}`;
    navigator.clipboard.writeText(url);
    toast.success("Invite link copied");
  };

  const handleResend = async (inv: any) => {
    setResendingId(inv.id);
    try {
      const { error } = await supabase.functions.invoke("send-manager-invitation", {
        body: {
          agency_user_id: user!.id,
          email: inv.email,
          contact_name: inv.contact_name,
          client_company_name: inv.client_company_name,
          workspace_id: inv.workspace_id,
          token: inv.token,
          invitation_id: inv.id,
        },
      });
      if (error) throw error;
      toast.success(`Invitation resent to ${inv.email}`);
      fetchInvitations();
    } catch {
      toast.error("Failed to resend invitation");
    } finally {
      setResendingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("agency_client_invitations")
      .delete()
      .eq("id", id);
    if (error) {
      toast.error("Failed to delete invitation");
    } else {
      toast.success("Invitation deleted");
      setInvitations((prev) => prev.filter((i) => i.id !== id));
    }
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const filters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: "Pending" },
    { key: "sent", label: "Sent" },
    { key: "accepted", label: "Accepted" },
  ];

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Client Invitations</h1>
          <p className="text-muted-foreground mt-1">Track and manage all client invitations</p>
        </div>
        <Button variant="default" onClick={() => setInviteOpen(true)}>
          <Send className="w-4 h-4 mr-2" />
          Invite Client
        </Button>
      </div>

      {/* Status filters */}
      <div className="flex gap-2">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? "bg-primary text-inverse"
                : "bg-secondary text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.label} ({counts[f.key]})
          </button>
        ))}
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Mail className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground">
                {filter === "all" ? "No invitations sent" : `No ${filter} invitations`}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {filter === "all" ? "Invite your first client to get started." : "No invitations match this filter."}
              </p>
              {filter === "all" && (
                <Button variant="default" className="mt-4" onClick={() => setInviteOpen(true)}>
                  Invite Client
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contact</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Sent</TableHead>
                  <TableHead>Link Opens</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inv) => {
                  const config = statusConfig[inv.status] || statusConfig["pending"]!;
                  const StatusIcon = config.icon;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.contact_name || "—"}</TableCell>
                      <TableCell>{inv.client_company_name || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{inv.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={config.color}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {inv.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inv.sent_at ? (
                          <Tooltip>
                            <TooltipTrigger className="text-sm text-muted-foreground cursor-default">
                              {relativeTime(inv.sent_at)}
                            </TooltipTrigger>
                            <TooltipContent>{new Date(inv.sent_at).toLocaleString()}</TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-sm text-muted-foreground">Not sent</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {(inv.link_opened_count || 0) > 0 ? (
                          <Tooltip>
                            <TooltipTrigger className="flex items-center gap-1 text-sm text-muted-foreground cursor-default">
                              <ExternalLink className="w-3 h-3" />
                              {inv.link_opened_count}x
                            </TooltipTrigger>
                            <TooltipContent>
                              Last opened: {inv.link_last_opened_at ? new Date(inv.link_last_opened_at).toLocaleString() : "Unknown"}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-sm text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {inv.status !== "accepted" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  disabled={resendingId === inv.id}
                                  onClick={() => handleResend(inv)}
                                >
                                  {resendingId === inv.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="w-4 h-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Resend</TooltipContent>
                            </Tooltip>
                          )}
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => copyLink(inv.token)}
                              >
                                <Copy className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Copy Link</TooltipContent>
                          </Tooltip>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                onClick={() => handleDelete(inv.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Delete</TooltipContent>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <InviteClientDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInviteSent={fetchInvitations}
      />
    </div>
  );
};

export default AgencyInvitesPage;
