import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Mail, Plus, Trash2, Star, Loader2, CheckCircle2, AlertCircle, Pencil, RefreshCw,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";

interface SenderIdentity {
  id: string;
  workspace_id: string;
  sender_name: string;
  sender_email: string;
  contact_name: string | null;
  is_default: boolean;
  is_verified: boolean;
  created_at: string;
}

export function SenderIdentitiesSection() {
  const { currentWorkspace } = useWorkspace();
  const [identities, setIdentities] = useState<SenderIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [verifiedDomain, setVerifiedDomain] = useState<string | null>(null);
  // Form state
  const [senderName, setSenderName] = useState("");
  const [senderEmail, setSenderEmail] = useState("");
  const [contactName, setContactName] = useState("");

  const workspaceId = currentWorkspace?.id;

  const getEmailDomain = (email: string) => email.split("@")[1]?.toLowerCase() ?? "";

  const fetchIdentities = async () => {
    if (!workspaceId) return;
    setLoading(true);

    const [{ data: identityData, error: identityError }, { data: domainData }] = await Promise.all([
      supabase
        .from("sender_identities")
        .select("*")
        .eq("workspace_id", workspaceId)
        .order("created_at", { ascending: true }),
      supabase
        .from("workspace_domains")
        .select("domain, status")
        .eq("workspace_id", workspaceId)
        .eq("status", "verified")
        .maybeSingle(),
    ]);

    if (identityError) {
      toast.error("Failed to load sender identities");
      setLoading(false);
      return;
    }

    const nextVerifiedDomain = domainData?.status === "verified"
      ? domainData.domain.toLowerCase()
      : null;
    setVerifiedDomain(nextVerifiedDomain);

    const rawIdentities = (identityData as SenderIdentity[]) || [];
    const normalizedIdentities = rawIdentities.map((identity) => {
      if (!nextVerifiedDomain) return identity;
      const shouldAutoVerify = getEmailDomain(identity.sender_email) === nextVerifiedDomain;
      return shouldAutoVerify ? { ...identity, is_verified: true } : identity;
    });

    setIdentities(normalizedIdentities);

    if (nextVerifiedDomain) {
      const staleIdentityIds = rawIdentities
        .filter((identity) => !identity.is_verified && getEmailDomain(identity.sender_email) === nextVerifiedDomain)
        .map((identity) => identity.id);

      if (staleIdentityIds.length > 0) {
        void supabase
          .from("sender_identities")
          .update({ is_verified: true, updated_at: new Date().toISOString() })
          .in("id", staleIdentityIds);
      }
    }

    setLoading(false);
  };

  useEffect(() => {
    fetchIdentities();
  }, [workspaceId]);

  const openCreate = () => {
    setEditingId(null);
    setSenderName("");
    setSenderEmail("");
    setContactName("");
    setDialogOpen(true);
  };

  const openEdit = (identity: SenderIdentity) => {
    setEditingId(identity.id);
    setSenderName(identity.sender_name);
    setSenderEmail(identity.sender_email);
    setContactName(identity.contact_name || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!workspaceId || !senderName.trim() || !senderEmail.trim()) {
      toast.error("Name and email are required");
      return;
    }

    const normalizedEmail = senderEmail.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      toast.error("Please enter a valid email address");
      return;
    }

    // Enforce same domain rule
    const newDomain = getEmailDomain(normalizedEmail);
    const existingDomains = identities
      .filter((i) => i.id !== editingId)
      .map((i) => getEmailDomain(i.sender_email));
    if (existingDomains.length > 0 && !existingDomains.includes(newDomain)) {
      toast.error(
        `All sender identities must use the same domain. Existing domain: ${existingDomains[0]}`
      );
      return;
    }

    setSaving(true);

    if (editingId) {
      const { error } = await supabase
        .from("sender_identities")
        .update({
          sender_name: senderName.trim(),
          sender_email: normalizedEmail,
          contact_name: contactName.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", editingId);
      if (error) toast.error(error.message);
      else {
        toast.success("Sender identity updated");
        setDialogOpen(false);
        fetchIdentities();
      }
    } else {
      const isFirst = identities.length === 0;
      const shouldAutoVerify = !!verifiedDomain && newDomain === verifiedDomain;
      const { error } = await supabase.from("sender_identities").insert({
        workspace_id: workspaceId,
        sender_name: senderName.trim(),
        sender_email: normalizedEmail,
        contact_name: contactName.trim() || null,
        is_default: isFirst,
        is_verified: shouldAutoVerify,
      });
      if (error) {
        if (error.code === "23505") toast.error("This email is already added");
        else toast.error(error.message);
      } else {
        toast.success(
          shouldAutoVerify
            ? "Sender identity added and auto-verified via your authenticated domain"
            : "Sender identity added"
        );
        setDialogOpen(false);
        fetchIdentities();
      }
    }
    setSaving(false);
  };

  const handleSetDefault = async (id: string) => {
    if (!workspaceId) return;
    // Unset all defaults first
    await supabase
      .from("sender_identities")
      .update({ is_default: false, updated_at: new Date().toISOString() })
      .eq("workspace_id", workspaceId);
    // Set the selected one
    const { error } = await supabase
      .from("sender_identities")
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Default sender updated");
      fetchIdentities();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("sender_identities")
      .delete()
      .eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Sender identity removed");
      fetchIdentities();
    }
  };

  const handleResendVerification = async (identity: SenderIdentity) => {
    if (!workspaceId) return;
    setResendingId(identity.id);

    const isCoveredByVerifiedDomain = !!verifiedDomain
      && getEmailDomain(identity.sender_email) === verifiedDomain;

    if (isCoveredByVerifiedDomain) {
      const { error } = await supabase
        .from("sender_identities")
        .update({ is_verified: true, updated_at: new Date().toISOString() })
        .eq("id", identity.id);

      if (error) {
        toast.error(error.message);
      } else {
        toast.success("This sender is verified via your authenticated domain — no external verification email is needed.");
        fetchIdentities();
      }
      setResendingId(null);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke("resend-sender-verification", {
        body: {
          workspace_id: workspaceId,
          sender_email: identity.sender_email,
          sender_name: identity.sender_name,
          contact_name: identity.contact_name,
        },
      });

      if (error) {
        const maybeData = data as { error?: unknown } | null;
        const rawMessage = maybeData?.error ?? error.message;
        const safeMessage = typeof rawMessage === "string"
          ? rawMessage
          : "Failed to send verification email";
        toast.error(safeMessage);
        return;
      }

      if (data?.already_verified) {
        toast.success("This sender is already verified!");
        fetchIdentities();
      } else if (data?.domain_verified) {
        toast.success("Your domain is already authenticated, so this sender is now verified with no external verification email.");
        fetchIdentities();
      } else if (data?.resent || data?.created) {
        toast.success(`Verification email sent to ${identity.sender_email}. Check your inbox.`);
      } else {
        toast.success("Verification request sent");
      }
    } catch {
      toast.error("Failed to send verification email");
    } finally {
      setResendingId(null);
    }
  };

  if (!workspaceId) {
    return <p className="text-muted-foreground py-8">No workspace found.</p>;
  }

  return (
    <>
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Sender Identities</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage the email addresses you send outreach from
            </p>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> Add Sender
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : identities.length === 0 ? (
            <div className="text-center py-8">
              <Mail className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No sender identities yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add your email address to start sending outreach
              </p>
              <Button size="sm" variant="outline" onClick={openCreate} className="mt-4 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Add Your First Sender
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {identities.map((identity) => {
                const isCoveredByVerifiedDomain = !!verifiedDomain
                  && getEmailDomain(identity.sender_email) === verifiedDomain;
                const isIdentityVerified = identity.is_verified || isCoveredByVerifiedDomain;

                return (
                  <div
                    key={identity.id}
                    className="flex items-center gap-3 p-3 rounded-lg border border-border/60 bg-secondary/20"
                  >
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Mail className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {identity.sender_name}
                        </p>
                        {identity.is_default && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            Default
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <p className="text-xs text-muted-foreground truncate">
                          {identity.sender_email}
                        </p>
                        {isIdentityVerified ? (
                          <span className="flex items-center gap-0.5 text-emerald-500 text-[10px]">
                            <CheckCircle2 className="w-3 h-3" /> Verified
                          </span>
                        ) : (
                          <>
                            <span className="flex items-center gap-0.5 text-amber-500 text-[10px]">
                              <AlertCircle className="w-3 h-3" /> Pending
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 px-1.5 text-[10px] text-primary hover:text-primary gap-1"
                              onClick={() => handleResendVerification(identity)}
                              disabled={resendingId === identity.id}
                            >
                              {resendingId === identity.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <RefreshCw className="w-3 h-3" />
                              )}
                              {resendingId === identity.id ? "Sending..." : "Resend Verification"}
                            </Button>
                          </>
                        )}
                      </div>
                      {identity.contact_name && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Signs off as: {identity.contact_name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!identity.is_default && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Set as default"
                          onClick={() => handleSetDefault(identity.id)}
                        >
                          <Star className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Edit"
                        onClick={() => openEdit(identity)}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Remove"
                        onClick={() => handleDelete(identity.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              <Separator className="my-3" />
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="text-xs text-muted-foreground">
                  <strong>Domain verification:</strong> All sender identities must use the same domain.
                  Once your domain is authenticated, all identities on that domain are automatically marked as verified.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit Sender Identity" : "Add Sender Identity"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Full Name *</Label>
              <Input
                value={senderName}
                onChange={(e) => setSenderName(e.target.value)}
                placeholder="e.g. Sarah Johnson"
              />
              <p className="text-[11px] text-muted-foreground">
                Displayed as the sender name in recipient inboxes
              </p>
            </div>
            <div className="space-y-2">
              <Label>Email Address *</Label>
              <Input
                type="email"
                value={senderEmail}
                onChange={(e) => setSenderEmail(e.target.value)}
                placeholder="e.g. sarah@yourbrand.com"
                disabled={!!editingId}
              />
              {editingId && (
                <p className="text-[11px] text-muted-foreground">
                  Email cannot be changed after creation
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Sign-off Name</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g. Sarah"
              />
              <p className="text-[11px] text-muted-foreground">
                How you greet recipients (used in email templates)
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="brand" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Sender"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
