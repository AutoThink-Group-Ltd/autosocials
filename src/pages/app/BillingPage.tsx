import { useState } from "react";
import { useNavigate, useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  CreditCard, FileText, ExternalLink, Loader2, ArrowRight,
  AlertTriangle, CheckCircle2, Mail, Sparkles, XCircle,
} from "lucide-react";
import { useSubscription, openCustomerPortal } from "@/hooks/useSubscription";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { formatPrice, detectCurrency } from "@/config/stripePlans";
import { SendPaymentEmailDialog } from "@/components/app/SendPaymentEmailDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useContentCredits } from "@/hooks/useContentCredits";
import { CreditAutoUpgrade } from "@/components/app/CreditAutoUpgrade";

const BillingPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentWorkspace } = useWorkspace();
  const { profile } = useAuth();
  const sub = useSubscription();
  const credits = useContentCredits(currentWorkspace?.id);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [invoicesOpen, setInvoicesOpen] = useState(false);
  const [invoices, setInvoices] = useState<any[] | null>(null);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const currency = detectCurrency();

  const isSuccess = searchParams.get("success") === "true";
  const isAgency = profile?.account_type === "agency";

  const handleManageBilling = async () => {
    setLoadingAction("portal");
    try {
      await openCustomerPortal(currentWorkspace?.id);
    } catch {
      toast.error("Failed to open billing portal");
    } finally {
      setLoadingAction(null);
    }
  };

  const handleLoadInvoices = async () => {
    setInvoicesOpen(true);
    if (invoices) return;
    setInvoicesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("list-invoices", {
        body: { workspace_id: currentWorkspace?.id },
      });
      if (error) throw error;
      setInvoices(data?.invoices ?? []);
    } catch {
      toast.error("Failed to load invoices");
    } finally {
      setInvoicesLoading(false);
    }
  };

  const statusConfig: Record<string, { label: string; className: string }> = {
    active: { label: "Active", className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30" },
    trialing: { label: "Trial", className: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30" },
    canceled: { label: "Cancelled", className: "bg-destructive/10 text-destructive border-destructive/30" },
    past_due: { label: "Past Due", className: "bg-destructive/10 text-destructive border-destructive/30" },
    free: { label: "Free", className: "bg-muted text-muted-foreground border-border" },
  };

  const currentStatus = statusConfig[sub.subscriptionStatus] || statusConfig["free"]!;

  if (sub.isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {isAgency
            ? `Manage your subscription and usage for ${currentWorkspace?.name || "workspace"}`
            : "Manage your subscription and usage across all workspaces"}
        </p>
      </div>

      {/* Success Banner */}
      {isSuccess && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
          <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
            Checkout complete. Your plan will update once payment is confirmed.
          </p>
        </div>
      )}

      {/* Past Due Alert */}
      {sub.subscriptionStatus === "past_due" && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-destructive">Payment failed — action required</p>
            <p className="text-xs text-destructive/80 mt-0.5">Update your payment method to avoid losing access.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" onClick={handleManageBilling} disabled={loadingAction === "portal"}>
              <CreditCard className="w-3.5 h-3.5" />
              Update Payment
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEmailDialogOpen(true)} className="border-destructive/30 text-destructive hover:bg-destructive/5">
              <Mail className="w-3.5 h-3.5" />
              Email Accounts Team
            </Button>
          </div>
        </div>
      )}

      {/* Cancelled Alert */}
      {sub.isCancelled && sub.currentPeriodEnd && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <XCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
              Your plan is cancelled. Access until {format(new Date(sub.currentPeriodEnd), "MMMM d, yyyy")}.
            </p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleManageBilling} disabled={loadingAction === "portal"}>
              Reactivate Plan
            </Button>
          </div>
        </div>
      )}

      {/* Current Plan Card */}
      <Card className="border-border/60">
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Current Plan
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 sm:gap-x-8 gap-y-4">
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Plan</p>
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-bold text-foreground">{sub.planName}{sub.isCourtesy ? " · Complimentary" : ""}</span>
              </div>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Billing</p>
              <p className="text-sm font-bold text-foreground capitalize">{sub.billingPeriod}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Status</p>
              <Badge variant="outline" className={`text-xs ${currentStatus.className}`}>
                {currentStatus.label}
              </Badge>
            </div>
            <div>
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {sub.isCourtesy ? "Complimentary access until" : sub.isCancelled ? "Access Until" : "Renews"}
              </p>
              <p className="text-sm font-bold text-foreground">
                {sub.currentPeriodEnd
                  ? format(new Date(sub.currentPeriodEnd), "MMM d, yyyy")
                  : "—"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            {sub.isCourtesy ? (
              <p className="text-sm text-muted-foreground">This workspace has complimentary access. No payment method is required.</p>
            ) : sub.subscribed ? (
              <>
                <Button variant="outline" size="sm" onClick={handleManageBilling} disabled={loadingAction === "portal"}>
                  <CreditCard className="w-4 h-4" />
                  {loadingAction === "portal" ? "Opening…" : "Manage Billing"}
                </Button>
                <Button size="sm" onClick={() => navigate("/app/plans")}>
                  <ArrowRight className="w-4 h-4" />
                  Change Plan
                </Button>
                <Button variant="outline" size="sm" onClick={handleLoadInvoices}>
                  <FileText className="w-4 h-4" />
                  View Invoices
                </Button>
              </>
            ) : (
              <Button onClick={() => navigate("/app/plans")}>
                <Sparkles className="w-4 h-4" />
                Upgrade Plan
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-4"><CardTitle className="text-base font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4" /> Content credits</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {credits.isLoading ? <p className="text-sm text-muted-foreground">Loading credit balance…</p> : credits.isError ? <p role="alert" className="text-sm text-destructive">Credit information is temporarily unavailable.</p> : !credits.data ? <p className="text-sm text-muted-foreground">No active credit period is available.</p> : <>
            {credits.data.unlimited ? <p className="text-2xl font-bold">Unlimited content credits</p> : <>
            <div><p className="text-2xl font-bold">{credits.data.available.toLocaleString("en-GB")} <span className="text-sm font-normal text-muted-foreground">of {credits.data.granted.toLocaleString("en-GB")} credits available</span></p><p className="mt-1 text-xs text-muted-foreground">Resets {format(new Date(credits.data.endsAt), "d MMM yyyy")}. Reserved credits remain unavailable until production is resolved.</p></div>
            <Progress value={credits.data.granted ? (credits.data.available / credits.data.granted) * 100 : 0} />
            </>}
            <div><h3 className="text-sm font-semibold">Recent credit activity</h3>{credits.data.entries.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No content credit activity yet.</p> : <ul className="mt-2 divide-y divide-border">{credits.data.entries.slice(0, 10).map((entry) => <li key={entry.id} className="flex justify-between gap-3 py-2 text-sm"><span className="capitalize">{entry.state.replaceAll("_", " ")}</span><span>{entry.credits} credits</span></li>)}</ul>}</div>
          </>}
        </CardContent>
      </Card>

      {/* Usage This Period */}
      {currentWorkspace && !sub.isCourtesy && !credits.data?.unlimited && <CreditAutoUpgrade workspaceId={currentWorkspace.id} isFree={!sub.subscribed} />}
      {/* Invoices Dialog */}
      <Dialog open={invoicesOpen} onOpenChange={setInvoicesOpen}>
        <DialogContent className="sm:max-w-lg max-h-[70vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Invoices
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-[50vh]">
            {invoicesLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </div>
            ) : !invoices || invoices.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No invoices yet.</p>
            ) : (
              <div className="space-y-2">
                {invoices.map((inv: any) => (
                  <div key={inv.id} className="flex items-center justify-between py-2.5 border-b border-border/40 last:border-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{inv.number}</span>
                      <span className="text-xs text-muted-foreground">
                        {inv.date ? format(new Date(inv.date), "MMM d, yyyy") : "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium">{formatPrice(inv.amount, currency)}</span>
                      <Badge variant={inv.status === "paid" ? "default" : "outline"} className="text-[10px]">{inv.status}</Badge>
                      {inv.pdf_url && (
                        <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <ExternalLink className="w-3 h-3" />
                          </Button>
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <SendPaymentEmailDialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen} />
    </div>
  );
};

export default BillingPage;
