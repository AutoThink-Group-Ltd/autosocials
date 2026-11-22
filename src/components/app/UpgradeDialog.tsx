import { useState } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, Zap, Search, Mail, Users, List, Database, Play } from "lucide-react";
import { motion } from "framer-motion";

type LimitType = "searches" | "emails" | "saved_creators" | "creator_lists" | "vibe_conversations" | "enrichments" | "content_calls";

const LIMIT_META: Record<LimitType, { icon: typeof Search; label: string; description: string; upgradeHint: string }> = {
  searches: {
    icon: Search,
    label: "Creator Searches",
    description: "You've used all your creator searches for this month.",
    upgradeHint: "Unlock more searches to discover the perfect creators for your brand.",
  },
  emails: {
    icon: Mail,
    label: "Outreach Emails",
    description: "You've sent all your outreach emails for this month.",
    upgradeHint: "Send more personalised outreach to grow your creator network.",
  },
  saved_creators: {
    icon: Users,
    label: "Saved Creators",
    description: "You've reached your saved creators limit.",
    upgradeHint: "Save more creators to build a stronger talent pipeline.",
  },
  creator_lists: {
    icon: List,
    label: "Creator Lists",
    description: "You've reached your creator lists limit.",
    upgradeHint: "Organise your creators into more lists for better campaign management.",
  },
  vibe_conversations: {
    icon: Sparkles,
    label: "AI Vibe Conversations",
    description: "You've used all your AI Vibe conversations for this month.",
    upgradeHint: "Get more AI-powered insights to find trending creators faster.",
  },
  enrichments: {
    icon: Database,
    label: "Profile Enrichments",
    description: "You've used all your profile enrichments for this month.",
    upgradeHint: "Enrich more profiles to get detailed analytics and contact info.",
  },
  content_calls: {
    icon: Play,
    label: "Content Updates",
    description: "You've used all your content refresh calls for this month.",
    upgradeHint: "Refresh more creator content to stay up-to-date with the latest posts.",
  },
};

interface UpgradeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  limitType: LimitType;
  currentUsage?: number;
  currentLimit?: number | "unlimited";
  planName?: string;
}

export function UpgradeDialog({
  open,
  onOpenChange,
  limitType,
  currentUsage,
  currentLimit,
  planName = "your current plan",
}: UpgradeDialogProps) {
  const navigate = useNavigate();
  const meta = LIMIT_META[limitType];
  const Icon = meta.icon;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-0">
        {/* Gradient header */}
        <div className="gradient-brand px-6 pt-8 pb-6 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-20">
            <div className="absolute top-4 left-8 w-16 h-16 rounded-full border border-white/20" />
            <div className="absolute bottom-2 right-12 w-10 h-10 rounded-full border border-white/20" />
            <div className="absolute top-12 right-20 w-6 h-6 rounded-full border border-white/10" />
          </div>
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="relative"
          >
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center mx-auto mb-4 shadow-lg">
              <Icon className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-xl font-bold text-white mb-1">
              Limit Reached
            </h2>
            <p className="text-sm text-white/80">
              {meta.description}
            </p>
          </motion.div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {currentUsage !== undefined && currentLimit !== undefined && currentLimit !== "unlimited" && (
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
              <span className="text-sm text-muted-foreground">{meta.label} used</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${Math.min(100, (currentUsage / currentLimit) * 100)}%` }}
                  />
                </div>
                <Badge variant="outline" className="text-xs font-mono">
                  {currentUsage} / {currentLimit}
                </Badge>
              </div>
            </div>
          )}

          <div className="text-center space-y-2">
            <p className="text-sm text-foreground font-medium">
              {meta.upgradeHint}
            </p>
            <p className="text-xs text-muted-foreground">
              Upgrade your plan to get higher limits and unlock premium features.
            </p>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Button
              onClick={() => {
                onOpenChange(false);
                navigate("/app/plans");
              }}
              className="w-full gap-2"
              variant="brand"
              size="lg"
            >
              <Zap className="w-4 h-4" />
              View Plans & Upgrade
              <ArrowRight className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground"
            >
              Maybe later
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Hook for easy usage in any component
export function useUpgradeDialog() {
  const [state, setState] = useState<{
    open: boolean;
    limitType: LimitType;
    currentUsage: number | undefined;
    currentLimit: number | "unlimited" | undefined;
  }>({ open: false, limitType: "searches", currentUsage: undefined, currentLimit: undefined });

  function showUpgrade(limitType: LimitType, currentUsage?: number, currentLimit?: number | "unlimited") {
    setState({ open: true, limitType, currentUsage, currentLimit });
  }

  function closeUpgrade() {
    setState((prev) => ({ ...prev, open: false }));
  }

  return {
    upgradeDialogProps: {
      open: state.open,
      onOpenChange: (open: boolean) => setState((prev) => ({ ...prev, open })),
      limitType: state.limitType,
      currentUsage: state.currentUsage,
      currentLimit: state.currentLimit,
    },
    showUpgrade,
    closeUpgrade,
  };
}

export type { LimitType };
