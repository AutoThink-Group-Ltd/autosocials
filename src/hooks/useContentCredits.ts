import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ensureContentCreditPeriod } from "@/lib/content-credit.functions";

type CreditEntry = { id: string; request_key: string; credits: number; state: string; created_at: string };
type CreditPeriod = { id: string; granted: number; ends_at: string };

export function useContentCredits(workspaceId?: string) {
  return useQuery({
    queryKey: ["content-credits", workspaceId],
    enabled: !!workspaceId,
    queryFn: async () => {
      const { unlimited } = await ensureContentCreditPeriod({ data: { workspaceId: workspaceId! } });
      const db = supabase as unknown as SupabaseClient;
      const now = new Date().toISOString();
      const periodResult = await db.from("content_credit_periods").select("id,granted,ends_at").eq("workspace_id", workspaceId!).lte("starts_at", now).gt("ends_at", now).order("starts_at", { ascending: false }).limit(1).maybeSingle();
      if (periodResult.error) throw periodResult.error;
      const period = periodResult.data as CreditPeriod | null;
      if (!period) return null;
      const result = await db.from("content_credit_reservations").select("id,request_key,credits,state,created_at").eq("workspace_id", workspaceId!).eq("period_id", period.id).order("created_at", { ascending: false });
      if (result.error) throw result.error;
      const entries = (result.data ?? []) as CreditEntry[];
      const used = entries.filter((entry) => entry.state !== "released").reduce((sum, entry) => sum + entry.credits, 0);
      return { unlimited, granted: period.granted, available: Math.max(0, period.granted - used), endsAt: period.ends_at, entries };
    },
  });
}
