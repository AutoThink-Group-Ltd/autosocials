import { motion } from "framer-motion";
import { Users, Crown, UserCheck, Star } from "lucide-react";

interface CreatorEmailData {
  to_email: string;
  to_name: string | null;
  follower_count: number | null;
  avatar_url: string | null;
  username: string | null;
  display_name: string | null;
  niches: string[] | null;
  emailCount: number;
}

interface CreatorsTabProps {
  creatorStats: CreatorEmailData[];
}

const formatFollowers = (count: number | null) => {
  if (!count) return "—";
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
};

const getTierInfo = (count: number | null) => {
  if (!count) return { label: "Unknown", color: "bg-muted text-muted-foreground" };
  if (count >= 1_000_000) return { label: "Mega", color: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" };
  if (count >= 100_000) return { label: "Macro", color: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" };
  if (count >= 10_000) return { label: "Mid-Tier", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" };
  if (count >= 1_000) return { label: "Micro", color: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" };
  return { label: "Nano", color: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300" };
};

const CreatorsTab = ({ creatorStats = [] }: CreatorsTabProps) => {
  // Tier breakdown
  const tiers = [
    { label: "Mega (1M+)", min: 1_000_000, max: Infinity, icon: Crown, color: "text-violet-500" },
    { label: "Macro (100K–1M)", min: 100_000, max: 999_999, icon: Star, color: "text-blue-500" },
    { label: "Mid-Tier (10K–100K)", min: 10_000, max: 99_999, icon: UserCheck, color: "text-emerald-500" },
    { label: "Micro (1K–10K)", min: 1_000, max: 9_999, icon: Users, color: "text-amber-500" },
    { label: "Nano (<1K)", min: 0, max: 999, icon: Users, color: "text-orange-500" },
  ];

  const tierCounts = tiers.map(t => ({
    ...t,
    count: creatorStats.filter(c => (c.follower_count || 0) >= t.min && (c.follower_count || 0) <= t.max).length,
    emails: creatorStats.filter(c => (c.follower_count || 0) >= t.min && (c.follower_count || 0) <= t.max).reduce((s, c) => s + c.emailCount, 0),
  }));

  const maxTier = Math.max(...tierCounts.map(t => t.count), 1);

  return (
    <div className="space-y-6">
      {/* Tier breakdown */}
      <motion.div
        className="bg-card rounded-xl border border-border p-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
          <Crown className="w-4 h-4 text-primary" /> Outreach by Creator Tier
        </h3>
        <div className="space-y-3">
          {tierCounts.map((tier, i) => (
            <div key={tier.label} className="flex items-center gap-3">
              <div className="w-36 flex items-center gap-2">
                <tier.icon className={`w-4 h-4 ${tier.color} flex-shrink-0`} />
                <span className="text-xs text-muted-foreground truncate">{tier.label}</span>
              </div>
              <div className="flex-1 h-8 bg-secondary/50 rounded-lg overflow-hidden">
                <motion.div
                  className="h-full bg-primary/70 rounded-lg flex items-center px-3 gap-2"
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max((tier.count / maxTier) * 100, tier.count > 0 ? 8 : 0)}%` }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                >
                  {tier.count > 0 && (
                    <span className="text-[11px] font-semibold text-primary-foreground whitespace-nowrap">
                      {tier.count} creators · {tier.emails} emails
                    </span>
                  )}
                </motion.div>
              </div>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Top creators emailed */}
      <motion.div
        className="bg-card rounded-xl border border-border p-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" /> Top Creators Emailed
        </h3>
        {creatorStats.length > 0 ? (
          <div className="space-y-2">
            {creatorStats.slice(0, 20).map((creator, i) => {
              const tier = getTierInfo(creator.follower_count);
              return (
                <motion.div
                  key={creator.to_email}
                  className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center overflow-hidden flex-shrink-0">
                    {creator.avatar_url ? (
                      <img src={creator.avatar_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {creator.display_name || creator.to_name || creator.username || creator.to_email}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {creator.username ? `@${creator.username}` : creator.to_email}
                    </p>
                  </div>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tier.color}`}>
                    {tier.label}
                  </span>
                  <span className="text-xs text-muted-foreground w-16 text-right">
                    {formatFollowers(creator.follower_count)}
                  </span>
                  <span className="text-xs font-medium text-foreground w-20 text-right">
                    {creator.emailCount} {creator.emailCount === 1 ? "email" : "emails"}
                  </span>
                </motion.div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No email data yet. Send your first outreach to see creator metrics here.
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default CreatorsTab;
