import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { CreationScheduleDialog, type CampaignScheduleRow } from "./CreationScheduleDialog";
import type { ScheduleCommand } from "./ScheduleDialogHost";

/** Reusable entry point for opening the same scheduling flow from any workspace screen. */
export function WorkspaceCreationScheduleDialog({ open, onOpenChange, workspaceId, campaignRows, initialTileIds = [], initialVideoIds = [], initialWrittenIds = [], onScheduled, mode = "dialog", onModeChange, command, onCommandHandled, onSelectionCountChange, selectionScope, onLockChange }: {
  open: boolean; onOpenChange: (open: boolean) => void; workspaceId: string; campaignRows?: CampaignScheduleRow[]; initialTileIds?: string[]; initialVideoIds?: string[]; initialWrittenIds?: string[]; onScheduled?: () => void; mode?: "pane" | "dialog"; onModeChange?: (mode: "pane" | "dialog" | null) => void; command?: ScheduleCommand | null; onCommandHandled?: (sequence: number) => void; onSelectionCountChange?: ((count: number) => void) | undefined; selectionScope?: string | undefined; onLockChange?: (locked: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const context = useQuery({
    queryKey: ["creation-schedule-context", workspaceId], enabled: open && !!workspaceId,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
    queryFn: async () => {
      const [workspace, accounts] = await Promise.all([
        supabase.from("workspaces").select("timezone").eq("id", workspaceId).single(),
        supabase.from("social_accounts").select("id,platform,display_name,handle,status,is_enabled,expires_at").eq("workspace_id", workspaceId).order("display_name"),
      ]);
      if (workspace.error || accounts.error || !workspace.data) throw new Error("Could not load scheduling details.");
      const storedZone = workspace.data.timezone;
      const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const timezone = (!storedZone || storedZone === "UTC") && localZone === "Europe/London" ? localZone : storedZone || "UTC";
      return { timezone, accounts: accounts.data ?? [] };
    },
  });
  if (!open) return null;
  if ((context.isFetching || context.isError || !context.data) && mode === "pane") return <aside aria-label="Schedule pane" className="fixed bottom-3 right-3 top-16 z-40 w-[min(520px,calc(100vw-1.5rem))] rounded-2xl border border-border-control bg-background p-5 text-ink shadow-xl"><div className="flex items-center justify-between"><h2 className="font-display text-xl font-bold">Schedule</h2><button type="button" className="rounded-lg px-3 py-2 text-sm hover:bg-surface-subtle" onClick={() => onOpenChange(false)}>Close</button></div>{context.isError ? <p role="alert" className="mt-4">Could not load scheduling details. <button type="button" className="underline" onClick={() => void context.refetch()}>Try again</button></p> : <p role="status" className="mt-4">Loading accounts and timezone…</p>}</aside>;
  if (context.isFetching || context.isError || !context.data) return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent>
    <DialogTitle>Publish content</DialogTitle><DialogDescription>Loading your scheduling details.</DialogDescription>
    {context.isError ? <div role="alert" className="space-y-3"><p>Could not load scheduling details.</p><Button type="button" variant="outline" onClick={() => void context.refetch()}>Try again</Button></div> : <p role="status">Loading accounts and timezone…</p>}
  </DialogContent></Dialog>;
  return <CreationScheduleDialog {...(campaignRows ? { campaignRows } : {})} mode={mode} selectionScope={selectionScope} onLockChange={onLockChange} onModeChange={onModeChange} command={command} onCommandHandled={onCommandHandled} onSelectionCountChange={onSelectionCountChange} open={open} onOpenChange={onOpenChange} workspaceId={workspaceId} timezone={context.data.timezone} accounts={context.data.accounts} initialTileIds={initialTileIds} initialVideoIds={initialVideoIds} initialWrittenIds={initialWrittenIds} onScheduled={() => { void queryClient.invalidateQueries({ queryKey: ["publish-planner", workspaceId] }); void queryClient.invalidateQueries({ queryKey: ["asset-publishing-status", workspaceId] }); void queryClient.invalidateQueries({ queryKey: ["pipeline-assets", workspaceId] }); onScheduled?.(); }} />;
}
