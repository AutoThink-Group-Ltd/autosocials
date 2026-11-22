import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { createWorkspaceInvite, resendInvite, cancelInvite } from "@/lib/invites.functions";
import { isEmail } from "@/lib/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Mail, RotateCw, Trash2, UserPlus, X } from "lucide-react";

type Member = { user_id: string; full_name: string | null; email: string; role: string };

/** People in one workspace: members, pending invites, invite by email. Works for owners, admins and the managing agency. */
export function WorkspacePeople({ workspaceId, workspaceName, canManage, compact = false }:
  { workspaceId: string; workspaceName: string; canManage: boolean; compact?: boolean }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invite = useServerFn(createWorkspaceInvite);
  const resend = useServerFn(resendInvite);
  const cancel = useServerFn(cancelInvite);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", role: "member" as "member" | "admin" });
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const key = ["workspace-people", workspaceId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [m, i] = await Promise.all([
        supabase.rpc("get_workspace_members_with_email", { _workspace_id: workspaceId }),
        supabase.from("workspace_invitations").select("id, email, full_name, role, sent_at, expires_at")
          .eq("workspace_id", workspaceId).eq("status", "pending").order("created_at", { ascending: false }),
      ]);
      return { members: (m.data ?? []) as Member[], invites: i.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const send = async () => {
    if (!isEmail(form.email)) { toast.error("Enter a valid email address"); return; }
    setSending(true);
    try {
      await invite({ data: { workspaceId, email: form.email, fullName: form.name || null, role: form.role } });
      toast.success(`Invitation sent to ${form.email}`);
      setForm({ name: "", email: "", role: "member" }); setOpen(false); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send the invitation"); }
    setSending(false);
  };

  const changeRole = async (m: Member, role: string) => {
    const { error } = await supabase.from("workspace_members").update({ role }).eq("workspace_id", workspaceId).eq("user_id", m.user_id);
    if (error) toast.error("Couldn't change the role"); else { toast.success("Role updated"); refresh(); }
  };
  const remove = async () => {
    if (!removing) return;
    const { error } = await supabase.from("workspace_members").delete().eq("workspace_id", workspaceId).eq("user_id", removing.user_id);
    if (error) toast.error("Couldn't remove this person"); else { toast.success(`${removing.full_name || removing.email} removed`); refresh(); }
    setRemoving(null);
  };
  const act = async (fn: typeof resend, id: string, ok: string) => {
    try { await fn({ data: { kind: "workspace", id } }); toast.success(ok); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
  };

  return (
    <div className="space-y-5">
      {canManage && (
        <div className="flex justify-end">
          <Button size={compact ? "sm" : "default"} onClick={() => setOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" /> Invite person</Button>
        </div>
      )}
      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Members ({data?.members.length ?? 0})</p>
            {(data?.members ?? []).map((m) => (
              <div key={m.user_id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">
                  {(m.full_name || m.email).slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{m.full_name || "—"}{m.user_id === user?.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                </div>
                {canManage && m.role !== "owner" && m.user_id !== user?.id ? (
                  <>
                    <Select value={m.role} onValueChange={(v) => changeRole(m, v)}>
                      <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent>
                    </Select>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Remove ${m.email}`} onClick={() => setRemoving(m)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                ) : <Badge variant="secondary" className="capitalize">{m.role}</Badge>}
              </div>
            ))}
          </section>
          {(data?.invites.length ?? 0) > 0 && (
            <section className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Pending invitations</p>
              {data!.invites.map((i) => (
                <div key={i.id} className="flex items-center gap-3 rounded-xl border border-dashed border-border p-3">
                  <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{i.full_name || i.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{i.email} · {i.role} · sent {i.sent_at ? new Date(i.sent_at).toLocaleDateString() : "—"}</p>
                  </div>
                  {canManage && (
                    <>
                      <Button variant="ghost" size="sm" onClick={() => act(resend, i.id, "Invitation resent")}><RotateCw className="mr-1 h-3.5 w-3.5" />Resend</Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Cancel invitation" onClick={() => act(cancel, i.id, "Invitation cancelled")}><X className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              ))}
            </section>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite someone to {workspaceName}</DialogTitle>
            <DialogDescription>They'll get a branded email, set a password and land straight in this workspace.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label htmlFor="wp-name">Name</Label>
              <Input id="wp-name" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" /></div>
            <div className="space-y-2"><Label htmlFor="wp-email">Email</Label>
              <Input id="wp-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@company.com" /></div>
            <div className="space-y-2"><Label>Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as "member" | "admin" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="member">Member — works in the workspace</SelectItem>
                  <SelectItem value="admin">Admin — also manages people and settings</SelectItem>
                </SelectContent>
              </Select></div>
            <Button className="w-full" onClick={send} disabled={sending || !form.email}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invitation"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.full_name || removing?.email}?</AlertDialogTitle>
            <AlertDialogDescription>They'll lose access to {workspaceName} straight away.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={remove}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
