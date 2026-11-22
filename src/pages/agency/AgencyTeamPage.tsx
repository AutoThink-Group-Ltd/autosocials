import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useAgencyRole } from "@/features/agency/useAgencyRole";
import { createAgencyInvite, updateAgencyMember, resendInvite, cancelInvite } from "@/lib/invites.functions";
import { isEmail } from "@/lib/invites";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Mail, Pencil, RotateCw, Trash2, UserPlus, Users, X } from "lucide-react";

type Access = { role: "admin" | "member"; clientAccess: "all" | "specific"; clientIds: string[] };
type Employee = { id: string; email: string; full_name: string | null; role: string | null; client_access: string | null; client_ids: string[] | null; employee_user_id: string };

function AccessFields({ value, onChange, clients }: { value: Access; onChange: (a: Access) => void; clients: { id: string; client_name: string }[] }) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Access level</Label>
        <RadioGroup value={value.role} onValueChange={(r) => onChange({ ...value, role: r as Access["role"] })} className="gap-2">
          {[
            { v: "member", t: "Clients only", d: "Works in the clients you pick. No billing, team or agency settings." },
            { v: "admin", t: "Admin", d: "Every client, plus billing, team and agency settings." },
          ].map((o) => (
            <label key={o.v} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[[data-state=checked]]:border-foreground">
              <RadioGroupItem value={o.v} className="mt-0.5" />
              <span><span className="block text-sm font-medium text-foreground">{o.t}</span><span className="block text-xs text-muted-foreground">{o.d}</span></span>
            </label>
          ))}
        </RadioGroup>
      </div>
      {value.role === "member" && (
        <div className="space-y-2">
          <Label>Clients</Label>
          <RadioGroup value={value.clientAccess} onValueChange={(c) => onChange({ ...value, clientAccess: c as Access["clientAccess"] })} className="flex gap-4">
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="all" />All clients</label>
            <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="specific" />Pick clients</label>
          </RadioGroup>
          {value.clientAccess === "specific" && (
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-border p-2">
              {clients.length === 0 && <p className="p-2 text-xs text-muted-foreground">No active clients yet.</p>}
              {clients.map((c) => (
                <label key={c.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-secondary">
                  <Checkbox checked={value.clientIds.includes(c.id)} onCheckedChange={(on) => onChange({ ...value, clientIds: on ? [...value.clientIds, c.id] : value.clientIds.filter((x) => x !== c.id) })} />
                  {c.client_name}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const blank: Access = { role: "member", clientAccess: "all", clientIds: [] };

const AgencyTeamPage = () => {
  const { user } = useAuth();
  const { ownerId, isAdmin } = useAgencyRole();
  const qc = useQueryClient();
  const invite = useServerFn(createAgencyInvite);
  const update = useServerFn(updateAgencyMember);
  const resend = useServerFn(resendInvite);
  const cancel = useServerFn(cancelInvite);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", access: blank });
  const [editing, setEditing] = useState<{ emp: Employee; access: Access } | null>(null);
  const [removing, setRemoving] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);

  const key = ["agency-team", ownerId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!ownerId,
    queryFn: async () => {
      const [e, i, c] = await Promise.all([
        supabase.from("agency_employees").select("*").eq("agency_user_id", ownerId!).eq("is_active", true).order("created_at"),
        supabase.from("agency_employee_invitations").select("id, email, full_name, role, client_access, sent_at").eq("agency_user_id", ownerId!).eq("status", "pending").order("created_at", { ascending: false }),
        supabase.from("agency_clients").select("id, client_name").eq("agency_user_id", ownerId!).eq("status", "active").order("client_name"),
      ]);
      return { employees: (e.data ?? []) as Employee[], invites: i.data ?? [], clients: c.data ?? [] };
    },
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const clients = data?.clients ?? [];
  const clientLabel = (e: { role: string | null; client_access: string | null; client_ids?: string[] | null }) =>
    e.role === "admin" ? "All clients · Admin" : e.client_access === "all" ? "All clients" : `${e.client_ids?.length ?? 0} client${(e.client_ids?.length ?? 0) === 1 ? "" : "s"}`;

  const sendInvite = async () => {
    if (!isEmail(form.email)) { toast.error("Enter a valid email address"); return; }
    if (form.access.role === "member" && form.access.clientAccess === "specific" && form.access.clientIds.length === 0) { toast.error("Pick at least one client"); return; }
    setBusy(true);
    try {
      await invite({ data: { email: form.email, fullName: form.name || null, ...form.access } });
      toast.success(`Invitation sent to ${form.email}`);
      setForm({ name: "", email: "", access: blank }); setInviteOpen(false); refresh();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't send the invitation"); }
    setBusy(false);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try { await update({ data: { id: editing.emp.id, ...editing.access } }); toast.success("Access updated"); setEditing(null); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't update"); }
    setBusy(false);
  };

  const remove = async () => {
    if (!removing) return;
    const { error } = await supabase.from("agency_employees").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", removing.id);
    if (error) toast.error("Couldn't remove this teammate"); else { toast.success("Teammate removed"); refresh(); }
    setRemoving(null);
  };

  const act = async (fn: typeof resend, id: string, ok: string) => {
    try { await fn({ data: { kind: "agency", id } }); toast.success(ok); refresh(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong"); }
  };

  return (
    <div className="max-w-4xl space-y-6 p-4 sm:p-6 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Team</h1>
          <p className="mt-1 text-muted-foreground">Invite colleagues and choose which clients they can work on</p>
        </div>
        {isAdmin && <Button onClick={() => setInviteOpen(true)}><UserPlus className="mr-1.5 h-4 w-4" />Invite teammate</Button>}
      </div>

      {isLoading || !ownerId ? (
        <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <section className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Teammates ({data?.employees.length ?? 0})</p>
            {data?.employees.length === 0 && (
              <div className="flex flex-col items-center rounded-2xl border border-dashed border-border py-12 text-center">
                <Users className="mb-3 h-10 w-10 text-muted-foreground/40" />
                <p className="font-medium text-foreground">No teammates yet</p>
                <p className="text-sm text-muted-foreground">Invite a colleague by name and email.</p>
              </div>
            )}
            {data?.employees.map((e) => (
              <div key={e.id} className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-foreground">{(e.full_name || e.email).slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{e.full_name || e.email}{e.employee_user_id === user?.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p>
                  <p className="truncate text-xs text-muted-foreground">{e.email}</p>
                </div>
                <Badge variant="secondary">{clientLabel(e)}</Badge>
                {isAdmin && e.employee_user_id !== user?.id && (
                  <>
                    <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Edit access for ${e.email}`}
                      onClick={() => setEditing({ emp: e, access: { role: e.role === "admin" ? "admin" : "member", clientAccess: e.client_access === "specific" ? "specific" : "all", clientIds: e.client_ids ?? [] } })}>
                      <Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" aria-label={`Remove ${e.email}`} onClick={() => setRemoving(e)}><Trash2 className="h-4 w-4" /></Button>
                  </>
                )}
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
                    <p className="truncate text-xs text-muted-foreground">{i.email} · {clientLabel(i)} · sent {i.sent_at ? new Date(i.sent_at).toLocaleDateString() : "—"}</p>
                  </div>
                  {isAdmin && (
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

      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Invite a teammate</DialogTitle>
            <DialogDescription>They'll get a branded email, set a password and land on your agency dashboard.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="at-name">Name</Label><Input id="at-name" maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Alex Jones" /></div>
              <div className="space-y-2"><Label htmlFor="at-email">Email</Label><Input id="at-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="alex@agency.com" /></div>
            </div>
            <AccessFields value={form.access} onChange={(access) => setForm({ ...form, access })} clients={clients} />
            <Button className="w-full" onClick={sendInvite} disabled={busy || !form.email}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send invitation"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Access for {editing?.emp.full_name || editing?.emp.email}</DialogTitle></DialogHeader>
          {editing && <AccessFields value={editing.access} onChange={(access) => setEditing({ ...editing, access })} clients={clients} />}
          <Button className="w-full" onClick={saveEdit} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save access"}</Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!removing} onOpenChange={(o) => !o && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removing?.full_name || removing?.email}?</AlertDialogTitle>
            <AlertDialogDescription>They'll lose access to your agency and every client straight away.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={remove}>Remove</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AgencyTeamPage;
