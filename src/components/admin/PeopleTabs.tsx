import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listPeople, listPeopleSubscriptions, deletePerson, remapWorkspaceAgency } from "@/lib/admin-people.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB") : "Never");
const th = "text-left p-3 text-xs font-medium text-muted-foreground";

export function PeopleSubscribersTab() {
  const list = useServerFn(listPeopleSubscriptions);
  const { data, isLoading, error } = useQuery({ queryKey: ["admin-people-subscriptions"], queryFn: () => list() });
  const [query, setQuery] = useState("");
  const rows = (data ?? []).filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()));
  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <p role="alert" className="text-sm text-destructive">Could not load subscribers. Please try again.</p>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Plans and credit allowances by workspace, including complimentary access and Stripe subscriptions.</p>
      <div className="relative max-w-sm"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search workspaces" aria-label="Search workspaces" className="pl-9" /></div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-secondary/50"><th className={th}>Workspace</th><th className={th}>Plan</th><th className={th}>Status</th><th className={th}>Billing</th><th className={th}>Credits per period</th><th className={th}>Period ends</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-xs text-muted-foreground">No workspaces match.</td></tr>}
            {rows.map((row) => <tr key={row.id} className="border-b border-border/50 last:border-0"><td className="p-3 font-medium">{row.name}</td><td className="p-3 capitalize">{row.plan}</td><td className="p-3 capitalize">{row.status.replaceAll("_", " ")}</td><td className="p-3">{row.billing}</td><td className="p-3 tabular-nums">{row.credits?.toLocaleString() ?? "—"}</td><td className="p-3">{row.renewal ? fmt(row.renewal) : "—"}</td></tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">{rows.length} workspace{rows.length === 1 ? "" : "s"} shown.</p>
    </div>
  );
}

function usePeople() {
  const fn = useServerFn(listPeople);
  return useQuery({ queryKey: ["admin-people"], queryFn: () => fn() });
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{value.toLocaleString()}</p>
    </div>
  );
}

