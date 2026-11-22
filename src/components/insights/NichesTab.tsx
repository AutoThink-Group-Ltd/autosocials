import { motion } from "framer-motion";
import { PieChart, Hash, TrendingUp } from "lucide-react";

interface NicheEmailData {
  niche: string;
  creatorCount: number;
  emailCount: number;
  avgFollowers: number;
}

interface NichesTabProps {
  nicheStats: NicheEmailData[];
  nicheBreakdown: { niche: string; count: number }[];
}

const formatFollowers = (count: number) => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toLocaleString();
};

const NICHE_COLORS = [
  "from-pink-500 to-rose-400",
  "from-violet-500 to-purple-400",
  "from-blue-500 to-indigo-400",
  "from-emerald-500 to-teal-400",
  "from-amber-500 to-orange-400",
  "from-cyan-500 to-sky-400",
  "from-fuchsia-500 to-pink-400",
  "from-lime-500 to-green-400",
  "from-red-500 to-rose-400",
  "from-indigo-500 to-blue-400",
  "from-teal-500 to-emerald-400",
  "from-orange-500 to-amber-400",
];

const NichesTab = ({ nicheStats, nicheBreakdown }: NichesTabProps) => {
  const maxNicheEmails = Math.max(...nicheStats.map(n => n.emailCount), 1);
  const maxNicheCreators = Math.max(...nicheBreakdown.map(n => n.count), 1);

  return (
    <div className="space-y-6">
      {/* Niche outreach breakdown */}
      <motion.div
        className="bg-card rounded-xl border border-border p-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> Outreach by Niche
        </h3>
        {nicheStats.length > 0 ? (
          <div className="space-y-3">
            {nicheStats.map((n, i) => (
              <div key={n.niche} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 text-right truncate" title={n.niche}>
                  {n.niche}
                </span>
                <div className="flex-1 h-8 bg-secondary/50 rounded-lg overflow-hidden">
                  <motion.div
                    className={`h-full rounded-lg flex items-center px-3 bg-gradient-to-r ${NICHE_COLORS[i % NICHE_COLORS.length]}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max((n.emailCount / maxNicheEmails) * 100, n.emailCount > 0 ? 10 : 0)}%` }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                  >
                    {n.emailCount > 0 && (
                      <span className="text-[11px] font-semibold text-white whitespace-nowrap">
                        {n.emailCount} emails
                      </span>
                    )}
                  </motion.div>
                </div>
                <div className="flex gap-3 text-[11px] text-muted-foreground w-40">
                  <span>{n.creatorCount} creators</span>
                  <span>avg {formatFollowers(n.avgFollowers)}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No niche data yet. Send outreach to creators to see niche metrics.
          </div>
        )}
      </motion.div>

      {/* Saved creators by niche */}
      <motion.div
        className="bg-card rounded-xl border border-border p-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h3 className="text-sm font-semibold text-foreground mb-5 flex items-center gap-2">
          <PieChart className="w-4 h-4 text-primary" /> Saved Creators by Niche
        </h3>
        {nicheBreakdown.length > 0 ? (
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            {nicheBreakdown.map((n, i) => (
              <motion.div
                key={n.niche}
                className="relative overflow-hidden rounded-lg border border-border p-4"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.04 }}
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${NICHE_COLORS[i % NICHE_COLORS.length]} opacity-[0.07]`}
                />
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground truncate">{n.niche}</span>
                  </div>
                  <p className="text-xl font-bold text-foreground">{n.count}</p>
                  <div className="mt-2 h-1.5 bg-secondary/50 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full rounded-full bg-gradient-to-r ${NICHE_COLORS[i % NICHE_COLORS.length]}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${(n.count / maxNicheCreators) * 100}%` }}
                      transition={{ duration: 0.6, delay: 0.3 + i * 0.04 }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-muted-foreground text-sm">
            No niche data yet. Add creators to your lists to see niche breakdowns.
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default NichesTab;
