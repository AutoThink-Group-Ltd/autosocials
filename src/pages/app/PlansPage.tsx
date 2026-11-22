import { useState } from "react";
import { toast } from "sonner";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { ContentCreditPlans } from "@/components/pricing/ContentCreditPlans";
import { CONTENT_CREDIT_PLANS } from "@/config/contentCreditPlans";
import { PLANS } from "@/config/stripePlans";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import {
  createCheckoutSession,
  useSubscription,
} from "@/hooks/useSubscription";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type PlanQuote = {
  quote_id: string;
  amount_due: number;
  currency: string;
  expires_at: string;
  credit_delta: number;
  effective_at: string;
  change: "upgrade" | "downgrade";
  planName: string;
};

export default function PlansPage() {
  const navigate = useNavigate();
  const { currentWorkspace } = useWorkspace();
  const subscription = useSubscription();
  const [loading, setLoading] = useState<string | null>(null);
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  async function selectPlan(plan: (typeof CONTENT_CREDIT_PLANS)[number]) {
    if (subscription.isCourtesy) {
      toast.info("This workspace has complimentary access. Contact your administrator to change it.");
      return;
    }
    if (!currentWorkspace) {
      toast.error("Select a workspace first.");
      return;
    }
    if (subscription.isLoading || subscription.auth_unavailable) {
      toast.error("Subscription status is unavailable. Try again shortly.");
      return;
    }
    if (plan.key === "free") {
      if (subscription.subscribed)
        toast.error("Contact support to move to Free.");
      return;
    }
    if (subscription.planKey === plan.key) {
      toast.info("This is your current plan.");
      return;
    }
    setLoading(plan.key);
    try {
      if (subscription.subscribed) {
        const result = await supabase.functions.invoke("update-subscription", {
          body: {
            workspace_id: currentWorkspace.id,
            action: "preview",
            price_id: PLANS[plan.key].prices.monthly.price_id,
          },
        });
        if (result.error) throw result.error;
        const value = result.data as Omit<PlanQuote, "planName">;
        if (
          typeof value?.quote_id !== "string" ||
          typeof value.amount_due !== "number" ||
          !Number.isInteger(value.amount_due) ||
          value.amount_due < 0 ||
          typeof value.currency !== "string" ||
          !/^[a-z]{3}$/i.test(value.currency) ||
          typeof value.credit_delta !== "number" ||
          !Number.isFinite(Date.parse(value.effective_at)) ||
          !Number.isFinite(Date.parse(value.expires_at)) ||
          !["upgrade", "downgrade"].includes(value.change)
        )
          throw new Error("Plan preview unavailable");
        setQuote({ ...value, planName: plan.name });
      } else
        await createCheckoutSession(
          PLANS[plan.key].prices.monthly.price_id,
          currentWorkspace.id,
        );
    } catch {
      toast.error("Could not open billing. Please try again.");
    } finally {
      setLoading(null);
    }
  }
  async function confirmChange() {
    if (
      !quote ||
      !currentWorkspace ||
      Date.now() >= Date.parse(quote.expires_at)
    ) {
      setQuote(null);
      toast.error("This quote expired. Please request a new one.");
      return;
    }
    setLoading(quote.planName);
    try {
      const result = await supabase.functions.invoke("update-subscription", {
        body: {
          workspace_id: currentWorkspace.id,
          action: "confirm",
          quote_id: quote.quote_id,
          confirmed: true,
        },
      });
      if (result.error) throw result.error;
      setQuote(null);
      toast.success(
        "Plan change submitted. Billing will update when Stripe confirms it.",
      );
      await subscription.refetch();
    } catch {
      toast.error(
        "Could not confirm the plan change. Check billing before trying again.",
      );
    } finally {
      setLoading(null);
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <Button variant="ghost" onClick={() => navigate("/app/billing")}>
        Back to billing
      </Button>
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Plans and credits</h1>
        <p className="text-muted-foreground">
          Choose a monthly allowance for{" "}
          {currentWorkspace?.name ?? "your workspace"}.
        </p>
      </header>
      {subscription.isCourtesy && <p className="text-sm text-muted-foreground">This workspace has complimentary {subscription.planName} access. Contact your administrator to change it.</p>}
      <ContentCreditPlans onSelect={selectPlan} loading={loading} disabled={subscription.isCourtesy} />
      <p className="text-sm text-muted-foreground">
        {subscription.subscribed
          ? "Review the exact payment and effective date before confirming a change. Manage payment details and invoices in Billing. "
          : ""}
        Credit examples vary with the selected engine and settings.
      </p>
      <AlertDialog
        open={!!quote}
        onOpenChange={(open) => {
          if (!open && !loading) setQuote(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Review {quote?.planName} plan</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {quote?.change === "downgrade"
                    ? "This downgrade is scheduled for renewal."
                    : "This upgrade applies after payment is confirmed."}
                </p>
                <p>
                  Amount due:{" "}
                  {quote
                    ? new Intl.NumberFormat("en-GB", {
                        style: "currency",
                        currency: quote.currency.toUpperCase(),
                      }).format(quote.amount_due / 100)
                    : "—"}
                </p>
                <p>
                  Effective:{" "}
                  {quote
                    ? new Date(quote.effective_at).toLocaleDateString("en-GB")
                    : "—"}
                </p>
                <p>Credit adjustment: {quote?.credit_delta ?? 0} credits</p>
                <p>
                  This quote expires{" "}
                  {quote
                    ? new Date(quote.expires_at).toLocaleString("en-GB")
                    : ""}
                  .
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!loading}
              onClick={(event) => {
                event.preventDefault();
                void confirmChange();
              }}
            >
              Confirm plan change
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
