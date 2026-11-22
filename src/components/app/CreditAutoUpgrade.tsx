import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Status = {
  enabled: boolean;
  ready: boolean;
  owner: boolean;
  payment_ready: boolean;
  payment_action_url?: string | null;
};

function stripePaymentUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? "");
    return url.protocol === "https:" &&
      (url.hostname === "stripe.com" || url.hostname.endsWith(".stripe.com"))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
export function CreditAutoUpgrade({
  workspaceId,
  isFree,
}: {
  workspaceId: string;
  isFree: boolean;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const key = ["credit-auto-upgrade-status", workspaceId];
  const status = useQuery({
    queryKey: key,
    retry: false,
    queryFn: async () => {
      const response = await supabase.functions.invoke(
        "credit-auto-upgrade-settings",
        { body: { workspace_id: workspaceId, action: "status" } },
      );
      if (response.error) throw response.error;
      const value = response.data as Status;
      if (
        typeof value?.ready !== "boolean" ||
        typeof value?.owner !== "boolean" ||
        typeof value?.enabled !== "boolean" ||
        typeof value?.payment_ready !== "boolean"
      )
        throw new Error("Invalid billing status");
      return value;
    },
  });
  async function setEnabled(enabled: boolean) {
    setBusy(true);
    try {
      const result = await supabase.functions.invoke(
        "credit-auto-upgrade-settings",
        { body: { workspace_id: workspaceId, enabled } },
      );
      if (result.error) throw result.error;
      await queryClient.invalidateQueries({ queryKey: key });
    } catch {
      toast.error("Could not update automatic upgrades. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  async function setup() {
    setBusy(true);
    try {
      const result = await supabase.functions.invoke(
        "credit-auto-upgrade-setup",
        { body: { workspace_id: workspaceId } },
      );
      if (result.error || typeof result.data?.url !== "string")
        throw new Error("Setup unavailable");
      window.location.assign(result.data.url);
    } catch {
      toast.error("Could not open payment setup. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Automatic upgrades"
      className="space-y-3 rounded-xl border border-border p-4"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="font-semibold">Automatic upgrades</h3>
          <p className="text-sm text-muted-foreground">
            Optional and off by default. When credits run out, upgrade to the
            next plan after payment succeeds.
          </p>
        </div>
        <Switch
          aria-label="Automatic upgrades"
          checked={status.data?.enabled ?? false}
          disabled={
            busy ||
            !status.data?.owner ||
            (!status.data?.enabled &&
              (!status.data?.ready || (isFree && !status.data?.payment_ready)))
          }
          onCheckedChange={(checked) => void setEnabled(checked)}
        />
      </div>
      {isFree && (
        <p className="text-sm text-muted-foreground">
          Your first upgrade charges a prorated Starter price for the rest of
          this period, then £49 per month. Add a payment method, then explicitly
          enable automatic upgrades.
        </p>
      )}
      {status.data?.owner &&
        stripePaymentUrl(status.data.payment_action_url) && (
          <p className="text-sm">
            <a
              className="font-semibold underline"
              href={stripePaymentUrl(status.data.payment_action_url)!}
            >
              Complete payment
            </a>
            . Generation remains paused until payment is confirmed.
          </p>
        )}
      {isFree &&
        status.data?.ready &&
        status.data.owner &&
        !status.data.payment_ready && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void setup()}
          >
            Set up payment method
          </Button>
        )}
      {status.isError && (
        <p role="status" className="text-sm text-muted-foreground">
          Automatic upgrade status is unavailable.
        </p>
      )}
      {status.data && !status.data.ready && (
        <p className="text-sm text-muted-foreground">
          Automatic upgrades are not available yet.
        </p>
      )}
      {status.data && !status.data.owner && (
        <p className="text-sm text-muted-foreground">
          Only the workspace owner can change this setting.
        </p>
      )}
    </section>
  );
}
