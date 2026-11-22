import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity } from "lucide-react";

const AgencyActivityPage = () => {
  const { user } = useAuth();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) fetchActivity();
  }, [user?.id]);

  const fetchActivity = async () => {
    const { data } = await supabase
      .from("agency_activity_log")
      .select("*")
      .eq("agency_user_id", user!.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setActivities(data || []);
    setLoading(false);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-extrabold tracking-[-0.02em] text-foreground">Activity Log</h1>
        <p className="text-muted-foreground mt-1">Track all agency actions across client workspaces</p>
      </div>

      <Card className="border-border">
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activities.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Activity className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground">No activity yet</h3>
              <p className="text-sm text-muted-foreground mt-1">Actions will be logged here as your team works.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {activities.map((a) => (
                <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary/50">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">{a.action_label}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <span>{new Date(a.created_at).toLocaleString()}</span>
                      {a.client_name && <span>· {a.client_name}</span>}
                      <span className="px-1.5 py-0.5 rounded bg-secondary text-[10px]">{a.action_type}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgencyActivityPage;
