import { useState } from "react";
import { AlertTriangle, CreditCard, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SendPaymentEmailDialog } from "./SendPaymentEmailDialog";

export const PaymentFailedBanner = () => {
  const { subscriptionStatus } = useSubscription();
  const { currentWorkspace } = useWorkspace();
  const [portalLoading, setPortalLoading] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);

  if (subscriptionStatus !== "past_due") return null;

  const handleUpdatePayment = async () => {
    setPortalLoading(true);
    try {
      const portalWindow = window.open("", "_blank");
      const { data, error } = await supabase.functions.invoke("customer-portal", {
        body: {
          workspace_id: currentWorkspace?.id,
          flow_data: { type: "payment_method_update" },
        },
      });
      if (error) throw error;
      if (data?.url && portalWindow) {
        portalWindow.location.href = data.url;
      } else {
        portalWindow?.close();
      }
    } catch {
      toast.error("Failed to open payment portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <>
      <div className="w-full bg-destructive/10 border-b border-destructive/20 px-4 py-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 max-w-7xl mx-auto">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0" />
            <p className="text-sm font-medium text-destructive">
              Payment failed — action required to keep your account running smoothly
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              size="sm"
              variant="destructive"
              onClick={handleUpdatePayment}
              disabled={portalLoading}
              className="gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5" />
              {portalLoading ? "Opening…" : "Update Payment"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEmailDialogOpen(true)}
              className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/5"
            >
              <Mail className="w-3.5 h-3.5" />
              Email Accounts Team
            </Button>
          </div>
        </div>
      </div>

      <SendPaymentEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogOpen}
      />
    </>
  );
};