function DeleteDialog({ target, onClose }: { target: { id: string; label: string; agency?: boolean } | null; onClose: () => void }) {
  const del = useServerFn(deletePerson);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {target?.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            {target?.agency
              ? "This permanently deletes the agency account. Its client workspaces stay, but become unassigned."
              : "This permanently deletes the user account and signs them out everywhere. This can't be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={async (e) => {
              e.preventDefault();
              if (!target) return;
              setBusy(true);
              try {
                await del({ data: { userId: target.id } });
                toast.success(`${target.label} deleted`);
                await qc.invalidateQueries({ queryKey: ["admin-people"] });
                onClose();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Delete failed");
              } finally { setBusy(false); }
            }}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function PeopleUsersTab() {
  const { data, isLoading } = usePeople();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [target, setTarget] = useState<{ id: string; label: string } | null>(null);
  const users = data?.users ?? [];
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? users.filter((u) => u.email.toLowerCase().includes(s) || (u.name ?? "").toLowerCase().includes(s)) : users;
  }, [users, q]);
  const rows = filtered.slice(page * 50, page * 50 + 50);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total users" value={users.length} />
        <Stat label="Onboarded" value={users.filter((u) => u.onboarded).length} />
        <Stat label="Direct" value={users.filter((u) => u.accountType !== "agency").length} />
        <Stat label="Agency" value={users.filter((u) => u.accountType === "agency").length} />
      </div>
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search name or email" className="pl-9" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-secondary/50">
            <th className={th}>Name</th><th className={th}>Type</th><th className={th}>Last login</th><th className={th}>Joined</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id} className="border-b border-border/50 last:border-0">
                <td className="p-3"><p className="font-medium text-foreground">{u.name || "Unnamed"}</p><p className="text-xs text-muted-foreground">{u.email}</p></td>
                <td className="p-3"><Badge variant="outline" className="text-[10px] capitalize">{u.superAdmin ? "super admin" : u.accountType}</Badge></td>
                <td className="p-3 text-xs text-muted-foreground">{fmt(u.lastSignIn)}</td>
                <td className="p-3 text-xs text-muted-foreground">{fmt(u.createdAt)}</td>
                <td className="p-3 text-right">
                  {!u.superAdmin && (
                    <Button size="sm" variant="ghost" aria-label={`Delete ${u.email}`} onClick={() => setTarget({ id: u.id, label: u.name || u.email })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Showing {filtered.length ? page * 50 + 1 : 0}–{Math.min(filtered.length, page * 50 + 50)} of {filtered.length}</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button size="sm" variant="outline" disabled={(page + 1) * 50 >= filtered.length} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
      <DeleteDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

export function PeopleAgenciesTab() {
  const { data, isLoading } = usePeople();
  const [target, setTarget] = useState<{ id: string; label: string; agency: boolean } | null>(null);
  const agencies = data?.agencies ?? [];

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Agencies <span className="text-muted-foreground">· {agencies.length}</span></h3>
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-border bg-secondary/50">
              <th className={th}>Agency</th><th className={th}>Clients</th><th className={th}>Joined</th><th className="p-3" />
            </tr></thead>
            <tbody>
              {agencies.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-xs text-muted-foreground">No agencies yet.</td></tr>}
              {agencies.map((a) => (
                <tr key={a.userId} className="border-b border-border/50 last:border-0">
                  <td className="p-3"><p className="font-medium text-foreground">{a.name}</p><p className="text-xs text-muted-foreground">{a.email}</p></td>
                  <td className="p-3 tabular-nums">{a.clients}</td>
                  <td className="p-3 text-xs text-muted-foreground">{fmt(a.createdAt)}</td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="ghost" aria-label={`Delete ${a.name}`} onClick={() => setTarget({ id: a.userId, label: a.name, agency: true })}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">To move a client workspace between agencies, use People → Workspaces.</p>
      <DeleteDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

type Ws = { id: string; name: string; agencyUserId: string | null; owner: string | null; memberCount: number; createdAt: string };

export function PeopleWorkspacesTab() {
  const { data, isLoading } = usePeople();
  const remap = useServerFn(remapWorkspaceAgency);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "managed" | "none">("all");
  const [moving, setMoving] = useState<Ws | null>(null);
  const [dest, setDest] = useState<string>("none");
  const [saving, setSaving] = useState(false);
  const agencies = data?.agencies ?? [];
  const agencyName = (id: string | null) => (id ? agencies.find((a) => a.userId === id)?.name ?? "Unknown agency" : "No agency");
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data?.workspaces ?? []).filter((w) =>
      (!s || w.name.toLowerCase().includes(s) || (w.owner ?? "").toLowerCase().includes(s)) &&
      (filter === "all" || (filter === "managed" ? !!w.agencyUserId : !w.agencyUserId)));
  }, [data, q, filter]);

  if (isLoading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const confirm = async () => {
    if (!moving) return;
    setSaving(true);
    try {
      await remap({ data: { workspaceId: moving.id, agencyUserId: dest === "none" ? null : dest } });
      toast.success(`${moving.name} now managed by ${agencyName(dest === "none" ? null : dest)}`);
      await qc.invalidateQueries({ queryKey: ["admin-people"] });
      await qc.invalidateQueries({ queryKey: ["agency-clients"] });
      setMoving(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    } finally { setSaving(false); }
  };

  const unchanged = moving && (dest === "none" ? null : dest) === moving.agencyUserId;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search workspace or owner" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <SelectTrigger className="h-9 w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All workspaces</SelectItem>
            <SelectItem value="managed">Managed by an agency</SelectItem>
            <SelectItem value="none">No agency</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{rows.length} shown</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-border bg-secondary/50">
            <th className={th}>Workspace</th><th className={th}>Managed by</th><th className={th}>Members</th><th className={th}>Created</th><th className="p-3" />
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-xs text-muted-foreground">No workspaces match.</td></tr>}
            {rows.map((w) => (
              <tr key={w.id} className="border-b border-border/50 last:border-0">
                <td className="p-3"><p className="font-medium text-foreground">{w.name}</p><p className="text-xs text-muted-foreground">Owner: {w.owner ?? "none"}</p></td>
                <td className="p-3">{w.agencyUserId ? <Badge variant="secondary">{agencyName(w.agencyUserId)}</Badge> : <span className="text-xs text-muted-foreground">No agency</span>}</td>
                <td className="p-3 tabular-nums">{w.memberCount}</td>
                <td className="p-3 text-xs text-muted-foreground">{fmt(w.createdAt)}</td>
                <td className="p-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => { setMoving(w); setDest(w.agencyUserId ?? "none"); }}>Move to agency</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AlertDialog open={!!moving} onOpenChange={(o) => !o && !saving && setMoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {moving?.name}</AlertDialogTitle>
            <AlertDialogDescription>Choose which agency manages this workspace. Its posts, files and batches stay as they are.</AlertDialogDescription>
          </AlertDialogHeader>
          <Select value={dest} onValueChange={setDest}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No agency</SelectItem>
              {agencies.map((a) => <SelectItem key={a.userId} value={a.userId}>{a.name} · {a.email}</SelectItem>)}
            </SelectContent>
          </Select>
          {moving && !unchanged && (
            <p className="rounded-lg border border-border bg-secondary/50 p-3 text-sm text-foreground">
              {moving.name} will move from <b>{agencyName(moving.agencyUserId)}</b> to <b>{agencyName(dest === "none" ? null : dest)}</b>.
              {moving.agencyUserId && " The current agency's management link and its owner's direct workspace access end. Other invited members retain access."}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={saving || !!unchanged} onClick={(e) => { e.preventDefault(); void confirm(); }}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirm move
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
