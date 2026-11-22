import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Send, MousePointerClick, MessageSquare, AlertTriangle,
  Plus, Trash2, Loader2, Mail, Reply,
} from "lucide-react";

interface NotificationRecipient {
  id: string;
  workspace_id: string;
  email: string;
  name: string | null;
  is_sender_identity: boolean;
  bcc_on_campaigns: boolean;
  bcc_on_clicks: boolean;
  bcc_on_replies: boolean;
  bcc_on_bounces: boolean;
  bcc_on_reply_sends: boolean;
}

const OUTREACH_COLUMNS = [
  { key: "bcc_on_campaigns", label: "Invites", icon: Send },
  { key: "bcc_on_clicks", label: "Clicks", icon: MousePointerClick },
  { key: "bcc_on_replies", label: "Creator Replies", icon: MessageSquare },
  { key: "bcc_on_bounces", label: "Bounces", icon: AlertTriangle },
  { key: "bcc_on_reply_sends", label: "My Replies", icon: Reply },
] as const;

export function NotificationMatrix() {
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();
  const [recipients, setRecipients] = useState<NotificationRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [adding, setAdding] = useState(false);

  const workspaceId = currentWorkspace?.id;

  const fetchRecipients = useCallback(async () => {
    if (!workspaceId) return;
    const { data, error } = await supabase
      .from("notification_recipients")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("is_sender_identity", { ascending: false })
      .order("created_at", { ascending: true });
    if (!error && data) setRecipients(data as unknown as NotificationRecipient[]);
    setLoading(false);
  }, [workspaceId]);

  // Sync sender identities into the matrix
  const syncSenderIdentities = useCallback(async () => {
    if (!workspaceId) return;
    const { data: identities } = await supabase
      .from("sender_identities")
      .select("sender_email, sender_name")
      .eq("workspace_id", workspaceId);

    if (!identities?.length) return;

    for (const identity of identities) {
      await supabase
        .from("notification_recipients")
        .upsert(
          {
            workspace_id: workspaceId,
            email: identity.sender_email.toLowerCase(),
            name: identity.sender_name,
            is_sender_identity: true,
          },
          { onConflict: "workspace_id,email" }
        );
    }
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    const init = async () => {
      setLoading(true);
      await syncSenderIdentities();
      await fetchRecipients();
    };
    init();
  }, [workspaceId, syncSenderIdentities, fetchRecipients]);

  const handleToggle = async (recipientId: string, columnKey: string, value: boolean) => {
    // Optimistic update
    setRecipients((prev) =>
      prev.map((r) => (r.id === recipientId ? { ...r, [columnKey]: value } : r))
    );

    const updatePayload: Record<string, unknown> = { [columnKey]: value, updated_at: new Date().toISOString() };
    const { error } = await supabase
      .from("notification_recipients")
      .update(updatePayload as any)
      .eq("id", recipientId);

    if (error) {
      toast.error("Failed to update preference");
      // Revert
      setRecipients((prev) =>
        prev.map((r) => (r.id === recipientId ? { ...r, [columnKey]: !value } : r))
      );
    }
  };

  const handleAddRecipient = async () => {
    if (!workspaceId || !newEmail.trim()) return;
    const emailLower = newEmail.trim().toLowerCase();

    if (recipients.some((r) => r.email.toLowerCase() === emailLower)) {
      toast.error("This email is already in the list");
      return;
    }

    setAdding(true);
    const { error } = await supabase.from("notification_recipients").insert({
      workspace_id: workspaceId,
      email: emailLower,
      name: newName.trim() || null,
      is_sender_identity: false,
    });

    if (error) {
      toast.error("Failed to add recipient");
    } else {
      setNewName("");
      setNewEmail("");
      await fetchRecipients();
      toast.success("Recipient added");
    }
    setAdding(false);
  };

  const handleDelete = async (id: string) => {
    setRecipients((prev) => prev.filter((r) => r.id !== id));
    const { error } = await supabase.from("notification_recipients").delete().eq("id", id);
    if (error) {
      toast.error("Failed to remove recipient");
      await fetchRecipients();
    }
  };

  if (loading) {
    return (
      <Card className="border-border/60">
        <CardContent className="py-12 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/60">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Mail className="w-5 h-5 text-primary" />
          Outreach Notifications
        </CardTitle>
        <CardDescription>
          Control who gets BCC'd on outreach emails by category. Sender identities are auto-synced.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Matrix */}
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="text-left py-2 pr-4 font-medium text-muted-foreground min-w-[200px]">
                  Recipient
                </th>
                {OUTREACH_COLUMNS.map((col) => (
                  <th key={col.key} className="text-center py-2 px-2 min-w-[80px]">
                    <div className="flex flex-col items-center gap-1">
                      <col.icon className="w-4 h-4 text-muted-foreground" />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {col.label}
                      </span>
                    </div>
                  </th>
                ))}
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {recipients.map((recipient) => (
                <tr key={recipient.id} className="border-t border-border/40">
                  <td className="py-3 pr-4">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground text-sm">
                        {recipient.email}
                      </span>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {recipient.is_sender_identity && (
                          <Badge
                            variant="secondary"
                            className="text-[10px] px-1.5 py-0 h-4 font-normal"
                          >
                            Sender Identity
                          </Badge>
                        )}
                        {recipient.name && !recipient.is_sender_identity && (
                          <span className="text-xs text-muted-foreground">
                            {recipient.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  {OUTREACH_COLUMNS.map((col) => (
                    <td key={col.key} className="text-center py-3 px-2">
                      <div className="flex justify-center">
                        <Switch
                          checked={(recipient as any)[col.key] ?? false}
                          onCheckedChange={(v) => handleToggle(recipient.id, col.key, v)}
                        />
                      </div>
                    </td>
                  ))}
                  <td className="text-center py-3">
                    {!recipient.is_sender_identity && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(recipient.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}

              {recipients.length === 0 && (
                <tr>
                  <td
                    colSpan={OUTREACH_COLUMNS.length + 2}
                    className="text-center py-8 text-muted-foreground text-sm"
                  >
                    No notification recipients yet. Add one below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Add recipient */}
        <Separator />
        <div className="flex items-end gap-2">
          <div className="space-y-1 flex-shrink-0">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Optional"
              className="w-36"
            />
          </div>
          <div className="space-y-1 flex-1 min-w-[200px]">
            <label className="text-xs text-muted-foreground">Email</label>
            <Input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="team@company.com"
              onKeyDown={(e) => e.key === "Enter" && handleAddRecipient()}
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 flex-shrink-0"
            onClick={handleAddRecipient}
            disabled={adding || !newEmail.trim()}
          >
            {adding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground">
          Toggle categories to control which email events each person is BCC'd on. Changes save automatically.
        </p>
      </CardContent>
    </Card>
  );
}
