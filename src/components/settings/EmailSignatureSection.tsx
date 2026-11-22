import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  FileSignature, Plus, Trash2, Star, Loader2, Pencil, Eye, Copy, Send,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SignatureEditor } from "./signature/SignatureEditor";
import { generateDefaultSignatureHtml } from "./signature/generateDefaultSignature";

interface EmailSignature {
  id: string;
  workspace_id: string;
  name: string;
  html_content: string;
  is_default: boolean;
  sender_identity_id: string | null;
  created_at: string;
}

interface SenderIdentity {
  id: string;
  sender_name: string;
  sender_email: string;
}

export function EmailSignatureSection() {
  const { currentWorkspace } = useWorkspace();
  const { profile, user } = useAuth();
  const [signatures, setSignatures] = useState<EmailSignature[]>([]);
  const [identities, setIdentities] = useState<SenderIdentity[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingIdentityId, setEditingIdentityId] = useState<string | null>(null);
  const [editingHtml, setEditingHtml] = useState("");
  const [saving, setSaving] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [testSigHtml, setTestSigHtml] = useState("");
  const [sendingTest, setSendingTest] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSig, setCloneSig] = useState<EmailSignature | null>(null);
  const [cloneIdentityId, setCloneIdentityId] = useState<string | null>(null);

  const workspaceId = currentWorkspace?.id;

  const fetchData = async () => {
    if (!workspaceId) return;
    setLoading(true);
    const [sigRes, idRes] = await Promise.all([
      supabase.from("email_signatures").select("*").eq("workspace_id", workspaceId).order("created_at", { ascending: true }),
      supabase.from("sender_identities").select("id, sender_name, sender_email").eq("workspace_id", workspaceId),
    ]);
    if (!sigRes.error) setSignatures((sigRes.data as unknown as EmailSignature[]) || []);
    if (!idRes.error) setIdentities((idRes.data as unknown as SenderIdentity[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [workspaceId]);

  const openCreate = () => {
    setEditingId(null);
    setEditingName(signatures.length === 0 ? "Default" : "");
    setEditingIdentityId(null);
    setEditingHtml(
      generateDefaultSignatureHtml({
        fullName: profile?.full_name || "",
        phone: currentWorkspace?.phone || "",
        address: currentWorkspace?.address || "",
        bookingLink: currentWorkspace?.booking_link || "",
        logoUrl: currentWorkspace?.logo_url || "",
        avatarUrl: profile?.avatar_url || "",
      })
    );
    setEditorOpen(true);
  };

  const openEdit = (sig: EmailSignature) => {
    setEditingId(sig.id);
    setEditingName(sig.name);
    setEditingIdentityId(sig.sender_identity_id);
    setEditingHtml(sig.html_content);
    setEditorOpen(true);
  };

  const handleSave = async (html: string) => {
    if (!workspaceId || !editingName.trim()) {
      toast.error("Signature name is required");
      return;
    }
    setSaving(true);
    const isFirst = signatures.length === 0;

    if (editingId) {
      const { error } = await supabase.from("email_signatures").update({
        name: editingName.trim(),
        html_content: html,
        sender_identity_id: editingIdentityId,
        updated_at: new Date().toISOString(),
      }).eq("id", editingId);
      if (error) toast.error(error.message);
      else { toast.success("Signature updated"); setEditorOpen(false); fetchData(); }
    } else {
      const { error } = await supabase.from("email_signatures").insert({
        workspace_id: workspaceId,
        name: editingName.trim(),
        html_content: html,
        is_default: isFirst,
        sender_identity_id: editingIdentityId,
      });
      if (error) toast.error(error.message);
      else { toast.success("Signature created"); setEditorOpen(false); fetchData(); }
    }
    setSaving(false);
  };

  const handleSetDefault = async (id: string) => {
    if (!workspaceId) return;
    await supabase.from("email_signatures").update({ is_default: false, updated_at: new Date().toISOString() }).eq("workspace_id", workspaceId);
    const { error } = await supabase.from("email_signatures").update({ is_default: true, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Default signature updated"); fetchData(); }
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("email_signatures").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Signature deleted"); fetchData(); }
  };

  const handleClone = async () => {
    if (!cloneSig || !workspaceId) return;
    const { error } = await supabase.from("email_signatures").insert({
      workspace_id: workspaceId,
      name: `${cloneSig.name} (Copy)`,
      html_content: cloneSig.html_content,
      is_default: false,
      sender_identity_id: cloneIdentityId,
    });
    if (error) toast.error(error.message);
    else { toast.success("Signature cloned"); setCloneDialogOpen(false); fetchData(); }
  };

  const handleSendTest = async () => {
    if (!testEmail || !workspaceId) return;
    setSendingTest(true);
    const { error } = await supabase.functions.invoke("send-test-signature", {
      body: { workspace_id: workspaceId, signature_html: testSigHtml, to_email: testEmail },
    });
    if (error) toast.error("Failed to send test email");
    else { toast.success(`Test sent to ${testEmail}`); setTestDialogOpen(false); }
    setSendingTest(false);
  };

  const handleIdentityChange = async (sigId: string, identityId: string | null) => {
    const { error } = await supabase.from("email_signatures").update({
      sender_identity_id: identityId,
      updated_at: new Date().toISOString(),
    }).eq("id", sigId);
    if (error) toast.error(error.message);
    else fetchData();
  };

  if (!workspaceId) return null;

  return (
    <>
      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileSignature className="w-5 h-5" /> Email Signatures
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Create signatures to auto-append to your outgoing emails
            </p>
          </div>
          <Button size="sm" onClick={openCreate} className="gap-1.5">
            <Plus className="w-3.5 h-3.5" /> New Signature
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : signatures.length === 0 ? (
            <div className="text-center py-8">
              <FileSignature className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No signatures yet</p>
              <Button size="sm" variant="outline" onClick={openCreate} className="mt-4 gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Create Signature
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {signatures.map((sig) => {
                const identity = identities.find((i) => i.id === sig.sender_identity_id);
                return (
                  <div
                    key={sig.id}
                    className="rounded-lg border border-border/60 bg-secondary/20 overflow-hidden"
                  >
                    {/* Preview area */}
                    <div className="p-4 bg-white border-b border-border/40 min-h-[120px] overflow-hidden">
                      <div
                        style={{ transform: "scale(0.75)", transformOrigin: "top left", pointerEvents: "none" }}
                        dangerouslySetInnerHTML={{ __html: sig.html_content }}
                      />
                    </div>

                    {/* Card footer */}
                    <div className="p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <p className="text-sm font-medium text-foreground truncate">{sig.name}</p>
                        {sig.is_default && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">Default</Badge>
                        )}
                      </div>

                      {identities.length > 0 && (
                        <Select
                          value={sig.sender_identity_id || "none"}
                          onValueChange={(v) => handleIdentityChange(sig.id, v === "none" ? null : v)}
                        >
                          <SelectTrigger className="h-7 text-xs mb-2">
                            <SelectValue placeholder="Sender identity" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">No linked identity</SelectItem>
                            {identities.map((id) => (
                              <SelectItem key={id.id} value={id.id}>
                                {id.sender_name} ({id.sender_email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}

                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Preview" onClick={() => { setPreviewHtml(sig.html_content); setPreviewOpen(true); }}>
                          <Eye className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Send Test" onClick={() => { setTestSigHtml(sig.html_content); setTestEmail(user?.email || ""); setTestDialogOpen(true); }}>
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                        {!sig.is_default && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="Set Default" onClick={() => handleSetDefault(sig.id)}>
                            <Star className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={() => openEdit(sig)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Clone" onClick={() => { setCloneSig(sig); setCloneIdentityId(null); setCloneDialogOpen(true); }}>
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete" onClick={() => handleDelete(sig.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Signature Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Signature" : "Create Signature"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Signature Name</Label>
                <Input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  placeholder="e.g. Default, Formal"
                />
              </div>
              {identities.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Sender Identity</Label>
                  <Select
                    value={editingIdentityId || "none"}
                    onValueChange={(v) => setEditingIdentityId(v === "none" ? null : v)}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      {identities.map((id) => (
                        <SelectItem key={id.id} value={id.id}>
                          {id.sender_name} ({id.sender_email})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <SignatureEditor
              initialHtml={editingHtml}
              workspaceId={workspaceId}
              onSave={handleSave}
              saving={saving}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Signature Preview</DialogTitle></DialogHeader>
          <div className="rounded-lg border border-border bg-white p-4">
            <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Send Test Dialog */}
      <Dialog open={testDialogOpen} onOpenChange={setTestDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Send Test Email</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Send to</Label>
              <Input value={testEmail} onChange={(e) => setTestEmail(e.target.value)} placeholder="your@email.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setTestDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleSendTest} disabled={sendingTest || !testEmail}>
              {sendingTest ? "Sending..." : "Send Test"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone Dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Clone Signature</DialogTitle></DialogHeader>
          {identities.length > 1 && (
            <div className="space-y-1.5 py-2">
              <Label className="text-xs">Assign to sender identity</Label>
              <Select value={cloneIdentityId || "none"} onValueChange={(v) => setCloneIdentityId(v === "none" ? null : v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {identities.map((id) => (
                    <SelectItem key={id.id} value={id.id}>{id.sender_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCloneDialogOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={handleClone}>Clone</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
