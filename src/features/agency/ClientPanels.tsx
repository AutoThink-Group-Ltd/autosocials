import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { WorkspacePeople } from "@/features/people/WorkspacePeople";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export type PanelClient = { client_name: string; workspace_id: string | null };
export type ClientPanel = { type: "people" | "notifications"; client: PanelClient } | null;

// Only notifications that are actually sent today can be toggled.
const NOTIFS = [
  { key: "bcc_on_campaigns", label: "Campaign emails", hint: "Get a copy of every outreach email sent" },
  { key: "bcc_on_replies", label: "Creator replies", hint: "Get a copy when a creator replies" },
  { key: "bcc_on_bounces", label: "Bounces", hint: "Know when an email doesn't arrive" },
  { key: "bcc_on_clicks", label: "Link clicks", hint: "Know when a creator clicks a link" },
] as const;
const SOON = [
  { label: "Post failed to publish", hint: "Alert when a scheduled post fails" },
  { label: "Content awaiting approval", hint: "Alert when the client needs to sign off" },
  { label: "Weekly client summary", hint: "A weekly roundup of this client's activity" },
];

function NotificationsPanel({ workspaceId }: { workspaceId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["agency-notif", user?.id, workspaceId];
  const { data, isLoading } = useQuery({
    queryKey: key, enabled: !!user,
    queryFn: async () => (await supabase.from("agency_notification_preferences").select("*").eq("agency_user_id", user!.id).eq("client_workspace_id", workspaceId).maybeSingle()).data,
  });
  const toggle = async (field: string, value: boolean) => {
    qc.setQueryData(key, { ...(data ?? {}), [field]: value });
    const res = data?.id
      ? await supabase.from("agency_notification_preferences").update({ [field]: value } as never).eq("id", data.id)
      : await supabase.from("agency_notification_preferences").insert({ agency_user_id: user!.id, client_workspace_id: workspaceId, [field]: value } as never);
    if (res.error) toast.error("Couldn't save that setting");
    qc.invalidateQueries({ queryKey: key });
  };
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-2">
      {NOTIFS.map((n) => (
        <div key={n.key} className="flex items-center justify-between gap-4 rounded-xl border border-border p-3">
          <div><Label htmlFor={`n-${n.key}`} className="text-sm font-medium">{n.label}</Label><p className="text-xs text-muted-foreground">{n.hint}</p></div>
          <Switch id={`n-${n.key}`} checked={!!(data as Record<string, unknown> | null)?.[n.key]} onCheckedChange={(v) => toggle(n.key, v)} />
        </div>
      ))}
      <p className="pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">Coming soon</p>
      {SOON.map((n) => (
        <div key={n.label} className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-border p-3 opacity-60">
          <div><p className="text-sm font-medium">{n.label} <Badge variant="outline" className="ml-1">Soon</Badge></p><p className="text-xs text-muted-foreground">{n.hint}</p></div>
          <Switch disabled checked={false} aria-label={`${n.label} (coming soon)`} />
        </div>
      ))}
    </div>
  );
}

export function ClientPanelSheet({ panel, onClose }: { panel: ClientPanel; onClose: () => void }) {
  return (
    <Sheet open={!!panel} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {panel?.client.workspace_id && (
          <>
            <SheetHeader className="mb-6">
              <SheetTitle>{panel.type === "people" ? "People" : "Notifications"} · {panel.client.client_name}</SheetTitle>
              <SheetDescription>{panel.type === "people" ? "Everyone who can work in this client's workspace. Invite the client here when you're ready." : "What you hear about for this client. Changes save instantly."}</SheetDescription>
            </SheetHeader>
            {panel.type === "people"
              ? <WorkspacePeople workspaceId={panel.client.workspace_id} workspaceName={panel.client.client_name} canManage compact />
              : <NotificationsPanel workspaceId={panel.client.workspace_id} />}
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
