import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

const CANCELLATION_REASONS = [
  { value: "too_expensive", label: "Too expensive" },
  { value: "not_using", label: "Not using it enough" },
  { value: "missing_features", label: "Missing features I need" },
  { value: "found_alternative", label: "Found an alternative" },
  { value: "temporary", label: "Temporary — I'll be back" },
  { value: "other", label: "Other" },
];

interface CancellationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planKey: string;
  onCancelled: () => void;
}

export function CancellationDialog({ open, onOpenChange, planKey, onCancelled }: CancellationDialogProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    if (!reason) {
      toast.error("Please select a reason");
      return;
    }
    setLoading(true);
    try {
      // Store cancellation event
      const { error: insertError } = await supabase.from("cancellation_events").insert({
        user_id: user!.id,
        ...(currentWorkspace?.id !== undefined ? { workspace_id: currentWorkspace.id } : {}),
        reason,
        details: details || null,
        plan_key: planKey,
      });
      if (insertError) throw insertError;

      // Trigger Stripe cancellation via update-subscription
      const { error } = await supabase.functions.invoke("update-subscription", {
        body: { action: "cancel", workspace_id: currentWorkspace?.id, confirmation_text: "CANCEL" },
      });
      if (error) throw error;

      toast.success("Subscription cancelled. You'll have access until the end of your billing period.");
      onCancelled();
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel subscription");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancel Subscription</DialogTitle>
          <DialogDescription>
            We're sorry to see you go. Your access will continue until the end of your current billing period.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Why are you cancelling?</Label>
            <RadioGroup value={reason} onValueChange={setReason}>
              {CANCELLATION_REASONS.map((r) => (
                <div key={r.value} className="flex items-center space-x-2">
                  <RadioGroupItem value={r.value} id={r.value} />
                  <Label htmlFor={r.value} className="text-sm font-normal cursor-pointer">
                    {r.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Anything else you'd like us to know?</Label>
            <Textarea
              placeholder="Optional feedback..."
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Keep Subscription
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={loading || !reason}>
            {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Cancelling...</> : "Cancel Subscription"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
