import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Building2, Unlink, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function AgencyDisconnectSection() {
  const { user, profile } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [agencyName, setAgencyName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  // Only show for direct (non-agency) users
  const isDirectUser = profile?.account_type !== "agency";

  useEffect(() => {
    if (!user || !currentWorkspace || !isDirectUser) {
      setLoading(false);
      return;
    }

    const fetchAgency = async () => {
      const { data: link } = await supabase
        .from("agency_client_links")
        .select("agency_user_id")
        .eq("workspace_id", currentWorkspace.id)
        .eq("client_user_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (link?.agency_user_id) {
        const { data: agencyProfile } = await supabase
          .from("agency_profiles")
          .select("agency_name")
          .eq("user_id", link.agency_user_id)
          .maybeSingle();

        setAgencyName(agencyProfile?.agency_name || "Your Agency");
      } else {
        setAgencyName(null);
      }
      setLoading(false);
    };

    fetchAgency();
  }, [user?.id, currentWorkspace?.id, isDirectUser]);

  const handleDisconnect = async () => {
    if (!currentWorkspace) return;
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("disconnect-agency", {
        body: { workspace_id: currentWorkspace.id },
      });

      if (error) throw error;
      toast.success("Agency disconnected successfully");
      setAgencyName(null);
    } catch (err: any) {
      toast.error(err.message || "Failed to disconnect agency");
    } finally {
      setDisconnecting(false);
    }
  };

  if (!isDirectUser || loading || !agencyName) return null;

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Building2 className="w-5 h-5 text-muted-foreground" />
          Connected Agency
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">{agencyName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              This agency manages your workspace. Disconnecting will revoke their access.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={disconnecting}>
                {disconnecting ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Unlink className="w-4 h-4 mr-1" />}
                Disconnect
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Disconnect from {agencyName}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove the agency's access to your workspace. Your data, campaigns, and subscription will remain unchanged. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDisconnect} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Yes, Disconnect
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}
