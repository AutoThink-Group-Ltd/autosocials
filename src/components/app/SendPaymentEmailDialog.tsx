import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";
import { Send, Plus, X, Users, Loader2 } from "lucide-react";

interface TeamMember {
  user_id: string;
  full_name: string | null;
  email: string;
  role: string | null;
}

interface SendPaymentEmailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SendPaymentEmailDialog = ({ open, onOpenChange }: SendPaymentEmailDialogProps) => {
  const { currentWorkspace } = useWorkspace();
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
  const [manualEmail, setManualEmail] = useState("");
  const [manualEmails, setManualEmails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open && currentWorkspace?.id) {
      fetchTeamMembers();
    }
  }, [open, currentWorkspace?.id]);

  const fetchTeamMembers = async () => {
    if (!currentWorkspace?.id) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_workspace_members_with_email", {
        _workspace_id: currentWorkspace.id,
      });
      if (error) throw error;
      setTeamMembers((data as TeamMember[]) || []);
    } catch {
      console.error("Failed to fetch team members");
    } finally {
      setLoading(false);
    }
  };

  const toggleEmail = (email: string) => {
    const next = new Set(selectedEmails);
    if (next.has(email)) next.delete(email);
    else next.add(email);
    setSelectedEmails(next);
  };

  const addManualEmail = () => {
    const email = manualEmail.trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Please enter a valid email address");
      return;
    }
    if (!manualEmails.includes(email)) {
      setManualEmails((prev) => [...prev, email]);
    }
    setSelectedEmails((prev) => new Set([...prev, email]));
    setManualEmail("");
  };

  const removeManualEmail = (email: string) => {
    setManualEmails((prev) => prev.filter((e) => e !== email));
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      next.delete(email);
      return next;
    });
  };

  const allRecipients = [...selectedEmails];

  const recipientNames: Record<string, string> = {};
  teamMembers.forEach((m) => {
    if (m.full_name && selectedEmails.has(m.email)) {
      recipientNames[m.email] = m.full_name;
    }
  });

  const handleSend = async () => {
    if (allRecipients.length === 0) {
      toast.error("Please select at least one recipient");
      return;
    }
    setSending(true);
    try {
      const { error } = await supabase.functions.invoke("send-payment-update-email", {
        body: {
          workspace_id: currentWorkspace?.id,
          recipients: allRecipients,
          recipient_names: recipientNames,
        },
      });
      if (error) throw error;
      toast.success(`Payment update email sent to ${allRecipients.length} recipient(s)`);
      onOpenChange(false);
      setSelectedEmails(new Set());
      setManualEmails([]);
    } catch {
      toast.error("Failed to send email. Please try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            Send Payment Update Email
          </DialogTitle>
          <DialogDescription>
            Send a secure payment update link to your accounts team. No login required — the link goes directly to the payment portal.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Team members */}
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4 justify-center">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading team members…
            </div>
          ) : teamMembers.length > 0 ? (
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <Users className="w-3.5 h-3.5" />
                Team Members
              </Label>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {teamMembers.map((member) => (
                  <label
                    key={member.user_id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-secondary cursor-pointer transition-colors"
                  >
                    <Checkbox
                      checked={selectedEmails.has(member.email)}
                      onCheckedChange={() => toggleEmail(member.email)}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {member.full_name || member.email.split("@")[0]}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    </div>
                    {member.role && (
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                        {member.role}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {/* Manual email input */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Add Email Address
            </Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="accounts@company.com"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addManualEmail())}
                className="flex-1"
              />
              <Button type="button" size="icon" variant="outline" onClick={addManualEmail}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Manual emails list */}
          {manualEmails.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manualEmails.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-secondary rounded-md text-xs text-foreground"
                >
                  {email}
                  <button onClick={() => removeManualEmail(email)} className="text-muted-foreground hover:text-foreground">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {allRecipients.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {allRecipients.length} recipient{allRecipients.length !== 1 ? "s" : ""} selected
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={sending || allRecipients.length === 0}
            className="gap-1.5"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? "Sending…" : "Send Email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
