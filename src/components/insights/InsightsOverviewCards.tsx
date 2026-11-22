import { motion } from "framer-motion";
import { Search, List, Users, Send, MessageSquare, TrendingUp } from "lucide-react";

interface OverviewProps {
  totalSearches: number;
  totalLists: number;
  totalCreatorsInLists: number;
  totalSent: number;
  totalReplies: number;
  replyRate: number;
}

const InsightsOverviewCards = ({ totalSearches, totalLists, totalCreatorsInLists, totalSent, totalReplies, replyRate }: OverviewProps) => {
  const stats = [
    { label: "Creator Searches", value: totalSearches.toLocaleString(), icon: Search, color: "text-primary" },
    { label: "Creator Lists", value: totalLists.toLocaleString(), icon: List, color: "text-violet-500" },
    { label: "Creators Saved", value: totalCreatorsInLists.toLocaleString(), icon: Users, color: "text-emerald-500" },
    { label: "Emails Sent", value: totalSent.toLocaleString(), icon: Send, color: "text-primary" },
    { label: "Replies", value: totalReplies.toLocaleString(), icon: MessageSquare, color: "text-emerald-500" },
    { label: "Reply Rate", value: `${replyRate}%`, icon: TrendingUp, color: "text-violet-500" },
  ];

  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.label}
          className="bg-card rounded-xl border border-border p-4 hover:shadow-card hover:-translate-y-0.5 transition-all duration-200"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
        >
          <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center mb-2.5">
            <stat.icon className={`w-4 h-4 ${stat.color}`} />
          </div>
          <p className="text-xl font-bold text-foreground">{stat.value}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{stat.label}</p>
        </motion.div>
      ))}
    </div>
  );
};

export default InsightsOverviewCards;
