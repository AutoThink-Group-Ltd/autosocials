import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppIcon } from "@/components/brand/AppIcon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { listSwitchableUsers, startImpersonation, endImpersonation } from "@/lib/impersonation.functions";
import { beginSwitch, readImpersonation, returnToSelf, type ImpersonationState } from "./impersonation";

type U = Awaited<ReturnType<typeof listSwitchableUsers>>[number];

/** Header icon button (super admins only) that opens the user picker. */
export function UserSwitcherButton() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("users");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [pick, setPick] = useState<U | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useServerFn(listSwitchableUsers);
  const start = useServerFn(startImpersonation);
  const { currentWorkspace, workspaces, setCurrentWorkspace, loading: workspacesLoading } = useWorkspace();
  const matchingWorkspaces = workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["switchable-users", tab, debounced],
    queryFn: () => list({ data: { query: debounced, ...(tab === "agencies" ? { accountType: "agency" as const } : {}) } }),
    enabled: open && tab !== "workspaces",
    staleTime: 30_000,
  });

  async function confirm() {
    if (!pick) return;
    setBusy(true);
    try {
      const res = await start({ data: { targetId: pick.id } });
      await beginSwitch(res.tokenHash, res.targetName, res.eventId, res.destination);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't switch user");
      setBusy(false);
    }
  }

  function switchWorkspace(workspace: (typeof workspaces)[number]) {
    setCurrentWorkspace(workspace);
    setOpen(false);
    window.location.assign("/app/create");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Switch user or workspace"
        title="Switch user or workspace"
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border-control text-ink hover:bg-surface-subtle"
      >
        <AppIcon name="switchUser" size={16} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Switch user or workspace</DialogTitle>
            <DialogDescription>{tab !== "workspaces" ? "You'll see AutoSocials exactly as they do. Every user switch is recorded." : "Open a workspace while staying signed in as yourself."}</DialogDescription>
          </DialogHeader>
          <Tabs value={tab} onValueChange={(value) => { setTab(value); setQuery(""); }}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="workspaces">Workspaces</TabsTrigger>
              <TabsTrigger value="agencies">Agencies</TabsTrigger>
            </TabsList>
            <Input autoFocus className="mt-3" placeholder={tab === "workspaces" ? "Search workspaces" : tab === "agencies" ? "Search agency name or email" : "Search name, email or business"} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tab === "workspaces" ? "Search workspaces" : tab === "agencies" ? "Search agencies" : "Search users"} />
            <TabsContent value={tab === "agencies" ? "agencies" : "users"}>
              <div className="max-h-[50vh] min-h-[120px] overflow-y-auto rounded-[10px] border border-border">
            {isLoading && <p className="p-4 text-[13px] text-text-secondary">Loading {tab === "agencies" ? "agencies" : "users"}…</p>}
            {error && <p className="p-4 text-[13px] text-destructive">Couldn't load users. Try again in a moment.</p>}
            {!isLoading && !error && users.length === 0 && <p className="p-4 text-[13px] text-text-secondary">No matching {tab === "agencies" ? "agency users" : "users"}.</p>}
            <ul>
              {users.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setPick(u)}
                    className="flex w-full items-center gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-surface-subtle"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-semibold text-inverse">
                      {(u.name || u.email || "?").slice(0, 1).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-ink">{u.name || u.email}</span>
                      <span className="block truncate text-[12px] text-muted-foreground">
                        {u.email}{u.workspace ? ` · ${u.workspace}` : ""}{u.accountType === "agency" ? " · Agency" : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
              </div>
            </TabsContent>
            <TabsContent value="workspaces">
              <div className="max-h-[50vh] min-h-[120px] overflow-y-auto rounded-[10px] border border-border">
                {workspacesLoading && <p className="p-4 text-[13px] text-text-secondary">Loading workspaces…</p>}
                {!workspacesLoading && matchingWorkspaces.length === 0 && <p className="p-4 text-[13px] text-text-secondary">No matching workspaces.</p>}
                <ul>
                  {matchingWorkspaces.map((workspace) => (
                    <li key={workspace.id}>
                      <button type="button" onClick={() => switchWorkspace(workspace)}
                        className="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-surface-subtle">
                        <span className="min-w-0 truncate text-[14px] font-medium text-ink">{workspace.name}</span>
                        {workspace.id === currentWorkspace?.id && <span className="shrink-0 text-[12px] text-muted-foreground">Current</span>}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pick} onOpenChange={(o) => !o && !busy && setPick(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch into {pick?.name || pick?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              You'll be signed in as this user in this tab. Anything you do will happen on their account. Use “Back to Admin” in the top bar to come back.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void confirm(); }}>
              {busy ? "Switching…" : "Switch user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Slim carbon bar shown while a super admin is viewing as another user. */
export function ImpersonationBar() {
  const [st, setSt] = useState<ImpersonationState | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useServerFn(endImpersonation);
  useEffect(() => setSt(readImpersonation()), []);
  if (!st) return null;
  return (
    <div role="status" className="flex min-h-9 shrink-0 items-center justify-center gap-2 bg-ink px-3 py-1 text-[13px] text-inverse sm:gap-3 sm:px-4">
      <span className="shrink-0"><AppIcon name="switchUser" size={14} /></span>
      <span className="min-w-0 truncate">Viewing as <strong className="font-semibold">{st.targetName}</strong></span>
      <span className="text-silver">·</span>
      <button
        type="button"
        disabled={busy}
        onClick={() => { setBusy(true); void returnToSelf((eventId) => end({ data: { eventId } })); }}
        className="shrink-0 font-semibold underline underline-offset-4 disabled:opacity-60"
      >
        {busy ? "Returning…" : "Back to Admin"}
      </button>
    </div>
  );
}
