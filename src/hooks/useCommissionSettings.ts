import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useWorkspace } from "@/contexts/WorkspaceContext";
import { toast } from "sonner";

export interface CommissionSettings {
  id?: string;
  workspace_id: string;
  commission_type: "percentage" | "flat_fee" | "both";
  default_percentage: number;
  default_flat_fee: number;
  currency: string;
  enable_tiers: boolean;
  notes: string;
}

export interface CommissionTier {
  id?: string;
  workspace_id: string;
  min_followers: number;
  max_followers: number | null;
  commission_type: "percentage" | "flat_fee";
  percentage: number;
  flat_fee: number;
  label: string;
  position: number;
}

export interface CommissionRule {
  id?: string;
  workspace_id: string;
  rule_type: "niche" | "keyword" | "creator_type" | "platform";
  match_value: string;
  action: "override" | "zero";
  override_type: "percentage" | "flat_fee";
  override_percentage: number;
  override_flat_fee: number;
  is_active: boolean;
  position: number;
}

export function useCommissionSettings() {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?.id;

  const [settings, setSettings] = useState<CommissionSettings | null>(null);
  const [tiers, setTiers] = useState<CommissionTier[]>([]);
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);

    const [settingsRes, tiersRes, rulesRes] = await Promise.all([
      supabase.from("commission_settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      supabase.from("commission_tiers").select("*").eq("workspace_id", workspaceId).order("position"),
      supabase.from("commission_rules").select("*").eq("workspace_id", workspaceId).order("position"),
    ]);

    if (settingsRes.data) {
      setSettings(settingsRes.data as unknown as CommissionSettings);
    } else {
      setSettings({
        workspace_id: workspaceId,
        commission_type: "percentage",
        default_percentage: 20,
        default_flat_fee: 0,
        currency: "GBP",
        enable_tiers: false,
        notes: "",
      });
    }

    setTiers((tiersRes.data || []) as unknown as CommissionTier[]);
    setRules((rulesRes.data || []) as unknown as CommissionRule[]);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const saveSettings = async (s: CommissionSettings) => {
    if (!workspaceId) return;
    const payload = { ...s, workspace_id: workspaceId, updated_at: new Date().toISOString() };
    
    if (s.id) {
      const { error } = await supabase.from("commission_settings").update(payload).eq("id", s.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from("commission_settings").insert(payload);
      if (error) { toast.error(error.message); return; }
    }
    toast.success("Commission settings saved");
    load();
  };

  const saveTier = async (t: CommissionTier) => {
    if (!workspaceId) return;
    const payload = { ...t, workspace_id: workspaceId, updated_at: new Date().toISOString() };
    if (t.id) {
      const { error } = await supabase.from("commission_tiers").update(payload).eq("id", t.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("commission_tiers").insert(rest);
      if (error) { toast.error(error.message); return; }
    }
    load();
  };

  const deleteTier = async (id: string) => {
    const { error } = await supabase.from("commission_tiers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const saveRule = async (r: CommissionRule) => {
    if (!workspaceId) return;
    const payload = { ...r, workspace_id: workspaceId, updated_at: new Date().toISOString() };
    if (r.id) {
      const { error } = await supabase.from("commission_rules").update(payload).eq("id", r.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("commission_rules").insert(rest);
      if (error) { toast.error(error.message); return; }
    }
    load();
  };

  const deleteRule = async (id: string) => {
    const { error } = await supabase.from("commission_rules").delete().eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  const toggleRule = async (id: string, active: boolean) => {
    const { error } = await supabase.from("commission_rules").update({ is_active: active }).eq("id", id);
    if (error) toast.error(error.message);
    else load();
  };

  // Resolve commission for a given creator context
  const resolveCommission = useCallback((creator?: { niches?: string[]; follower_count?: number; platform?: string }) => {
    if (!settings) return { type: "percentage" as const, percentage: 15, flat_fee: 0 };

    // Check exclusion rules first
    if (creator && rules.length > 0) {
      for (const rule of rules.filter(r => r.is_active)) {
        const matchVal = rule.match_value.toLowerCase();
        let matches = false;

        if (rule.rule_type === "niche" && creator.niches) {
          matches = creator.niches.some(n => n.toLowerCase().includes(matchVal));
        } else if (rule.rule_type === "keyword") {
          const allText = [...(creator.niches || [])].join(" ").toLowerCase();
          matches = allText.includes(matchVal);
        } else if (rule.rule_type === "platform" && creator.platform) {
          matches = creator.platform.toLowerCase() === matchVal;
        }

        if (matches) {
          if (rule.action === "zero") return { type: "none" as const, percentage: 0, flat_fee: 0 };
          return {
            type: rule.override_type,
            percentage: rule.override_percentage,
            flat_fee: rule.override_flat_fee,
          };
        }
      }
    }

    // Check tiers if enabled
    if (settings.enable_tiers && tiers.length > 0 && creator?.follower_count) {
      const fc = creator.follower_count;
      const tier = tiers.find(t => fc >= t.min_followers && (t.max_followers === null || fc <= t.max_followers));
      if (tier) {
        return { type: tier.commission_type, percentage: tier.percentage, flat_fee: tier.flat_fee };
      }
    }

    return {
      type: settings.commission_type,
      percentage: settings.default_percentage,
      flat_fee: settings.default_flat_fee,
    };
  }, [settings, tiers, rules]);

  return {
    settings, tiers, rules, loading,
    saveSettings, saveTier, deleteTier,
    saveRule, deleteRule, toggleRule,
    resolveCommission, reload: load,
  };
}
