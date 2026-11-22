import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PublishingNotifications } from "@/components/settings/PublishingNotifications";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type AgencyPreference = Database["public"]["Tables"]["agency_notification_preferences"]["Row"];
const OUTREACH_OPTIONS = [
  { key: "bcc_on_campaigns", label: "BCC on campaigns" },
  { key: "bcc_on_replies", label: "BCC on replies" },
  { key: "bcc_on_bounces", label: "BCC on bounces" },
  { key: "bcc_on_clicks", label: "BCC on clicks" },
] as const;
type OutreachOption = (typeof OUTREACH_OPTIONS)[number]["key"];

const AgencyNotificationsPage = () => {
  const { user } = useAuth();
  const { workspaces, loading: workspacesLoading } = useWorkspace();
  const [prefs, setPrefs] = useState<Record<string, AgencyPreference>>({});
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    const { data: prefData, error } = await supabase
      .from("agency_notification_preferences")
      .select("*")
      .eq("agency_user_id", user.id);

    if (error) toast.error("Couldn't load outreach notification settings");
    const prefMap: Record<string, AgencyPreference> = {};
    (prefData || []).forEach((p) => { prefMap[p.client_workspace_id] = p; });
    setPrefs(prefMap);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const togglePref = async (workspaceId: string, field: OutreachOption, value: boolean) => {
    const existing = prefs[workspaceId];
    const result = existing
      ? await supabase
        .from("agency_notification_preferences")
        .update({ [field]: value })
        .eq("id", existing.id)
      : await supabase
        .from("agency_notification_preferences")
        .insert({
          agency_user_id: user!.id,
          client_workspace_id: workspaceId,
          [field]: value,
        });
    if (result.error) toast.error("Couldn't save outreach notification settings");
    fetchData();
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Notification Preferences</h1>
        <p className="text-muted-foreground mt-1">Configure BCC and notification settings per client</p>
      </div>

      {loading || workspacesLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : workspaces.length === 0 ? (
        <Card className="border-border">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Bell className="w-12 h-12 text-muted-foreground/30 mb-4" />
            <h3 className="text-lg font-medium text-foreground">No clients yet</h3>
            <p className="text-sm text-muted-foreground mt-1">Notification preferences will appear once you have active clients.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {workspaces.map((client) => {
            const p = prefs[client.id] || {};
            return (
              <Card key={client.id} className="border-border">
                <CardHeader>
                  <CardTitle className="text-base">{client.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {OUTREACH_OPTIONS.map((item) => (
                      <div key={item.key} className="flex items-center justify-between">
                        <Label className="text-sm">{item.label}</Label>
                        <Switch
                          aria-label={`${item.label} for ${client.name}`}
                          checked={!!p[item.key]}
                          onCheckedChange={(v) => togglePref(client.id, item.key, v)}
                        />
                      </div>
                    ))}
                  </div>
                  <PublishingNotifications workspaceId={client.id} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AgencyNotificationsPage;
