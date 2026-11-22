import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { PLANS, type PlanKey, type BillingPeriod } from "@/config/stripePlans";

interface SubscriptionData {
  subscribed: boolean;
  plan_key: string;
  billing_period: string;
  subscription_status: string;
  current_period_end: string | null;
  auth_unavailable?: boolean;
  is_courtesy?: boolean;
}

export function useSubscription() {
  const { session, user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const { data, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ["subscription", user?.id, workspaceId],
    queryFn: async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession?.access_token) {
        return { subscribed: false, plan_key: "free", billing_period: "monthly", subscription_status: "free", current_period_end: null };
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const { data, error } = await supabase.functions.invoke("check-subscription", {
          ...(workspaceId ? { body: { workspace_id: workspaceId } } : {}),
          headers: { Authorization: `Bearer ${currentSession.access_token}` },
        });
        clearTimeout(timeout);
        if (error) throw error;
        return data as SubscriptionData;
      } catch (err) {
        clearTimeout(timeout);
        // Soft fallback — never block the user
        return { subscribed: false, plan_key: "free", billing_period: "monthly", subscription_status: "free", current_period_end: null, auth_unavailable: true };
      }
    },
    enabled: !!user,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 3,
  });

  const planKey = (data?.plan_key || "free") as PlanKey | "free";
  const planConfig = planKey !== "free" ? PLANS[planKey as PlanKey] : null;
  const billingPeriod = (data?.billing_period || "monthly") as BillingPeriod;
  const isCancelled = data?.subscription_status === "canceled";
  const isPastDue = data?.subscription_status === "past_due";

  return {
    isLoading,
    subscribed: data?.subscribed ?? false,
    isCourtesy: data?.is_courtesy ?? false,
    auth_unavailable: data?.auth_unavailable ?? false,
    planKey,
    planName: planConfig?.name ?? "Free",
    billingPeriod,
    subscriptionStatus: data?.subscription_status ?? "free",
    currentPeriodEnd: data?.current_period_end ?? null,
    isCancelled,
    isPastDue,
    planConfig,
    refetch,

  };
}

export async function createCheckoutSession(priceId: string, workspaceId?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) {
    window.location.href = `/auth?redirect=/pricing`;
    return;
  }
  const { data, error } = await supabase.functions.invoke("create-checkout", {
    body: { price_id: priceId, ...(workspaceId ? { workspace_id: workspaceId } : {}) },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (error) throw error;
  if (data?.url) window.location.href = data.url;
}

export async function openCustomerPortal(workspaceId?: string) {
  const portalWindow = window.open("", "_blank");
  try {
    const { data, error } = await supabase.functions.invoke("customer-portal", {
      ...(workspaceId ? { body: { workspace_id: workspaceId } } : {}),
    });
    if (error) throw error;
    if (data?.url && portalWindow) portalWindow.location.href = data.url;
  } catch (err) {
    portalWindow?.close();
    throw err;
  }
}
